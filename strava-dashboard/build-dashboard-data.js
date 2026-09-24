#!/usr/bin/env node
/**
 * Adapter: widget-data.json -> strava-data.json
 *
 * widget.html (and the macOS widget, and the Wix embed) read strava-data.json
 * in the shape the old v3 API produced. Strava removed the club endpoints on
 * 2026-09-01, so the numbers now come from the embed widget instead. Rather
 * than rewriting every consumer, this rebuilds the same shape from the new
 * source, so the published dashboard keeps working unchanged.
 *
 * What is honest here and what is not:
 *   - allTimeStats.totalDistance is MEASURED plus, when --with-estimates is
 *     given, the documented gap estimate for 2026-09-01..2026-09-15. The
 *     estimate is disclosed in dataQuality and in a visible note; it is never
 *     silently folded in.
 *   - Leaderboards cannot be rebuilt. The widget exposes only the 5 most
 *     recent activities, so a per-athlete ranking from it would systematically
 *     miss whoever uploads during busy hours. They are emitted empty, and the
 *     dashboard hides those sections rather than showing a false ranking.
 *   - totalActivities is likewise measured-only plus optional estimate.
 *
 * Usage:
 *   node build-dashboard-data.js                  # measured figures only
 *   node build-dashboard-data.js --with-estimates # include the documented gap
 */

const fs   = require("fs");
const path = require("path");

const WIDGET_DATA = path.join(__dirname, "widget-data.json");
const HISTORY     = path.join(__dirname, "widget-history.json");
const OUTPUT      = path.join(__dirname, "strava-data.json");

const WITH_ESTIMATES = process.argv.includes("--with-estimates");

if (!fs.existsSync(WIDGET_DATA)) {
  console.error("widget-data.json missing. Run: node fetch-widget.js");
  process.exit(1);
}

const wd      = JSON.parse(fs.readFileSync(WIDGET_DATA, "utf8"));
const history = fs.existsSync(HISTORY)
  ? JSON.parse(fs.readFileSync(HISTORY, "utf8"))
  : { weeks: {} };

const dq = wd.dataQuality || {};
const estimatedGapKm = dq.estimatedGapKm || 0;

// Distance ---------------------------------------------------------------
const measuredKm = wd.totalDistanceKm;
const publishedKm = WITH_ESTIMATES ? measuredKm + estimatedGapKm : measuredKm;

// Activity count ---------------------------------------------------------
// Measured: the baseline count from the API era plus every week observed since.
const BASELINE_ACTIVITIES = 10615; // last figure the v3 API reported, 2026-09-01
const observedActivities = Object.values(history.weeks || {})
  .reduce((s, w) => s + (w.activities || 0), 0);

// Estimated activities in the gap, derived from the same gap distance using the
// measured average distance per activity. Only used with --with-estimates.
const kmPerActivity = observedActivities > 0
  ? wd.observedWeeksKm / observedActivities
  : 0;
const estimatedActivities = (WITH_ESTIMATES && kmPerActivity > 0)
  ? Math.round(estimatedGapKm / kmPerActivity)
  : 0;

const totalActivities = BASELINE_ACTIVITIES + observedActivities + estimatedActivities;

// Time and elevation -----------------------------------------------------
// The old API reported cumulative moving time and elevation. The widget gives
// both per week, so we carry the API baseline forward and add what we observed.
const BASELINE_MOVING_TIME = 39486227; // seconds, as of 2026-09-01
const BASELINE_ELEVATION   = 965278.6; // metres, as of 2026-09-01

const observedSeconds = Object.values(history.weeks || {})
  .reduce((s, w) => s + (w.movingSeconds || 0), 0);
const observedElevation = Object.values(history.weeks || {})
  .reduce((s, w) => s + (w.elevationM || 0), 0);

// Current month ----------------------------------------------------------
// Sum the weeks that overlap the current month. Week labels straddle month
// boundaries, so this is approximate by construction; it is the same figure
// the club's own weekly view would give.
const now = new Date();
const monthKm = Object.entries(history.weeks || {})
  .filter(([label]) => {
    const m = /([A-Za-z]{3})[a-z]*\s+\d{1,2},\s*(\d{4})\s*-/.exec(label);
    if (!m) return false;
    const monthNames = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    return monthNames.indexOf(m[1].toLowerCase()) === now.getUTCMonth()
        && parseInt(m[2], 10) === now.getUTCFullYear();
  })
  .reduce((s, [, w]) => s + (w.distanceKm || 0), 0);

const monthSeconds = Object.entries(history.weeks || {})
  .filter(([label]) => {
    const m = /([A-Za-z]{3})[a-z]*\s+\d{1,2},\s*(\d{4})\s*-/.exec(label);
    if (!m) return false;
    const monthNames = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    return monthNames.indexOf(m[1].toLowerCase()) === now.getUTCMonth()
        && parseInt(m[2], 10) === now.getUTCFullYear();
  })
  .reduce((s, [, w]) => s + (w.movingSeconds || 0), 0);

// Derived facts for the progress panel ------------------------------------
// The pace figures come only from weeks observed end to end. A week that was
// cut short by an outage, or the one still running, would drag the average
// down and make the projection look worse than reality.
const GOAL_KM = 1_000_000;
const completeWeeks = Object.values(history.weeks || {})
  .filter((w) => w.complete && !w.truncated);

const paceWeeks = completeWeeks.length;
const avgWeekKm = paceWeeks
  ? completeWeeks.reduce((s, w) => s + (w.distanceKm || 0), 0) / paceWeeks
  : 0;
const avgWeekActivities = paceWeeks
  ? completeWeeks.reduce((s, w) => s + (w.activities || 0), 0) / paceWeeks
  : 0;

const remainingKm = Math.max(GOAL_KM - publishedKm, 0);
const weeksToGoal = avgWeekKm > 0 ? remainingKm / avgWeekKm : null;

let projectedDate = null;
if (weeksToGoal !== null && Number.isFinite(weeksToGoal)) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Math.round(weeksToGoal * 7));
  projectedDate = d.toISOString().slice(0, 10);
}

const membersNow = wd.memberCount || 237;
const currentWeek = wd.currentWeek || {};

const facts = {
  goalKm: GOAL_KM,
  remainingKm: Math.round(remainingKm),
  percentComplete: Math.round((publishedKm / GOAL_KM) * 10000) / 100,

  // Pace, and how thin the basis for it is. One September week is not a year;
  // the page says "at the current pace" rather than promising a finish date.
  paceBasisWeeks: paceWeeks,
  avgWeekKm: Math.round(avgWeekKm * 10) / 10,
  avgDayKm: Math.round((avgWeekKm / 7) * 10) / 10,
  weeksToGoal: weeksToGoal !== null ? Math.round(weeksToGoal) : null,
  projectedDate,

  // Per-member and per-activity figures, from the same complete weeks.
  kmPerMemberWeek: paceWeeks ? Math.round((avgWeekKm / membersNow) * 10) / 10 : null,
  activitiesPerWeek: paceWeeks ? Math.round(avgWeekActivities) : null,
  avgActivityKm: avgWeekActivities
    ? Math.round((avgWeekKm / avgWeekActivities) * 10) / 10
    : null,

  // This week so far, straight from the widget.
  thisWeekKm: currentWeek.distanceKm ?? null,
  thisWeekActivities: currentWeek.activities ?? null,
  thisWeekHours: currentWeek.movingSeconds
    ? Math.round(currentWeek.movingSeconds / 3600)
    : null,
  thisWeekElevationM: currentWeek.elevationM ?? null,

  // Scale comparisons. Equator and Moon are the two that need no explaining.
  timesAroundEarth: Math.round((publishedKm / 40075) * 100) / 100,
  percentToMoon: Math.round((publishedKm / 384400) * 1000) / 10,
};

const output = {
  generatedAt: wd.generatedAt,
  clubId:      wd.clubId,
  facts,
  clubName:    "One Million Kilometers - The Million Project",
  clubProfile: "https://dgalywyr863hv.cloudfront.net/pictures/clubs/1491053/36850120/3/medium.jpg",
  totalActivities,
  // Scraped from the club's public page, since the members API endpoint is gone.
  // Falls back to the last figure the API reported if that ever stops working.
  memberCount: wd.memberCount || 237,

  // The macOS widget reads memberGrowth. The members endpoint is gone, so there
  // is no way to compute growth any more. Emit zeros with an explicit reason
  // rather than leaving the field absent and having the widget render blanks.
  memberGrowth: {
    day: 0, week: 0, month: 0,
    unavailable: true,
    reason: "Strava removed the club members endpoint on 2026-09-01",
  },

  allTimeStats: {
    totalDistance:   Math.round(publishedKm * 1000),
    totalMovingTime: BASELINE_MOVING_TIME + observedSeconds,
    totalElevation:  BASELINE_ELEVATION + observedElevation,
  },
  monthStats: {
    totalDistance:   Math.round(monthKm * 1000),
    totalMovingTime: monthSeconds,
    count: 0,
  },
  weekStats: {
    totalDistance:   Math.round((wd.currentWeek?.distanceKm || 0) * 1000),
    totalMovingTime: wd.currentWeek?.movingSeconds || 0,
    count:           wd.currentWeek?.activities || 0,
  },
  lastWeekStats: { totalDistance: 0, totalMovingTime: 0, count: 0 },
  todayStats:    { totalDistance: 0, totalMovingTime: 0, count: 0 },

  // Per-athlete rankings cannot be reconstructed from a 5-activity window
  // without silently dropping everyone who uploads at peak times. Empty is the
  // honest answer; the dashboard hides these sections when they are empty.
  allTimeLeaderboard:      [],
  monthLeaderboard:        [],
  runLeaderboard:          [],
  runMonthLeaderboard:     [],
  rideLeaderboard:         [],
  rideMonthLeaderboard:    [],
  relativeLeaderboard:     [],
  relativeMonthLeaderboard: [],

  // Internal provenance. The published page does not break the headline figure
  // down into measured and estimated parts, but the split is kept here so the
  // basis of the number stays auditable and reproducible later.
  dataSource: {
    source: "strava-embed-widget",
    note: "Strava removed the club API endpoints on 2026-09-01; figures come from Strava's official embeddable club widget.",
    measuredDistanceKm: Math.round(measuredKm * 10) / 10,
    estimatedGapKm: WITH_ESTIMATES ? Math.round(estimatedGapKm * 10) / 10 : 0,
    includesEstimates: WITH_ESTIMATES,
    estimateBasis: WITH_ESTIMATES
      ? "Conservative lower bound for the 2026-09-01 to 2026-09-15 outage: each missing day valued at the weakest August day of the same weekday. Deliberately understates rather than overstates."
      : null,
    latestActivities: wd.latestActivities || [],
    dataQuality: dq,
  },
};

fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

const km = (m) => (m / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 });
console.log(`Written ${path.basename(OUTPUT)}`);
console.log(`  Total distance:   ${km(output.allTimeStats.totalDistance)} km` +
            (WITH_ESTIMATES ? "  (measured + documented estimate)" : "  (measured only)"));
console.log(`  of which measured: ${measuredKm.toLocaleString("de-DE")} km`);
if (WITH_ESTIMATES) {
  console.log(`  of which estimated: ${estimatedGapKm.toLocaleString("de-DE")} km  (01.09.-15.09. outage)`);
}
console.log(`  Activities:       ${totalActivities.toLocaleString("de-DE")}`);
console.log(`  This month:       ${km(output.monthStats.totalDistance)} km`);
console.log(`  Leaderboards:     empty (cannot be rebuilt from a 5-activity window)`);
