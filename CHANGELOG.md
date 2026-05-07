# Changelog — Snapmaker U1 Card

All notable changes to this project are documented here.
Internal build numbers map to the semantic release version shown below.

---

## [0.0.51] — 2026-05-07 *(current)*

**Internal build:** `v25.0.0`

### Added
- **Configurable printer name** — `printer_name` and `printer_brand` YAML keys let you set any name in the card header (e.g. `printer_name: Artisan`). Default: `U1` / `snapmaker`.
- **Border color** — new `border_color` key. Values: `auto` (calm blue default), `rainbow` (animated prismatic gradient), or any CSS color (`#ff00cc`, `coral`, `rgb(0,200,100)`).
- **Separator line color** — new `separator_color` key. Values: `auto` (calm blue default), `rainbow` (animated prismatic), `state` (follows print state — cyan / amber / red), or any CSS color.
- All three new options appear in the visual card editor (Edit Card panel) under new **Printer Identity** and **Appearance** sections.

---

## [0.0.50] — 2026-05-03

**Internal build:** `v24.0.0`

### Removed
- Entire filament-edit modal (spool modal) removed — filament data is now display-only.
- Removed CSS: all `.spool-modal*`, `.cp-*`, `.spool-form-*`, `.spool-input`, `.spool-btn-*` rules.
- Removed JS: `_spoolModalHtml()`, `_drawPickerCanvas()`, `_updatePickerFromHsb()`,
  `_initColorPicker()`, `_openSpoolModal()`, `_closeSpoolModal()` methods.
- Removed spool card click listener and modal event wiring.
- Removed `_modalLane` / `_pickerH` / `_pickerS` / `_pickerB` state variables.
- Removed `cursor: pointer` and hover highlight from AFC lane cards.

### Kept
- Spool display cards (color swatch, material, weight, active glow) fully intact.

---

## [0.0.49] — 2026-05-02

**Internal build:** `v23.0.0`

### Changed
- Filename text above progress bar: `rgba(160,180,255,0.45)` → `rgba(255,255,255,0.90)` (bright white).

---

## [0.0.48] — 2026-05-02

**Internal build:** `v22.0.0`

### Changed
- Progress percentage text: changed to solid white.
- All label and title text set to bright white for consistency.

---

## [0.0.47] — 2026-05-02

**Internal build:** `v21.0.0`

### Changed
- Fan speed, layer counter, and print speed: color white, font size 20 px.

---

## [0.0.46] — 2026-05-01

**Internal build:** `v20.0.0`

### Changed
- Bed temperature accent color: `#fbbf24` → `#ff8c00` (orange).
- Hotend temperature accent color: `#f97316` → `#ff3333` (red).

---

## [0.0.45] — 2026-05-01

**Internal build:** `v19.0.0`

### Changed
- Separator bar: removed shimmer animation, made static.
- Separator bar: color changed to blue gradient (matches card border).
- Content row: `padding-top` increased to `16px`.

---

## [0.0.44] — 2026-04-30

**Internal build:** `v18.0.0`

### Changed
- Separator bar `margin-top` adjusted to `-10px` to close visual gap.

---

## [0.0.43] — 2026-04-30

**Internal build:** `v17.0.0`

### Fixed
- Active spool detection: `isLoaded` now uses only `currentLane` match (lane name string equality).
- `tool_loaded` (boolean, true for all lanes when any filament is present) no longer used for active-lane highlighting.
- `current_load` confirmed as boolean — `current_lane` string is the sole source for active-lane detection.

---

## [0.0.42] — 2026-04-29

**Internal build:** `v16.0.0`

### Changed
- `afc-section-hdr` label color updated to match other label/title brightness changes.

---

## [0.0.41] — 2026-04-29

**Internal build:** `v15.0.0` – `v13.0.0`

### Added / Changed
- Two-tier render key (`state|color|!!thumbUrl`) — full DOM rebuild only on state change.
- `_patchDynamic()` method for in-place patching of temperatures, progress, layer, speed without touching DOM structure.
- `_afcFetchInFlight` guard to prevent concurrent AFC requests.
- No-downgrade guard in `_buildAndStoreSlots` to prevent gray placeholder overwriting a real spool color.

---

## [0.0.40] — 2026-04-28

**Internal build:** `v12.0.0` – `v9.0.0`

### Added
- AFC Lite v2.x integration — 4-lane filament strip embedded in card.
- Lane cards show: color swatch, material type, weight, active-lane glow.
- Load / Unload buttons per lane (`LANE_MOVE` / `EJECT` g-code).
- AFC data polled via `AFC_lane` Moonraker query object.

---

## [0.0.30] — 2026-04-20

**Internal build:** `v8.0.0` – `v6.0.0`

### Added / Changed
- Initial Prism Dashboard aesthetic — animated prismatic border, dark card background.
- Four state variants: Printing (cyan), Standby (purple), Paused (amber), Error (red).
- G-code thumbnail support — auto-fetched from Moonraker file metadata.
- Nozzle and bed temperature display with mini progress bars.
- Layer count, print speed, fan speed, filament-used stats.
- Progress bar with elapsed / remaining time.
- Action buttons: Pause, Resume, Cancel, Emergency Stop, Preheat.
- Single vanilla JS file, no build step, no dependencies.

---

*For the full internal build changelog see [`output/VERSIONS.md`](output/VERSIONS.md).*
