// One Million Kilometers — macOS Desktop Widget (Übersicht)
//
// Setup:
// 1. Install Übersicht: https://tracesof.net/uebersicht/
// 2. Open Übersicht > Preferences > Widget Folder and point it to this folder's parent,
//    OR copy this entire "macos-widget" folder into ~/Library/Application Support/Übersicht/widgets/
// 3. DATA_URL below points to your local strava-data.json — update path if needed.
// 4. For auto-sync, run: bash sync-setup.sh  (in the strava-dashboard folder)
//
const DATA_FILE = "/Users/Ruben/Desktop/VS_Code/One Million Kilometers/strava-dashboard/strava-data.json";
const REPO_DIR  = "/Users/Ruben/Desktop/VS_Code/One Million Kilometers/strava-dashboard";

const GOAL_METERS = 1_000_000 * 1000; // 1 million km in meters

export const refreshFrequency = 5 * 60 * 1000; // re-read file every 5 minutes

// cat reads the local file directly — no curl/file:// issues on macOS.
// git pull runs first so a manual refresh always pulls the latest committed data.
export const command = `git -C "${REPO_DIR}" pull --ff-only origin main --quiet 2>/dev/null; cat "${DATA_FILE}" 2>/dev/null || echo "__ERROR__"`;


// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = {
  km: (m) =>
    (m / 1000).toLocaleString("de-DE", { maximumFractionDigits: 0 }),
  km1: (m) =>
    (m / 1000).toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
  hhmm: (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  },
  pct: (part, total) => (total ? Math.min(100, (part / total) * 100) : 0),
  date: (iso) =>
    new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  weekGrowthPct: (thisWeek, lastWeek) => {
    if (!lastWeek || lastWeek === 0) return null;
    const pct = ((thisWeek - lastWeek) / lastWeek) * 100;
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toFixed(0)}% vs letzte Woche`;
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatBlock({ value, label, sub }) {
  return (
    <div style={s.statBlock}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
      {sub && <div style={s.statSub}>{sub}</div>}
    </div>
  );
}

function LeaderRow({ rank, name, distM, maxDistM, medals }) {
  const bar = fmt.pct(distM, maxDistM);
  return (
    <div style={s.leaderRow}>
      <span style={s.medal}>{medals[rank - 1] || `${rank}.`}</span>
      <div style={s.leaderInfo}>
        <div style={s.leaderName}>{name}</div>
        <div style={s.leaderBarBg}>
          <div style={{ ...s.leaderBarFill, width: `${bar.toFixed(1)}%`, opacity: 1 - (rank - 1) * 0.18 }} />
        </div>
      </div>
      <span style={s.leaderDist}>{fmt.km1(distM)} km</span>
    </div>
  );
}

function Divider() {
  return <div style={s.divider} />;
}

function SectionLabel({ children }) {
  return <div style={s.sectionLabel}>{children}</div>;
}

// ─── Refresh button — no React state needed ───────────────────────────────────
// Übersicht exposes run() as a global to re-execute the widget command immediately.
// We animate the icon via a CSS class toggled directly on the DOM element.
function handleRefreshClick(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const svg = btn.querySelector("svg");
  btn.disabled = true;
  if (svg) svg.style.animation = "spin 1s linear infinite";
  // run() is the Übersicht global that re-runs `command` and calls render().
  if (typeof run === "function") {
    run();
  }
  // Re-enable after 4s as fallback in case run() doesn't trigger a re-render.
  setTimeout(() => {
    btn.disabled = false;
    if (svg) svg.style.animation = "none";
  }, 4000);
}

function RefreshButton() {
  return (
    <button
      onClick={handleRefreshClick}
      style={s.refreshBtn}
      title="Live-Daten holen (git pull)"
    >
      <svg
        viewBox="0 0 24 24"
        width="11"
        height="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: "inline-block", verticalAlign: "middle", marginRight: "4px" }}
      >
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
      Aktualisieren
    </button>
  );
}

// ─── Main render ─────────────────────────────────────────────────────────────

export function render({ output, error }) {
  if (error || !output || output === "__ERROR__") {
    return (
      <div style={s.wrapper}>
        <div style={s.card}>
          <div style={s.errorText}>Keine Daten — strava-data.json nicht erreichbar</div>
        </div>
      </div>
    );
  }

  let data;
  try { data = JSON.parse(output); }
  catch (e) {
    return (
      <div style={s.wrapper}>
        <div style={s.card}>
          <div style={s.errorText}>JSON-Fehler beim Lesen der Daten</div>
        </div>
      </div>
    );
  }

  const allTime  = data.allTimeStats  || {};
  const month    = data.monthStats    || {};
  const week     = data.weekStats     || {};
  const lastWeek = data.lastWeekStats || {};
  const today    = data.todayStats    || {};
  const growth   = data.memberGrowth  || {};
  const topMonth = (data.monthLeaderboard || []).slice(0, 3);
  const maxMonthDist = topMonth[0]?.month?.distance || 1;

  const totalDist = allTime.totalDistance || 0;
  const goalPct   = fmt.pct(totalDist, GOAL_METERS);
  const remaining = Math.max(0, GOAL_METERS - totalDist);

  const memberCurrent = growth.current ?? data.memberCount ?? (data.allTimeLeaderboard?.length ?? 0);
  const memberDiff7d  = growth.lastWeek  != null ? memberCurrent - growth.lastWeek  : null;
  const memberDiff30d = growth.lastMonth != null ? memberCurrent - growth.lastMonth : null;

  const weekGrowthStr = fmt.weekGrowthPct(week.totalDistance || 0, lastWeek.totalDistance || 0);

  const medals = ["🥇", "🥈", "🥉"];

  const hasWeekData = (week.count || 0) > 0 || (today.count || 0) > 0;

  return (
    <div style={s.wrapper}>
      <div style={s.card}>

        {/* ── Header ── */}
        <div style={s.header}>
          <div>
            <div style={s.clubName}>{data.clubName || "One Million Km"}</div>
            <div style={s.memberLine}>
              <span style={s.memberCount}>{memberCurrent} Mitglieder</span>
              {memberDiff7d !== null && memberDiff7d !== 0 && (
                <span style={{ ...s.badge, background: memberDiff7d > 0 ? ACCENT_GREEN : ACCENT_RED }}>
                  {memberDiff7d > 0 ? "+" : ""}{memberDiff7d} diese Woche
                </span>
              )}
              {memberDiff30d !== null && memberDiff30d !== 0 && (
                <span style={{ ...s.badge, background: "rgba(255,255,255,0.1)" }}>
                  {memberDiff30d > 0 ? "+" : ""}{memberDiff30d} diesen Monat
                </span>
              )}
            </div>
          </div>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="#FC4C02" style={{ marginTop: 3, flexShrink: 0 }}>
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
        </div>

        {/* ── Goal progress ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <SectionLabel>Ziel: 1.000.000 km</SectionLabel>
            <span style={s.goalPct}>{goalPct.toFixed(2)}%</span>
          </div>
          <div style={s.progressBg}>
            <div style={{ ...s.progressFill, width: `${goalPct.toFixed(3)}%` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
            <span style={s.progressVal}>{fmt.km(totalDist)} km erreicht</span>
            <span style={s.progressRemain}>noch {fmt.km(remaining)} km</span>
          </div>
        </div>

        <Divider />

        {/* ── Today + This week ── */}
        <SectionLabel>Heute & Diese Woche</SectionLabel>
        <div style={s.grid2}>
          <StatBlock
            value={`${fmt.km1(today.totalDistance || 0)} km`}
            label="Heute"
            sub={today.count ? `${today.count} Aktivität${today.count !== 1 ? "en" : ""}` : "keine Aktivitäten"}
          />
          <StatBlock
            value={`${fmt.km(week.totalDistance || 0)} km`}
            label="Diese Woche"
            sub={weekGrowthStr || (week.count ? `${week.count} Aktivitäten` : "keine Aktivitäten")}
          />
        </div>
        {!hasWeekData && (
          <div style={s.hint}>Tages-/Wochendaten nach dem nächsten Strava-Sync verfügbar</div>
        )}

        <Divider />

        {/* ── Month + All-time ── */}
        <SectionLabel>Monat & Gesamt</SectionLabel>
        <div style={s.grid2}>
          <StatBlock
            value={`${fmt.km(month.totalDistance || 0)} km`}
            label="Dieser Monat"
            sub={fmt.hhmm(month.totalMovingTime || 0)}
          />
          <StatBlock
            value={`${fmt.km(totalDist)} km`}
            label="Gesamt"
            sub={`${data.totalActivities || 0} Aktivitäten`}
          />
        </div>

        <Divider />

        {/* ── Monthly leaderboard ── */}
        <SectionLabel>Top 3 diesen Monat</SectionLabel>
        {topMonth.length === 0 ? (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
            Noch keine Daten für diesen Monat
          </div>
        ) : (
          topMonth.map((a, i) => (
            <LeaderRow
              key={i}
              rank={i + 1}
              name={a.name}
              distM={a.month?.distance || 0}
              maxDistM={maxMonthDist}
              medals={medals}
            />
          ))
        )}

        <Divider />

        {/* ── Footer ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={s.footer}>
            Stand: {data.generatedAt ? fmt.date(data.generatedAt) : "unbekannt"}
          </div>
          <RefreshButton />
        </div>

      </div>
    </div>
  );
}

// ─── Positioning — zentriert auf dem Display ──────────────────────────────────
// Widget-Breite: 340px → margin-left: -170px
// Geschätzte Höhe: ~520px → margin-top: -260px
// Passe margin-top an, wenn das Widget zu hoch oder zu tief liegt.

export const className = `
  left: 50%;
  top: 50%;
  margin-left: -170px;
  margin-top: -260px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
`;

// ─── Design tokens ────────────────────────────────────────────────────────────

const GREEN       = "#0c6a37";
const GREEN_LIGHT = "#18a050";
const ORANGE      = "#FC4C02";
const ACCENT_GREEN = "rgba(24,160,80,0.55)";
const ACCENT_RED   = "rgba(220,60,60,0.55)";

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = {
  wrapper: {
    width: "340px",
  },
  card: {
    background: "rgba(12, 12, 14, 0.86)",
    backdropFilter: "blur(28px) saturate(200%)",
    WebkitBackdropFilter: "blur(28px) saturate(200%)",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.09)",
    padding: "18px 18px 13px",
    color: "#f0f0f0",
    boxShadow: "0 12px 48px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.06) inset",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: "14px",
  },
  clubName: {
    fontSize: "15px",
    fontWeight: "700",
    color: "#fff",
    letterSpacing: "-0.3px",
    marginBottom: "4px",
  },
  memberLine: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    flexWrap: "wrap",
  },
  memberCount: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.5)",
  },
  badge: {
    fontSize: "10px",
    fontWeight: "600",
    color: "#fff",
    borderRadius: "6px",
    padding: "1px 6px",
  },
  sectionLabel: {
    fontSize: "10px",
    fontWeight: "600",
    color: "rgba(255,255,255,0.38)",
    textTransform: "uppercase",
    letterSpacing: "0.9px",
    marginBottom: "8px",
  },
  goalPct: {
    fontSize: "11px",
    fontWeight: "700",
    color: GREEN_LIGHT,
  },
  progressBg: {
    height: "6px",
    background: "rgba(255,255,255,0.09)",
    borderRadius: "3px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: `linear-gradient(90deg, ${GREEN}, ${GREEN_LIGHT})`,
    borderRadius: "3px",
  },
  progressVal: {
    fontSize: "11px",
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
  },
  progressRemain: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.3)",
  },
  divider: {
    height: "1px",
    background: "rgba(255,255,255,0.07)",
    margin: "12px 0",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    marginBottom: "4px",
  },
  statBlock: {
    background: "rgba(255,255,255,0.055)",
    borderRadius: "12px",
    padding: "10px 11px",
  },
  statValue: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#fff",
    lineHeight: "1.15",
    marginBottom: "2px",
  },
  statLabel: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.42)",
    lineHeight: "1.3",
  },
  statSub: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.28)",
    marginTop: "2px",
  },
  hint: {
    fontSize: "10px",
    color: "rgba(255,180,0,0.55)",
    marginTop: "4px",
    marginBottom: "2px",
  },
  leaderRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "9px",
  },
  medal: {
    fontSize: "13px",
    width: "16px",
    textAlign: "center",
    flexShrink: 0,
  },
  leaderInfo: {
    flex: 1,
    minWidth: 0,
  },
  leaderName: {
    fontSize: "12px",
    fontWeight: "600",
    color: "rgba(255,255,255,0.82)",
    marginBottom: "3px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  leaderBarBg: {
    height: "3px",
    background: "rgba(255,255,255,0.07)",
    borderRadius: "2px",
    overflow: "hidden",
  },
  leaderBarFill: {
    height: "100%",
    background: ORANGE,
    borderRadius: "2px",
  },
  leaderDist: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#fff",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  footer: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.22)",
    textAlign: "center",
    marginTop: "2px",
  },
  errorText: {
    fontSize: "12px",
    color: "rgba(255,100,100,0.75)",
    textAlign: "center",
    padding: "20px 0",
  },
  refreshBtn: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    color: "rgba(255,255,255,0.55)",
    fontSize: "10px",
    fontWeight: "600",
    padding: "3px 8px",
    display: "flex",
    alignItems: "center",
    gap: "0px",
    lineHeight: "1",
    fontFamily: "inherit",
  },
};

// Inject keyframes for the spin animation (runs once on load)
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
