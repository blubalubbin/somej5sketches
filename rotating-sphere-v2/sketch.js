let rotationVector;
let sphX, sphY, sphZ;   // pre-computed unit-sphere coords (equirectangular mode)
let UVmap;
let RM;                  // rotation matrix (pre-scaled by 127.5)
// Rotation-axis spherical coordinates
let axisTheta    = Math.acos(Math.sqrt(3) / 3); // polar  (~54.7°)
let axisPhi      = Math.PI / 4;                  // azimuthal (45°)

// Colour-warp exponent  z^(a+ib)
let coordExp     = 1.0;
let coordExpImag = 0.0;

// Coordinate-centre offset — subtracted from each surface normal before warp.
let coordCenterX = 0.0;
let coordCenterY = 0.0;
let coordCenterZ = 0.0;

// Rotation offset controlled by dragging the canvas (radians).
// Replaces the raw mouseX-based offset.
let rotOffset = 0.0;

// Rotation parameterisation:
//   'rgb'  — three Euler rotations about the R/G/B (X/Y/Z) colour axes (default).
//   'axis' — one rotation as axis-angle (rotOffset about the θ/φ axis).
let rotMode = 'rgb';
let rotR = 0.0, rotG = 0.0, rotB = 0.0;   // RGB-axis rotation angles (radians)

// ── RGB-space overlay ────────────────────────────────────────────────
// A 3D wireframe of the deformed sphere (the warped vector *before*
// renormalisation) drawn over the render, but only while a parameter is
// being changed — manually or by an auto-cycling slider. Each vertex is
// coloured by the exact pixel colour it produces (= its normalised
// direction), so the shape literally sits in RGB space.
let lastParamChange = -1e9;   // millis() of the last parameter mutation
let vizAlpha        = 0;      // eased 0→1 visibility
let vizBaseX, vizBaseY, vizBaseZ;   // precomputed unit-sphere sample grid
const VIZ_MER = 18, VIZ_PAR = 36;   // overlay grid resolution (coarse)
// Per-parameter manual-change timestamps + eased visibility for the intuition
// indicators (polar/azimuth arcs, rotation swirl, centre-offset vector).
// Only manual edits set these — auto-cycling sliders deliberately don't, so the
// indicators stay tied to "you are dragging this control right now".
let manualChange = { theta: -1e9, phi: -1e9, rot: -1e9, centre: -1e9 };
let indAlpha     = { theta: 0, phi: 0, rot: 0, centre: 0 };
// Overlay render style: false = individual dots, true = filled surface mesh.
let vizSurface = true;
function setVizSurface(on) { vizSurface = !!on; }

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  RM = new Float64Array(9);
  applySettingsFromHash();
  updateRotationVector();
  initBuffers();
  buildVizGrid();
}

// Sample grid of unit-sphere normals used by the RGB-space overlay.
function buildVizGrid() {
  const N = VIZ_MER * VIZ_PAR;
  vizBaseX = new Float32Array(N);
  vizBaseY = new Float32Array(N);
  vizBaseZ = new Float32Array(N);
  let k = 0;
  for (let j = 0; j < VIZ_MER; j++) {
    const mer = Math.PI * j / (VIZ_MER - 1);
    const sm = Math.sin(mer), cm = Math.cos(mer);
    for (let i = 0; i < VIZ_PAR; i++) {
      const par = (Math.PI * 2) * i / VIZ_PAR;
      vizBaseX[k] = sm * Math.cos(par);
      vizBaseY[k] = sm * Math.sin(par);
      vizBaseZ[k] = cm;
      k++;
    }
  }
}

function initBuffers() {
  const N = width * height;
  sphX = new Float32Array(N);
  sphY = new Float32Array(N);
  sphZ = new Float32Array(N);
  UVmap = createImage(width, height);
  buildCoordsVector(sphX, sphY, sphZ, height, width);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  initBuffers();
}

function draw() {
  if (rotMode === 'rgb') {
    buildRotationMatrixRGB(RM, rotR, rotG, rotB);
    updateAxisFromRM();   // keep rotationVector + readout in sync for the overlay
  } else {
    buildRotationMatrix(RM, rotationVector, rotOffset);
  }
  renderSphere(UVmap, RM, sphX, sphY, sphZ);
  image(UVmap, 0, 0);
  drawRGBViz();
}

function updateRotationVector() {
  const sinT = Math.sin(axisTheta);
  rotationVector = createVector(
    sinT * Math.cos(axisPhi),
    sinT * Math.sin(axisPhi),
    Math.cos(axisTheta)
  );
  const el = document.getElementById('axis-display');
  if (el) {
    const v = rotationVector;
    el.textContent = `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}`;
  }
}

function noteParamChange()   { lastParamChange = (typeof millis === 'function') ? millis() : 0; }
// Bump the global overlay timer, and the per-indicator timer too — unless that
// slider is currently auto-cycling (in which case the change isn't "manual").
function _noteManual(key, sliderId) {
  const t = (typeof millis === 'function') ? millis() : 0;
  lastParamChange = t;
  const playing = (typeof _sliderSpeeds !== 'undefined') && _sliderSpeeds[sliderId];
  if (!playing) manualChange[key] = t;
}
function setAxisTheta(deg)    { axisTheta    = deg * Math.PI / 180; updateRotationVector(); _noteManual('theta', 'theta-slider'); }
function setAxisPhi(deg)      { axisPhi      = deg * Math.PI / 180; updateRotationVector(); _noteManual('phi',   'phi-slider'); }
function setCoordExp(val)     { coordExp     = parseFloat(val); noteParamChange(); }
function setCoordExpImag(val) { coordExpImag = parseFloat(val); noteParamChange(); }
function setCoordCenterX(val) { coordCenterX = parseFloat(val); _noteManual('centre', 'cx-slider'); }
function setCoordCenterY(val) { coordCenterY = parseFloat(val); _noteManual('centre', 'cy-slider'); }
function setCoordCenterZ(val) { coordCenterZ = parseFloat(val); _noteManual('centre', 'cz-slider'); }
function setRotOffset(val)    { rotOffset    = parseFloat(val); _noteManual('rot', 'rot-offset-slider'); }
function setRotMode(mode)     { rotMode = (mode === 'rgb') ? 'rgb' : 'axis'; if (rotMode === 'axis') updateRotationVector(); noteParamChange(); }
function setRotR(deg)         { rotR = deg * Math.PI / 180; noteParamChange(); }
function setRotG(deg)         { rotG = deg * Math.PI / 180; noteParamChange(); }
function setRotB(deg)         { rotB = deg * Math.PI / 180; noteParamChange(); }

// ── Settings serialization ──────────────────────────────────────────
function getSettings() {
  const s = {
    t:  +(axisTheta * 180 / Math.PI).toFixed(2),
    p:  +(axisPhi   * 180 / Math.PI).toFixed(2),
    a:  +coordExp.toFixed(3),
    b:  +coordExpImag.toFixed(2),
    cx: +coordCenterX.toFixed(3),
    cy: +coordCenterY.toFixed(3),
    cz: +coordCenterZ.toFixed(3),
    ro: +(rotOffset * 180 / Math.PI).toFixed(1),
  };
  // Only emit RGB-rotation params when that mode is active, so axis-mode links
  // stay unchanged (backward compatible).
  if (rotMode === 'rgb') {
    s.rmode = 'rgb';
    s.rr = +(rotR * 180 / Math.PI).toFixed(1);
    s.rg = +(rotG * 180 / Math.PI).toFixed(1);
    s.rb = +(rotB * 180 / Math.PI).toFixed(1);
  }
  return s;
}

function encodeSettings() {
  const s = getSettings();
  return Object.keys(s).map(k => `${k}=${s[k]}`).join('&');
}

function parseSettingsHash(hash) {
  if (!hash) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const out = {};
  for (const kv of raw.split('&')) {
    const i = kv.indexOf('=');
    if (i < 0) continue;
    const k = decodeURIComponent(kv.slice(0, i));
    const v = decodeURIComponent(kv.slice(i + 1));
    out[k] = v;
  }
  return out;
}

function applySettingsFromHash() {
  const s = parseSettingsHash(typeof location !== 'undefined' ? location.hash : '');
  if (!s) return;
  const num = (v, fb) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fb; };
  if ('t'  in s) axisTheta    = num(s.t,  axisTheta * 180 / Math.PI) * Math.PI / 180;
  if ('p'  in s) axisPhi      = num(s.p,  axisPhi   * 180 / Math.PI) * Math.PI / 180;
  if ('a'  in s) coordExp     = num(s.a,  coordExp);
  if ('b'  in s) coordExpImag = num(s.b,  coordExpImag);
  if ('cx' in s) coordCenterX = num(s.cx, coordCenterX);
  if ('cy' in s) coordCenterY = num(s.cy, coordCenterY);
  if ('cz' in s) coordCenterZ = num(s.cz, coordCenterZ);
  if ('ro' in s) rotOffset    = num(s.ro, rotOffset * 180 / Math.PI) * Math.PI / 180;
  if ('rr' in s) rotR = num(s.rr, 0) * Math.PI / 180;
  if ('rg' in s) rotG = num(s.rg, 0) * Math.PI / 180;
  if ('rb' in s) rotB = num(s.rb, 0) * Math.PI / 180;
  // The mode marker is only emitted for RGB links, so a hash without it is an
  // axis-mode link (including older links from before RGB mode existed). Force
  // axis there so it overrides the now-RGB default rather than inheriting it.
  rotMode = ('rmode' in s) ? (s.rmode === 'rgb' ? 'rgb' : 'axis') : 'axis';
}

// Real part of sign(v)·|v|^(a+ib).  At a=1, b=0 this is the identity.
function warpCoord(v, a, b) {
  if (v === 0) return 0;
  const absv = Math.abs(v);
  return Math.sign(v) * Math.pow(absv, a) * (b === 0 ? 1 : Math.cos(b * Math.log(absv)));
}

// Rodrigues rotation — pre-scaled by 127.5 so pixel writes need no extra arithmetic.
function buildRotationMatrix(RM, RV, theta) {
  const c = Math.cos(theta), s = Math.sin(theta), t = 1 - c;
  const x = RV.x, y = RV.y, z = RV.z, k = 127.5;
  RM[0] = k*(c+x*x*t);   RM[1] = k*(x*y*t-z*s); RM[2] = k*(x*z*t+y*s);
  RM[3] = k*(y*x*t+z*s); RM[4] = k*(c+y*y*t);   RM[5] = k*(y*z*t-x*s);
  RM[6] = k*(z*x*t-y*s); RM[7] = k*(z*y*t+x*s); RM[8] = k*(c+z*z*t);
}

// Three Euler rotations about the R/G/B (X/Y/Z) axes, composed as Rz·Ry·Rx
// (R applied first, then G, then B). Pre-scaled by 127.5 like buildRotationMatrix.
function buildRotationMatrixRGB(M, aR, aG, aB) {
  const ca = Math.cos(aR), sa = Math.sin(aR);
  const cb = Math.cos(aG), sb = Math.sin(aG);
  const cg = Math.cos(aB), sg = Math.sin(aB);
  const k = 127.5;
  M[0] = k*(cg*cb);            M[1] = k*(cg*sb*sa - sg*ca); M[2] = k*(cg*sb*ca + sg*sa);
  M[3] = k*(sg*cb);            M[4] = k*(sg*sb*sa + cg*ca); M[5] = k*(sg*sb*ca - cg*sa);
  M[6] = k*(-sb);              M[7] = k*(cb*sa);            M[8] = k*(cb*ca);
}

// Recover the equivalent single rotation axis from RM so the overlay's
// rotation-axis indicator + readout stay meaningful in RGB mode.
function updateAxisFromRM() {
  let ax = RM[7] - RM[5];   // (r21 - r12), 127.5 scale cancels on normalise
  let ay = RM[2] - RM[6];   // (r02 - r20)
  let az = RM[3] - RM[1];   // (r10 - r01)
  const len = Math.sqrt(ax*ax + ay*ay + az*az);
  if (len > 1e-6) rotationVector.set(ax/len, ay/len, az/len);
  const el = document.getElementById('axis-display');
  if (el) {
    const v = rotationVector;
    el.textContent = `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}`;
  }
}

function buildCoordsVector(xs, ys, zs, meridiansCount, parallelsCount) {
  for (let j = 0; j < meridiansCount; j++) {
    const meridian = Math.PI * j / (meridiansCount - 1);
    const sinM = Math.sin(meridian), cosM = Math.cos(meridian);
    const rowOffset = parallelsCount * j;
    for (let i = 0; i < parallelsCount; i++) {
      const parallel = (Math.PI * 2) * i / parallelsCount;
      const idx = i + rowOffset;
      xs[idx] = sinM * Math.cos(parallel);
      ys[idx] = sinM * Math.sin(parallel);
      zs[idx] = cosM;
    }
  }
}

// v2 pipeline: (coord − centre) → warp → normalise → rotate → pixel.
// Fast path when centre=(0,0,0) and warp=identity: skip all three steps.
function renderSphere(img, RM, xs, ys, zs) {
  img.loadPixels();
  const pixels = img.pixels;
  const m00=RM[0],m01=RM[1],m02=RM[2],m10=RM[3],m11=RM[4],m12=RM[5],m20=RM[6],m21=RM[7],m22=RM[8];
  const k  = 127.5;
  const N  = xs.length;
  const a  = coordExp, b = coordExpImag;
  const cx = coordCenterX, cy = coordCenterY, cz = coordCenterZ;
  const pure = (a===1 && b===0 && cx===0 && cy===0 && cz===0);

  for (let i = 0; i < N; i++) {
    const p = i << 2;
    let nx, ny, nz;
    if (pure) {
      nx = xs[i]; ny = ys[i]; nz = zs[i];
    } else {
      const wx = warpCoord(xs[i]-cx, a, b);
      const wy = warpCoord(ys[i]-cy, a, b);
      const wz = warpCoord(zs[i]-cz, a, b);
      const len = Math.sqrt(wx*wx + wy*wy + wz*wz);
      if (len < 1e-6) { pixels[p]=pixels[p+1]=pixels[p+2]=0; pixels[p+3]=255; continue; }
      nx = wx/len; ny = wy/len; nz = wz/len;
    }
    pixels[p]   = m00*nx + m01*ny + m02*nz + k;
    pixels[p+1] = m10*nx + m11*ny + m12*nz + k;
    pixels[p+2] = m20*nx + m21*ny + m22*nz + k;
    pixels[p+3] = 255;
  }
  img.updatePixels();
}

// ── RGB-space overlay ────────────────────────────────────────────────
// Fixed camera; the shape (and its body frame) rotate within it, so the
// orientation set by the rotation axis + offset is visible. Fades in only
// while a parameter is changing.
const VIZ_HOLD_MS = 1100;   // keep visible this long after the last change
const VIZ_VIEW_YAW   = -0.62;
const VIZ_VIEW_PITCH =  0.52;
const VIZ_UNIT_TOL   = 1.004;   // treat |w| above this as "outside unit" (FP slack)

function drawRGBViz() {
  const now = (typeof millis === 'function') ? millis() : 0;
  const target = (now - lastParamChange) < VIZ_HOLD_MS ? 1 : 0;
  vizAlpha += (target - vizAlpha) * 0.16;
  if (vizAlpha < 0.012) { if (target === 0) vizAlpha = 0; return; }
  const A = vizAlpha;

  // Unscaled rotation matrix (RM is the same rotation pre-scaled by 127.5).
  const r00=RM[0]/127.5, r01=RM[1]/127.5, r02=RM[2]/127.5;
  const r10=RM[3]/127.5, r11=RM[4]/127.5, r12=RM[5]/127.5;
  const r20=RM[6]/127.5, r21=RM[7]/127.5, r22=RM[8]/127.5;

  const a = coordExp, b = coordExpImag;
  const cX = coordCenterX, cY = coordCenterY, cZ = coordCenterZ;
  const N = vizBaseX.length;

  // Transform every sample: warp → rotate (NO renormalise → keeps deformation).
  const X = new Float64Array(N), Y = new Float64Array(N), Z = new Float64Array(N);
  const cr = new Float64Array(N), cg = new Float64Array(N), cb = new Float64Array(N);
  const mag = new Float64Array(N);   // |w| before renormalise; >1 = outside unit
  let minx=0, maxx=0, miny=0, maxy=0, minz=0, maxz=0, maxMag=0, maxMagIdx=0;
  for (let i = 0; i < N; i++) {
    const wx = warpCoord(vizBaseX[i] - cX, a, b);
    const wy = warpCoord(vizBaseY[i] - cY, a, b);
    const wz = warpCoord(vizBaseZ[i] - cZ, a, b);
    const x = r00*wx + r01*wy + r02*wz;
    const y = r10*wx + r11*wy + r12*wz;
    const z = r20*wx + r21*wy + r22*wz;
    X[i]=x; Y[i]=y; Z[i]=z;
    if (x<minx) minx=x; if (x>maxx) maxx=x;
    if (y<miny) miny=y; if (y>maxy) maxy=y;
    if (z<minz) minz=z; if (z>maxz) maxz=z;
    const len = Math.sqrt(x*x + y*y + z*z);
    mag[i] = len;
    if (len > maxMag) { maxMag = len; maxMagIdx = i; }
    // Colour = the pixel colour this sample produces (= its unit direction).
    const L = len || 1;
    cr[i] = Math.max(0, Math.min(255, x/L*127.5 + 127.5));
    cg[i] = Math.max(0, Math.min(255, y/L*127.5 + 127.5));
    cb[i] = Math.max(0, Math.min(255, z/L*127.5 + 127.5));
  }

  // Half-extent of the axis-aligned bounding box (reported in the caption).
  const half = Math.max(1, Math.abs(minx), Math.abs(maxx),
                           Math.abs(miny), Math.abs(maxy),
                           Math.abs(minz), Math.abs(maxz));
  // Viewport scales to the max radius, not the bounding box. Radius is invariant
  // under rotation (rotation preserves distance), so spinning the axis/offset
  // doesn't change the on-screen size of a warped, non-spherical shape.
  const fitR = Math.max(1, maxMag);
  const cx = width / 2, cy = height / 2;
  const scl = (Math.min(width, height) * 0.30) / (fitR * 1.08);

  const cYaw = Math.cos(VIZ_VIEW_YAW),   sYaw = Math.sin(VIZ_VIEW_YAW);
  const cPit = Math.cos(VIZ_VIEW_PITCH), sPit = Math.sin(VIZ_VIEW_PITCH);
  // Fixed orthographic camera. Returns [sx, sy, depth]; larger depth = farther.
  const proj = (x, y, z) => {
    const x1 = x*cYaw - y*sYaw;
    const y1 = x*sYaw + y*cYaw;
    const y2 = y1*cPit - z*sPit;
    const z2 = y1*sPit + z*cPit;
    return [cx + x1*scl, cy - z2*scl, y2];
  };

  push();
  textFont('monospace');

  // ── bounding box (actual parameter-dependent extent) ──
  // Each edge runs parallel to one colour axis (X→R, Y→G, Z→B). Split it where
  // it crosses the unit boundary (value ±1): the stretch beyond unit is drawn
  // in that axis's bright colour, the part inside the unit cube stays faint —
  // so you can see exactly where (and in which channel) the box exceeds unit.
  const corners = [];
  for (const xi of [minx, maxx])
    for (const yi of [miny, maxy])
      for (const zi of [minz, maxz])
        corners.push(proj(xi, yi, zi));
  // [loCornerIdx, hiCornerIdx, axis] — axis 0=R(x), 1=G(y), 2=B(z); lo corner
  // sits at the axis's min value, hi corner at its max.
  const boxEdges = [
    [0,1,2],[2,3,2],[4,5,2],[6,7,2],   // B (z)
    [0,2,1],[1,3,1],[4,6,1],[5,7,1],   // G (y)
    [0,4,0],[1,5,0],[2,6,0],[3,7,0],   // R (x)
  ];
  const _boxCols   = [[255,90,90],[90,220,120],[90,150,255]];
  const _boxRanges = [[minx,maxx],[miny,maxy],[minz,maxz]];
  for (const [u, v, ax] of boxEdges) {
    const [lo, hi] = _boxRanges[ax];
    const span = hi - lo;
    const pu = corners[u], pv = corners[v];
    // Breakpoints: the edge's value run [lo,hi] cut at any ±1 it crosses.
    const cuts = [lo];
    if (-1 > lo && -1 < hi) cuts.push(-1);
    if ( 1 > lo &&  1 < hi) cuts.push(1);
    cuts.push(hi);
    cuts.sort((a, b) => a - b);
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = cuts[k], b = cuts[k + 1];
      const ta = span !== 0 ? (a - lo) / span : 0;
      const tb = span !== 0 ? (b - lo) / span : 1;
      const x0 = pu[0] + (pv[0] - pu[0]) * ta, y0 = pu[1] + (pv[1] - pu[1]) * ta;
      const x1 = pu[0] + (pv[0] - pu[0]) * tb, y1 = pu[1] + (pv[1] - pu[1]) * tb;
      if (Math.abs((a + b) * 0.5) > 1) {        // beyond unit on this axis
        const c = _boxCols[ax];
        stroke(c[0], c[1], c[2], 200 * A); strokeWeight(1.6);
      } else {                                   // inside the unit cube
        stroke(140, 155, 185, 50 * A); strokeWeight(1);
      }
      line(x0, y0, x1, y1);
    }
  }

  // ── deformed sphere + RGB axes (depth-merged so the shape occludes the axes) ──
  const sp = new Array(N);
  let dmin = Infinity, dmax = -Infinity;
  for (let i = 0; i < N; i++) {
    sp[i] = proj(X[i], Y[i], Z[i]);
    const d = sp[i][2];
    if (d < dmin) dmin = d;
    if (d > dmax) dmax = d;
  }
  const dspan = (dmax - dmin) || 1;

  const o = proj(0, 0, 0);
  // G points down the −Y direction so the three reference arrows splay ~120°
  // apart (an equilateral triad) in this view instead of bunching on the right.
  const axes = [
    { e: proj(1, 0,  0), dir: [1,  0, 0], col: [255, 90, 90],  lbl: 'R' },
    { e: proj(0, -1, 0), dir: [0, -1, 0], col: [90, 220, 120], lbl: 'G' },
    { e: proj(0, 0,  1), dir: [0,  0, 1], col: [90, 150, 255], lbl: 'B' },
  ];

  // One depth-sorted primitive list so the painter's order (far first) lets the
  // surface / dots paint over the stretch of an axis that sits behind them.
  // kind 0 = surface quad, 1 = dot, 2 = RGB-axis sub-segment.
  const prims = [];
  if (vizSurface) {
    for (let j = 0; j < VIZ_MER - 1; j++) {
      for (let i = 0; i < VIZ_PAR; i++) {
        const i2 = (i + 1) % VIZ_PAR;
        const a = j * VIZ_PAR + i,        b = j * VIZ_PAR + i2;
        const c = (j + 1) * VIZ_PAR + i2, d = (j + 1) * VIZ_PAR + i;
        prims.push([(sp[a][2] + sp[b][2] + sp[c][2] + sp[d][2]) * 0.25, 0, a, b, c, d]);
      }
    }
  } else {
    for (let i = 0; i < N; i++) prims.push([sp[i][2], 1, i]);
  }
  // Subdivide each axis (origin → unit tip) so it can be partly occluded; the
  // last sub-segment carries the arrowhead.
  const AX_SEG = 16;
  for (const ax of axes) {
    let pp = o, pd = o[2];
    for (let i = 1; i <= AX_SEG; i++) {
      const t = i / AX_SEG;
      const p = proj(ax.dir[0] * t, ax.dir[1] * t, ax.dir[2] * t);
      prims.push([(pd + p[2]) * 0.5, 2, pp[0], pp[1], p[0], p[1],
                  ax.col[0], ax.col[1], ax.col[2], i === AX_SEG ? 1 : 0]);
      pp = p; pd = p[2];
    }
  }
  prims.sort((p, q) => q[0] - p[0]);   // far first

  for (const pr of prims) {
    const kind = pr[1];
    if (kind === 0) {
      const a = pr[2], b = pr[3], c = pr[4], d = pr[5];
      const near = 1 - (pr[0] - dmin) / dspan;
      const sh = 0.65 + 0.35 * near;     // dim the far side slightly for form
      const rr = (cr[a] + cr[b] + cr[c] + cr[d]) * 0.25 * sh;
      const gg = (cg[a] + cg[b] + cg[c] + cg[d]) * 0.25 * sh;
      const bb = (cb[a] + cb[b] + cb[c] + cb[d]) * 0.25 * sh;
      // Stroke == fill closes anti-aliasing seams so it reads as one surface.
      stroke(rr, gg, bb, 230 * A); strokeWeight(1);
      fill(rr, gg, bb, 230 * A);
      quad(sp[a][0], sp[a][1], sp[b][0], sp[b][1], sp[c][0], sp[c][1], sp[d][0], sp[d][1]);
      // Outline facets that reach outside the unit sphere; brighter the further.
      const mx = Math.max(mag[a], mag[b], mag[c], mag[d]);
      if (mx > VIZ_UNIT_TOL) {
        const f = Math.min(1, (mx - 1) * 1.2);
        noFill(); stroke(255, 255, 255, (85 + 130 * f) * A); strokeWeight(1 + 0.8 * f);
        quad(sp[a][0], sp[a][1], sp[b][0], sp[b][1], sp[c][0], sp[c][1], sp[d][0], sp[d][1]);
      }
    } else if (kind === 1) {
      const i = pr[2], s = sp[i];
      const near = 1 - (s[2] - dmin) / dspan;   // 1 = nearest, 0 = farthest
      // Outside the unit sphere → bright white ring (scales with overshoot).
      if (mag[i] > VIZ_UNIT_TOL) {
        const f = Math.min(1, (mag[i] - 1) * 1.5);
        stroke(255, 255, 255, (120 + 135 * f) * A); strokeWeight(1 + 1.2 * f);
      } else {
        stroke(0, 0, 0, 70 * A); strokeWeight(0.75);
      }
      fill(cr[i], cg[i], cb[i], (140 + 100 * near) * A);
      circle(s[0], s[1], 2.6 + 2.4 * near);
    } else {
      stroke(pr[6], pr[7], pr[8], 235 * A); strokeWeight(2.5);
      line(pr[2], pr[3], pr[4], pr[5]);
      if (pr[9]) _vizArrowHead([pr[2], pr[3]], [pr[4], pr[5]], [pr[6], pr[7], pr[8]], A);
    }
  }

  // ── unit-sphere reference: three faint great circles (the natural bound) ──
  // Drawn over the shape so the part that bulges past unit radius is obvious.
  {
    const segs = 48;
    const rings = [
      [[1,0,0],[0,1,0]],   // XY
      [[0,1,0],[0,0,1]],   // YZ
      [[1,0,0],[0,0,1]],   // XZ
    ];
    stroke(205, 215, 235, 45 * A); strokeWeight(1); noFill();
    for (const [u, w] of rings) {
      let prev = null;
      for (let i = 0; i <= segs; i++) {
        const an = 2 * Math.PI * i / segs, c = Math.cos(an), s = Math.sin(an);
        const pt = proj(c*u[0] + s*w[0], c*u[1] + s*w[1], c*u[2] + s*w[2]);
        if (prev) line(prev[0], prev[1], pt[0], pt[1]);
        prev = pt;
      }
    }
  }

  // ── RGB axis labels (kept on top so they stay legible over the shape) ──
  textSize(14); textAlign(CENTER, CENTER); noStroke();
  for (const ax of axes) {
    fill(ax.col[0], ax.col[1], ax.col[2], 240 * A);
    text(ax.lbl, ax.e[0] + (ax.e[0] - o[0]) * 0.13, ax.e[1] + (ax.e[1] - o[1]) * 0.13);
  }

  // ── rotation axis (yellow; invariant under the spin) ──
  const av = rotationVector, L = fitR * 0.98;
  const ap = proj(av.x * L, av.y * L, av.z * L);
  const an = proj(-av.x * L, -av.y * L, -av.z * L);
  stroke(240, 210, 60, 200 * A); strokeWeight(1.6);
  line(an[0], an[1], ap[0], ap[1]);
  _vizArrowHead(o, ap, [240, 210, 60], A);

  // ── body pole (image of +Z): shows the spin/orientation ──
  const pe = proj(r02 * 0.9, r12 * 0.9, r22 * 0.9);
  stroke(255, 255, 255, 210 * A); strokeWeight(1.4);
  line(o[0], o[1], pe[0], pe[1]);
  noStroke(); fill(255, 255, 255, 225 * A); circle(pe[0], pe[1], 4.4);

  // ── per-parameter intuition indicators (manual edits only) ──
  const _indTarget = k => (now - manualChange[k] < VIZ_HOLD_MS) ? 1 : 0;
  indAlpha.theta  += (_indTarget('theta')  - indAlpha.theta ) * 0.18;
  indAlpha.phi    += (_indTarget('phi')    - indAlpha.phi   ) * 0.18;
  indAlpha.rot    += (_indTarget('rot')    - indAlpha.rot   ) * 0.18;
  indAlpha.centre += (_indTarget('centre') - indAlpha.centre) * 0.18;
  textSize(12);

  // Polar θ — arc from the +Z (blue/up) axis to the rotation axis: the tilt.
  if (indAlpha.theta > 0.02) {
    const ta = A * indAlpha.theta;
    const ang = Math.acos(Math.max(-1, Math.min(1, av.z)));
    const Rarc = 0.5 * fitR;
    if (ang > 0.02) {
      const sa = Math.sin(ang), segs = 22;
      stroke(120, 225, 235, 235 * ta); strokeWeight(2);
      let prev = null, prev2 = null, mid = null;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const w0 = Math.sin((1 - t) * ang) / sa, w1 = Math.sin(t * ang) / sa;
        const s2 = proj(w1 * av.x * Rarc, w1 * av.y * Rarc, (w0 + w1 * av.z) * Rarc);
        if (prev) line(prev[0], prev[1], s2[0], s2[1]);
        if (i === (segs >> 1)) mid = s2;
        prev2 = prev; prev = s2;
      }
      if (prev2) _vizArrowHead(prev2, prev, [120, 225, 235], ta);
      if (mid) { noStroke(); fill(160, 232, 242, 240 * ta); textAlign(CENTER, BOTTOM);
                 text('θ ' + (axisTheta * 180 / Math.PI).toFixed(0) + '°', mid[0], mid[1] - 4); }
    }
  }

  // Azimuth φ — arc in the XY (equator) plane from +X, with a drop line from
  // the axis tip: the compass heading the axis is swung around to.
  if (indAlpha.phi > 0.02) {
    const pa = A * indAlpha.phi;
    const Rarc = 0.5 * fitR, phi = axisPhi;
    const segs = Math.max(8, Math.round(Math.abs(phi) / (Math.PI / 24)));
    stroke(235, 150, 235, 235 * pa); strokeWeight(2);
    let prev = null, prev2 = null, mid = null;
    for (let i = 0; i <= segs; i++) {
      const an = phi * (i / segs);
      const s2 = proj(Math.cos(an) * Rarc, Math.sin(an) * Rarc, 0);
      if (prev) line(prev[0], prev[1], s2[0], s2[1]);
      if (i === (segs >> 1)) mid = s2;
      prev2 = prev; prev = s2;
    }
    if (prev2) _vizArrowHead(prev2, prev, [235, 150, 235], pa);
    const tip = proj(av.x * Rarc, av.y * Rarc, av.z * Rarc);
    const tipXY = proj(av.x * Rarc, av.y * Rarc, 0);
    stroke(235, 150, 235, 110 * pa); strokeWeight(1);
    line(tip[0], tip[1], tipXY[0], tipXY[1]);
    if (mid) { noStroke(); fill(240, 170, 240, 240 * pa); textAlign(CENTER, TOP);
               text('φ ' + (axisPhi * 180 / Math.PI).toFixed(0) + '°', mid[0], mid[1] + 4); }
  }

  // Rotation — a circular arrow swirling around the axis; phase = the offset,
  // so the whole swirl spins as you drag the rotation.
  if (indAlpha.rot > 0.02) {
    const ra = A * indAlpha.rot;
    const basis = _perpBasis(av), u = basis[0], v = basis[1];
    const Rs = 0.45 * fitR, sweep = 5.2, segs = 30, phase = rotOffset;
    stroke(245, 215, 70, 235 * ra); strokeWeight(2);
    let prev = null, prev2 = null, mid = null;
    for (let i = 0; i <= segs; i++) {
      const al = phase + sweep * (i / segs);
      const c = Math.cos(al), s = Math.sin(al);
      const s2 = proj((c*u[0]+s*v[0])*Rs, (c*u[1]+s*v[1])*Rs, (c*u[2]+s*v[2])*Rs);
      if (prev) line(prev[0], prev[1], s2[0], s2[1]);
      if (i === (segs >> 1)) mid = s2;
      prev2 = prev; prev = s2;
    }
    if (prev2) _vizArrowHead(prev2, prev, [245, 215, 70], ra);
    if (mid) { noStroke(); fill(248, 222, 96, 240 * ra); textAlign(CENTER, CENTER);
               text((rotOffset * 180 / Math.PI).toFixed(0) + '°', mid[0], mid[1]); }
  }

  // Centre offset — distance along each R/G/B reference axis (the offset's X/Y/Z
  // components are the R/G/B channels) + resultant arrow and magnitude.
  if (indAlpha.centre > 0.02) {
    const ca = A * indAlpha.centre;
    const dR = coordCenterX, dG = coordCenterY, dB = coordCenterZ;
    const cmag = Math.sqrt(dR*dR + dG*dG + dB*dB);
    const pR = proj(dR, 0, 0), pRG = proj(dR, dG, 0), pEnd = proj(dR, dG, dB);
    strokeWeight(1.5);
    stroke(255, 120, 120, 170 * ca); line(o[0], o[1], pR[0], pR[1]);
    stroke(120, 230, 140, 170 * ca); line(pR[0], pR[1], pRG[0], pRG[1]);
    stroke(120, 170, 255, 170 * ca); line(pRG[0], pRG[1], pEnd[0], pEnd[1]);
    stroke(245, 245, 250, 235 * ca); strokeWeight(2);
    line(o[0], o[1], pEnd[0], pEnd[1]);
    if (cmag > 1e-4) _vizArrowHead(o, pEnd, [245, 245, 250], ca);
    noStroke(); fill(245, 245, 250, 235 * ca); circle(pEnd[0], pEnd[1], 4.6);
    // Per-channel distance readout, aligned to the R/G/B reference axes.
    const sgn = v => (v >= 0 ? '+' : '') + v.toFixed(2);
    textAlign(LEFT, CENTER); textSize(10);
    let ly = pEnd[1] - 21;
    fill(255, 140, 140, 235 * ca); text('R ' + sgn(dR), pEnd[0] + 9, ly); ly += 14;
    fill(140, 235, 160, 235 * ca); text('G ' + sgn(dG), pEnd[0] + 9, ly); ly += 14;
    fill(140, 185, 255, 235 * ca); text('B ' + sgn(dB), pEnd[0] + 9, ly); ly += 14;
    fill(235, 238, 245, 235 * ca); text('|RGB| ' + cmag.toFixed(2), pEnd[0] + 9, ly);
  }

  // ── subtle annotations (with a dark shadow so they read over the render) ──
  noStroke(); textSize(11);
  // Bounds: tucked against the far corner of the bounding box, so it rides
  // along as the box changes shape.
  const bc = corners[7];   // (maxx, maxy, maxz) corner
  _vizLabel('±' + half.toFixed(2), bc[0] + 6, bc[1] - 4, LEFT, BOTTOM, 205, 218, 240, 215 * A);
  // Max radius: printed next to the single furthest-out point; brightens when
  // it pushes past the unit sphere.
  const over = maxMag > VIZ_UNIT_TOL;
  const fp = sp[maxMagIdx];
  _vizLabel('r ' + maxMag.toFixed(2), fp[0] + 7, fp[1], LEFT, CENTER,
            over ? 255 : 205, over ? 255 : 218, over ? 255 : 240, (over ? 240 : 210) * A);

  pop();
}

// Two orthonormal vectors spanning the plane perpendicular to a unit axis.
function _perpBasis(ax) {
  let rx = 0, ry = 0, rz = 1;
  if (Math.abs(ax.z) > 0.9) { rx = 1; rz = 0; }
  let ux = ax.y*rz - ax.z*ry, uy = ax.z*rx - ax.x*rz, uz = ax.x*ry - ax.y*rx;
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const vx = ax.y*uz - ax.z*uy, vy = ax.z*ux - ax.x*uz, vz = ax.x*uy - ax.y*ux;
  return [[ux, uy, uz], [vx, vy, vz]];
}

// Small label with a soft dark shadow so it stays readable over the render.
function _vizLabel(str, x, y, ah, av, r, g, b, a) {
  textAlign(ah, av);
  fill(0, 0, 0, a * 0.6);
  text(str, x + 1, y + 1);
  fill(r, g, b, a);
  text(str, x, y);
}

function _vizArrowHead(from, to, col, A) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const sz = 7;
  const bx = to[0] - ux * sz, by = to[1] - uy * sz;
  const nx = -uy, ny = ux;
  noStroke(); fill(col[0], col[1], col[2], 235 * A);
  triangle(to[0], to[1],
           bx + nx * sz * 0.5, by + ny * sz * 0.5,
           bx - nx * sz * 0.5, by - ny * sz * 0.5);
}

