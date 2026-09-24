const DATA_URL = "https://rush-tree.github.io/one-million-km/strava-dashboard/strava-data.json";
const CLUB_URL = "https://www.strava.com/clubs/1491053";
const GOAL_KM = 1_000_000;

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :host {
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    /* Neutrals carry a slight green bias so they sit with the project's green
       rather than beside it. The --orange-* names are legacy; they hold the
       brand green and are referenced throughout. */
    --orange: #0c6a37;
    --orange-light: #16a34a;
    --orange-pale: #e8f2ec;
    --bg: #FAFAF8;
    --card: #FFFFFF;
    --text: #12201a;
    --muted: #6b7370;
    --border: #e3e6e3;
    --border-strong: #cdd4cf;
    --track: #e8ebe8;
    --gold: #ffd700;
    --silver: #87ceeb;
    --bronze: #8b4513;
    --radius: 16px;
    --shadow: 0 1px 2px rgba(18,32,26,0.04), 0 2px 8px rgba(18,32,26,0.04);
  }

  /* The host page decides the theme; this widget follows the OS preference.
     Tokens are redefined, never the components themselves. */
  @media (prefers-color-scheme: dark) {
    :host {
      --orange: #3fa86a;
      --orange-light: #5cc487;
      --orange-pale: #16281f;
      --bg: #0f1512;
      --card: #172019;
      --text: #e8efea;
      --muted: #97a39c;
      --border: #24302a;
      --border-strong: #35443c;
      --track: #223029;
      --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.25);
    }
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
    padding: 10px 14px;
    margin-bottom: 14px;
    line-height: 1.55;
  }
  .relative-info code {
    background: rgba(0,0,0,0.06);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 11px;
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

  /* ─── Mission panel ────────────────────────────────────────────────────── */
  /* The one element that carries weight: the only place the accent is spent
     at full strength. */
  .mission {
    background: var(--card);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 24px;
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .mission-top {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; flex-wrap: wrap;
  }
  .mission-eyebrow {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.11em; color: var(--orange); margin-bottom: 3px;
  }
  .mission-goal { font-size: 15px; font-weight: 600; color: var(--muted); }
  .mission-pct {
    font-size: 15px; font-weight: 700; color: var(--muted);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .mission-pct span { font-size: 24px; color: var(--text); }
  .mission-figure { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .mission-km {
    font-size: clamp(38px, 10vw, 62px);
    font-weight: 800; line-height: 0.95; letter-spacing: -0.025em;
    color: var(--text); font-variant-numeric: tabular-nums;
  }
  .mission-unit { font-size: 20px; font-weight: 600; color: var(--muted); }
  .mission-track {
    position: relative; height: 12px;
    background: var(--track); border-radius: 999px; overflow: visible;
  }
  .mission-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--orange), var(--orange-light));
    border-radius: 999px;
    transition: width 900ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  /* Ticks make the bar a scale; without them a 17% fill is just a stub. */
  .ms-tick {
    position: absolute; top: -3px; bottom: -3px;
    width: 1px; background: var(--border-strong);
  }
  .ms-label {
    position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
    font-size: 10px; font-weight: 600; color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .mission-foot {
    display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    font-size: 13px; color: var(--muted);
    margin-top: 22px; /* room for the tick labels below the track */
  }
  .mission-foot strong { color: var(--text); font-variant-numeric: tabular-nums; }
  .mission-scale { color: var(--orange); font-weight: 600; }

  /* ─── Totals strip ─────────────────────────────────────────────────────── */
  .totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: 20px;
  }
  .total {
    padding: 14px 16px;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .total:last-child { border-right: none; }
  .total-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--muted); margin-bottom: 5px;
  }
  .total-value {
    font-size: 19px; font-weight: 700; color: var(--text);
    font-variant-numeric: tabular-nums; line-height: 1.1;
  }
  .total-unit { font-size: 12px; font-weight: 600; color: var(--muted); margin-left: 3px; }

  /* ─── Pace ─────────────────────────────────────────────────────────────── */
  .pace { margin-bottom: 22px; }
  .pace-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .pace-cell { background: var(--card); padding: 16px; }
  .pace-label { font-size: 11px; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
  .pace-value {
    font-size: 26px; font-weight: 700; color: var(--text);
    font-variant-numeric: tabular-nums; line-height: 1.05;
  }
  .pace-unit { font-size: 13px; font-weight: 600; color: var(--muted); margin-left: 3px; }
  .pace-sub { font-size: 11px; color: var(--muted); margin-top: 5px; }
  .pace-note {
    font-size: 13px; line-height: 1.55; color: var(--muted);
    margin-top: 12px; padding-left: 12px;
    border-left: 2px solid var(--orange-pale);
  }
  .pace-note strong { color: var(--text); }

  /* ─── Scale comparisons ────────────────────────────────────────────────── */
  .scale { margin-bottom: 22px; }
  /* One card carries the accent; the rest stay quiet so the lead reads first. */
  .scale-lead {
    background: var(--orange);
    border-radius: var(--radius);
    padding: 18px 20px;
    margin-bottom: 12px;
  }
  .scale-lead-text {
    font-size: 21px;
    font-weight: 700;
    color: #fff;
    line-height: 1.25;
    font-variant-numeric: tabular-nums;
  }
  .scale-lead-detail {
    font-size: 13px;
    color: rgba(255,255,255,0.85);
    margin-top: 4px;
  }
  /* Flex, not grid: a grid's empty trailing cells show as bare gap colour when
     the item count does not fill the last row. Here the last item just grows. */
  .scale-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .scale-item {
    background: var(--card);
    padding: 14px 16px;
    flex: 1 1 190px;
  }
  .scale-item-text {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
  }
  .scale-item-detail {
    font-size: 11px;
    color: var(--muted);
    margin-top: 3px;
  }

  .no-dist { font-size: 11px; font-weight: 500; color: var(--muted); white-space: nowrap; }

  @media (prefers-reduced-motion: reduce) {
    .mission-fill { transition: none; }
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
  elevation: `<svg viewBox="0 0 24 24"><path d="M14 6l-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22L14 6z"/></svg>`,
};

// Thousands separators matter at six figures: "168715.1" is hard to read.
function metersToKm(m) {
  return (m / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const nf = (n, d = 0) =>
  (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function initials(name) {
  return name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
}

// The mission panel: the running total, the bar, and the distance still to go.
// Milestone ticks turn the bar into a scale — at 17% an unmarked fill says
// almost nothing about how far there is left to run.
function missionPanel(data) {
  const f = data.facts || {};
  const km = data.allTimeStats.totalDistance / 1000;
  const pct = Math.min((km / GOAL_KM) * 100, 100);

  const milestones = [25, 50, 75].map((m) => `
    <div class="ms-tick" style="left:${m}%"><span class="ms-label">${m}%</span></div>`).join("");

  return `
    <section class="mission">
      <div class="mission-top">
        <div>
          <div class="mission-eyebrow">Mission</div>
          <div class="mission-goal">1,000,000 km together</div>
        </div>
        <div class="mission-pct"><span>${pct.toFixed(2)}</span>%</div>
      </div>
      <div class="mission-figure">
        <span class="mission-km">${nf(km, 1)}</span>
        <span class="mission-unit">km</span>
      </div>
      <div class="mission-track" role="img"
           aria-label="${pct.toFixed(1)} percent of one million kilometres completed">
        <div class="mission-fill" style="width:${pct}%"></div>
        ${milestones}
      </div>
      <div class="mission-foot">
        <span><strong>${nf(f.remainingKm)} km</strong> to go</span>
        ${f.timesAroundEarth ? `<span class="mission-scale">${nf(f.timesAroundEarth, 2)}× around the equator</span>` : ""}
      </div>
    </section>`;
}

// Distances nobody can picture become distances everybody can. Every reference
// is a fixed figure (equator, Moon, the Nile), not a survey average — those
// vary by a factor of two between sources and would make the whole panel
// suspect. The lead card is the Moon: it is the one with a finish line.
function scaleCards(data) {
  const list = (data.facts && data.facts.comparisons) || [];
  if (!list.length) return "";

  const lead = list.find((c) => c.key === "moon") || list[0];
  const rest = list.filter((c) => c !== lead);

  return `
    <section class="scale">
      <div class="section-header" style="margin-top:4px">
        <span class="section-title">What that distance looks like</span>
      </div>

      <div class="scale-lead">
        <div class="scale-lead-text">${lead.text}</div>
        <div class="scale-lead-detail">${lead.detail}</div>
      </div>

      <div class="scale-grid">
        ${rest.map((c) => `
          <div class="scale-item">
            <div class="scale-item-text">${c.text}</div>
            <div class="scale-item-detail">${c.detail}</div>
          </div>`).join("")}
      </div>
    </section>`;
}

// Cumulative totals: a quiet row divided by rules, not five competing cards.
// These are context for the mission figure, not headlines of their own.
function totalsStrip(data) {
  const s = data.allTimeStats;
  const items = [
    ["Distance",    nf(s.totalDistance / 1000, 1), "km"],
    ["Moving time", nf(Math.floor(s.totalMovingTime / 3600)), "h"],
    ["Activities",  nf(data.totalActivities), ""],
    ["Elevation",   nf(Math.round(s.totalElevation / 1000)), "km"],
    ["Members",     nf(data.memberCount), ""],
  ];
  return `
    <section class="totals">
      ${items.map(([label, value, unit]) => `
        <div class="total">
          <div class="total-label">${label}</div>
          <div class="total-value">${value}${unit ? `<span class="total-unit">${unit}</span>` : ""}</div>
        </div>`).join("")}
    </section>`;
}

// Pace, derived only from weeks measured end to end. A truncated or in-progress
// week would drag the average down and understate the club.
function paceGrid(data) {
  const f = data.facts || {};
  if (!f.paceBasisWeeks) return "";

  const projected = f.projectedDate
    ? new Date(f.projectedDate + "T00:00:00Z").toLocaleDateString(undefined, { year: "numeric", month: "long" })
    : null;

  const cells = [
    ["This week so far", nf(f.thisWeekKm, 1), "km",
      `${nf(f.thisWeekActivities)} activities · ${nf(f.thisWeekHours)} h`],
    ["Per day", nf(f.avgDayKm), "km", "average of full weeks"],
    ["Per member", nf(f.kmPerMemberWeek, 1), "km", "per week"],
    ["Per activity", nf(f.avgActivityKm, 1), "km", `${nf(f.activitiesPerWeek)} activities a week`],
  ];

  return `
    <section class="pace">
      <div class="pace-grid">
        ${cells.map(([label, value, unit, sub]) => `
          <div class="pace-cell">
            <div class="pace-label">${label}</div>
            <div class="pace-value">${value}${unit ? `<span class="pace-unit">${unit}</span>` : ""}</div>
            <div class="pace-sub">${sub}</div>
          </div>`).join("")}
      </div>
      ${projected ? `
      <p class="pace-note">
        At this pace the club reaches one million kilometres around <strong>${projected}</strong>.
        Based on ${f.paceBasisWeeks} fully measured week${f.paceBasisWeeks === 1 ? "" : "s"},
        so treat it as a direction of travel rather than a date in the calendar.
      </p>` : ""}
    </section>`;
}

function latestActivitiesCard(data) {
  const acts = (data.dataSource && data.dataSource.latestActivities) || [];
  if (!acts.length) {
    return `<div class="leaderboard-card"><ul class="leaderboard-list">
      <li style="padding:16px 20px;color:var(--muted);font-size:13px">No recent activities available.</li>
    </ul></div>`;
  }
  const rows = acts.map((a) => {
    const who = a.athlete || "Unknown";
    // Strength training and yoga cover no ground; "0 km" reads as a failed
    // reading, when in fact these activities count in time, not distance.
    const dist = (a.distanceKm != null && a.distanceKm > 0)
      ? `${a.distanceKm.toLocaleString()}<span>km</span>`
      : `<span class="no-dist">no distance</span>`;
    const link = a.activityId
      ? `https://www.strava.com/activities/${a.activityId}`
      : CLUB_URL;
    return `
      <li class="leaderboard-item">
        <div class="athlete-avatar-placeholder">${initials(who)}</div>
        <div class="athlete-info">
          <div class="athlete-name">
            <a href="${link}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${a.name || "Activity"}</a>
          </div>
          <div class="athlete-sub">${who}${a.date ? " · " + a.date : ""}</div>
        </div>
        <div class="athlete-distance">${dist}</div>
      </li>`;
  }).join("");

  return `<div class="leaderboard-card"><ul class="leaderboard-list">${rows}</ul></div>`;
}

// Explains why per-athlete rankings disappeared. Members will wonder where
// their name went; saying it plainly prevents them assuming their kilometres
// stopped counting. They still count — only the attribution is gone.
function dataSourceNote() {
  return `
    <div class="relative-info" style="margin-top:10px;line-height:1.55">
      ℹ️ <strong>Why there is no athlete ranking any more</strong><br>
      On 1 September 2026, Strava switched off the interface that let external
      projects read a club's activities athlete by athlete. Every kilometre you
      log still counts toward our total — we simply can no longer see which
      kilometre belongs to whom, so a per-athlete leaderboard is not possible.
      This affects every project using Strava club data, not just ours.
      <div style="margin-top:6px">
        Club totals continue to update automatically via Strava's official club widget.
        Keep running, walking and hiking — it all adds up.
      </div>
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
    // Auto-refresh every 10 minutes so visitors see new data without reloading the page
    this._refreshTimer = setInterval(() => this.loadData(), 10 * 60 * 1000);
    // Also refresh when the tab becomes visible again after being in background
    this._onVisible = () => { if (document.visibilityState === "visible") this.loadData(); };
    document.addEventListener("visibilitychange", this._onVisible);
  }

  disconnectedCallback() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    if (this._onVisible) document.removeEventListener("visibilitychange", this._onVisible);
  }

  async loadData(forceRefresh = false) {
    // On manual refresh use unique timestamp to bust CDN/browser cache.
    // Otherwise rotate URL every 10 min so auto-refresh sees fresh data.
    const cacheBust = forceRefresh ? Date.now() : Math.floor(Date.now() / (10 * 60 * 1000));
    const url = `${DATA_URL}?v=${cacheBust}`;

    const btn = this._shadow && this._shadow.getElementById("refresh-btn");
    if (btn) { btn.classList.add("spinning"); btn.disabled = true; }

    try {
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
    const f = data.facts || {};
    this._container.innerHTML = `
      ${missionPanel(data)}
      ${totalsStrip(data)}
      ${scaleCards(data)}
      ${paceGrid(data)}

      <div class="section-header" style="margin-top:4px">
        <span class="section-title">Latest Activities</span>
        <div style="margin-left:auto; display:flex; gap:8px; align-items:center">
          <button class="refresh-btn" id="refresh-btn" title="Reload latest data">
            ${ICONS.refresh}<span>Refresh</span>
          </button>
          <a class="strava-badge" href="${CLUB_URL}" target="_blank" rel="noopener">
            ${ICONS.strava} View Club
          </a>
        </div>
      </div>
      ${latestActivitiesCard(data)}
      ${dataSourceNote(data)}

      <div class="footer">
        <span>Last updated ${new Date(data.generatedAt).toLocaleString()}</span>
      </div>`;

    const refreshBtn = this._shadow.getElementById("refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", () => this.loadData(true));
  }
}

customElements.define("strava-dashboard", StravaDashboard);
