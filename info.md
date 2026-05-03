# Snapmaker U1 Card

A **Prism Dashboard**-style Home Assistant Lovelace card for the **Snapmaker U1 3D printer**.

Pulls live data from Moonraker (Klipper / AFC Lite v2.x) and shows temperatures, progress, layer, speed, G-code thumbnail, and a 4-lane AFC filament strip — all in one card with four auto-switching state variants.

**Version:** 0.0.50

## Quick setup

```yaml
type: custom:snapmaker-u1-card
moonraker_url: http://192.168.1.xxx
printer_image: /local/snapmaker-u1.png
```

See the [README](README.md) for full configuration options.
