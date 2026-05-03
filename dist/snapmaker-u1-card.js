/**
 * snapmaker-u1-card.js  —  v24.0.0
 * Prism-style Home Assistant custom card for the Snapmaker U1 3D printer.
 * Data source: Moonraker REST API (Klipper-based firmware).
 *
 * Installation:
 *   1. Copy this file to <ha-config>/www/snapmaker-u1-card.js
 *   2. In HA → Settings → Dashboards → Resources, add:
 *        URL: /local/snapmaker-u1-card.js   Type: JavaScript Module
 *   3. Add a card to your dashboard:
 *
 *   type: custom:snapmaker-u1-card
 *   moonraker_url: http://192.168.1.xxx        # required
 *   printer_image: /local/snapmaker-u1.png     # optional — any image URL
 *   poll_interval: 2000                        # optional, ms (default 2000)
 *   # api_key: your-moonraker-api-key           # omit entirely if not needed;
 *                                             # only set if Moonraker requires auth
 *
 * Spool / MMU colors:
 *   The Snapmaker U1 always has an MMU. Spool colors, material types, and
 *   loaded-lane state are pulled live from the AFC Lite Moonraker plugin —
 *   no static color config required or supported.
 *
 * Finding your Moonraker API key:
 *   In moonraker.conf set trusted_clients or api_key_file, then copy the key
 *   shown in the Moonraker log on first startup, or generate one via:
 *   GET http://<printer-ip>/access/api_key
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtTime(sec) {
  if (!sec || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

function hsbToHex(h, s, b) {
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const [p, q, t] = [b * (1 - s), b * (1 - f * s), b * (1 - (1 - f) * s)];
  const rgb = [[b,t,p],[q,b,p],[p,b,t],[p,q,b],[t,p,b],[b,p,q]][i];
  return '#' + rgb.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
function hexToHsb(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: max ? d / max : 0, b: max };
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles (shadow DOM — isolated, mirrors prism.css mockup design)
// ─────────────────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :host { display: block; font-family: 'Inter', system-ui, sans-serif; }

  /* ── Card shell ── */
  .ha-card {
    background: #0c0e16;
    border-radius: 18px;
    overflow: hidden;
    position: relative;
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.05),
      0 24px 64px rgba(0,0,0,0.85),
      0 0 70px var(--status-glow, rgba(0,229,255,0.15));
    transition: box-shadow 0.5s ease;
  }

  /* Animated blue border */
  .card-glow-border {
    position: absolute; inset: 0; border-radius: 18px; padding: 1.5px;
    background: linear-gradient(135deg,
      rgba(0,120,255,0.75) 0%, rgba(0,210,255,0.55) 35%,
      rgba(30,160,255,0.70) 65%, rgba(0,200,255,0.50) 100%);
    background-size: 300% 300%;
    animation: border-shift 8s ease-in-out infinite;
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    pointer-events: none; z-index: 10;
  }
  @keyframes border-shift {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  /* ── Header ── */
  .card-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px 12px;
  }
  .header-left { display: flex; align-items: center; gap: 10px; }
  .printer-icon-sm {
    width: 34px; height: 34px; border-radius: 9px;
    background: linear-gradient(135deg, rgba(123,97,255,0.18), rgba(0,229,255,0.1));
    border: 1px solid rgba(123,97,255,0.28);
    display: flex; align-items: center; justify-content: center;
    color: #a78bfa; box-shadow: 0 0 12px rgba(123,97,255,0.18); flex-shrink: 0;
  }
  .printer-icon-sm.err-icon {
    background: linear-gradient(135deg, rgba(255,79,79,0.18), rgba(255,100,80,0.1));
    border-color: rgba(255,79,79,0.35); color: #ff6b6b;
    box-shadow: 0 0 12px rgba(255,79,79,0.22);
  }
  .printer-icon-sm.pause-icon {
    background: linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.1));
    border-color: rgba(245,158,11,0.38); color: #fbbf24;
    box-shadow: 0 0 12px rgba(245,158,11,0.22);
  }
  .hdr-brand {
    font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase;
    color: rgba(255,255,255,0.90); font-weight: 600; line-height: 1; margin-bottom: 2px;
  }
  .hdr-model { font-size: 17px; font-weight: 800; color: #eaecff; letter-spacing: -0.01em; line-height: 1; }

  .status-badge {
    display: flex; align-items: center; gap: 6px;
    background: color-mix(in srgb, var(--status-color) 13%, rgba(12,14,22,0.8));
    border: 1px solid color-mix(in srgb, var(--status-color) 45%, transparent);
    border-radius: 20px; padding: 5px 12px 5px 8px;
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 700;
    letter-spacing: 0.14em; color: var(--status-color);
    box-shadow: 0 0 14px color-mix(in srgb, var(--status-color) 28%, transparent);
  }
  .status-pulse {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--status-color); box-shadow: 0 0 8px var(--status-color);
    flex-shrink: 0; animation: blink 2s ease-in-out infinite;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.35} }

  /* ── Prism line ── */
  .prism-line {
    height: 2px;
    margin-top: -10px;
    background: linear-gradient(90deg,
      transparent 0%, rgba(0,120,255,0.85) 15%, rgba(0,210,255,0.70) 38%,
      rgba(30,160,255,0.90) 58%, rgba(0,200,255,0.65) 80%, transparent 100%);
    box-shadow: 0 0 10px rgba(0,180,255,0.45);
  }
  .prism-line.err-line {
    background: linear-gradient(90deg,
      transparent 0%, #ff4f4f 15%, #ff8c6b 38%,
      #ff4f4f 58%, #bf3030 74%, #ff4f4f 88%, transparent 100%);
    box-shadow: 0 0 10px rgba(255,79,79,0.45);
  }
  .prism-line.pause-line {
    background: linear-gradient(90deg,
      transparent 0%, #f59e0b 15%, #fbbf24 38%,
      #f59e0b 58%, #d97706 74%, #f59e0b 88%, transparent 100%);
    box-shadow: 0 0 10px rgba(245,158,11,0.45);
  }
  @keyframes shimmer { 0%{background-position:0% 0} 100%{background-position:200% 0} }

  /* ── Content row ── */
  .content-row { display: flex; align-items: stretch; background: #080a10; padding-top: 16px; }

  /* ── Side columns ── */
  .side-col {
    width: 72px; flex-shrink: 0;
    display: flex; flex-direction: column; align-items: center;
    justify-content: space-evenly; padding: 14px 8px;
    background: rgba(255,255,255,0.015);
  }
  .left-col { border-right: 1px solid rgba(255,255,255,0.06); }
  .right-col { border-left: 1px solid rgba(255,255,255,0.06); }
  .side-stat-group { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 100%; }
  .side-stat-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.90); font-weight: 700; line-height: 1; }
  .side-stat-val { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; line-height: 1.1; text-align: center; }
  .side-stat-target { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: rgba(150,160,220,0.3); line-height: 1; }
  .side-divider-h { width: 100%; height: 1px; background: rgba(255,255,255,0.05); margin: 10px 0; }
  .side-mini-bar { width: 24px; height: 48px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; display: flex; align-items: flex-end; margin-top: 5px; }
  .side-mini-fill { width: 100%; border-radius: 4px; transition: height 0.4s ease; }
  .hot-val   { color: #ff3333; } .warm-val { color: #ff8c00; } .cool-val { color: rgba(150,170,230,0.45); }
  .layer-val { color: rgba(255,255,255,0.92); font-size: 20px; } .speed-val { color: rgba(255,255,255,0.92); font-size: 20px; } .fan-val { color: rgba(255,255,255,0.92); font-size: 20px; }
  .purple-val{ color: #a78bfa; } .muted-val { color: rgba(160,180,230,0.45); font-family: 'JetBrains Mono', monospace; }
  .pause-stat-val { color: #fbbf24; } .err-stat-val { color: rgba(255,140,140,0.55); }
  .hot-fill  { background: linear-gradient(0deg,#ff6b6b,#ff8c6b); box-shadow: 0 0 6px rgba(255,107,107,0.5); }
  .warm-fill { background: linear-gradient(0deg,#f59e0b,#fbbf24); box-shadow: 0 0 6px rgba(251,191,36,0.4); }
  .cool-fill { background: rgba(140,160,220,0.2); }

  /* ── Center image ── */
  .center-img-wrap { flex: 1; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; min-height: 220px; }
  .center-img { width: 100%; height: 100%; object-fit: contain; object-position: center calc(50% + 10px); display: block; filter: brightness(0.9) contrast(1.04); }
  .img-inner-glow {
    position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse at 50% 0%,rgba(8,10,16,0.5) 0%,transparent 60%),
                radial-gradient(ellipse at 50% 100%,rgba(8,10,16,0.55) 0%,transparent 60%);
  }
  .standby-img { filter: brightness(0.55) saturate(0.45) contrast(1.05); }
  .err-img     { filter: brightness(0.5) saturate(0.3) contrast(1.1) hue-rotate(330deg); }
  .pause-img   { filter: brightness(0.72) saturate(0.65) contrast(1.05); }

  /* Cover thumbnail */
  .cover-thumb {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, calc(-50% + 45px));
    z-index: 2; background: rgba(8,10,18,0.72);
    border: 1px solid rgba(0,229,255,0.22); border-radius: 10px;
    padding: 10px 10px 6px; backdrop-filter: blur(6px);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.6), 0 0 18px rgba(0,229,255,0.12);
    display: flex; flex-direction: column; align-items: center; gap: 5px;
  }
  .cover-thumb img { width: 72px; height: 72px; object-fit: contain; border-radius: 4px; }
  .cover-thumb-svg { display: block; }
  .cover-thumb-label { font-family: 'JetBrains Mono', monospace; font-size: 8px; font-weight: 500; color: rgba(160,180,255,0.4); letter-spacing: 0.05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px; }
  .cover-thumb.muted  { border-color: rgba(167,139,250,0.15); box-shadow: 0 8px 24px rgba(0,0,0,0.6); opacity: 0.6; }
  .cover-thumb.err    { border-color: rgba(255,79,79,0.25); }
  .cover-thumb.pause  { border-color: rgba(245,158,11,0.25); }

  /* Standby overlay */
  .standby-overlay { position: absolute; inset: 0; z-index: 3; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
  .standby-icon-ring { width: 46px; height: 46px; border-radius: 50%; background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.32); display: flex; align-items: center; justify-content: center; color: #a78bfa; box-shadow: 0 0 20px rgba(167,139,250,0.22); }
  .standby-msg { font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(200,210,255,0.6); }

  /* Pause overlay */
  .pause-overlay { position: absolute; inset: 0; z-index: 3; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
  .pause-icon-ring { width: 54px; height: 54px; border-radius: 50%; background: rgba(245,158,11,0.12); border: 1.5px solid rgba(245,158,11,0.48); display: flex; align-items: center; justify-content: center; color: #fbbf24; box-shadow: 0 0 0 6px rgba(245,158,11,0.07), 0 0 22px rgba(245,158,11,0.35); animation: pause-pulse 2.4s ease-in-out infinite; }
  @keyframes pause-pulse { 0%,100%{box-shadow:0 0 0 6px rgba(245,158,11,0.07),0 0 22px rgba(245,158,11,0.35)} 50%{box-shadow:0 0 0 10px rgba(245,158,11,0.04),0 0 32px rgba(245,158,11,0.5)} }
  .pause-msg { font-size: 14px; font-weight: 800; color: #fcd34d; letter-spacing: 0.06em; text-transform: uppercase; text-shadow: 0 0 14px rgba(245,158,11,0.55); }
  .pause-sub { font-size: 10px; color: rgba(251,191,36,0.45); letter-spacing: 0.06em; font-weight: 500; }

  /* Error overlay */
  .err-scanlines { position: absolute; inset: 0; background: repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,50,50,0.04) 3px,rgba(255,50,50,0.04) 4px); pointer-events: none; z-index: 1; animation: scanflicker 0.15s steps(1) infinite; }
  @keyframes scanflicker { 0%,100%{opacity:0.6} 50%{opacity:1} }
  .err-overlay { position: absolute; inset: 0; z-index: 3; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; }
  .err-icon-ring { width: 56px; height: 56px; border-radius: 50%; background: rgba(255,79,79,0.12); border: 1.5px solid rgba(255,79,79,0.5); display: flex; align-items: center; justify-content: center; color: #ff6b6b; box-shadow: 0 0 0 6px rgba(255,79,79,0.07), 0 0 24px rgba(255,79,79,0.35); animation: err-pulse 2s ease-in-out infinite; }
  @keyframes err-pulse { 0%,100%{box-shadow:0 0 0 6px rgba(255,79,79,0.07),0 0 24px rgba(255,79,79,0.35)} 50%{box-shadow:0 0 0 10px rgba(255,79,79,0.04),0 0 36px rgba(255,79,79,0.5)} }
  .err-title { font-size: 14px; font-weight: 800; color: #ff8c8c; letter-spacing: 0.04em; text-shadow: 0 0 16px rgba(255,79,79,0.6); }
  .err-code { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 600; letter-spacing: 0.18em; color: rgba(255,120,120,0.55); background: rgba(255,79,79,0.1); border: 1px solid rgba(255,79,79,0.2); border-radius: 4px; padding: 3px 8px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }

  /* ── MMU strip ── */
  .mmu-strip { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-top: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.012); }
  .mmu-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.16em; color: rgba(255,255,255,0.90); font-weight: 700; flex-shrink: 0; }
  .mmu-slots { display: flex; gap: 8px; flex: 1; }
  .mmu-slot { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 4px 5px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); position: relative; }
  .mmu-slot.active { border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); }
  .mmu-slot.idle { opacity: 0.45; }
  .mmu-swatch { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.12); flex-shrink: 0; }
  .mmu-slot-num { font-family: 'JetBrains Mono', monospace; font-size: 8px; font-weight: 700; color: rgba(150,165,220,0.35); line-height: 1; }
  .mmu-slot-type { font-size: 8.5px; font-weight: 600; color: rgba(200,215,255,0.55); letter-spacing: 0.05em; line-height: 1; }
  .mmu-active-dot { position: absolute; top: -3px; right: -3px; width: 7px; height: 7px; border-radius: 50%; border: 1.5px solid #0c0e16; animation: blink 1.6s ease-in-out infinite; }

  /* ── AFC Spool Cards ── */
  .afc-section { border-top: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.012); padding: 10px 10px 8px; }
  .afc-section-hdr { font-size: 8px; text-transform: uppercase; letter-spacing: 0.16em; color: rgba(150,165,220,0.35); font-weight: 700; margin-bottom: 8px; }
  .afc-lanes { display: flex; gap: 6px; }
  .afc-lane-card { flex: 1; border-radius: 10px; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.02); overflow: hidden; transition: border-color .2s, background .2s, box-shadow .2s, transform .2s; }
  .afc-lane-card.active { transform: translateY(-2px); z-index: 2; }
  .afc-lane-card.idle { opacity: 0.52; filter: saturate(0.4); }
  .afc-lane-hdr { background: rgba(255,255,255,0.04); padding: 4px 5px; text-align: center; font-family: 'JetBrains Mono', monospace; font-size: 7.5px; font-weight: 700; color: rgba(200,215,255,0.55); letter-spacing: 0.04em; border-bottom: 1px solid rgba(255,255,255,0.04); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .afc-spool-area { padding: 8px 4px 5px; display: flex; flex-direction: column; align-items: center; gap: 3px; position: relative; min-height: 80px; }
  .afc-badge { font-size: 6px; font-weight: 800; letter-spacing: 0.07em; background: rgba(100,120,200,0.15); border: 1px solid rgba(100,120,200,0.2); border-radius: 3px; padding: 1px 4px; color: rgba(180,195,255,0.5); }
  .afc-badge.badge-active { background: rgba(0,229,255,0.12); border-color: rgba(0,229,255,0.3); color: rgba(0,229,255,0.85); }
  .afc-lane-dot { position: absolute; top: 5px; left: 5px; width: 7px; height: 7px; border-radius: 50%; animation: blink 1.6s ease-in-out infinite; box-shadow: 0 0 5px currentColor; }
  .afc-active-label { font-size: 6.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 2px; }
  .afc-material { font-size: 9px; font-weight: 700; color: rgba(220,230,255,0.85); letter-spacing: 0.03em; }
  .afc-weight { font-size: 7.5px; color: rgba(150,165,220,0.4); font-family: 'JetBrains Mono', monospace; }
  .afc-btn-row { display: flex; border-top: 1px solid rgba(255,255,255,0.04); }
  .afc-btn { flex: 1; padding: 5px 0; background: none; border: none; cursor: pointer; color: rgba(150,165,220,0.35); font-size: 12px; transition: color .15s, background .15s; line-height: 1; }
  .afc-btn:hover { color: rgba(200,215,255,0.8); background: rgba(255,255,255,0.04); }
  .afc-load:hover { color: rgba(0,229,255,0.9) !important; }
  .afc-unload:hover { color: rgba(245,158,11,0.9) !important; }
  .afc-btn + .afc-btn { border-left: 1px solid rgba(255,255,255,0.04); }

  /* ── Info strips ── */
  .info-strip { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-top: 1px solid rgba(255,255,255,0.05); }
  .info-strip.standby { background: rgba(167,139,250,0.04); border-top-color: rgba(167,139,250,0.1); }
  .info-strip.pause   { background: rgba(245,158,11,0.04); border-top-color: rgba(245,158,11,0.1); }
  .info-strip.err     { background: rgba(255,79,79,0.05); border-top-color: rgba(255,79,79,0.12); }
  .strip-icon { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
  .strip-icon.ok     { background: rgba(52,211,153,0.15); border: 1px solid rgba(52,211,153,0.3); color: #34d399; }
  .strip-icon.pause  { background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.3); color: #fbbf24; }
  .strip-dot { width: 8px; height: 8px; border-radius: 50%; background: #ff4f4f; box-shadow: 0 0 8px rgba(255,79,79,0.8); flex-shrink: 0; animation: blink 1.2s ease-in-out infinite; }
  .strip-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .strip-title { font-size: 11px; font-weight: 600; }
  .strip-title.standby { color: rgba(200,215,255,0.65); } .strip-title.pause { color: rgba(252,211,77,0.7); } .strip-title.err { color: rgba(255,160,160,0.75); }
  .strip-sub { font-family: 'JetBrains Mono', monospace; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .strip-sub.standby { color: rgba(150,165,220,0.38); } .strip-sub.pause { color: rgba(245,158,11,0.35); } .strip-sub.err { color: rgba(255,120,120,0.38); }

  /* ── Progress section ── */
  .progress-section { padding: 12px 16px 10px; border-top: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.01); }
  .prog-file { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.90); letter-spacing: 0.05em; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .prog-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .prog-pct { font-family: 'JetBrains Mono', monospace; font-size: 24px; font-weight: 700; line-height: 1; flex-shrink: 0; }
  .prog-pct.cyan   { color: #ffffff; filter: drop-shadow(0 0 6px rgba(0,229,255,0.35)); }
  .prog-pct.amber  { color: #ffffff; filter: drop-shadow(0 0 6px rgba(245,158,11,0.4)); }
  .prog-pct.red    { color: #ffffff; filter: drop-shadow(0 0 6px rgba(255,79,79,0.4)); }
  .prog-track { flex: 1; height: 6px; background: rgba(255,255,255,0.08); border-radius: 6px; position: relative; overflow: visible; }
  .prog-track.amber { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.1); }
  .prog-track.red   { background: rgba(255,79,79,0.08); border: 1px solid rgba(255,79,79,0.12); }
  .prog-fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 6px; animation: shimmer 3s linear infinite; }
  .prog-fill.cyan  { background: linear-gradient(90deg,#7b61ff,#00e5ff,#bf5af2); background-size: 200% 100%; box-shadow: 0 0 10px rgba(0,229,255,0.55); }
  .prog-fill.amber { background: linear-gradient(90deg,#d97706,#fbbf24); box-shadow: 0 0 10px rgba(245,158,11,0.45); animation: none; }
  .prog-fill.red   { background: linear-gradient(90deg,#ff4f4f,#ff8c6b); box-shadow: 0 0 10px rgba(255,79,79,0.5); animation: none; }
  .prog-dot { position: absolute; top: 50%; transform: translate(-50%,-50%); width: 13px; height: 13px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px rgba(0,229,255,0.5), 0 0 14px rgba(0,229,255,0.8); }
  .prog-dot.amber { box-shadow: 0 0 0 2px rgba(245,158,11,0.5), 0 0 12px rgba(245,158,11,0.75); background: #fcd34d; }
  .prog-times { display: flex; align-items: center; }
  .prog-time-cell { flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .prog-time-cell.center { align-items: center; } .prog-time-cell.end { align-items: flex-end; }
  .prog-time-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.09em; color: rgba(255,255,255,0.90); font-weight: 700; }
  .prog-time-val { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; color: rgba(220,228,255,0.85); }
  .prog-time-sep { width: 1px; height: 26px; background: rgba(255,255,255,0.06); margin: 0 10px; }

  /* ── Action row ── */
  .action-row { display: flex; gap: 8px; padding: 10px 16px 16px; }
  button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 9px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; letter-spacing: 0.03em; border: 1px solid; cursor: pointer; font-family: 'Inter', system-ui, sans-serif; transition: all 0.18s ease; }
  .btn-pause    { background: rgba(123,97,255,0.12); border-color: rgba(123,97,255,0.35); color: #a78bfa; }
  .btn-pause:hover { background: rgba(123,97,255,0.22); box-shadow: 0 0 16px rgba(123,97,255,0.3); }
  .btn-cancel   { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.09); color: rgba(190,200,240,0.5); }
  .btn-cancel:hover { background: rgba(255,255,255,0.08); color: rgba(200,210,255,0.8); }
  .btn-estop    { background: rgba(255,60,60,0.09); border-color: rgba(255,80,80,0.32); color: #ff6b6b; }
  .btn-estop:hover { background: rgba(255,60,60,0.2); box-shadow: 0 0 16px rgba(255,70,70,0.28); }
  .btn-resume   { flex: 1.4; background: rgba(167,139,250,0.13); border-color: rgba(167,139,250,0.42); color: #c4b5fd; }
  .btn-resume:hover { background: rgba(167,139,250,0.24); box-shadow: 0 0 22px rgba(167,139,250,0.32); }
  .btn-resume.amber { background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.42); color: #fcd34d; }
  .btn-resume.amber:hover { background: rgba(245,158,11,0.24); }
  .btn-start    { flex: 1.4; background: rgba(167,139,250,0.13); border-color: rgba(167,139,250,0.42); color: #c4b5fd; box-shadow: 0 0 16px rgba(167,139,250,0.18); }
  .btn-start:hover { background: rgba(167,139,250,0.24); }
  .btn-preheat  { background: rgba(255,140,107,0.09); border-color: rgba(255,140,107,0.28); color: #ff8c6b; }
  .btn-preheat:hover { background: rgba(255,140,107,0.18); }
  .btn-clear    { background: rgba(255,79,79,0.1); border-color: rgba(255,79,79,0.35); color: #ff8c8c; }
  .btn-clear:hover { background: rgba(255,79,79,0.2); box-shadow: 0 0 20px rgba(255,79,79,0.3); }
  .btn-green    { background: rgba(52,211,153,0.08); border-color: rgba(52,211,153,0.28); color: #34d399; }
  .btn-green:hover { background: rgba(52,211,153,0.16); }

  /* ── Connection error ── */
  .offline-state { padding: 32px 16px; text-align: center; }
  .offline-icon { color: rgba(150,165,220,0.3); margin-bottom: 10px; }
  .offline-msg { font-size: 13px; color: rgba(160,180,255,0.35); font-weight: 500; }
  .offline-sub { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: rgba(120,140,200,0.25); margin-top: 4px; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// SVG icons (inline, no external deps)
// ─────────────────────────────────────────────────────────────────────────────
const ICONS = {
  printer: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="7" rx="2"/><path d="M7 11V7a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4"/><circle cx="17" cy="14.5" r="1" fill="currentColor"/></svg>`,
  pause:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  play:    `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  x:       `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  zap:     `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  check:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  flame:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v10M12 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>`,
  power:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>`,
  alert:   `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  wifi_off:`<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20" stroke-width="2" stroke-linecap="round"/></svg>`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Thumbnail SVG placeholder (layer stack — used when no Moonraker thumb)
// ─────────────────────────────────────────────────────────────────────────────
function thumbSVG(colors) {
  const [c1, c2, c3, c4, c5, c6, c7] = colors;
  return `<svg class="cover-thumb-svg" width="72" height="72" viewBox="0 0 80 80" fill="none">
    <rect x="8"  y="48" width="64" height="4"  rx="2" fill="${c1}"/>
    <rect x="12" y="40" width="56" height="6"  rx="2" fill="${c2}"/>
    <rect x="16" y="32" width="48" height="6"  rx="2" fill="${c3}"/>
    <rect x="20" y="24" width="40" height="6"  rx="2" fill="${c4}"/>
    <rect x="24" y="16" width="32" height="6"  rx="2" fill="${c5}"/>
    <rect x="28" y="10" width="24" height="4"  rx="2" fill="${c6}"/>
    <rect x="32" y="6"  width="16" height="3"  rx="1.5" fill="${c7}"/>
  </svg>`;
}

const THUMB_CYAN  = thumbSVG(['rgba(0,229,255,0.18)','rgba(0,229,255,0.25)','rgba(123,97,255,0.3)','rgba(123,97,255,0.38)','rgba(191,90,242,0.4)','rgba(191,90,242,0.45)','rgba(255,255,255,0.3)']);
const THUMB_AMBER = thumbSVG(['rgba(245,158,11,0.15)','rgba(245,158,11,0.22)','rgba(245,158,11,0.28)','rgba(245,158,11,0.32)','rgba(245,158,11,0.12)','rgba(245,158,11,0.09)','rgba(255,255,255,0.08)']);
const THUMB_RED   = thumbSVG(['rgba(255,79,79,0.15)','rgba(255,79,79,0.2)','rgba(255,79,79,0.25)','rgba(255,79,79,0.28)','rgba(255,79,79,0.22)','rgba(255,79,79,0.18)','rgba(255,255,255,0.15)']);
const THUMB_MUTED = thumbSVG(['rgba(167,139,250,0.12)','rgba(167,139,250,0.15)','rgba(167,139,250,0.18)','rgba(167,139,250,0.2)','rgba(167,139,250,0.22)','rgba(167,139,250,0.24)','rgba(255,255,255,0.15)']);

// ─────────────────────────────────────────────────────────────────────────────
// Card class
// ─────────────────────────────────────────────────────────────────────────────
class SnapmakerU1Card extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config    = {};
    this._data      = null;
    this._error     = null;
    this._timer     = null;
    this._thumbUrl  = null;
    this._lastFile  = null;
    this._afcSlots          = null;
    this._afcLaneKey        = null;
    this._afcRetried        = false;
    this._afcFetchInFlight  = false;
    this._afcWorkingPrefix  = null;
    this._lastRenderKey     = null;    // state|color — full rebuild only on change
    this._lastAfcHash       = null;    // hash of afc slots — patch only on change
  }

  // ── HA interface ───────────────────────────────────────────────────────────
  static getConfigElement() {
    return document.createElement('snapmaker-u1-card-editor');
  }

  static getStubConfig() {
    return {
      moonraker_url: 'http://192.168.1.xxx',
      printer_image: '/local/snapmaker-u1.png',
      poll_interval: 2000,
    };
  }

  setConfig(config) {
    if (!config.moonraker_url) throw new Error('snapmaker-u1-card: moonraker_url is required');
    this._config = {
      poll_interval: 2000,
      api_key: '',
      ...config,
    };
    this._config.moonraker_url = this._config.moonraker_url.replace(/\/$/, '');
    if (this.isConnected) this._startPolling();
  }

  set hass(_hass) { /* not needed — we poll directly */ }

  connectedCallback()    { this._startPolling(); }
  disconnectedCallback() { this._stopPolling();  }

  // ── Auth headers ───────────────────────────────────────────────────────────
  _headers(extra = {}) {
    const h = { ...extra };
    if (this._config.api_key) h['X-Api-Key'] = this._config.api_key;
    return h;
  }

  // ── Polling ────────────────────────────────────────────────────────────────
  _startPolling() {
    if (!this._config.moonraker_url || this._timer) return;
    this._poll();
    this._timer = setInterval(() => this._poll(), this._config.poll_interval);
  }

  _stopPolling() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  async _poll() {
    const base = this._config.moonraker_url;
    const fields = 'print_stats&extruder&heater_bed&fan&virtual_sdcard&motion_report&gcode_move&AFC';
    try {
      const res = await fetch(`${base}/printer/objects/query?${fields}`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`Moonraker HTTP ${res.status}`);
      const json = await res.json();
      const s = json.result.status;

      const ps   = s.print_stats    || {};
      const ext  = s.extruder       || {};
      const bed  = s.heater_bed     || {};
      const fan  = s.fan            || {};
      const sd   = s.virtual_sdcard || {};
      const gm   = s.gcode_move     || {};

      // ── AFC Lite spool data ───────────────────────────────────────────────
      // AFC Lite exposes lane data in one of four layouts depending on version:
      //  A) v2.x dict   — afc.lanes = { lane1: {material,color,...}, ... }
      //  B) v2.x array  — afc.lanes = ["Turtle_1 lane1", ...] (names only;
      //                    data lives in separate Moonraker objects — fetched below)
      //  C) v2.x units  — afc.units = { Turtle_1: { lane1: {...}, ... } }
      //  D) v1.x nested — afc.Turtle_1 = { lane1: {...}, hub: {...}, ... }
      //  E) legacy flat  — afc.lane1 = { material, color, loaded, ... }
      if (s.AFC) {
        const afc = s.AFC;

        const isObj  = v => v && typeof v === 'object' && !Array.isArray(v);
        // Expanded field set covers both v1 and v2 naming conventions
        const LANE_F = new Set(['material','filament_type','loaded','tool_loaded',
                                'hub_loaded','filament_present','color','spool_id',
                                'weight','map','tool_map','filament_color',
                                'hex_color','index','status','unit','name']);
        const isLane = v => isObj(v) && Object.keys(v).some(f => LANE_F.has(f));
        // Keys that are never lane containers at the top level of AFC
        const META   = new Set(['system','current','current_load','current_lane',
                                'next_lane','current_state','current_toolchange',
                                'number_of_toolchanges','spoolman','td1_present',
                                'lane_data_enabled','error_state','bypass_state',
                                'bypass','quiet_mode','position_saved',
                                'lanes','extruders','hubs','buffers','message',
                                'led_state','num_lanes','tool_count','error',
                                'hub','extruder','buffer']);

        // current_load is a boolean (is anything loaded?), NOT the lane name.
        // current_lane is the string name of the active lane (e.g. "E0").
        // Never use current_load as a lane identifier — it short-circuits the ||
        // chain and sets currentLane to `true`, which never matches a lane name.
        let currentLane = (typeof afc.current_lane === 'string' && afc.current_lane)
                        || (typeof afc.current     === 'string' && afc.current)
                        || '';
        let lanePairs   = [];

        // ── Layout A: afc.lanes is a dict of lane objects ──────────────────
        if (isObj(afc.lanes) && Object.keys(afc.lanes).length) {
          lanePairs = Object.entries(afc.lanes).filter(([, v]) => isObj(v));

        // ── Layout B: afc.lanes is an array of Moonraker object names ──────
        } else if (Array.isArray(afc.lanes) && afc.lanes.length) {
          // Schedule a separate fetch for the individual lane objects.
          // _afcSlots will be populated when that fetch completes.
          // Pass unit names so the retry can try "unit U1 E0" style lookups
          const _unitNames = Array.isArray(afc.units)
            ? afc.units
            : Object.keys(afc.units || {});
          this._fetchAfcLaneObjects(base, afc.lanes, currentLane, _unitNames);

        // ── Layout C: afc.units contains nested unit→lane dicts ────────────
        } else if (isObj(afc.units) && Object.keys(afc.units).length) {
          for (const [, unit] of Object.entries(afc.units)) {
            if (!isObj(unit)) continue;
            for (const [lk, lv] of Object.entries(unit)) {
              if (isLane(lv)) lanePairs.push([lk, lv]);
            }
          }

        // ── Layouts D & E: v1.x nested unit or legacy flat ─────────────────
        } else {
          for (const [k, v] of Object.entries(afc)) {
            if (META.has(k) || !isObj(v)) continue;
            if (isLane(v)) {
              lanePairs.push([k, v]);
            } else {
              if (v.system) currentLane = currentLane || v.system.current_load || '';
              for (const [lk, lv] of Object.entries(v)) {
                if (!META.has(lk) && isLane(lv)) lanePairs.push([lk, lv]);
              }
            }
          }
        }

        // Debug — visible in browser devtools console
        console.debug('[SnapmakerU1] AFC raw keys:', Object.keys(afc));
        console.debug('[SnapmakerU1] currentLane:', JSON.stringify(currentLane), '| current_load:', afc.current_load, '| current_lane raw:', afc.current_lane);
        console.debug('[SnapmakerU1] afc.lanes:', JSON.stringify(afc.lanes)?.slice(0, 300));
        console.debug('[SnapmakerU1] afc.units:', JSON.stringify(afc.units)?.slice(0, 300));
        console.debug('[SnapmakerU1] AFC lanes found:', lanePairs.map(([k]) => k));

        const _parseColor = rawColor => {
          if (!rawColor) return '#666';
          if (Array.isArray(rawColor)) {
            const scale = rawColor.some(v => v > 1) ? 1 : 255;
            return '#' + rawColor.slice(0, 3)
              .map(v => Math.round(v * scale).toString(16).padStart(2, '0'))
              .join('');
          }
          const s = String(rawColor).trim();
          return s.startsWith('#') ? s : (/^[0-9a-f]{3,8}$/i.test(s) ? `#${s}` : s);
        };

        this._afcSlots = lanePairs.map(([name, lane]) => {
          const rawColor = lane.color ?? lane.filament_color ?? lane.hex_color ?? '';
          // "loaded" means "currently active printing lane" — only one lane at a time.
          // lane.tool_loaded/loaded/hub_loaded mean "filament physically present",
          // which is true for ALL lanes simultaneously and MUST NOT be used here.
          // The authoritative source is current_lane from the top-level AFC object.
          const isLoaded  = !!(currentLane && name === currentLane);
          // v2.x also exposes "map" as the tool assignment (T0, T1 …)
          const mapVal = lane.map || lane.tool_map || lane.tool || '';
          return {
            name,
            type:    lane.material || lane.filament_type || lane.type || '—',
            color:   _parseColor(rawColor),
            loaded:  isLoaded,
            spoolId: lane.spool_id  || '',
            weight:  lane.weight    || lane.filament_weight || 0,
            map:     mapVal,
          };
        });
      }

      // Fetch thumbnail when filename changes
      const fname = ps.filename || '';
      if (fname && fname !== this._lastFile) {
        this._lastFile = fname;
        this._fetchThumb(base, fname);
      }
      if (!fname) { this._thumbUrl = null; this._lastFile = null; }

      // Estimate remaining time
      const progress = sd.progress || 0;
      const elapsed  = ps.print_duration || 0;
      const remaining = progress > 0.01 ? elapsed * (1 / progress - 1) : 0;

      this._data = {
        state:         ps.state || 'standby',
        filename:      fname.replace(/\.gcode$/i, ''),
        progress:      progress,
        elapsed:       elapsed,
        remaining:     remaining,
        filamentUsed:  ((ps.filament_used || 0) / 1000).toFixed(1), // mm → m
        currentLayer:  ps.info?.current_layer || 0,
        totalLayers:   ps.info?.total_layer   || 0,
        extruderActual: ext.temperature || 0,
        extruderTarget: ext.target      || 0,
        bedActual:      bed.temperature || 0,
        bedTarget:      bed.target      || 0,
        fanSpeed:       Math.round((fan.speed || 0) * 100),
        speed:          Math.round((gm.speed_factor || 1) * 100),
        message:        ps.message || '',
      };
      this._error = null;
    } catch (e) {
      this._error = e.message;
    }
    this._render();
  }

  // ── Layout B: fetch lane objects individually when afc.lanes is a name array ──
  async _fetchAfcLaneObjects(base, laneNames, currentLane, unitNames = []) {
    // Prevent concurrent overlapping fetches — only one in flight at a time.
    // The old "skip if we already have real data" dedup guard was removed: it
    // permanently blocked tool_loaded updates after the first successful fetch.
    // DOM re-renders are now gated by _patchDynamic's hash check (v12+) so
    // fetching every poll is safe and free of visual flashing.
    if (this._afcFetchInFlight) return;
    this._afcFetchInFlight = true;
    try {
      const isObj   = v => v && typeof v === 'object' && !Array.isArray(v);
      const hasData = v => isObj(v) && Object.keys(v).length > 0;

      // ── Fast path: we already know which prefix works ─────────────────────
      if (this._afcWorkingPrefix !== null) {
        const pfx = this._afcWorkingPrefix;
        const qs  = laneNames.map(n => encodeURIComponent(pfx + n)).join('&');
        const res = await fetch(`${base}/printer/objects/query?${qs}`, {
          headers: this._headers(), signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const st = (await res.json())?.result?.status || {};
          this._buildAndStoreSlots(Object.keys(st), st, laneNames, currentLane);
        }
        return;
      }

      // ── Slow path: probe — first try the bare lane names ─────────────────
      const qs = laneNames.map(n => encodeURIComponent(n)).join('&');
      const res = await fetch(`${base}/printer/objects/query?${qs}`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return;
      const json = await res.json();
      const st = json?.result?.status || {};
      console.debug('[SnapmakerU1] AFC lane objects fetched:', Object.keys(st));
      const firstKey = Object.keys(st)[0];
      console.debug('[SnapmakerU1] AFC first lane value:', JSON.stringify(st[firstKey])?.slice(0, 400));

      // If the direct-name fetch returned null OR empty-object values, the
      // names are AFC-internal IDs (e.g. "E0") that matched a different
      // Moonraker object (e.g. the Klipper stepper named E0 which returns {}).
      // Retry with the real AFC Moonraker object prefix.
      const isEmptyResult = v => v === null || v === undefined ||
                                 (isObj(v) && Object.keys(v).length === 0);
      const allEmpty = Object.values(st).every(isEmptyResult);
      if (allEmpty && !this._afcRetried) {
        this._afcRetried = true;
        // Try each candidate prefix until one returns real objects
        // hasData: must be a non-null, non-array object with at least one key
        const hasData = v => isObj(v) && Object.keys(v).length > 0;

        // ── Phase 1: try common AFC Moonraker object name prefixes ────────────
        const prefixes = [
          'AFC_stepper ', 'afc_stepper ', 'AFC lane ', 'AFC_lane ',
          `${(unitNames[0] || '')} `, // e.g. "unit U1 E0"
        ];
        for (const pfx of prefixes) {
          if (!pfx.trim()) continue;
          const qs2 = laneNames.map(n => encodeURIComponent(pfx + n)).join('&');
          const r2  = await fetch(`${base}/printer/objects/query?${qs2}`, {
            headers: this._headers(), signal: AbortSignal.timeout(4000),
          });
          if (!r2.ok) continue;
          const j2  = await r2.json();
          const st2 = j2?.result?.status || {};
          const k2  = Object.keys(st2);
          console.debug('[SnapmakerU1] AFC retry prefix "' + pfx + '" →', k2,
                        '| first val:', JSON.stringify(st2[k2[0]])?.slice(0, 300));
          if (k2.length && Object.values(st2).some(hasData)) {
            this._afcWorkingPrefix = pfx; // cache so future polls skip this loop
            this._buildAndStoreSlots(k2, st2, laneNames, currentLane);
            return;
          }
        }

        // ── Phase 2: try querying each unit object directly ───────────────────
        for (const unitName of unitNames) {
          const r3 = await fetch(
            `${base}/printer/objects/query?${encodeURIComponent(unitName)}`, {
            headers: this._headers(), signal: AbortSignal.timeout(4000),
          });
          if (!r3.ok) continue;
          const j3  = await r3.json();
          const st3 = j3?.result?.status || {};
          const uObj = st3[unitName];
          console.debug('[SnapmakerU1] AFC unit "' + unitName + '" val:',
                        JSON.stringify(uObj)?.slice(0, 400));
          if (hasData(uObj)) {
            // Unit object has data — look for lane sub-objects inside it
            const pairs = Object.entries(uObj).filter(([, v]) => hasData(v));
            if (pairs.length) {
              const fakeSt = Object.fromEntries(pairs);
              this._buildAndStoreSlots(Object.keys(fakeSt), fakeSt, laneNames, currentLane);
              return;
            }
          }
        }

        // ── Phase 3: fetch the full Moonraker object list for diagnosis ───────
        try {
          const rl = await fetch(`${base}/printer/objects/list`, {
            headers: this._headers(), signal: AbortSignal.timeout(4000),
          });
          if (rl.ok) {
            const jl = await rl.json();
            const allObjs = jl?.result?.objects || [];
            const afcObjs = allObjs.filter(n =>
              /afc|lane|spool|filament|turtle|unit/i.test(n) ||
              laneNames.some(ln => n.includes(ln)));
            console.debug('[SnapmakerU1] ALL Moonraker objects (AFC-related):',
                          afcObjs);
            console.debug('[SnapmakerU1] ALL Moonraker objects (full list):',
                          allObjs);
            // Try querying every AFC-related object at once
            if (afcObjs.length) {
              const qs4 = afcObjs.map(n => encodeURIComponent(n)).join('&');
              const r4  = await fetch(`${base}/printer/objects/query?${qs4}`, {
                headers: this._headers(), signal: AbortSignal.timeout(4000),
              });
              if (r4.ok) {
                const j4  = await r4.json();
                const st4 = j4?.result?.status || {};
                console.debug('[SnapmakerU1] AFC obj-list query results:',
                              Object.entries(st4).map(([k,v]) =>
                                `${k}:${JSON.stringify(v)?.slice(0,80)}`));
                const validKeys = Object.keys(st4).filter(k => hasData(st4[k]));
                if (validKeys.length) {
                  this._buildAndStoreSlots(validKeys, st4, laneNames, currentLane);
                  return;
                }
              }
            }
          }
        } catch { /* ignore */ }

        // ── Phase 4: nothing worked — build placeholder slots with lane names ─
      }
      this._afcRetried = false;
      this._buildAndStoreSlots(Object.keys(st), st, laneNames, currentLane);
    } catch (e) {
      console.debug('[SnapmakerU1] _fetchAfcLaneObjects error:', e.message);
    } finally {
      this._afcFetchInFlight = false;
    }
  }

  // ── Shared slot-builder used by _fetchAfcLaneObjects ────────────────────────
  _buildAndStoreSlots(keys, st, laneNames, currentLane) {
    const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
    const _parseColor = rawColor => {
      if (!rawColor) return '#666';
      if (Array.isArray(rawColor)) {
        const scale = rawColor.some(v => v > 1) ? 1 : 255;
        return '#' + rawColor.slice(0, 3)
          .map(v => Math.round(v * (scale === 1 ? 255 : 1))
            .toString(16).padStart(2, '0')).join('');
      }
      const s = String(rawColor).trim();
      return s.startsWith('#') ? s : (/^[0-9a-f]{3,8}$/i.test(s) ? `#${s}` : s);
    };

    const slots = keys.map(objKey => {
      const lane = isObj(st[objKey]) ? st[objKey] : {};
      // Derive a short display name — last token of the Moonraker object key
      // e.g. "AFC_stepper E0" → "E0", "E0" → "E0", "Turtle_1 lane1" → "lane1"
      const shortName = objKey.split(/\s+/).pop() || objKey;
      const rawColor  = lane.color ?? lane.filament_color ?? lane.hex_color ?? '';
      // "loaded" means "currently active printing lane" — only one lane at a time.
      // lane.tool_loaded/loaded/hub_loaded mean "filament physically present",
      // which can be true for ALL lanes simultaneously and MUST NOT be used here.
      // The authoritative source is current_lane from the top-level AFC object.
      const isLoaded  = !!(currentLane &&
                           (shortName === currentLane || objKey === currentLane));
      const mapVal    = lane.map || lane.tool_map || lane.tool || '';
      return {
        name:    shortName,
        type:    lane.material || lane.filament_type || lane.type || '—',
        color:   _parseColor(rawColor),
        loaded:  isLoaded,
        spoolId: lane.spool_id  || '',
        weight:  lane.weight    || lane.filament_weight || 0,
        map:     mapVal,
      };
    });

    console.debug('[SnapmakerU1] AFC slots built:', slots.length,
                  slots.map(s => `${s.name}:${s.type}:${s.color}:loaded=${s.loaded}`));
    if (!slots.length) return;
    // Never overwrite real colored data with gray placeholders (race-condition guard)
    const hasRealExisting = this._afcSlots?.some(s => s.color !== '#666');
    const hasRealNew      = slots.some(s => s.color !== '#666');
    if (hasRealExisting && !hasRealNew) {
      console.debug('[SnapmakerU1] AFC ignoring placeholder update — keeping real data');
      return;
    }
    this._afcSlots = slots;
    this._render();
  }

  async _fetchThumb(base, filename) {
    try {
      const res = await fetch(`${base}/server/files/metadata?filename=${encodeURIComponent(filename)}`, {
        headers: this._headers(),
      });
      if (!res.ok) return;
      const json = await res.json();
      const thumbs = json.result?.thumbnails || [];
      if (!thumbs.length) return;
      const largest = thumbs.sort((a, b) => b.width - a.width)[0];
      // Moonraker serves thumbnails at this path:
      this._thumbUrl = `${base}/server/files/gcodes/${largest.relative_path}`;
      this._render();
    } catch { /* no thumb */ }
  }

  // ── Gcode script helper ─────────────────────────────────────────────────────
  async _gcodeScript(script) {
    await fetch(`${this._config.moonraker_url}/printer/gcode/script`, {
      method: 'POST',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ script }),
      signal: AbortSignal.timeout(5000),
    });
  }

  // ── API actions ────────────────────────────────────────────────────────────
  async _apiPost(path) {
    try {
      await fetch(`${this._config.moonraker_url}${path}`, {
        method: 'POST',
        headers: this._headers(),
        signal: AbortSignal.timeout(5000),
      });
      setTimeout(() => this._poll(), 500);
    } catch { /* ignore */ }
  }

  _attachListeners() {
    const root = this.shadowRoot;
    // ── Printer action buttons ──────────────────────────────────────────────
    root.querySelector('.btn-pause')   ?.addEventListener('click', () => this._apiPost('/printer/print/pause'));
    root.querySelector('.btn-resume')  ?.addEventListener('click', () => this._apiPost('/printer/print/resume'));
    root.querySelector('.btn-cancel')  ?.addEventListener('click', () => this._apiPost('/printer/print/cancel'));
    root.querySelector('.btn-estop')   ?.addEventListener('click', () => this._apiPost('/printer/emergency_stop'));
    root.querySelector('.btn-clear')   ?.addEventListener('click', () => this._apiPost('/machine/proc_stats'));
    root.querySelector('.btn-start')   ?.addEventListener('click', () => this._apiPost('/printer/print/resume'));
    root.querySelector('.btn-preheat') ?.addEventListener('click', () => {
      this._gcodeScript('M104 S200\nM140 S60').catch(() => {});
    });

    // ── Load / unload buttons ───────────────────────────────────────────────
    root.querySelectorAll('.afc-load').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try { await this._gcodeScript(`LANE_MOVE LANE=${btn.dataset.lane}`); } catch {}
        setTimeout(() => this._poll(), 800);
      });
    });
    root.querySelectorAll('.afc-unload').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try { await this._gcodeScript('AFC_UNLOAD'); } catch {}
        setTimeout(() => this._poll(), 800);
      });
    });

  }

  // ── Shared sub-templates ───────────────────────────────────────────────────
  _headerHTML(labelClass = '', iconClass = '') {
    const label = this._getStatusLabel();
    return `
      <div class="card-header">
        <div class="header-left">
          <div class="printer-icon-sm ${iconClass}">${ICONS.printer}</div>
          <div>
            <div class="hdr-brand">snapmaker</div>
            <div class="hdr-model">U1</div>
          </div>
        </div>
        <div class="status-badge">
          <span class="status-pulse"></span>
          ${label}
        </div>
      </div>`;
  }

  _prismLine(cls = '') {
    return `<div class="prism-line ${cls}"></div>`;
  }

  _leftTempCol(opts = {}) {
    const { extActual, extTarget, bedActual, bedTarget, showBars = true } = opts;
    const extPct = clamp((extActual / Math.max(extTarget + 10, 1)) * 100, 0, 100);
    const bedPct = clamp((bedActual / Math.max(bedTarget + 5, 1))  * 100, 0, 100);
    const cold   = extTarget === 0 && bedTarget === 0;
    return `
      <div class="side-col left-col">
        <div class="side-stat-group">
          <div class="side-stat-label">HOTEND</div>
          <div class="side-stat-val ${cold ? 'cool-val' : 'hot-val'}" data-su1="ext-actual">${extActual.toFixed(0)}°</div>
          <div class="side-stat-target" data-su1="ext-target">${cold ? 'Off' : '/' + extTarget.toFixed(0) + '°C'}</div>
          ${showBars ? `<div class="side-mini-bar"><div class="side-mini-fill ${cold ? 'cool-fill' : 'hot-fill'}" data-su1="ext-bar" style="height:${extPct}%"></div></div>` : ''}
        </div>
        <div class="side-divider-h"></div>
        <div class="side-stat-group">
          <div class="side-stat-label">BED</div>
          <div class="side-stat-val ${cold ? 'cool-val' : 'warm-val'}" data-su1="bed-actual">${bedActual.toFixed(0)}°</div>
          <div class="side-stat-target" data-su1="bed-target">${cold ? 'Off' : '/' + bedTarget.toFixed(0) + '°C'}</div>
          ${showBars ? `<div class="side-mini-bar"><div class="side-mini-fill ${cold ? 'cool-fill' : 'warm-fill'}" data-su1="bed-bar" style="height:${bedPct}%"></div></div>` : ''}
        </div>
      </div>`;
  }

  _coverThumb(cls = '', svgThumb = THUMB_CYAN) {
    const name = this._data?.filename || '';
    const content = this._thumbUrl
      ? `<img src="${this._thumbUrl}" alt="print preview" />`
      : svgThumb;
    return `
      <div class="cover-thumb ${cls}">
        ${content}
        <div class="cover-thumb-label">${name}</div>
      </div>`;
  }

  _centerImage(imgCls = '', overlay = '', coverCls = '', svgThumb = THUMB_CYAN) {
    const src = this._config.printer_image || '';
    const imgEl = src
      ? `<img class="center-img ${imgCls}" src="${src}" alt="Snapmaker U1" />`
      : `<div style="flex:1;min-height:220px;background:rgba(255,255,255,0.02);"></div>`;
    return `
      <div class="center-img-wrap">
        ${imgEl}
        <div class="img-inner-glow"></div>
        ${this._coverThumb(coverCls, svgThumb)}
        ${overlay}
      </div>`;
  }

  _spoolSvg(color = '#888', active = false) {
    const glow = active ? `filter:drop-shadow(0 0 8px ${color}cc);` : '';
    return `<svg viewBox="0 0 60 60" width="50" height="50" style="${glow}" xmlns="http://www.w3.org/2000/svg">
      <!-- Outer flange -->
      <circle cx="30" cy="30" r="27" fill="#1a1c2e" stroke="#2d3050" stroke-width="1.5"/>
      <!-- Wound filament (colored ring) -->
      <circle cx="30" cy="30" r="22" fill="${color}"/>
      <!-- Winding texture -->
      <circle cx="30" cy="30" r="20" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="1.5"/>
      <circle cx="30" cy="30" r="17.5" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1.5"/>
      <!-- Hub area -->
      <circle cx="30" cy="30" r="13" fill="#111320"/>
      <!-- Spokes (3, at 0° / 120° / 240°) -->
      <line x1="43" y1="30" x2="17" y2="30" stroke="#1c1f35" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="23.5" y1="41.3" x2="36.5" y2="18.7" stroke="#1c1f35" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="23.5" y1="18.7" x2="36.5" y2="41.3" stroke="#1c1f35" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Hub cap -->
      <circle cx="30" cy="30" r="7" fill="#0d0f1e" stroke="#252840" stroke-width="1"/>
      <circle cx="30" cy="30" r="3" fill="#1a1c2e"/>
      <!-- Filament highlight (left arc) -->
      <path d="M13,21 Q9,30 13,39" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Flange rim sheen -->
      <circle cx="30" cy="30" r="27" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.8"/>
    </svg>`;
  }

  _afcLaneCardHtml(s, showActive = true) {
    const isActive  = showActive && s.loaded;
    const laneLabel = s.map ? `${s.name} > ${s.map}` : s.name;
    const weight    = s.weight ? `${s.weight} g` : '';
    const cardStyle = isActive
      ? `style="border:2px solid ${s.color}bb;box-shadow:inset 0 0 20px ${s.color}28,inset 0 0 6px ${s.color}18;background:${s.color}14"`
      : '';
    const hdrStyle  = isActive ? `style="color:${s.color}ee;background:${s.color}22;border-bottom-color:${s.color}33"` : '';
    return `
      <div class="afc-lane-card ${isActive ? 'active' : 'idle'}" data-lane="${s.name}" ${cardStyle}>
        <div class="afc-lane-hdr" ${hdrStyle}>${laneLabel}</div>
        <div class="afc-spool-area">
          ${isActive ? `<div class="afc-lane-dot" style="background:${s.color};color:${s.color}"></div>` : ''}
          <div class="afc-badge ${isActive ? 'badge-active' : ''}">AUTO</div>
          ${this._spoolSvg(s.color, isActive)}
          <div class="afc-material">${s.type}</div>
          ${isActive ? `<div class="afc-active-label" style="color:${s.color}cc">● LOADED</div>` : ''}
          ${weight ? `<div class="afc-weight">${weight}</div>` : ''}
        </div>
        <div class="afc-btn-row">
          <button class="afc-btn afc-load"   data-lane="${s.name}" title="Load lane">↑</button>
          <button class="afc-btn afc-unload" data-lane="${s.name}" title="Unload">⇑</button>
        </div>
      </div>`;
  }

  _mmuStrip(showActive = true) {
    // Colors come exclusively from the AFC Lite plugin — no static defaults.
    const afcSlots = this._afcSlots;
    if (afcSlots && afcSlots.length > 0) {
      const cards = afcSlots.map(s => this._afcLaneCardHtml(s, showActive)).join('');
      return `<div class="afc-section" data-su1="afc"><div class="afc-section-hdr">AFC · Filament Lanes</div><div class="afc-lanes">${cards}</div></div>`;
    }
    // Placeholder while waiting for first AFC poll
    const placeholders = Array.from({ length: 4 }, () => `
      <div class="afc-lane-card idle">
        <div class="afc-lane-hdr">—</div>
        <div class="afc-spool-area">${this._spoolSvg('#383a4a', false)}<div class="afc-material">—</div></div>
        <div class="afc-btn-row"><button class="afc-btn">↑</button><button class="afc-btn">⇑</button></div>
      </div>`).join('');
    return `<div class="afc-section" data-su1="afc"><div class="afc-section-hdr">AFC · Filament Lanes</div><div class="afc-lanes">${placeholders}</div></div>`;
  }

  _progressSection(pctCls = 'cyan', trackCls = '', fillCls = 'cyan', dotCls = '') {
    const d = this._data;
    const pct = (d.progress * 100).toFixed(1);
    return `
      <div class="progress-section">
        <div class="prog-file">${d.filename}</div>
        <div class="prog-row">
          <span class="prog-pct ${pctCls}" data-su1="prog-pct">${pct}%</span>
          <div class="prog-track ${trackCls}">
            <div class="prog-fill ${fillCls}" data-su1="prog-fill" style="width:${pct}%"></div>
            <div class="prog-dot ${dotCls}" data-su1="prog-dot" style="left:${pct}%"></div>
          </div>
        </div>
        <div class="prog-times">
          <div class="prog-time-cell">
            <span class="prog-time-label">Elapsed</span>
            <span class="prog-time-val" data-su1="prog-elapsed">${fmtTime(d.elapsed)}</span>
          </div>
          <div class="prog-time-sep"></div>
          <div class="prog-time-cell center">
            <span class="prog-time-label">Filament</span>
            <span class="prog-time-val" data-su1="prog-filament">${d.filamentUsed}m</span>
          </div>
          <div class="prog-time-sep"></div>
          <div class="prog-time-cell end">
            <span class="prog-time-label">Remaining</span>
            <span class="prog-time-val" data-su1="prog-remaining">${fmtTime(d.remaining)}</span>
          </div>
        </div>
      </div>`;
  }

  // ── State labels ───────────────────────────────────────────────────────────
  _getStatusLabel() {
    const map = { printing:'PRINTING', standby:'STANDBY', complete:'COMPLETE', cancelled:'COMPLETE', paused:'PAUSED', error:'ERROR' };
    return map[this._data?.state] || 'OFFLINE';
  }

  _getStatusColors() {
    const state = this._data?.state;
    if (state === 'printing')  return { color: '#00e5ff', glow: 'rgba(0,229,255,0.28)' };
    if (state === 'paused')    return { color: '#f59e0b', glow: 'rgba(245,158,11,0.28)' };
    if (state === 'error')     return { color: '#ff4f4f', glow: 'rgba(255,79,79,0.32)'  };
    return                            { color: '#a78bfa', glow: 'rgba(167,139,250,0.25)' };
  }

  // ── State renders ──────────────────────────────────────────────────────────
  _renderPrinting() {
    const d = this._data;
    return `
      ${this._headerHTML()}
      ${this._prismLine()}
      <div class="content-row">
        ${this._leftTempCol({ extActual: d.extruderActual, extTarget: d.extruderTarget, bedActual: d.bedActual, bedTarget: d.bedTarget })}
        ${this._centerImage('', '', '', THUMB_CYAN)}
        <div class="side-col right-col">
          <div class="side-stat-group">
            <div class="side-stat-label">LAYER</div>
            <div class="side-stat-val layer-val" data-su1="layer-val">${d.currentLayer}</div>
            <div class="side-stat-target" data-su1="layer-tot">/${d.totalLayers}</div>
          </div>
          <div class="side-divider-h"></div>
          <div class="side-stat-group">
            <div class="side-stat-label">SPEED</div>
            <div class="side-stat-val speed-val" data-su1="speed-val">${d.speed}</div>
            <div class="side-stat-target">%</div>
          </div>
          <div class="side-divider-h"></div>
          <div class="side-stat-group">
            <div class="side-stat-label">FAN</div>
            <div class="side-stat-val fan-val" data-su1="fan-val">${d.fanSpeed}</div>
            <div class="side-stat-target">%</div>
          </div>
        </div>
      </div>
      ${this._mmuStrip(true)}
      ${this._progressSection()}
      <div class="action-row">
        <button class="btn-pause">${ICONS.pause} Pause</button>
        <button class="btn-cancel">${ICONS.x} Cancel</button>
        <button class="btn-estop">${ICONS.zap} E-Stop</button>
      </div>`;
  }

  _renderPaused() {
    const d = this._data;
    const overlay = `
      <div class="pause-overlay">
        <div class="pause-icon-ring">${ICONS.pause.replace('width="11" height="11"','width="22" height="22"')}</div>
        <div class="pause-msg">Paused</div>
        <div class="pause-sub">Temperatures maintained</div>
      </div>`;
    return `
      ${this._headerHTML('', 'pause-icon')}
      ${this._prismLine('pause-line')}
      <div class="content-row">
        ${this._leftTempCol({ extActual: d.extruderActual, extTarget: d.extruderTarget, bedActual: d.bedActual, bedTarget: d.bedTarget })}
        ${this._centerImage('pause-img', overlay, 'pause', THUMB_AMBER)}
        <div class="side-col right-col">
          <div class="side-stat-group">
            <div class="side-stat-label">LAYER</div>
            <div class="side-stat-val pause-stat-val">${d.currentLayer}</div>
            <div class="side-stat-target">/${d.totalLayers}</div>
          </div>
          <div class="side-divider-h"></div>
          <div class="side-stat-group">
            <div class="side-stat-label">SPEED</div>
            <div class="side-stat-val pause-stat-val" style="font-size:22px;color:rgba(251,191,36,0.3)">—</div>
          </div>
          <div class="side-divider-h"></div>
          <div class="side-stat-group">
            <div class="side-stat-label">USED</div>
            <div class="side-stat-val pause-stat-val">${d.filamentUsed}</div>
            <div class="side-stat-target">m</div>
          </div>
        </div>
      </div>
      ${this._mmuStrip(true)}
      <div class="info-strip pause">
        <div class="strip-icon pause">${ICONS.pause}</div>
        <div class="strip-text">
          <span class="strip-title pause">Print paused · temperatures held</span>
          <span class="strip-sub pause">${d.filename} · ${fmtTime(d.elapsed)} elapsed · layer ${d.currentLayer}/${d.totalLayers}</span>
        </div>
      </div>
      ${this._progressSection('amber', 'amber', 'amber', 'amber')}
      <div class="action-row">
        <button class="btn-resume amber">${ICONS.play} Resume</button>
        <button class="btn-cancel">${ICONS.x} Cancel</button>
        <button class="btn-estop">${ICONS.zap} E-Stop</button>
      </div>`;
  }

  _renderError() {
    const d = this._data;
    const errMsg = d.message || 'PRINTER_ERROR';
    const overlay = `
      <div class="err-overlay">
        <div class="err-icon-ring">${ICONS.alert}</div>
        <div class="err-title">Print Halted</div>
        <div class="err-code">${errMsg.toUpperCase().replace(/ /g,'_')}</div>
      </div>`;
    return `
      ${this._headerHTML('', 'err-icon')}
      ${this._prismLine('err-line')}
      <div class="content-row">
        ${this._leftTempCol({ extActual: d.extruderActual, extTarget: d.extruderTarget, bedActual: d.bedActual, bedTarget: d.bedTarget })}
        ${this._centerImage('err-img', `<div class="err-scanlines"></div>${overlay}`, 'err', THUMB_RED)}
        <div class="side-col right-col">
          <div class="side-stat-group">
            <div class="side-stat-label">LAYER</div>
            <div class="side-stat-val err-stat-val">${d.currentLayer}</div>
            <div class="side-stat-target">/${d.totalLayers}</div>
          </div>
          <div class="side-divider-h"></div>
          <div class="side-stat-group">
            <div class="side-stat-label">PROG</div>
            <div class="side-stat-val err-stat-val">${(d.progress*100).toFixed(0)}</div>
            <div class="side-stat-target">%</div>
          </div>
          <div class="side-divider-h"></div>
          <div class="side-stat-group">
            <div class="side-stat-label">TIME</div>
            <div class="side-stat-val err-stat-val" style="font-size:14px">${fmtTime(d.elapsed)}</div>
          </div>
        </div>
      </div>
      ${this._mmuStrip(false)}
      <div class="info-strip err">
        <div class="strip-dot"></div>
        <div class="strip-text">
          <span class="strip-title err">${errMsg || 'Printer error'}</span>
          <span class="strip-sub err">${d.filename} · fault at layer ${d.currentLayer} · ${fmtTime(d.elapsed)}</span>
        </div>
      </div>
      <div class="progress-section">
        <div class="prog-file">${d.filename} — halted at ${(d.progress*100).toFixed(1)}%</div>
        <div class="prog-row">
          <span class="prog-pct red">${(d.progress*100).toFixed(1)}%</span>
          <div class="prog-track red"><div class="prog-fill red" style="width:${(d.progress*100).toFixed(1)}%"></div></div>
        </div>
      </div>
      <div class="action-row">
        <button class="btn-clear">${ICONS.check} Clear Error</button>
        <button class="btn-green">${ICONS.play} Resume</button>
        <button class="btn-estop">${ICONS.zap} E-Stop</button>
      </div>`;
  }

  _renderStandby() {
    const d = this._data;
    const isComplete = d.state === 'complete' || d.state === 'cancelled';
    const overlay = `
      <div class="standby-overlay">
        <div class="standby-icon-ring">${ICONS.power}</div>
        <div class="standby-msg">${isComplete ? 'Done' : 'Idle'}</div>
      </div>`;
    return `
      ${this._headerHTML()}
      ${this._prismLine()}
      <div class="content-row">
        ${this._leftTempCol({ extActual: d.extruderActual, extTarget: 0, bedActual: d.bedActual, bedTarget: 0 })}
        ${this._centerImage('standby-img', overlay, 'muted', THUMB_MUTED)}
        <div class="side-col right-col">
          <div class="side-stat-group">
            <div class="side-stat-label">LAST</div>
            <div class="side-stat-val muted-val" style="font-size:11px;line-height:1.3;white-space:normal;text-align:center">${d.filename || '—'}</div>
          </div>
          <div class="side-divider-h"></div>
          <div class="side-stat-group">
            <div class="side-stat-label">TIME</div>
            <div class="side-stat-val purple-val" style="font-size:14px;line-height:1.3">${fmtTime(d.elapsed)}</div>
          </div>
          <div class="side-divider-h"></div>
          <div class="side-stat-group">
            <div class="side-stat-label">USED</div>
            <div class="side-stat-val purple-val">${d.filamentUsed}<span style="font-size:9px;opacity:0.6">m</span></div>
          </div>
        </div>
      </div>
      ${this._mmuStrip(false)}
      ${isComplete ? `
      <div class="info-strip standby">
        <div class="strip-icon ok">✓</div>
        <div class="strip-text">
          <span class="strip-title standby">Last print completed</span>
          <span class="strip-sub standby">${d.filename} · ${fmtTime(d.elapsed)} · ${d.filamentUsed}m</span>
        </div>
      </div>` : ''}
      <div class="action-row">
        <button class="btn-start">${ICONS.play} Start Print</button>
        <button class="btn-preheat">${ICONS.flame} Preheat</button>
      </div>`;
  }

  _renderOffline() {
    return `
      <div class="card-header">
        <div class="header-left">
          <div class="printer-icon-sm">${ICONS.printer}</div>
          <div><div class="hdr-brand">snapmaker</div><div class="hdr-model">U1</div></div>
        </div>
        <div class="status-badge"><span class="status-pulse"></span>OFFLINE</div>
      </div>
      <div class="prism-line"></div>
      <div class="offline-state">
        <div class="offline-icon">${ICONS.wifi_off}</div>
        <div class="offline-msg">Cannot reach Moonraker</div>
        <div class="offline-sub">${this._error || ''}</div>
      </div>`;
  }

  // ── Main render ────────────────────────────────────────────────────────────
  // ── Two-tier render: full rebuild on state change; patch-in-place otherwise ──
  _render() {
    if (!this._data && this._error) {
      const key = 'offline';
      if (key !== this._lastRenderKey) {
        this._lastRenderKey = key;
        this.shadowRoot.innerHTML = `<style>${STYLES}</style><div class="ha-card" style="--status-color:#a78bfa;--status-glow:rgba(167,139,250,0.15)">${this._renderOffline()}</div>`;
        this._attachListeners();
      }
      return;
    }
    if (!this._data) return;

    const { color, glow } = this._getStatusColors();
    const state = this._data.state;
    const renderKey = `${state}|${color}|${!!this._thumbUrl}`;

    if (renderKey !== this._lastRenderKey) {
      // State or color changed — rebuild the full DOM
      this._lastRenderKey = renderKey;
      this._lastAfcHash   = null; // force AFC patch after rebuild
      let body;
      if      (state === 'printing') body = this._renderPrinting();
      else if (state === 'paused')   body = this._renderPaused();
      else if (state === 'error')    body = this._renderError();
      else                           body = this._renderStandby();
      this.shadowRoot.innerHTML = `
        <style>${STYLES}</style>
        <div class="ha-card" style="--status-color:${color};--status-glow:${glow}">
          <div class="card-glow-border"></div>
          ${body}
        </div>`;
      this._attachListeners();
    }

    // Always patch dynamic values without touching the DOM structure
    this._patchDynamic();
  }

  // Patch only the changing leaf values — no DOM replacement, no repaint flash
  _patchDynamic() {
    const sr = this.shadowRoot;
    if (!sr || !this._data) return;
    const d = this._data;

    const setText = (sel, val) => {
      const el = sr.querySelector(`[data-su1="${sel}"]`);
      if (el && el.textContent !== String(val)) el.textContent = String(val);
    };
    const setStyle = (sel, prop, val) => {
      const el = sr.querySelector(`[data-su1="${sel}"]`);
      if (el) el.style[prop] = val;
    };

    // Temperatures
    const cold = d.extruderTarget === 0 && d.bedTarget === 0;
    setText('ext-actual', d.extruderActual.toFixed(0) + '°');
    setText('ext-target', cold ? 'Off' : '/' + d.extruderTarget.toFixed(0) + '°C');
    setText('bed-actual', d.bedActual.toFixed(0) + '°');
    setText('bed-target', cold ? 'Off' : '/' + d.bedTarget.toFixed(0) + '°C');
    const extPct = clamp((d.extruderActual / Math.max(d.extruderTarget + 10, 1)) * 100, 0, 100);
    const bedPct = clamp((d.bedActual    / Math.max(d.bedTarget + 5,  1))  * 100, 0, 100);
    setStyle('ext-bar', 'height', extPct + '%');
    setStyle('bed-bar', 'height', bedPct + '%');

    // Right-column stats
    setText('layer-val', d.currentLayer);
    setText('layer-tot', '/' + d.totalLayers);
    setText('speed-val', d.speed);
    setText('fan-val',   d.fanSpeed);

    // Progress bar + times
    if (d.progress != null) {
      const pct = (d.progress * 100).toFixed(1);
      setText('prog-pct',       pct + '%');
      setStyle('prog-fill',     'width', pct + '%');
      setStyle('prog-dot',      'left',  pct + '%');
      setText('prog-elapsed',   fmtTime(d.elapsed));
      setText('prog-remaining', fmtTime(d.remaining));
      setText('prog-filament',  d.filamentUsed + 'm');
    }

    // AFC section — replace innerHTML only when slot data actually changes
    const afcHash = this._afcSlots
      ? this._afcSlots.map(s => `${s.name}:${s.color}:${s.loaded}:${s.type}:${s.weight}`).join('|')
      : '';
    if (afcHash !== this._lastAfcHash) {
      this._lastAfcHash = afcHash;
      const afcEl = sr.querySelector('[data-su1="afc"]');
      if (afcEl) {
        // Replace only the AFC section's inner lanes HTML
        const lanesCont = afcEl.querySelector('.afc-lanes');
        if (lanesCont && this._afcSlots?.length) {
          lanesCont.innerHTML = this._afcSlots.map(s => this._afcLaneCardHtml(s, true)).join('');
          // Re-wire buttons inside the updated AFC section
          afcEl.querySelectorAll('.afc-lane-card').forEach(card => {
            card.addEventListener('click', () => {
              const lane = this._afcSlots?.find(s => s.name === card.dataset.lane);
              if (lane) this._openSpoolModal(lane);
            });
          });
          afcEl.querySelectorAll('.afc-load').forEach(btn => {
            btn.addEventListener('click', async e => {
              e.stopPropagation();
              try { await this._gcodeScript(`LANE_MOVE LANE=${btn.dataset.lane}`); } catch {}
              setTimeout(() => this._poll(), 800);
            });
          });
          afcEl.querySelectorAll('.afc-unload').forEach(btn => {
            btn.addEventListener('click', async e => {
              e.stopPropagation();
              try { await this._gcodeScript('AFC_UNLOAD'); } catch {}
              setTimeout(() => this._poll(), 800);
            });
          });
        }
      }
    }
  }
}

customElements.define('snapmaker-u1-card', SnapmakerU1Card);

// ─────────────────────────────────────────────────────────────────────────────
// Visual config editor — shown in HA Lovelace "Edit Card" panel
// ─────────────────────────────────────────────────────────────────────────────
const EDITOR_STYLES = `
  :host { display: block; font-family: var(--primary-font-family, 'Inter', system-ui, sans-serif); }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .sm-editor { padding: 4px 0 8px; }

  .sm-section { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--secondary-text-color, rgba(160,175,210,0.5)); margin: 18px 0 12px; }
  .sm-section:first-child { margin-top: 4px; }

  .sm-divider { border: none; border-top: 1px solid var(--divider-color, rgba(255,255,255,0.08)); margin: 20px 0; }

  .sm-field { margin-bottom: 14px; }
  .sm-field label {
    display: block; font-size: 12px; font-weight: 600;
    color: var(--primary-text-color, #e2e8f0); margin-bottom: 5px;
  }
  .sm-field label .req { color: var(--error-color, #ff6b6b); margin-left: 2px; }

  .sm-field input {
    width: 100%; padding: 9px 12px;
    background: var(--input-fill-color, rgba(255,255,255,0.05));
    border: 1px solid var(--divider-color, rgba(255,255,255,0.13));
    border-radius: 8px;
    color: var(--primary-text-color, #e2e8f0);
    font-size: 13px; font-family: inherit; outline: none;
    transition: border-color .15s, background .15s;
  }
  .sm-field input:focus {
    border-color: var(--primary-color, #00e5ff);
    background: var(--input-fill-color, rgba(0,229,255,0.04));
  }
  .sm-field input::placeholder { color: var(--secondary-text-color, rgba(160,175,210,0.35)); }
  .sm-field input.sm-mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }

  .sm-hint {
    display: block; font-size: 10.5px; line-height: 1.45; margin-top: 4px;
    color: var(--secondary-text-color, rgba(160,175,210,0.5));
  }

  .sm-row { display: flex; gap: 12px; }
  .sm-row .sm-field { flex: 1; min-width: 0; }
`;

class SnapmakerU1CardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  _v(name) {
    const val = this._config[name];
    return val === undefined || val === null ? '' : String(val);
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>${EDITOR_STYLES}</style>
      <div class="sm-editor">

        <div class="sm-section">Connection</div>

        <div class="sm-field">
          <label>Moonraker URL <span class="req">*</span></label>
          <input class="sm-mono" type="url" name="moonraker_url"
            value="${this._v('moonraker_url')}"
            placeholder="http://192.168.1.xxx" />
          <span class="sm-hint">Full HTTP/HTTPS address of your Moonraker instance — no trailing slash</span>
        </div>

        <div class="sm-field">
          <label>API Key</label>
          <input class="sm-mono" type="text" name="api_key"
            value="${this._v('api_key')}"
            placeholder="Leave blank for trusted networks" />
          <span class="sm-hint">Optional Moonraker API key (Settings → API Keys in Mainsail/Fluidd)</span>
        </div>

        <hr class="sm-divider" />
        <div class="sm-section">Printer Image</div>

        <div class="sm-field">
          <label>Image URL</label>
          <input class="sm-mono" type="text" name="printer_image"
            value="${this._v('printer_image')}"
            placeholder="/local/snapmaker-u1.png" />
          <span class="sm-hint">Place your image in HA's <code>www/</code> folder and reference it as <code>/local/filename.png</code></span>
        </div>

        <div class="sm-row">
          <div class="sm-field">
            <label>Image Offset Y (px)</label>
            <input type="number" name="printer_image_offset_y"
              value="${this._v('printer_image_offset_y')}"
              placeholder="10" />
            <span class="sm-hint">Shift printer image down (+) or up (−)</span>
          </div>
          <div class="sm-field">
            <label>Thumb Offset Y (px)</label>
            <input type="number" name="cover_thumb_offset_y"
              value="${this._v('cover_thumb_offset_y')}"
              placeholder="10" />
            <span class="sm-hint">Shift print preview down (+) or up (−)</span>
          </div>
        </div>

        <hr class="sm-divider" />
        <div class="sm-section">Polling</div>

        <div class="sm-field">
          <label>Poll Interval (ms)</label>
          <input type="number" name="poll_interval"
            value="${this._v('poll_interval')}"
            placeholder="2000" min="500" max="60000" step="500" />
          <span class="sm-hint">How often to refresh printer data in milliseconds — default 2000 (2 s), minimum 500</span>
        </div>

      </div>`;

    this._attachListeners();
  }

  _attachListeners() {
    this.shadowRoot.querySelectorAll('input').forEach(input => {
      // fire on blur so HA gets clean values, not every keystroke
      input.addEventListener('change', (e) => this._fieldChanged(e.target));
      // also fire on Enter
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._fieldChanged(e.target); });
    });
  }

  _fieldChanged(input) {
    const { name, value, type } = input;
    const trimmed = value.trim();
    const newConfig = { ...this._config };

    if (trimmed === '') {
      delete newConfig[name];
    } else if (type === 'number') {
      const num = parseFloat(trimmed);
      if (!isNaN(num)) newConfig[name] = num;
    } else {
      newConfig[name] = trimmed;
    }

    this._config = newConfig;
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define('snapmaker-u1-card-editor', SnapmakerU1CardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type:        'snapmaker-u1-card',
  name:        'Snapmaker U1',
  description: 'Prism-style Moonraker card for the Snapmaker U1 3D printer',
  preview:     false,
});
