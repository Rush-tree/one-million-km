#!/usr/bin/env node
/**
 * Strava Club Data Fetcher
 * Fetches all club activities and caches stats as strava-data.json
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. node fetch-data.js
 *   3. Schedule via cron: 0 * * * * cd /path/to/strava-dashboard && node fetch-data.js
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Config — reads from .env or environment variables
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8")
      .split("\n")
      .forEach((line) => {
        const [key, ...rest] = line.split("=");
        if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
      });
  }
}

loadEnv();

const CLUB_ID = process.env.STRAVA_CLUB_ID || "1491053";
const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.STRAVA_REFRESH_TOKEN;
const OUTPUT_FILE = path.join(__dirname, "strava-data.json");
const CACHE_FILE = path.join(__dirname, "strava-cache.json");

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error(
    "Missing STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, or STRAVA_REFRESH_TOKEN in .env"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(body).toString();
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(JSON.parse(body)));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { Authorization: `Bearer ${token}` },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode === 429) {
          reject(new Error("Rate limited (429). Try again later."));
        } else {
          resolve(JSON.parse(body));
        }
      });
    });
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
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  if (!res.access_token) {
    throw new Error("Token refresh failed: " + JSON.stringify(res));
  }
  console.log(`Access token obtained (expires ${new Date(res.expires_at * 1000).toISOString()})`);
  return res.access_token;
}

async function fetchAllActivities(token) {
  console.log(`Fetching all activities for club ${CLUB_ID}...`);
  const all = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const url = `https://www.strava.com/api/v3/clubs/${CLUB_ID}/activities?per_page=${perPage}&page=${page}`;
    const batch = await httpsGet(url, token);

    if (!Array.isArray(batch)) {
      console.error("Unexpected response:", batch);
      break;
    }

    all.push(...batch);
    console.log(`  Page ${page}: ${batch.length} activities (total so far: ${all.length})`);

    if (batch.length < perPage) break;
    page++;

    // Polite rate-limit pause between pages
    await new Promise((r) => setTimeout(r, 300));
  }

  return all;
}

async function fetchClubInfo(token) {
  return httpsGet(`https://www.strava.com/api/v3/clubs/${CLUB_ID}`, token);
}

// ---------------------------------------------------------------------------
// Activity cache — persists seen activities with a fetchedAt timestamp
// because Strava's club activities API does not return start_date.
// ---------------------------------------------------------------------------
function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try { return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch (_) {}
  }
  return { activities: [] };
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// Returns a stable fingerprint for deduplication.
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
      cache.activities.push({ ...act, _key: key, _fetchedAt: now });
      seen.add(key);
      newCount++;
    }
  }

  console.log(`  ${newCount} new activities added to cache (total: ${cache.activities.length})`);
  return cache;
}

// ---------------------------------------------------------------------------
// Stats computation
// ---------------------------------------------------------------------------
function computeStats(cachedActivities) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  const allTimeStats = { totalDistance: 0, totalMovingTime: 0, totalElevation: 0 };
  const monthStats = { totalDistance: 0, totalMovingTime: 0 };

  // athlete key → { name, profile, allTime, month }
  const athletes = {};

  for (const act of cachedActivities) {
    const key = act.athlete
      ? `${act.athlete.firstname}_${act.athlete.lastname}`
      : "unknown";

    if (!athletes[key]) {
      athletes[key] = {
        name: act.athlete
          ? `${act.athlete.firstname} ${act.athlete.lastname}`
          : "Unknown",
        profile: act.athlete?.profile_medium || act.athlete?.profile || null,
        allTime: { distance: 0, movingTime: 0, count: 0 },
        month: { distance: 0, movingTime: 0, count: 0 },
      };
    }

    const dist = act.distance || 0;
    const time = act.moving_time || 0;
    const elev = act.total_elevation_gain || 0;

    // Use _fetchedAt as a proxy for when the activity happened, since the
    // club activities endpoint does not expose start_date.
    const fetchedAt = act._fetchedAt ? new Date(act._fetchedAt) : null;
    const isThisMonth =
      fetchedAt &&
      fetchedAt.getFullYear() === currentYear &&
      fetchedAt.getMonth() === currentMonth;

    allTimeStats.totalDistance += dist;
    allTimeStats.totalMovingTime += time;
    allTimeStats.totalElevation += elev;

    athletes[key].allTime.distance += dist;
    athletes[key].allTime.movingTime += time;
    athletes[key].allTime.count += 1;

    if (isThisMonth) {
      monthStats.totalDistance += dist;
      monthStats.totalMovingTime += time;
      athletes[key].month.distance += dist;
      athletes[key].month.movingTime += time;
      athletes[key].month.count += 1;
    }
  }

  const allTimeLeaderboard = Object.values(athletes)
    .filter((a) => a.allTime.distance > 0)
    .sort((a, b) => b.allTime.distance - a.allTime.distance)
    .map((a, i) => ({ rank: i + 1, ...a }));

  const monthLeaderboard = Object.values(athletes)
    .filter((a) => a.month.distance > 0)
    .sort((a, b) => b.month.distance - a.month.distance)
    .map((a, i) => ({ rank: i + 1, ...a }));

  return { allTimeStats, monthStats, allTimeLeaderboard, monthLeaderboard };
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

  const cache = mergeIntoCache(loadCache(), freshActivities);
  saveCache(cache);

  console.log(`Processing ${cache.activities.length} total cached activities...`);
  const stats = computeStats(cache.activities);

  const output = {
    generatedAt: new Date().toISOString(),
    clubId: CLUB_ID,
    clubName: clubInfo.name || `Club ${CLUB_ID}`,
    clubProfile: clubInfo.profile_medium || null,
    totalActivities: cache.activities.length,
    ...stats,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nDone! Data written to ${OUTPUT_FILE}`);
  console.log(`  All-time distance: ${(output.allTimeStats.totalDistance / 1000).toFixed(1)} km`);
  console.log(`  This month distance: ${(output.monthStats.totalDistance / 1000).toFixed(1)} km`);
  console.log(`  All-time leaderboard entries: ${output.allTimeLeaderboard.length}`);
  console.log(`  Month leaderboard entries: ${output.monthLeaderboard.length}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
