# Snapmaker U1 Card for Home Assistant

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

A prismatic-styled Home Assistant Lovelace card for the **Snapmaker U1 3D printer**, pulling live data from the [Moonraker](https://moonraker.readthedocs.io/) REST API (Klipper-based firmware).

---

## Preview

> Four automatic state variants — Printing (cyan), Standby (purple), Error (red), Paused (amber) — each with animated prismatic border, side stat columns, center printer image, G-code thumbnail, MMU filament strip, and action buttons.

---

## Features

- Live polling of Moonraker every 2 seconds (configurable)
- Automatic state switching: **Printing → Paused → Error → Standby**
- Animated prismatic border (color-coded per state)
- Nozzle & bed temperatures with mini progress bars
- Layer count, print speed, fan speed, filament used
- Progress bar with elapsed & remaining time estimates
- G-code cover thumbnail (auto-fetched from Moonraker metadata)
- 4-slot MMU filament strip with active-slot glow
- Action buttons: Pause, Resume, Cancel, Emergency Stop, Preheat
- Single vanilla JS file — no build step, no dependencies

---

## Installation

### Via HACS (recommended)

1. Open HACS → Frontend → **⋮** → Custom repositories
2. Add this repository URL, category: **Lovelace**
3. Click **Install**
4. Hard-refresh your browser (`Ctrl+Shift+R`)

### Manual

1. Copy `snapmaker-u1-card.js` to `<ha-config>/www/snapmaker-u1-card.js`
2. Go to Settings → Dashboards → **⋮** → Resources → Add:
   - URL: `/local/snapmaker-u1-card.js`
   - Type: `JavaScript Module`
3. Hard-refresh your browser

---

## Configuration

Add this to any Lovelace dashboard (raw YAML editor):

```yaml
type: custom:snapmaker-u1-card
moonraker_url: http://192.168.1.xxx    # required — your printer's IP/hostname
printer_image: /local/snapmaker-u1.png # optional — image shown in card center
poll_interval: 2000                    # optional — polling interval in ms (default 2000)
# api_key: your-moonraker-api-key      # optional — only needed if Moonraker requires auth
mmu_slots:                             # optional — customize filament slots
  - { type: PLA,  color: "#ef4444" }
  - { type: PETG, color: "#f1f5f9" }
  - { type: PLA,  color: "#1c1917" }
  - { type: TPU,  color: "#facc15" }
```

### Configuration options

| Option | Required | Default | Description |
|---|---|---|---|
| `moonraker_url` | Yes | — | Base URL of your Moonraker instance (no trailing slash) |
| `printer_image` | No | *(none)* | URL or HA local path to a printer image |
| `poll_interval` | No | `2000` | How often to poll Moonraker, in milliseconds |
| `api_key` | No | *(none)* | Moonraker API key — omit if not using key-based auth |
| `mmu_slots` | No | 4 default slots | Array of `{ type, color }` objects for the MMU strip |

### Finding your Moonraker API key

If your Moonraker instance requires authentication, generate a key with:

```
GET http://<printer-ip>/access/api_key
```

Then add `api_key: <the-key>` to your card config.

---

## Moonraker setup

This card queries the following Moonraker endpoints:

| Endpoint | Purpose |
|---|---|
| `/printer/objects/query` | Live printer state, temperatures, progress |
| `/server/files/metadata` | G-code thumbnail lookup |
| `/printer/print/pause` | Pause button |
| `/printer/print/resume` | Resume button |
| `/printer/print/cancel` | Cancel button |
| `/printer/emergency_stop` | E-Stop button |
| `/printer/gcode/script` | Preheat (sends `M104 S200` + `M140 S60`) |

Your Moonraker instance must be reachable from the browser running your HA dashboard (not just the HA server). For remote access, expose Moonraker through a reverse proxy or VPN.

---

## License

MIT
