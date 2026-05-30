const DATA_URL = "https://rush-tree.github.io/one-million-km/strava-dashboard/strava-data.json";
const CLUB_URL = "https://www.strava.com/clubs/1491053";
const DEFAULT_LEADERBOARD_LIMIT = 10;
const GOAL_KM = 1_000_000;

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :host {
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --orange: #0c6a37;
    --orange-light: #1a8fd3;
    --orange-pale: #e8f5ee;
    --bg: #F7F7F7;
    --card: #FFFFFF;
    --text: #1A1A1A;
    --muted: #5c5c5c;
    --border: #d3b973;
    --gold: #ffd700;
    --silver: #87ceeb;
    --bronze: #8b4513;
    --radius: 16px;
    --shadow: 0 2px 12px rgba(0,0,0,0.08);
  }
  .dashboard {
    max-width: 900px;
    margin: 0 auto;
    padding: 24px 16px 40px;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
  }
  .strava-badge {
    display: flex; align-items: center; gap: 6px;
    background: var(--orange); color: white;
    border-radius: 8px; padding: 6px 12px;
    font-size: 13px; font-weight: 600;
    text-decoration: none; white-space: nowrap;
    transition: background 0.15s;
  }
  .strava-badge:hover { background: var(--orange-light); }
  .strava-badge svg { width: 16px; height: 16px; fill: white; }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px; margin-bottom: 28px;
  }
  .stat-card {
    background: var(--card);
    border-radius: var(--radius);
    padding: 20px;
    box-shadow: var(--shadow);
    border: 1px solid var(--border);
    position: relative; overflow: hidden;
  }
  .stat-card::before {
    content: "";
    position: absolute; top: 0; left: 0; right: 0;
    height: 3px; background: var(--orange);
    border-radius: var(--radius) var(--radius) 0 0;
  }
  .stat-card.accent { background: var(--orange); border-color: var(--orange); }
  .stat-card.accent::before { background: rgba(255,255,255,0.3); }
  .stat-card.accent .stat-label { color: rgba(255,255,255,0.8); }
  .stat-card.accent .stat-value { color: white; }
  .stat-card.accent .stat-unit { color: rgba(255,255,255,0.7); }
  .stat-icon {
    width: 36px; height: 36px; border-radius: 8px;
    background: var(--orange-pale);
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 12px;
  }
  .stat-icon svg { width: 18px; height: 18px; fill: var(--orange); }
  .stat-card.accent .stat-icon { background: rgba(255,255,255,0.2); }
  .stat-card.accent .stat-icon svg { fill: white; }
  .stat-label {
    font-size: 12px; font-weight: 600; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;
  }
  .stat-value { font-size: 28px; font-weight: 800; color: var(--text); line-height: 1; }
  .stat-unit { font-size: 14px; font-weight: 500; color: var(--muted); margin-left: 2px; }
  .section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .section-title { font-size: 17px; font-weight: 700; }
  .section-badge {
    background: var(--orange-pale); color: var(--orange);
    border-radius: 20px; padding: 2px 10px;
    font-size: 12px; font-weight: 600;
  }
  .leaderboards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px; margin-bottom: 28px;
  }
  .leaderboard-card {
    background: var(--card); border-radius: var(--radius);
    box-shadow: var(--shadow); border: 1px solid var(--border); overflow: hidden;
  }
  .leaderboard-header {
    padding: 16px 20px 14px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 10px;
  }
  .leaderboard-icon {
    width: 32px; height: 32px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
  }
  .leaderboard-icon.alltime { background: #fff8dc; }
  .leaderboard-icon.alltime svg { fill: var(--gold); }
  .leaderboard-icon.month { background: var(--orange-pale); }
  .leaderboard-icon.month svg { fill: var(--orange); }
  .leaderboard-icon svg { width: 16px; height: 16px; }
  .leaderboard-title { font-size: 15px; font-weight: 700; }
  .leaderboard-list { list-style: none; }
  .leaderboard-item {
    display: flex; align-items: center; gap: 12px;
    padding: 11px 20px; border-bottom: 1px solid var(--border);
    transition: background 0.1s;
  }
  .leaderboard-item:last-child { border-bottom: none; }
  .leaderboard-item:hover { background: #FAFAFA; }
  .leaderboard-item.top-1 { background: #fffde7; }
  .leaderboard-item.top-2 { background: #f0f8ff; }
  .leaderboard-item.top-3 { background: #fdf5e6; }
  .rank-badge {
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 800; flex-shrink: 0;
  }
  .rank-1 { background: var(--gold); color: #1a1a1a; }
  .rank-2 { background: var(--silver); color: #1a1a1a; }
  .rank-3 { background: var(--bronze); color: white; }
  .rank-other { background: #e5e7eb; color: var(--muted); font-size: 11px; }
  .athlete-avatar {
    width: 34px; height: 34px; border-radius: 50%;
    object-fit: cover; flex-shrink: 0; background: var(--orange-pale);
  }
  .athlete-avatar-placeholder {
    width: 34px; height: 34px; border-radius: 50%;
    background: linear-gradient(135deg, #0c6a37, #8ac225);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; font-size: 14px; font-weight: 700; color: white;
  }
  .athlete-info { flex: 1; min-width: 0; }
  .athlete-name {
    font-size: 14px; font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .athlete-sub { font-size: 11px; color: var(--muted); margin-top: 1px; }
  .athlete-distance {
    font-size: 15px; font-weight: 800; text-align: right; flex-shrink: 0;
  }
  .athlete-distance span {
    display: block; font-size: 11px; font-weight: 500;
    color: var(--muted); text-align: right;
  }
  .show-more-btn {
    display: block; width: 100%; padding: 12px;
    background: none; border: none; border-top: 1px solid var(--border);
    font-size: 13px; font-weight: 600; color: var(--orange);
    cursor: pointer; transition: background 0.1s;
  }
  .show-more-btn:hover { background: var(--orange-pale); }
  .million-bar-wrap {
    background: var(--card); border-radius: var(--radius);
    padding: 20px 24px; box-shadow: var(--shadow);
    border: 1px solid var(--border); margin-bottom: 28px;
  }
  .million-bar-header {
    display: flex; align-items: baseline;
    justify-content: space-between; margin-bottom: 12px;
  }
  .million-bar-title { font-size: 15px; font-weight: 700; }
  .million-bar-stats { display: flex; align-items: baseline; gap: 8px; }
  .million-bar-pct { font-size: 28px; font-weight: 800; color: var(--orange); line-height: 1; }
  .million-bar-km { font-size: 13px; color: var(--muted); }
  .million-bar-track {
    height: 18px; background: #e5e7eb;
    border-radius: 999px; overflow: hidden;
  }
  .million-bar-fill {
    height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, #0c6a37, #8ac225);
    transition: width 1s ease; min-width: 2px;
  }
  .million-bar-remaining { margin-top: 8px; font-size: 12px; color: var(--muted); text-align: right; }
  .footer {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 12px; padding-top: 8px;
    border-top: 1px solid var(--border);
    font-size: 12px; color: var(--muted);
  }
  .refresh-btn {
    display: flex; align-items: center; gap: 6px;
    background: none; border: 1px solid var(--border);
    border-radius: 8px; padding: 6px 12px;
    font-size: 12px; font-weight: 600; color: var(--muted);
    cursor: pointer; transition: all 0.15s;
  }
  .refresh-btn:hover { border-color: var(--orange); color: var(--orange); }
  .refresh-btn svg { width: 13px; height: 13px; fill: currentColor; }
  .refresh-btn.spinning svg { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .state-overlay {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 60px 24px; text-align: center; gap: 12px;
  }
  .state-spinner {
    width: 36px; height: 36px;
    border: 3px solid var(--border); border-top-color: var(--orange);
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  .state-title { font-size: 16px; font-weight: 700; }
  .state-sub { font-size: 13px; color: var(--muted); }
  .state-error { color: #DC2626; }
  .tabs {
    display: flex;
    gap: 4px;
    background: #e5e7eb;
    border-radius: 12px;
    padding: 4px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .tab {
    padding: 8px 14px;
    border-radius: 9px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    background: none;
    color: var(--muted);
    transition: all 0.15s;
    white-space: nowrap;
  }
  .tab.active { background: white; color: var(--text); box-shadow: 0 1px 4px rgba(0,0,0,0.12); }
  .tab:hover:not(.active) { color: var(--text); }
  .leaderboard-panel { display: none; }
  .leaderboard-panel.active { display: block; }
  .relative-info {
    font-size: 12px;
    color: var(--muted);
    background: var(--orange-pale);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 14px;
    line-height: 1.5;
  }
  @media (max-width: 600px) {
    .stats-grid { grid-template-columns: 1fr 1fr; }
    .leaderboards { grid-template-columns: 1fr; }
    .header-club-name { font-size: 18px; }
    .stat-value { font-size: 22px; }
  }
  @media (max-width: 380px) {
    .stats-grid { grid-template-columns: 1fr; }
  }
`;

const ICONS = {
  strava: `<svg viewBox="0 0 24 24"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>`,
  distance: `<svg viewBox="0 0 24 24"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>`,
  time: `<svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>`,
  activities: `<svg viewBox="0 0 24 24"><path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24"><path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
  elevation: `<svg viewBox="0 0 24 24"><path d="M14 6l-1-2H5v17h2v-7h5l1 2h7V6h-6zm4 8h-4l-1-2H7V6h5l1 2h5v6z"/></svg>`,
};

function metersToKm(m) { return (m / 1000).toFixed(1); }
function secondsToHHMM(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h >= 1000) return `${(h / 1000).toFixed(1)}k h`;
  return `${h}h ${m}m`;
}
function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function monthName(date) {
  return new Date(date).toLocaleString("default", { month: "long", year: "numeric" });
}
function initials(name) {
  return name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
}

function millionProgressBar(totalMeters) {
  const km = totalMeters / 1000;
  const pct = Math.min((km / GOAL_KM) * 100, 100);
  const pctDisplay = pct < 0.01 ? pct.toFixed(4) : pct.toFixed(2);
  const remaining = Math.max(GOAL_KM - km, 0);
  return `
    <div class="million-bar-wrap">
      <div class="million-bar-header">
        <span class="million-bar-title">Mission: 1.000.000 km</span>
        <div class="million-bar-stats">
          <span class="million-bar-pct">${pctDisplay}%</span>
          <span class="million-bar-km">${km.toLocaleString("de-DE", { maximumFractionDigits: 1 })} km</span>
        </div>
      </div>
      <div class="million-bar-track">
        <div class="million-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="million-bar-remaining">${remaining.toLocaleString("de-DE", { maximumFractionDigits: 0 })} km verbleibend</div>
    </div>`;
}

function statCard(iconName, label, value, unit, accent) {
  return `
    <div class="stat-card${accent ? " accent" : ""}">
      <div class="stat-icon">${ICONS[iconName]}</div>
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}<span class="stat-unit">${unit}</span></div>
    </div>`;
}

function leaderboardCard(type, title, entries, key) {
  const limit = DEFAULT_LEADERBOARD_LIMIT;
  const hasMore = entries.length > limit;
  const iconClass = type === "alltime" ? "alltime" : "month";
  const iconName = type === "alltime" ? "trophy" : "calendar";
  const rows = entries.map((a, i) => {
    const rankClass = i === 0 ? "top-1" : i === 1 ? "top-2" : i === 2 ? "top-3" : "";
    const badgeClass = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "rank-other";
    const hidden = i >= limit ? ' style="display:none"' : "";
    const dist = metersToKm(a[key].distance);
    const time = secondsToHHMM(a[key].movingTime);
    const count = a[key].count;
    const avatar = a.profile
      ? `<img class="athlete-avatar" src="${a.profile}" alt="${a.name}">`
      : `<div class="athlete-avatar-placeholder">${initials(a.name)}</div>`;
    return `
      <li class="leaderboard-item ${rankClass}"${hidden}>
        <div class="rank-badge ${badgeClass}">${a.rank}</div>
        ${avatar}
        <div class="athlete-info">
          <div class="athlete-name">${a.name}</div>
          <div class="athlete-sub">${count} activit${count === 1 ? "y" : "ies"} &middot; ${time}</div>
        </div>
        <div class="athlete-distance">${dist}<span>km</span></div>
      </li>`;
  }).join("");
  return `
    <div class="leaderboard-card">
      <div class="leaderboard-header">
        <div class="leaderboard-icon ${iconClass}">${ICONS[iconName]}</div>
        <span class="leaderboard-title">${title}</span>
        <span class="section-badge" style="margin-left:auto">${entries.length}</span>
      </div>
      <ul class="leaderboard-list">
        ${rows || '<li style="padding:16px 20px;color:#5c5c5c;font-size:13px">No activities yet.</li>'}
      </ul>
      ${hasMore ? `<button class="show-more-btn">Show all ${entries.length} athletes ▾</button>` : ""}
    </div>`;
}

function relativeLeaderboardCard(entries, title) {
  const limit = DEFAULT_LEADERBOARD_LIMIT;
  const hasMore = entries.length > limit;
  const rows = entries.map((a, i) => {
    const rankClass = i === 0 ? "top-1" : i === 1 ? "top-2" : i === 2 ? "top-3" : "";
    const badgeClass = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "rank-other";
    const hidden = i >= limit ? ' style="display:none"' : "";
    const cals = Math.round(a.relative.calories).toLocaleString("de-DE");
    const count = a.relative.count;
    const avatar = a.profile
      ? `<img class="athlete-avatar" src="${a.profile}" alt="${a.name}">`
      : `<div class="athlete-avatar-placeholder">${initials(a.name)}</div>`;
    return `
      <li class="leaderboard-item ${rankClass}"${hidden}>
        <div class="rank-badge ${badgeClass}">${a.rank}</div>
        ${avatar}
        <div class="athlete-info">
          <div class="athlete-name">${a.name}</div>
          <div class="athlete-sub">${count} activit${count === 1 ? "y" : "ies"}</div>
        </div>
        <div class="athlete-distance">${cals}<span>kJ</span></div>
      </li>`;
  }).join("");
  const iconClass = title && title.includes("All-Time") ? "alltime" : "month";
  const iconName = iconClass === "alltime" ? "trophy" : "calendar";
  return `
    <div class="leaderboard-card">
      <div class="leaderboard-header">
        <div class="leaderboard-icon ${iconClass}">${ICONS[iconName]}</div>
        <span class="leaderboard-title">${title || "Performance"}</span>
        <span class="section-badge" style="margin-left:auto">${entries.length}</span>
      </div>
      <ul class="leaderboard-list">
        ${rows || '<li style="padding:16px 20px;color:#5c5c5c;font-size:13px">No activities yet.</li>'}
      </ul>
      ${hasMore ? `<button class="show-more-btn">Show all ${entries.length} athletes ▾</button>` : ""}
    </div>`;
}

class StravaDashboard extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    const container = document.createElement("div");
    container.className = "dashboard";
    container.innerHTML = `
      <div class="state-overlay">
        <div class="state-spinner"></div>
        <div class="state-title">Loading club data…</div>
      </div>`;
    shadow.appendChild(style);
    shadow.appendChild(container);
    this._container = container;
    this._shadow = shadow;
    this.loadData();
  }

  async loadData(forceRefresh = false) {
    // Cache-bust every 10 minutes so updates from the hourly GitHub Action propagate.
    // On manual refresh use a unique timestamp to bypass browser + CDN cache.
    const cacheBust = forceRefresh ? Date.now() : Math.floor(Date.now() / (10 * 60 * 1000));
    const url = `${DATA_URL}?v=${cacheBust}`;

    const btn = this._shadow && this._shadow.getElementById("refresh-btn");
    if (btn) { btn.classList.add("spinning"); btn.disabled = true; }

    try {
      // Plain GET — no fetch options to avoid CORS preflight (GitHub Pages returns 405 on OPTIONS).
      // The unique ?v= param is enough to bypass HTTP caches.
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.render(data);
    } catch (err) {
      this._container.innerHTML = `
        <div class="state-overlay">
          <div class="state-title state-error">Could not load data</div>
          <div class="state-sub">${err.message}</div>
        </div>`;
    } finally {
      const b = this._shadow && this._shadow.getElementById("refresh-btn");
      if (b) { b.classList.remove("spinning"); b.disabled = false; }
    }
  }

  render(data) {
    const currentMonthLabel = monthName(data.generatedAt);
    this._container.innerHTML = `
      ${millionProgressBar(data.allTimeStats.totalDistance)}
      <div class="section-header">
        <span class="section-title">All-Time Stats</span>
        <a class="strava-badge" href="${CLUB_URL}" target="_blank" rel="noopener" style="margin-left:auto">
          ${ICONS.strava} View Club
        </a>
      </div>
      <div class="stats-grid">
        ${statCard("distance", "Total Distance", metersToKm(data.allTimeStats.totalDistance), "km", false)}
        ${statCard("time", "Total Time", secondsToHHMM(data.allTimeStats.totalMovingTime), "", false)}
        ${statCard("activities", "Activities", data.totalActivities.toLocaleString(), "", false)}
        ${statCard("elevation", "Elevation", Math.round(data.allTimeStats.totalElevation / 1000).toLocaleString(), "k m", false)}
      </div>
      <div class="section-header" style="margin-top:8px">
        <span class="section-title">${currentMonthLabel}</span>
        <span class="section-badge">This Month</span>
      </div>
      <div class="stats-grid">
        ${statCard("distance", "Distance This Month", metersToKm(data.monthStats.totalDistance), "km", true)}
        ${statCard("time", "Time This Month", secondsToHHMM(data.monthStats.totalMovingTime), "", true)}
      </div>
      <div class="section-header" style="margin-top:8px">
        <span class="section-title">Leaderboards</span>
        <div class="tabs" id="lb-tabs" style="margin-bottom:0;margin-left:auto">
          <button class="tab active" data-view="all">All Activities</button>
          <button class="tab" data-view="run">🏃 Running</button>
          <button class="tab" data-view="ride">🚴 Cycling</button>
          <button class="tab" data-view="relative">⚡ Performance</button>
        </div>
      </div>
      <div id="relative-info-box" class="relative-info" style="display:none">
        ⚡ <strong>Relative Performance</strong> — Ranked by energy expenditure (kJ). Running burns significantly more calories per km than cycling, making this comparison fair across sport types.
      </div>
      <div class="leaderboards" id="leaderboard-grid">
        ${leaderboardCard("alltime", "All-Time", data.allTimeLeaderboard, "allTime")}
        ${leaderboardCard("month", currentMonthLabel, data.monthLeaderboard, "month")}
      </div>
      <div class="footer">
        <span>Last updated ${new Date(data.generatedAt).toLocaleString()}</span>
        <button class="refresh-btn" id="refresh-btn">
          ${ICONS.refresh} Refresh
        </button>
      </div>`;

    this._shadow.getElementById("refresh-btn").addEventListener("click", () => {
      this.loadData(true);
    });

    const shadow = this._shadow;

    shadow.querySelectorAll("#lb-tabs .tab").forEach(tab => {
      tab.addEventListener("click", () => {
        shadow.querySelectorAll("#lb-tabs .tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const view = tab.dataset.view;
        const infoBox = shadow.getElementById("relative-info-box");
        infoBox.style.display = view === "relative" ? "block" : "none";
        const grid = shadow.getElementById("leaderboard-grid");

        if (view === "relative") {
          grid.innerHTML =
            relativeLeaderboardCard(data.relativeLeaderboard || [], "All-Time · Performance") +
            relativeLeaderboardCard(data.relativeLeaderboard || [], currentMonthLabel + " · Performance");
        } else if (view === "all") {
          grid.innerHTML =
            leaderboardCard("alltime", "All-Time",        data.allTimeLeaderboard, "allTime") +
            leaderboardCard("month",   currentMonthLabel, data.monthLeaderboard,   "month");
        } else if (view === "run") {
          grid.innerHTML =
            leaderboardCard("alltime", "All-Time · Running",            data.runLeaderboard || [], "run") +
            leaderboardCard("month",   currentMonthLabel + " · Running", data.runLeaderboard || [], "run");
        } else if (view === "ride") {
          grid.innerHTML =
            leaderboardCard("alltime", "All-Time · Cycling",            data.rideLeaderboard || [], "ride") +
            leaderboardCard("month",   currentMonthLabel + " · Cycling", data.rideLeaderboard || [], "ride");
        }
        wireShowMore(shadow);
      });
    });

    function wireShowMore(root) {
      root.querySelectorAll(".show-more-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          btn.previousElementSibling.querySelectorAll(".leaderboard-item[style*='none']")
            .forEach(el => el.style.display = "");
          btn.style.display = "none";
        });
      });
    }
    wireShowMore(shadow);
  }
}

customElements.define("strava-dashboard", StravaDashboard);
