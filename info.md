# Snapmaker U1 Card

A prismatic-styled Home Assistant Lovelace card for the **Snapmaker U1 3D printer**, powered by the Moonraker REST API.

## Features

- Live polling of Moonraker every 2 seconds
- Four automatic state variants: **Printing**, **Standby**, **Error**, **Paused**
- Animated prismatic border
- Nozzle & bed temperatures with mini progress bars
- Layer count, print speed, fan speed, filament used
- Progress bar with elapsed & remaining time
- G-code cover thumbnail (fetched automatically from Moonraker metadata)
- 4-slot MMU filament strip with active-slot highlight
- Action buttons: Pause, Resume, Cancel, Emergency Stop, Preheat
- No build step — single vanilla JS file, shadow DOM

## Configuration

```yaml
type: custom:snapmaker-u1-card
moonraker_url: http://192.168.1.xxx    # required
printer_image: /local/snapmaker-u1.png # optional
poll_interval: 2000                    # optional, ms
# api_key: your-key                    # optional, only if Moonraker requires auth
mmu_slots:
  - { type: PLA,  color: "#ef4444" }
  - { type: PETG, color: "#f1f5f9" }
  - { type: PLA,  color: "#1c1917" }
  - { type: TPU,  color: "#facc15" }
```
