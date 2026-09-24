# Strava Club Dashboard

Public dashboard for Strava club 1491053 (One Million Kilometers). Shows the
club's progress toward one million kilometres, all-time totals, current pace,
and the most recent activities.

## The 2026-09-01 break, and why the pipeline looks like this

Strava **removed** `/clubs/{id}/activities`, `/clubs/{id}/members` and
`/clubs/{id}/admins` on 1 September 2026. There is no replacement endpoint and
no migration path; the removal affects every app using club data.

The old pipeline did not fail loudly. A non-array API response was logged and
the loop broke, so the hourly job kept exiting 0, rewriting the cache unchanged
and committing a fresh timestamp — roughly 430 green commits over nine days
while nothing was ingested. Hence the hard failures in the current scripts:
**any fetch that cannot produce real data must exit non-zero.**

Data now comes from Strava's own embeddable club widget, a documented feature
that needs no OAuth token. It gives weekly totals and the five most recent
activities, with real calendar dates, athlete ids and activity ids — more
identity than the old API ever exposed.

## Pipeline

    fetch-widget.js  →  widget-data.json + widget-history.json
    build-dashboard-data.js  →  strava-data.json
    widget.js  ←  reads strava-data.json in the browser

- **`fetch-widget.js`** — scrapes the embed widget and the club's public page
  (for the member count, which the payload still carries). Accumulates weekly
  totals in `widget-history.json`, because the widget only ever reports the
  current week.
- **`build-dashboard-data.js`** — rebuilds `strava-data.json` in the shape the
  frontends expect, and derives the pace figures and scale comparisons.
  `--with-estimates` folds in the documented outage gap.
- **`widget.js`** — **this is the file the website loads.** A web component
  (`<strava-dashboard>`) with its own shadow DOM and CSS, pulled directly as a
  script from GitHub Pages.
- **`macos-widget/`** — Scriptable widget reading the local `strava-data.json`;
  needs a `git pull` to see new data.
- **`fetch-data.js` / `get-token.js`** — the old API path. Kept for reference
  only; not run by the workflow. Both now fail loudly instead of silently.

## Guardrails worth keeping

- **A week total can never shrink.** If the widget reports less than already
  recorded for that week, the script throws rather than quietly lowering the
  cumulative figure.
- **Truncated weeks are flagged.** A week last updated more than 6h before it
  ended is marked `truncated`; its recorded distance is an undercount.
- **Estimates never enter `totalDistanceKm`.** They live in `dataQuality` and
  are only folded into the published figure via `--with-estimates`. The split
  stays visible in `dataSource.measuredDistanceKm` vs `estimatedGapKm`.
- **Member count is best-effort.** A failed scrape keeps the last known value
  rather than publishing a zero, and never aborts the run.

## Deliberate omissions

- **No per-athlete leaderboards.** The widget exposes five activities at a
  time against ~1,240 a week, so any ranking built from it would systematically
  drop whoever uploads at peak hours. The dashboard explains this to members
  instead, making clear their kilometres still count.
- **No finish date, only a month.** The pace projection rests on very few
  fully measured weeks and no winter data, so it is phrased as a direction of
  travel.
- **Scale comparisons use fixed references only** (equator, Moon, the Nile).
  Survey-based figures such as "distance walked in a lifetime" vary by a factor
  of two between sources and are not used.

## Data gap: 1–15 September 2026

Between the API shutdown and the start of widget collection, two stretches went
unmeasured. Both are covered by a deliberately conservative lower bound: each
missing day valued at the *weakest* August day of the same weekday
(~15,797 km total). Recorded in `widget-history.json` with its derivation.

## Automation

`.github/workflows/update-strava-data.yml` runs half-hourly (external
cron-job.org trigger, with an internal schedule as fallback) and commits
`widget-data.json`, `widget-history.json` and `strava-data.json`.

No Strava credentials are needed any more. The widget token is public — it
appears on the club page and is meant for embedding.
