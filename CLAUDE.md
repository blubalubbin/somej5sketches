# Repo guide for Claude

Static site of p5.js sketches served via GitHub Pages — no build step, no
package manager, no test runner. The root `index.html` is the catalogue; each
sketch lives in its own directory.

For *what each sketch does* (render pipelines, controls, overlays) see
`README.md` — it is the source of truth for behaviour. This file is the
*engineering map*: where things live and what to touch when changing them.

## Layout

- `index.html` — catalogue page linking to each sketch.
- `<sketch>/index.html` — self-contained page: CSS + DOM + one large inline
  `<script>` holding all UI logic (controls panel, sliders, auto-cycle, share
  links, screenshot export, glassy tips).
- `<sketch>/sketch.js` — the p5 sketch: globals, `setup()`/`draw()`, the render
  pipeline, and the parameter setters. Loaded *before* the inline script.

## Cross-script globals (important)

`sketch.js` and the inline `<script>` are both classic scripts on the same
page, so top-level `let`/`const` in `sketch.js` (e.g. `axisTheta`, `rotOffset`,
`coordExp`, `rotMode`, `rotationVector`, `vizSurface`) are visible to the inline
script *by name*. The inline script calls the setters `sketch.js` exposes
(`setAxisTheta`, `setRotR`, …) and reads those globals directly. There is no
module system or bundler.

## Plumbing a parameter (rotating-sphere-v2)

One parameter is wired through several places; miss one and it silently
desyncs. Checklist:

1. `sketch.js`: global + `setXxx()` setter, used in the render path.
2. `sketch.js` `getSettings()` / `applySettingsFromHash()` — share-link round-trip.
3. `index.html`: the slider row (`oninput` calls the setter + updates the value label).
4. Auto-cycle registries in the inline script: `_WRAP_IDS` vs `_OSCILLATE_IDS`,
   `_sliderDefaults`, `_sliderDefaultSpeeds`, and — if it should stay shareable
   while cycling — the `sp_*` maps in `_encodeSpeedParams` / `_applySpeedsFromHash`.
5. `_syncControlsFromState()` — hydrates sliders from state on load.
6. `_drawSettingsPanel()` — the PNG export's settings list.
7. `_tipInfo` — the glassy tip text (optional).

## Testing

No build/lint/test commands. The p5 CDN is often blocked in sandboxes
(`cdn.jsdelivr.net` → 403), so the sketch usually can't be driven headless
here. Verify with: `node --check <file>` for JS, an HTML tag-balance check, and
numerical checks for any math (e.g. a rotation matrix should be orthonormal,
det 1). If live browser testing wasn't possible, say so.

## Conventions

- Plain ES + p5 globals; no frameworks, no dependencies beyond the p5 CDN.
- Match the existing dense-but-purposeful comment style; don't strip comments.
