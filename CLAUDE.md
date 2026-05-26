# Repo guide for Claude

Static site of p5.js sketches served via GitHub Pages — no build step, no
package manager, no test runner. The root `index.html` is the catalogue; each
sketch lives in its own directory.

For *what each sketch does* (render pipelines, controls, overlays) see
`README.md` — it is the source of truth for behaviour. This file is the
*engineering map*: where things live and what to touch when changing them.

## Layout

- `index.html` — catalogue page linking to each sketch.
- `common/ui.js` — the **shared, data-driven interface runtime** (one classic
  script exposing `window.SketchUI`). Builds the HUD + controls panel DOM from a
  config and wires every behaviour: slider drag, auto-cycle, trim handles,
  glassy tips, share links, PNG export. No sketch should reimplement this.
- `common/ui.css` — the shared interface styles (class names must stay in sync
  with the markup `ui.js` emits).
- `<sketch>/index.html` — a thin loader: a little sketch-specific CSS, then
  `sketch.js`, `../common/ui.js`, and `config.js` in that order.
- `<sketch>/config.js` — declares the per-sketch CONFIG object (sliders,
  sections, tips, share/export wiring) and calls `SketchUI.init(CONFIG)`.
- `<sketch>/sketch.js` — the p5 sketch: globals, `setup()`/`draw()`, the render
  pipeline, and the parameter setters. Loaded *before* the runtime.

## Cross-script globals (important)

`sketch.js`, `ui.js` and `config.js` are all classic scripts on the same page.
Two distinct visibility rules bite here:

- **`function` declarations** in `sketch.js` (the setters `setAxisTheta`,
  `encodeSettings`, …) become properties on `window`, so `ui.js` calls them by
  name (`window[cfg.set]`).
- **top-level `let`/`const`** in `sketch.js` (`axisTheta`, `rotMode`,
  `coordExp`, `rotationVector`, `vizSurface`, …) are visible to other classic
  scripts *by bare name* but are **not** on `window`. So `config.js` reads them
  directly inside its closures (`get`, `toValue`, `rows`, `getMode`), while
  `ui.js` — which can't see them by bare name — only ever touches them through
  those config closures. `ui.js` publishes `window._sliderSpeeds` because
  rotating-sphere's `sketch.js` reads it by bare name.

## Plumbing a parameter (config-driven)

A parameter now lives in two files. In `sketch.js`: the global + `setXxx()`
setter (render path) and the `encodeSettings`/`applySettingsFromHash`
round-trip. Everything else is one entry in `config.js`'s `sliders` array:

1. `id`, `section`, `label`, `min`/`max`/`step`/`default`.
2. `set` (the setter's name) + optional `toValue` (slider position → setter arg)
   and `format` (slider position → value label).
3. `get` — slider position from current state, for load-time hydration.
4. `cycle` (`'wrap'` | `'oscillate'` | `'none'`) + `speed` (auto-cycle row).
5. `trim` — opt-in cycle-range handles (warp sliders).
6. `tip` — the glassy tip text (optional).
7. Add the id → `sp_*` mapping in `share.speedParams` to keep it shareable while
   cycling, and a row in `exportPanel.rows()` for the PNG settings list.

Bespoke features are opt-in config keys: `modeToggle` (mutually-exclusive slider
groups), `canvasDrag`, `panelButtons`, `panelFooter`. A sketch that omits a key
instantiates none of that code path.

## Testing

No build/lint/test commands. The p5 CDN is often blocked in sandboxes
(`cdn.jsdelivr.net` → 403), so the sketch usually can't be driven headless
here. Verify with: `node --check <file>` for JS, an HTML tag-balance check, and
numerical checks for any math (e.g. a rotation matrix should be orthonormal,
det 1). If live browser testing wasn't possible, say so.

## Conventions

- Plain ES + p5 globals; no frameworks, no dependencies beyond the p5 CDN.
- Match the existing dense-but-purposeful comment style; don't strip comments.
