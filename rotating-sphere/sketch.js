let rotationVector;
let cx, cy, cz;          // Float32Array of unit-sphere coords (flat equirectangular mode)
let UVmap;
let RM;                  // flat 9-entry rotation matrix (scaled by 127.5)
let mode3D = false;
let sphereR;             // pixel radius used in 3D mode

// Spherical-coordinate params for the rotation axis
let axisTheta = Math.acos(Math.sqrt(3) / 3); // polar angle from +Z  (~54.7°)
let axisPhi   = Math.PI / 4;                  // azimuthal angle in XY (45°)
let rotSpeed  = 0.01;                          // rad / frame
let coordExp      = 1.0; // real part   a: sign(v)·|v|^a·cos(b·ln|v|) applied to normals
let coordExpImag  = 0.0; // imaginary part b: 0 = no effect, ±n = oscillating colour bands

let hudFocused  = false; // true while cursor is over the HUD overlay
let lastMouseX  = 0;     // frozen when hudFocused so the canvas ignores HUD hover

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  RM = new Float64Array(9);
  updateRotationVector();
  initBuffers();
}

function initBuffers() {
  const N = width * height;
  cx = new Float32Array(N);
  cy = new Float32Array(N);
  cz = new Float32Array(N);
  UVmap = createImage(width, height);
  buildCoordsVector(cx, cy, cz, height, width);
  sphereR = Math.min(width, height) * 0.45;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  initBuffers();
}

function draw() {
  if (!hudFocused) lastMouseX = mouseX;
  const theta = frameCount * rotSpeed + (8 * Math.PI * lastMouseX / width);
  buildRotationMatrix(RM, rotationVector, theta);
  if (mode3D) {
    renderSphere3D(UVmap, RM, sphereR, width / 2, height / 2);
  } else {
    renderSphere(UVmap, RM, cx, cy, cz);
  }
  image(UVmap, 0, 0);
}

function toggle3D() {
  mode3D = !mode3D;
  document.getElementById('mode-btn').textContent = mode3D ? 'Flat map' : '3D sphere';
}

// Recompute rotationVector from spherical coords and refresh the readout.
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

function setAxisTheta(deg) {
  axisTheta = deg * Math.PI / 180;
  updateRotationVector();
}

function setAxisPhi(deg) {
  axisPhi = deg * Math.PI / 180;
  updateRotationVector();
}

function setRotSpeed(val) {
  rotSpeed = parseFloat(val);
}

function setCoordExp(val) {
  coordExp = parseFloat(val);
}

function setCoordExpImag(val) {
  coordExpImag = parseFloat(val);
}

// Complex-power warp on a single coordinate component.
// Real part of sign(v)·|v|^(a+ib) = sign(v)·|v|^a·cos(b·ln|v|).
// At b=0 this is sign(v)·|v|^a; at a=1,b=0 it is the identity.
function warpCoord(v, a, b) {
  if (v === 0) return 0;
  const absv = Math.abs(v);
  return Math.sign(v) * Math.pow(absv, a) * (b === 0 ? 1 : Math.cos(b * Math.log(absv)));
}

// Rodrigues rotation. Pre-scaled by 127.5 so the inner loop can write
// straight to pixels with no shift/scale/floor/constrain.
function buildRotationMatrix(RM, RV, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const t = 1 - c;
  const x = RV.x, y = RV.y, z = RV.z;
  const k = 127.5;

  RM[0] = k * (c + x * x * t);
  RM[1] = k * (x * y * t - z * s);
  RM[2] = k * (x * z * t + y * s);
  RM[3] = k * (y * x * t + z * s);
  RM[4] = k * (c + y * y * t);
  RM[5] = k * (y * z * t - x * s);
  RM[6] = k * (z * x * t - y * s);
  RM[7] = k * (z * y * t + x * s);
  RM[8] = k * (c + z * z * t);
}

function buildCoordsVector(cx, cy, cz, meridiansCount, parallelsCount) {
  for (let j = 0; j < meridiansCount; j++) {
    const meridian = Math.PI * j / (meridiansCount - 1);
    const sinM = Math.sin(meridian);
    const cosM = Math.cos(meridian);
    const rowOffset = parallelsCount * j;
    for (let i = 0; i < parallelsCount; i++) {
      const parallel = (Math.PI * 2) * i / parallelsCount;
      const idx = i + rowOffset;
      cx[idx] = sinM * Math.cos(parallel);
      cy[idx] = sinM * Math.sin(parallel);
      cz[idx] = cosM;
    }
  }
}

// Fused rotate + write. Uint8ClampedArray auto-rounds and clamps to [0,255].
function renderSphere(img, RM, cx, cy, cz) {
  img.loadPixels();
  const pixels = img.pixels;
  const m00 = RM[0], m01 = RM[1], m02 = RM[2];
  const m10 = RM[3], m11 = RM[4], m12 = RM[5];
  const m20 = RM[6], m21 = RM[7], m22 = RM[8];
  const k = 127.5;
  const N = cx.length;
  const a = coordExp, b = coordExpImag;
  const identity = (a === 1 && b === 0);

  for (let i = 0; i < N; i++) {
    const p = i << 2;
    const x = identity ? cx[i] : warpCoord(cx[i], a, b);
    const y = identity ? cy[i] : warpCoord(cy[i], a, b);
    const z = identity ? cz[i] : warpCoord(cz[i], a, b);
    pixels[p]     = m00 * x + m01 * y + m02 * z + k;
    pixels[p + 1] = m10 * x + m11 * y + m12 * z + k;
    pixels[p + 2] = m20 * x + m21 * y + m22 * z + k;
    pixels[p + 3] = 255;
  }
  img.updatePixels();
}

// Ray-sphere intersection: for each pixel shoot an orthographic ray, compute
// the surface normal at the front hit point, then colour it the same way.
function renderSphere3D(img, RM, R, ox, oy) {
  img.loadPixels();
  const pixels = img.pixels;
  const W = img.width, H = img.height;
  const m00 = RM[0], m01 = RM[1], m02 = RM[2];
  const m10 = RM[3], m11 = RM[4], m12 = RM[5];
  const m20 = RM[6], m21 = RM[7], m22 = RM[8];
  const k = 127.5;
  const invR = 1 / R;
  const a = coordExp, b = coordExpImag;
  const identity = (a === 1 && b === 0);

  for (let j = 0; j < H; j++) {
    const rawNy = (j - oy) * invR;
    const rawNy2 = rawNy * rawNy;
    const rowBase = j * W;
    for (let i = 0; i < W; i++) {
      const p = (rowBase + i) << 2;
      const rawNx = (i - ox) * invR;
      const d2 = rawNx * rawNx + rawNy2;
      if (d2 > 1) {
        pixels[p] = pixels[p + 1] = pixels[p + 2] = 0;
        pixels[p + 3] = 255;
      } else {
        const rawNz = Math.sqrt(1 - d2);
        const nx = identity ? rawNx : warpCoord(rawNx, a, b);
        const ny = identity ? rawNy : warpCoord(rawNy, a, b);
        const nz = identity ? rawNz : warpCoord(rawNz, a, b);
        pixels[p]     = m00 * nx + m01 * ny + m02 * nz + k;
        pixels[p + 1] = m10 * nx + m11 * ny + m12 * nz + k;
        pixels[p + 2] = m20 * nx + m21 * ny + m22 * nz + k;
        pixels[p + 3] = 255;
      }
    }
  }
  img.updatePixels();
}
