#!/usr/bin/env node
/**
 * Strava club data via the official embed widget.
 *
 * Background: Strava removed /clubs/{id}/activities, /members and /admins from
 * the v3 API on 2026-09-01, which is why the API pipeline stopped that day.
 * There is no replacement endpoint.
 *
 * This uses Strava's own embeddable club widget instead. It is a documented
 * feature ("Embed the following code in your blog"), served without a login,
 * and addressed by a permanent token found on the club page. Two views exist:
 *
 *   show_rides=false  weekly totals: activities, distance, time, elevation
 *   show_rides=true   the latest ~5 activities WITH a real calendar date
 *
 * Limits worth knowing:
 *   - Totals cover the CURRENT WEEK only. There is no all-time figure and no
 *     history, so a cumulative total has to be accumulated here, week by week.
 *   - The activity list is a short excerpt, not the full feed. It cannot
 *     reconstruct per-athlete leaderboards.
 *   - This parses HTML. If Strava restyles the widget, the selectors need a
 *     look. The script fails loudly rather than writing bad numbers.
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");

const CLUB_ID      = process.env.STRAVA_CLUB_ID || "1491053";
const WIDGET_TOKEN = process.env.STRAVA_WIDGET_TOKEN || "de2f26ef03578b415a9e0a94ae8117486f8f1687";

const HISTORY_FILE = path.join(__dirname, "widget-history.json");
const OUTPUT_FILE  = path.join(__dirname, "widget-data.json");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
           "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    const u = new URL(url);
    https.get(
      { hostname: u.hostname, path: u.pathname + u.search, headers: { "User-Agent": UA } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(get(new URL(res.headers.location, url).href, redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let b = ""; res.setEncoding("utf8");
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve(b));
      }
    ).on("error", reject);
  });
}

const widgetUrl = (showRides) =>
  `https://www.strava.com/clubs/${CLUB_ID}/latest-rides/${WIDGET_TOKEN}?show_rides=${showRides}`;

// The widget carries no member count, and the members API endpoint was removed
// with the rest. The club's public page still states it, though: it renders
// server-side into the Next.js payload, readable without a login.
//
// Best-effort by design. A failure here must not abort the run — kilometres
// matter more than the headcount — so the caller falls back to the last known
// value rather than failing or publishing a zero.
async function fetchMemberCount() {
  const html = await get(`https://www.strava.com/clubs/${CLUB_ID}`);

  // Preferred: the structured payload. Survives CSS/markup restyles.
  const payload = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (payload) {
    try {
      const n = JSON.parse(payload[1])?.props?.pageProps?.club?.memberCount;
      if (Number.isInteger(n) && n > 0) return { count: n, via: "__NEXT_DATA__" };
    } catch (_) { /* fall through to the text scan */ }
  }

  // Fallback: the rendered "238 members" heading.
  const text = /([\d,.]+)\s+members/i.exec(html);
  if (text) {
    const n = parseInt(text[1].replace(/[,.]/g, ""), 10);
    if (Number.isInteger(n) && n > 0) return { count: n, via: "page text" };
  }

  throw new Error("Member count not found on the public club page");
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

// Each stat is <span class='stat-subtext'>Label</span><b class='stat-text'>Value</b>.
// We read the label so a reordered widget cannot silently swap the numbers.
function parseWeeklyStats(html) {
  const stats = {};
  const re = /stat-subtext'>\s*([^<]+?)\s*<\/span>\s*<b class='stat-text'>\s*([\s\S]*?)<\/b>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    stats[m[1].trim().toLowerCase()] = stripTags(m[2]);
  }

  const num = (s) => (s ? parseFloat(s.replace(/,/g, "").replace(/[^\d.]/g, "")) : NaN);

  const distanceKm  = num(stats["distance"]);
  const activities  = num(stats["activities"]);
  const elevationM  = num(stats["elevation"]);

  let movingSeconds = null;
  if (stats["time"]) {
    const h = /(\d[\d,]*)\s*h/.exec(stats["time"]);
    const mi = /(\d+)\s*m/.exec(stats["time"]);
    movingSeconds = (h ? parseInt(h[1].replace(/,/g, ""), 10) * 3600 : 0) +
                    (mi ? parseInt(mi[1], 10) * 60 : 0);
  }

  const weekMatch = /Week of ([^<]+?)\s*<\/h2>/.exec(html);

  if (!Number.isFinite(distanceKm) || !Number.isFinite(activities)) {
    throw new Error(
      "Could not parse weekly stats. Strava likely changed the widget markup. " +
      "Parsed labels: " + JSON.stringify(Object.keys(stats))
    );
  }

  return {
    week: weekMatch ? stripTags(weekMatch[1]) : null,
    activities, distanceKm, elevationM, movingSeconds,
    raw: stats,
  };
}

// Latest activities, each with a real calendar date (better than the old API,
// which exposed no timestamp at all).
function parseActivities(html) {
  const listMatch = /<ul class='activities'>([\s\S]*?)<\/ul>\s*<\/div>/.exec(html);
  if (!listMatch) return [];

  const out = [];
  // Split on top-level <li>, then keep only blocks that carry an athlete link.
  for (const block of listMatch[1].split(/<li>\s*(?=<a)/)) {
    if (!/href="\/athletes\//.test(block)) continue;

    const athleteId  = /href="\/athletes\/(\d+)"/.exec(block);
    const athlete    = /class='athlete-name'>([^<]+)</.exec(block);
    const activityId = /activities\/(\d+)/.exec(block);
    const title      = /title="([^"]+)"\s+href="https:\/\/www\.strava\.com\/activities/.exec(block);
    const date       = /class='timestamp'>[^,]+,\s*([^<]+)</.exec(block);

    const statList = /<ul class='stats'>([\s\S]*?)<\/ul>/.exec(block);
    const stats = statList
      ? [...statList[1].matchAll(/<li>([^<]+)<\/li>/g)].map((m) => stripTags(m[1]))
      : [];

    const distStat = stats.find((x) => /km|mi\b/.test(x));

    out.push({
      athlete:    athlete ? stripTags(athlete[1]) : null,
      athleteId:  athleteId ? athleteId[1] : null,
      activityId: activityId ? activityId[1] : null,
      name:       title ? stripTags(title[1]) : null,
      date:       date ? stripTags(date[1]) : null,
      distanceKm: distStat ? parseFloat(distStat.replace(/,/g, "")) : null,
      stats,
    });
  }
  return out;
}

// Week labels look like "Sep 7, 2026 - Sep 13, 2026". Returns the ms timestamp
// of the end of that last day (23:59:59 UTC), or null if the label is unusable.
// Strava renders the label in the club's timezone while we compare against UTC;
// the 6h grace period in the truncation check absorbs that offset.
const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5,
                 jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };

function weekEndUtc(label) {
  if (!label) return null;
  const parts = label.split(/\s*-\s*/);
  const last = parts[parts.length - 1];
  const m = /([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})/.exec(last || "");
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (mon === undefined) return null;
  return Date.UTC(parseInt(m[3], 10), mon, parseInt(m[2], 10), 23, 59, 59, 999);
}

async function main() {
  console.log(`Fetching club ${CLUB_ID} via embed widget...`);

  const [sumHtml, actHtml] = await Promise.all([
    get(widgetUrl(false)),
    get(widgetUrl(true)),
  ]);

  const weekly     = parseWeeklyStats(sumHtml);
  const activities = parseActivities(actHtml);

  console.log(`  Week:       ${weekly.week}`);
  console.log(`  Activities: ${weekly.activities}`);
  console.log(`  Distance:   ${weekly.distanceKm.toLocaleString("de-DE")} km`);
  console.log(`  Elevation:  ${weekly.elevationM?.toLocaleString("de-DE")} m`);
  console.log(`  Latest activities parsed: ${activities.length}`);

  // Best-effort: keep the previous figure if the page shape changed, so a
  // scraping hiccup never turns into a published "0 members".
  let memberCount = null;
  try {
    const m = await fetchMemberCount();
    memberCount = m.count;
    console.log(`  Members:    ${memberCount} (via ${m.via})`);
  } catch (e) {
    console.error(`  Member count unavailable (keeping last known): ${e.message}`);
  }

  // The widget only ever reports the current week, so history is kept here.
  // Keyed by week label: re-running on the same day overwrites that week's
  // entry with the newer figure instead of double counting.
  let history = { weeks: {}, baseline: null };
  if (fs.existsSync(HISTORY_FILE)) {
    try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch (_) {}
  }
  history.weeks = history.weeks || {};

  const key = weekly.week || new Date().toISOString().slice(0, 10);
  const prev = history.weeks[key];

  // A week's figure only ever grows. If the widget reports LESS than we already
  // recorded for this week, something is wrong (wrong club, a partial render, a
  // reset) and overwriting would silently shrink the cumulative total.
  if (prev && weekly.distanceKm < prev.distanceKm - 0.05) {
    throw new Error(
      `Refusing to overwrite week "${key}": widget reports ${weekly.distanceKm} km ` +
      `but ${prev.distanceKm} km was already recorded. A week total cannot shrink.`
    );
  }

  history.weeks[key] = {
    activities: weekly.activities,
    distanceKm: weekly.distanceKm,
    elevationM: weekly.elevationM,
    movingSeconds: weekly.movingSeconds,
    updatedAt: new Date().toISOString(),
    // Sunday 23:59 UTC of this week. Past it, the figure can no longer change,
    // so the week counts as complete rather than merely "last seen".
    complete: weekEndUtc(weekly.week) !== null && Date.now() > weekEndUtc(weekly.week),
  };
  console.log(prev
    ? `  Week ${key} updated (was ${prev.distanceKm} km, +${(weekly.distanceKm - prev.distanceKm).toFixed(1)} km)`
    : `  Week ${key} recorded for the first time`);

  // Mark every past week complete and warn about any that stopped being updated
  // before the week ended. Such a week is an undercount: the job was down, and
  // the kilometres logged after the last successful run are simply missing.
  const stale = [];
  for (const [wk, rec] of Object.entries(history.weeks)) {
    const end = weekEndUtc(wk);
    if (end === null || Date.now() <= end) continue;
    if (!rec.complete) {
      rec.complete = true;
      // Updated more than 6h before the week closed: very likely truncated.
      if (new Date(rec.updatedAt).getTime() < end - 6 * 3600 * 1000) {
        rec.truncated = true;
        stale.push({ wk, rec, end });
      }
    }
  }
  if (stale.length) {
    console.log("\n  !! Incomplete weeks (job was down before the week ended):");
    for (const { wk, rec, end } of stale) {
      const hrs = Math.round((end - new Date(rec.updatedAt).getTime()) / 3600000);
      console.log(`     ${wk}: last seen ${rec.updatedAt.slice(0, 16)}, ${hrs}h before week end`);
      console.log(`     -> recorded ${rec.distanceKm} km is an UNDERCOUNT`);
    }
  }

  // Member count: keep the last known figure when a fetch fails, and record one
  // dated sample per day so membership growth stays visible over time.
  if (memberCount !== null) {
    history.members = history.members || { current: null, history: {} };
    history.members.current = memberCount;
    history.members.updatedAt = new Date().toISOString();
    history.members.history[new Date().toISOString().slice(0, 10)] = memberCount;
  }
  const effectiveMemberCount = history.members?.current ?? null;

  // Cumulative total = frozen API baseline + every week observed since.
  // baseline is set once, from the last good API figure (see --set-baseline).
  const weeksSum = Object.values(history.weeks)
    .reduce((s, w) => s + (w.distanceKm || 0), 0);
  const baselineKm = history.baseline ? history.baseline.distanceKm : 0;

  // Estimates are kept strictly apart from measurements. totalDistanceKm counts
  // only observed kilometres and is the number to publish. Any estimate for a
  // truncated week is reported separately so nobody can mistake a projection
  // for a reading.
  const weekGapKm = Object.values(history.weeks)
    .reduce((s, w) => s + (w.estimatedMissingKm || 0), 0);

  // Periods with no week entry at all (the API was already dead, widget
  // collection had not started yet) live in their own list.
  const periodGapKm = (history.estimatedPeriods || [])
    .reduce((s, p) => s + (p.distanceKm || 0), 0);

  const estimatedGapKm = weekGapKm + periodGapKm;

  const truncatedWeeks = Object.entries(history.weeks)
    .filter(([, w]) => w.truncated)
    .map(([wk, w]) => ({
      week: wk,
      recordedKm: w.distanceKm,
      lastSeen: w.updatedAt,
      estimatedMissingKm: w.estimatedMissingKm || null,
    }));

  const output = {
    generatedAt: new Date().toISOString(),
    source: "strava-embed-widget",
    clubId: CLUB_ID,
    memberCount: effectiveMemberCount,
    memberCountUpdatedAt: history.members?.updatedAt || null,
    currentWeek: weekly,
    latestActivities: activities,
    baseline: history.baseline,
    observedWeeksKm: Math.round(weeksSum * 10) / 10,
    totalDistanceKm: Math.round((baselineKm + weeksSum) * 10) / 10,
    weeksTracked: Object.keys(history.weeks).length,
    // Measurement quality, for the dashboard to show honestly.
    dataQuality: {
      truncatedWeeks,
      estimatedPeriods: history.estimatedPeriods || [],
      estimatedGapKm: Math.round(estimatedGapKm * 10) / 10,
      totalWithEstimatesKm: estimatedGapKm
        ? Math.round((baselineKm + weeksSum + estimatedGapKm) * 10) / 10
        : null,
    },
  };

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\n  Baseline:   ${baselineKm.toLocaleString("de-DE")} km`);
  console.log(`  Observed:   ${output.observedWeeksKm.toLocaleString("de-DE")} km (${output.weeksTracked} week(s))`);
  console.log(`  TOTAL:      ${output.totalDistanceKm.toLocaleString("de-DE")} km  (measured only)`);
  if (estimatedGapKm) {
    console.log(`  Est. gap:   ${estimatedGapKm.toLocaleString("de-DE")} km in ${truncatedWeeks.length} truncated week(s)`);
    console.log(`  With est.:  ${output.dataQuality.totalWithEstimatesKm.toLocaleString("de-DE")} km  (NOT a measurement)`);
  }
  console.log(`\nWritten: ${path.basename(OUTPUT_FILE)}, ${path.basename(HISTORY_FILE)}`);
}

// One-off: seed the cumulative total with the last figure the API produced.
if (process.argv.includes("--set-baseline")) {
  const i = process.argv.indexOf("--set-baseline");
  const km = parseFloat(process.argv[i + 1]);
  if (!Number.isFinite(km)) {
    console.error("Usage: node fetch-widget.js --set-baseline <km>");
    process.exit(1);
  }
  let history = { weeks: {}, baseline: null };
  if (fs.existsSync(HISTORY_FILE)) {
    try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch (_) {}
  }
  history.baseline = {
    distanceKm: km,
    note: "Last figure from the v3 API before the club endpoints were removed",
    asOf: "2026-09-01T16:01:01.586Z",
    setAt: new Date().toISOString(),
  };
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  console.log(`Baseline set to ${km.toLocaleString("de-DE")} km.`);
  process.exit(0);
}

// One-off: record an estimate for a week the job missed part of. The estimate
// is stored on that week but never added to totalDistanceKm; it surfaces only
// under dataQuality, so a projection can never be mistaken for a measurement.
//   node fetch-widget.js --estimate-week "Sep 7, 2026 - Sep 13, 2026" 5881 "extrapolated from 1708 km/day over 3.56 observed days"
if (process.argv.includes("--estimate-week")) {
  const i = process.argv.indexOf("--estimate-week");
  const week = process.argv[i + 1];
  const km   = parseFloat(process.argv[i + 2]);
  const note = process.argv[i + 3];
  if (!week || !Number.isFinite(km) || !note) {
    console.error('Usage: node fetch-widget.js --estimate-week "<week label>" <km> "<how it was derived>"');
    console.error("The note is required: an estimate without a stated method is not reusable.");
    process.exit(1);
  }
  if (!fs.existsSync(HISTORY_FILE)) {
    console.error("No history file yet. Run the fetcher first.");
    process.exit(1);
  }
  const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  if (!history.weeks || !history.weeks[week]) {
    console.error(`Week "${week}" not found. Known weeks:`);
    for (const k of Object.keys(history.weeks || {})) console.error(`  ${k}`);
    process.exit(1);
  }
  history.weeks[week].estimatedMissingKm = km;
  history.weeks[week].estimateNote = note;
  history.weeks[week].estimateSetAt = new Date().toISOString();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  console.log(`Estimate recorded for "${week}": ${km.toLocaleString("de-DE")} km missing.`);
  console.log(`Method: ${note}`);
  console.log("\nThis is kept out of totalDistanceKm and reported under dataQuality only.");
  process.exit(0);
}

// One-off: record an estimate for a period that has no week entry at all —
// the stretch after the API died but before widget collection began. Like the
// per-week estimate, it stays out of totalDistanceKm.
//   node fetch-widget.js --estimate-period "2026-09-01..2026-09-06" 12957 "<method>"
if (process.argv.includes("--estimate-period")) {
  const i = process.argv.indexOf("--estimate-period");
  const range = process.argv[i + 1];
  const km    = parseFloat(process.argv[i + 2]);
  const note  = process.argv[i + 3];
  if (!range || !Number.isFinite(km) || !note) {
    console.error('Usage: node fetch-widget.js --estimate-period "<from>..<to>" <km> "<how it was derived>"');
    process.exit(1);
  }
  let history = { weeks: {}, baseline: null };
  if (fs.existsSync(HISTORY_FILE)) {
    try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch (_) {}
  }
  history.estimatedPeriods = history.estimatedPeriods || [];
  const existing = history.estimatedPeriods.findIndex((p) => p.range === range);
  const entry = { range, distanceKm: km, note, setAt: new Date().toISOString() };
  if (existing >= 0) {
    console.log(`Replacing existing estimate for ${range} (was ${history.estimatedPeriods[existing].distanceKm} km).`);
    history.estimatedPeriods[existing] = entry;
  } else {
    history.estimatedPeriods.push(entry);
  }
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  console.log(`Estimate recorded for ${range}: ${km.toLocaleString("de-DE")} km.`);
  console.log(`Method: ${note}`);
  console.log("\nThis is kept out of totalDistanceKm and reported under dataQuality only.");
  process.exit(0);
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
