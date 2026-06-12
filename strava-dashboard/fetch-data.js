#!/usr/bin/env node
/**
 * Strava Club Data Fetcher
 *
 * Fundamental constraint: the Strava Club Activities API (/clubs/{id}/activities)
 * does NOT return start_date or any timestamp for individual activities.
 * The only date signal we have is _fetchedAt — the moment we first saw the
 * activity in an API response. We use this as a proxy for "when the activity
 * happened". This is imprecise but unavoidable given the API limitations:
 *
 *   - Activities appear in the club feed within hours of being uploaded.
 *   - _fetchedAt therefore approximates the activity date to within ~24h for
 *     daily runs, and to the current fetch interval for all others.
 *   - This means "this month" and "this week" stats are based on when we first
 *     saw the activity, not the athlete's exact finish time.
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials.
 *   2. node fetch-data.js
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  });
}
loadEnv();

const CLUB_ID       = process.env.STRAVA_CLUB_ID || "1491053";
const CLIENT_ID     = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.STRAVA_REFRESH_TOKEN;

const OUTPUT_FILE        = path.join(__dirname, "strava-data.json");
const CACHE_FILE         = path.join(__dirname, "strava-cache.json");
const MEMBER_HISTORY_FILE= path.join(__dirname, "member-history.json");

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error("Missing STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, or STRAVA_REFRESH_TOKEN in .env");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(body).toString();
    const u = new URL(url);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname, method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded",
                   "Content-Length": Buffer.byteLength(data) } },
      (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve(JSON.parse(b))); }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search,
        headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let b = ""; res.on("data", (c) => (b += c));
        res.on("end", () => {
          if (res.statusCode === 429) reject(new Error("Rate limited (429). Try again later."));
          else resolve(JSON.parse(b));
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Strava API
// ---------------------------------------------------------------------------
async function refreshAccessToken() {
  console.log("Refreshing access token...");
  const res = await httpsPost("https://www.strava.com/oauth/token", {
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN, grant_type: "refresh_token",
  });
  if (!res.access_token) throw new Error("Token refresh failed: " + JSON.stringify(res));
  console.log(`Access token obtained (expires ${new Date(res.expires_at * 1000).toISOString()})`);
  return res.access_token;
}

async function fetchAllActivities(token) {
  console.log(`Fetching activities for club ${CLUB_ID}...`);
  const all = [];
  let page = 1;
  while (true) {
    const url = `https://www.strava.com/api/v3/clubs/${CLUB_ID}/activities?per_page=200&page=${page}`;
    const batch = await httpsGet(url, token);
    if (!Array.isArray(batch)) { console.error("Unexpected response:", batch); break; }
    all.push(...batch);
    console.log(`  Page ${page}: ${batch.length} activities (total: ${all.length})`);
    if (batch.length < 200) break;
    page++;
    await new Promise((r) => setTimeout(r, 300));
  }
  return all;
}

async function fetchClubInfo(token) {
  return httpsGet(`https://www.strava.com/api/v3/clubs/${CLUB_ID}`, token);
}

// ---------------------------------------------------------------------------
// Activity cache
//
// Key design decisions:
//
// 1. _fetchedAt is the only date we store. We do NOT store _startDate or
//    _hasRealDate — both were misleading abstractions. _fetchedAt IS the date.
//
// 2. Deduplication uses a fingerprint of athlete + distance + times. This is
//    stable: the same activity always produces the same key.
//
// 3. On migration: existing cache entries that were written before this version
//    may have _startDate set to _fetchedAt (from a previous migration pass).
//    We clean those up on load to keep the schema simple.
// ---------------------------------------------------------------------------
function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      // Normalise legacy schema: remove _startDate/_hasRealDate, ensure _fetchedAt.
      let migrated = 0;
      for (const act of cache.activities) {
        if (act._startDate !== undefined) { delete act._startDate; migrated++; }
        if (act._hasRealDate !== undefined) { delete act._hasRealDate; migrated++; }
        // If _fetchedAt is missing (should not happen), fall back to epoch so the
        // activity goes into all-time but not into any period leaderboard.
        if (!act._fetchedAt) act._fetchedAt = "2020-01-01T00:00:00.000Z";
      }
      if (migrated > 0) console.log(`  Cache migration: cleaned legacy date fields on ${migrated} entries`);
      return cache;
    } catch (_) {}
  }
  return { activities: [] };
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function activityKey(act) {
  const name = act.athlete ? `${act.athlete.firstname}_${act.athlete.lastname}` : "unknown";
  return `${name}__${act.distance}__${act.moving_time}__${act.elapsed_time}`;
}

function mergeIntoCache(cache, freshActivities) {
  const now = new Date().toISOString();
  const seen = new Set(cache.activities.map((a) => a._key));
  let newCount = 0;
  for (const act of freshActivities) {
    const key = activityKey(act);
    if (!seen.has(key)) {
      cache.activities.push({
        ...act,
        type: act.type || "Unknown",
        kilojoules: act.kilojoules || 0,
        _key: key,
        _fetchedAt: now,
      });
      seen.add(key);
      newCount++;
    }
  }
  console.log(`  ${newCount} new activities added (total: ${cache.activities.length})`);
  return cache;
}

// ---------------------------------------------------------------------------
// Member history
// ---------------------------------------------------------------------------
function loadMemberHistory() {
  if (fs.existsSync(MEMBER_HISTORY_FILE)) {
    try { return JSON.parse(fs.readFileSync(MEMBER_HISTORY_FILE, "utf8")); } catch (_) {}
  }
  return { snapshots: [] };
}

function saveMemberHistory(h) {
  fs.writeFileSync(MEMBER_HISTORY_FILE, JSON.stringify(h, null, 2));
}

function recordMemberSnapshot(history, count) {
  const today = new Date().toISOString().slice(0, 10);
  const last  = history.snapshots[history.snapshots.length - 1];
  if (!last || last.date !== today) {
    history.snapshots.push({ date: today, count });
    console.log(`  Member snapshot: ${count} on ${today}`);
  }
  if (history.snapshots.length > 90) history.snapshots = history.snapshots.slice(-90);
  return history;
}

function computeMemberGrowth(history) {
  const snaps = history.snapshots;
  if (!snaps.length) return { current: null, lastWeek: null, lastMonth: null };
  const current  = snaps[snaps.length - 1].count;
  const todayStr = snaps[snaps.length - 1].date;

  function countDaysAgo(days) {
    const target = new Date(todayStr);
    target.setDate(target.getDate() - days);
    const ts = target.toISOString().slice(0, 10);
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].date <= ts) return snaps[i].count;
    }
    return null;
  }
  return { current, lastWeek: countDaysAgo(7), lastMonth: countDaysAgo(30) };
}

// ---------------------------------------------------------------------------
// Stats computation
//
// Period boundaries are computed in UTC, matching _fetchedAt which is also UTC.
// "This month" = calendar month of the fetch timestamp.
// "This week"  = Monday–Sunday week containing today (UTC).
// "Last week"  = the previous Monday–Sunday week.
// "Today"      = UTC calendar day of today.
//
// All 742 cached activities have _fetchedAt. We use that as the single source
// of truth for period assignment. No fallbacks, no _startDate.
// ---------------------------------------------------------------------------

const RUN_TYPES  = new Set(["run","walk","hike","weighttraining","workout","yoga","swim","rowing","elliptical","stairstepper","nordicski","alpineski","snowboard","iceskate","inlineskate","wheelchair"]);
const RIDE_TYPES = new Set(["ride","virtualride","ebikeride","velomobile","handcycle"]);

function effortPoints(act) {
  const type    = (act.type || "").toLowerCase();
  const distKm  = (act.distance || 0) / 1000;
  const elevM   = act.total_elevation_gain || 0;
  const movTime = act.moving_time || 0;
  const speedKmh= movTime > 0 ? distKm / (movTime / 3600) : 0;
  let sportFactor, hmFactor, refSpeed;
  if      (RUN_TYPES.has(type))  { sportFactor = 1.0; hmFactor = 0.010; refSpeed = 10; }
  else if (RIDE_TYPES.has(type)) { sportFactor = 0.4; hmFactor = 0.008; refSpeed = 20; }
  else                           { sportFactor = 0.6; hmFactor = 0.010; refSpeed =  6; }
  const effectiveDist = distKm + elevM * hmFactor;
  const speedMulti    = speedKmh > 0 ? speedKmh / refSpeed : 1.0;
  return effectiveDist * sportFactor * speedMulti;
}

function computeStats(cachedActivities) {
  const now = new Date();

  // --- Period boundaries in UTC ---
  // Today: midnight UTC
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // This month: first second of current UTC month
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // This week: last Monday 00:00 UTC
  const dow = now.getUTCDay(); // 0=Sun
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(todayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - daysToMon);

  // Last week: the week before that
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  const lastWeekEnd = weekStart; // exclusive upper bound

  console.log(`  Period boundaries (UTC):`);
  console.log(`    Today:      ${todayStart.toISOString()}`);
  console.log(`    This week:  ${weekStart.toISOString()}`);
  console.log(`    This month: ${monthStart.toISOString()}`);

  const allTimeStats  = { totalDistance: 0, totalMovingTime: 0, totalElevation: 0 };
  const monthStats    = { totalDistance: 0, totalMovingTime: 0, count: 0 };
  const weekStats     = { totalDistance: 0, totalMovingTime: 0, count: 0 };
  const lastWeekStats = { totalDistance: 0, totalMovingTime: 0, count: 0 };
  const todayStats    = { totalDistance: 0, totalMovingTime: 0, count: 0 };

  const athletes = {};

  for (const act of cachedActivities) {
    const athleteKey = act.athlete
      ? `${act.athlete.firstname}_${act.athlete.lastname}`
      : "unknown";

    if (!athletes[athleteKey]) {
      athletes[athleteKey] = {
        name:          act.athlete ? `${act.athlete.firstname} ${act.athlete.lastname}` : "Unknown",
        profile:       act.athlete?.profile_medium || act.athlete?.profile || null,
        allTime:       { distance: 0, movingTime: 0, count: 0 },
        month:         { distance: 0, movingTime: 0, count: 0 },
        run:           { distance: 0, movingTime: 0, count: 0 },
        runMonth:      { distance: 0, movingTime: 0, count: 0 },
        ride:          { distance: 0, movingTime: 0, count: 0 },
        rideMonth:     { distance: 0, movingTime: 0, count: 0 },
        relative:      { points: 0, count: 0 },
        relativeMonth: { points: 0, count: 0 },
      };
    }

    const dist = act.distance || 0;
    const time = act.moving_time || 0;
    const elev = act.total_elevation_gain || 0;
    const type = (act.type || "").toLowerCase();
    const ep   = effortPoints(act);

    // _fetchedAt is the authoritative date. Every cached activity has it.
    const fetchedAt = new Date(act._fetchedAt);

    const isThisMonth = fetchedAt >= monthStart;
    const isThisWeek  = fetchedAt >= weekStart;
    const isLastWeek  = fetchedAt >= lastWeekStart && fetchedAt < lastWeekEnd;
    const isToday     = fetchedAt >= todayStart;

    // All-time
    allTimeStats.totalDistance   += dist;
    allTimeStats.totalMovingTime += time;
    allTimeStats.totalElevation  += elev;
    athletes[athleteKey].allTime.distance   += dist;
    athletes[athleteKey].allTime.movingTime += time;
    athletes[athleteKey].allTime.count      += 1;
    athletes[athleteKey].relative.points    += ep;
    athletes[athleteKey].relative.count     += 1;

    const isRun  = RUN_TYPES.has(type);
    const isRide = RIDE_TYPES.has(type);
    if (isRun)  { athletes[athleteKey].run.distance  += dist; athletes[athleteKey].run.movingTime  += time; athletes[athleteKey].run.count  += 1; }
    if (isRide) { athletes[athleteKey].ride.distance += dist; athletes[athleteKey].ride.movingTime += time; athletes[athleteKey].ride.count += 1; }

    // This month
    if (isThisMonth) {
      monthStats.totalDistance   += dist;
      monthStats.totalMovingTime += time;
      monthStats.count           += 1;
      athletes[athleteKey].month.distance         += dist;
      athletes[athleteKey].month.movingTime       += time;
      athletes[athleteKey].month.count            += 1;
      athletes[athleteKey].relativeMonth.points   += ep;
      athletes[athleteKey].relativeMonth.count    += 1;
      if (isRun)  { athletes[athleteKey].runMonth.distance  += dist; athletes[athleteKey].runMonth.movingTime  += time; athletes[athleteKey].runMonth.count  += 1; }
      if (isRide) { athletes[athleteKey].rideMonth.distance += dist; athletes[athleteKey].rideMonth.movingTime += time; athletes[athleteKey].rideMonth.count += 1; }
    }

    // This week
    if (isThisWeek) {
      weekStats.totalDistance   += dist;
      weekStats.totalMovingTime += time;
      weekStats.count           += 1;
    }

    // Last week
    if (isLastWeek) {
      lastWeekStats.totalDistance   += dist;
      lastWeekStats.totalMovingTime += time;
      lastWeekStats.count           += 1;
    }

    // Today
    if (isToday) {
      todayStats.totalDistance   += dist;
      todayStats.totalMovingTime += time;
      todayStats.count           += 1;
    }
  }

  function makeLeaderboard(athletes, sortKey, filterKey) {
    return Object.values(athletes)
      .filter((a) => a[filterKey].distance > 0)
      .sort((a, b) => b[sortKey].distance - a[sortKey].distance)
      .map((a, i) => ({ rank: i + 1, ...a }));
  }

  return {
    allTimeStats,
    monthStats,
    weekStats,
    lastWeekStats,
    todayStats,
    allTimeLeaderboard:      makeLeaderboard(athletes, "allTime",  "allTime"),
    monthLeaderboard:        makeLeaderboard(athletes, "month",    "month"),
    runLeaderboard:          makeLeaderboard(athletes, "run",      "run"),
    runMonthLeaderboard:     makeLeaderboard(athletes, "runMonth", "runMonth"),
    rideLeaderboard:         makeLeaderboard(athletes, "ride",     "ride"),
    rideMonthLeaderboard:    makeLeaderboard(athletes, "rideMonth","rideMonth"),
    relativeLeaderboard:     Object.values(athletes).filter((a) => a.relative.points > 0)
                               .sort((a, b) => b.relative.points - a.relative.points)
                               .map((a, i) => ({ rank: i + 1, ...a })),
    relativeMonthLeaderboard:Object.values(athletes).filter((a) => a.relativeMonth.points > 0)
                               .sort((a, b) => b.relativeMonth.points - a.relativeMonth.points)
                               .map((a, i) => ({ rank: i + 1, ...a })),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const token = await refreshAccessToken();
  const [clubInfo, freshActivities] = await Promise.all([
    fetchClubInfo(token),
    fetchAllActivities(token),
  ]);

  const memberCount   = clubInfo.member_count || 0;
  const memberHistory = loadMemberHistory();
  recordMemberSnapshot(memberHistory, memberCount);
  saveMemberHistory(memberHistory);
  const memberGrowth = computeMemberGrowth(memberHistory);

  const cache = loadCache();
  mergeIntoCache(cache, freshActivities);
  saveCache(cache);

  console.log(`\nComputing stats for ${cache.activities.length} activities...`);
  const stats = computeStats(cache.activities);

  const output = {
    generatedAt: new Date().toISOString(),
    clubId:      CLUB_ID,
    clubName:    clubInfo.name || `Club ${CLUB_ID}`,
    clubProfile: clubInfo.profile_medium || null,
    totalActivities: cache.activities.length,
    memberCount,
    memberGrowth,
    ...stats,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\nDone. Written to ${OUTPUT_FILE}`);
  console.log(`  All-time:   ${(output.allTimeStats.totalDistance / 1000).toFixed(1)} km`);
  console.log(`  This month: ${(output.monthStats.totalDistance / 1000).toFixed(1)} km (${output.monthStats.count} activities)`);
  console.log(`  This week:  ${(output.weekStats.totalDistance / 1000).toFixed(1)} km (${output.weekStats.count} activities)`);
  console.log(`  Today:      ${(output.todayStats.totalDistance / 1000).toFixed(1)} km (${output.todayStats.count} activities)`);
  console.log(`  Members:    ${memberCount}`);
  console.log(`  Month leaderboard: ${output.monthLeaderboard.length} athletes`);
}

main().catch((err) => { console.error("Error:", err.message); process.exit(1); });
