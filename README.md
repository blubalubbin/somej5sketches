# somej5sketches

Live demo: **<https://blubalubbin.github.io/somej5sketches/>**

A small catalogue of [p5.js](https://p5js.org/) sketches, served as a static site via GitHub Pages.

---

## Sketches

### [Rotating sphere](rotating-sphere/)

A unit sphere whose surface normals are mapped to RGB colour channels, then rotated by a configurable axis using a Rodrigues rotation matrix.  Move the cursor horizontally to add extra spin.

#### Render pipeline

```
surface normal (unit sphere)
        │
        ▼  optional complex-power warp
   n' = sign(n) · |n|^a · cos(b · ln|n|)
        │
        ▼  Rodrigues rotation  (axis θ,φ; angle = frameCount × speed + mouse)
   n'' = R · n'
        │
        ▼  map  [-1, 1]  →  [0, 255]
   pixel RGB = n'' × 127.5 + 127.5
```

Two render modes share the same colour function:

| Mode | How the sphere is sampled |
|------|--------------------------|
| **Flat map** | Equirectangular UV grid — every pixel maps to a fixed point on the unit sphere; the whole surface is visible at once. |
| **3D sphere** | Orthographic ray-cast — each screen pixel fires a ray; only the front hemisphere is shown, with the edge fading as the normal grazes 90°. |

The warp at `a=1, b=0` is the identity (no distortion).  Changing **a** compresses or expands the colour bands (lower = flatter, higher = sharper near the poles).  Adding a non-zero **b** creates oscillating colour rings via the imaginary part of the complex exponent.

#### Controls

| Slider | Effect |
|--------|--------|
| Polar θ / Azimuth φ | Direction of the rotation axis in spherical coordinates |
| Speed | Base rotation rate (rad / frame) |
| Exponent a | Real part of the complex power applied to each normal component |
| Imaginary b | Imaginary part — creates oscillating colour bands |

#### HUD extras

- **↓ GIF** — captures ~3 s at 15 fps and appends a parameter summary card before downloading `rotating-sphere.gif`.
- **⚙ Controls** — opens a panel with sliders and a live mini-sphere preview.  The preview shows the sphere in a fixed XYZ frame with the rotation axis arrow overlaid.

---

### [Rotating sphere v2](rotating-sphere-v2/)

Extends v1 with two conceptual changes:

1. **Coordinate-centre offset** — a 3-vector `(cx, cy, cz)` is subtracted from each surface normal *before* the warp is applied, shifting which region of the complex-power function is sampled.
2. **Warp before renormalisation** — after the warp the vector is renormalised to unit length before the rotation is applied.  This guarantees the output always stays in `[0, 255]` and lets the exponent shape the direction of the normal rather than its magnitude.

#### v2 render pipeline

```
surface normal  n  (unit sphere)
        │
        ▼  subtract centre
   u = n − (cx, cy, cz)
        │
        ▼  complex-power warp  (element-wise)
   w = sign(u) · |u|^a · cos(b · ln|u|)
        │
        ▼  renormalise
   n̂ = w / ‖w‖
        │
        ▼  Rodrigues rotation
   n̂' = R · n̂
        │
        ▼  map  [-1, 1]  →  [0, 255]
   pixel RGB = n̂' × 127.5 + 127.5
```

When `cx=cy=cz=0` and `a=1, b=0` both pipelines produce identical output (the renormalise step is a no-op on an already-unit vector).

#### Additional controls (v2 only)

| Slider | Effect |
|--------|--------|
| Centre X / Y / Z | Shifts the warp origin along each axis; colour bands migrate across the sphere surface as you drag |

The colour-axis labels in the sliders (red = X, green = Y, blue = Z) match the reference frame shown in the mini-sphere preview, where the rotation-equator ellipse (dashed yellow) visualises the great circle perpendicular to the current rotation axis.

#### RGB-space overlay

While a parameter is changing — dragged by hand or advanced by a ▶ play button — a 3D wireframe fades in over the render and relates the flat UV map back to a shape:

- **Deformed sphere** — the unit sphere is sampled on a coarse grid and pushed through the warp (`centre → exponent → imaginary`) *without* the final renormalise step, so the points genuinely bulge away from a sphere.  Each vertex is drawn at its position and tinted with the exact pixel colour it produces — its normalised direction — so the cloud literally sits in RGB space.
- **Unit axes** — fixed R/G/B arrows mark the colour-channel frame.
- **Bounding box** — scales to the shape's actual extent, which grows or shrinks with the warp parameters; the caption reports the current half-extent.
- **Orientation** — the rotation axis is drawn in yellow (invariant under the spin) and a white pole marker (the image of +Z) sweeps as the rotation offset advances, so the shape's orientation and its rotation about the axis settings are both visible.

The overlay is purely informational and disappears about a second after the last change.

---

## Running locally

No build step required — open either `index.html` in a browser or serve from any static file server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## Source

<https://github.com/blubalubbin/somej5sketches>
