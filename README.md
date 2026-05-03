# Snapmaker U1 Card for Home Assistant

[![Version](https://img.shields.io/badge/version-0.0.50-blue.svg)](CHANGELOG.md)
[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![HA](https://img.shields.io/badge/Home%20Assistant-2023.1%2B-brightgreen.svg)](https://www.home-assistant.io/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A **Prism Dashboard**-style Home Assistant Lovelace card for the **Snapmaker U1 3D printer**, pulling live data from the [Moonraker](https://moonraker.readthedocs.io/) REST API (Klipper / AFC Lite v2.x firmware).

---

## Status Variants

The card automatically switches appearance based on printer state.

| State | Accent | Description |
|---|---|---|
| 🖨️ **Printing** | Cyan `#00e5ff` | Active print — progress bar, layer, speed, thumbnail |
| 💤 **Standby** | Purple `#a78bfa` | Printer ready, idle |
| ⏸️ **Paused** | Amber `#f59e0b` | Print paused — Resume / Cancel actions highlighted |
| ❌ **Error / Offline** | Red `#ff4f4f` | Moonraker unreachable or firmware error |


---

## Features

- **Live Moonraker polling** every 2 seconds (configurable)
- **Four auto-switching state variants** — Printing · Standby · Paused · Error
- **Animated prismatic border** — color-coded per state with glow
- **Nozzle & bed temperatures** with mini progress bars
- **Layer count, print speed, fan speed, filament used**
- **Progress bar** with elapsed & remaining time estimates
- **G-code thumbnail** — auto-fetched from Moonraker file metadata
- **4-slot AFC Lite filament strip** — active lane glow, spool color, material, weight
- **Action buttons** — Pause, Resume, Cancel, Emergency Stop, Preheat
- **Single vanilla JS file** — no build step, zero dependencies

---

## Installation

### Via HACS (recommended)

1. Open **HACS → Frontend → ⋮ → Custom repositories**
2. Add this repository URL, category: **Lovelace**
3. Click **Install**
4. Hard-refresh your browser (`Ctrl+Shift+R`)

### Manual

1. Copy `snapmaker-u1-card.js` to `<config>/www/snapmaker-u1-card.js`
2. Go to **Settings → Dashboards → ⋮ → Resources → Add resource**
   - URL: `/local/snapmaker-u1-card.js`
   - Type: `JavaScript Module`
3. Hard-refresh your browser

---

## Configuration

```yaml
type: custom:snapmaker-u1-card
moonraker_url: http://192.168.1.xxx    # required — Moonraker IP/hostname (no trailing slash)
printer_image: /local/snapmaker-u1.png # optional — image shown in card centre
poll_interval: 2000                    # optional — polling ms (default 2000)
# api_key: your-moonraker-api-key      # optional — only if Moonraker requires auth
```

### Options

| Option | Required | Default | Description |
|---|---|---|---|
| `moonraker_url` | **Yes** | — | Base URL of your Moonraker instance |
| `printer_image` | No | *(none)* | URL or HA `/local/` path for the centre printer image |
| `poll_interval` | No | `2000` | Polling interval in milliseconds |
| `api_key` | No | *(none)* | Moonraker API key (omit if not required) |

### Printer image

Copy the included `docs/images/snapmaker-u1.png` to your HA config:

```
<config>/www/snapmaker-u1.png
```

Then reference it in the card config as `/local/snapmaker-u1.png`.

### Finding your Moonraker API key

If your Moonraker instance requires authentication, generate a key with:

```
GET http://<printer-ip>/access/api_key
```

Then add `api_key: <the-key>` to your card config.

---

## AFC Lite v2.x — Filament Slots

The card reads AFC data directly from Moonraker via the `AFC_lane` query object. No extra sensor setup is needed. The slot strip shows:

- **Spool color swatch** — matches the color set in your AFC config
- **Material type** — e.g. PLA, PETG, ABS
- **Weight** — in grams
- **Active glow** — the currently loaded lane highlights with its spool color

> AFC data updates on every poll cycle (default every 2 s).

---

## Moonraker Endpoints Used

| Endpoint | Purpose |
|---|---|
| `GET /printer/objects/query` | Live state, temps, progress, AFC data |
| `GET /server/files/metadata` | G-code thumbnail lookup |
| `POST /printer/print/pause` | Pause action |
| `POST /printer/print/resume` | Resume action |
| `POST /printer/print/cancel` | Cancel action |
| `POST /printer/emergency_stop` | Emergency stop |
| `POST /printer/gcode/script` | Preheat (`M104 S200` + `M140 S60`) |

> Moonraker must be reachable from the **browser** serving your dashboard — not just the HA server. For remote access, use a reverse proxy or VPN.

---

## CORS / Network Notes

If your HA and Moonraker are on different origins, add your HA origin to `moonraker.conf`:

```ini
[authorization]
cors_domains:
  http://your-ha-ip:8123
  https://your-ha-domain.duckdns.org
```

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

**Current version:** `0.0.50` (internal build `v24.0.0`)

---

## License

MIT — see [LICENSE](LICENSE) for details.
