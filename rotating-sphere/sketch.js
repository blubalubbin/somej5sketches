let rotationVector;
let cx, cy, cz;          // Float32Array of unit-sphere coords (flat equirectangular mode)
let UVmap;
let RM;                  // flat 9-entry rotation matrix (scaled by 127.5)
let mode3D = false;
let sphereR;             // pixel radius used in 3D mode

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  rotationVector = createVector(Math.sqrt(3) / 3, Math.sqrt(3) / 3, Math.sqrt(3) / 3);
  RM = new Float64Array(9);

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
  const theta = frameCount * 0.01 + (8 * Math.PI * mouseX / width);
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
  const btn = document.getElementById('mode-btn');
  btn.textContent = mode3D ? 'Flat map' : '3D sphere';
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

  for (let i = 0; i < N; i++) {
    const x = cx[i], y = cy[i], z = cz[i];
    const p = i << 2;
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

  for (let j = 0; j < H; j++) {
    const ny = (j - oy) * invR;
    const ny2 = ny * ny;
    const rowBase = j * W;
    for (let i = 0; i < W; i++) {
      const p = (rowBase + i) << 2;
      const nx = (i - ox) * invR;
      const d2 = nx * nx + ny2;
      if (d2 > 1) {
        pixels[p] = pixels[p + 1] = pixels[p + 2] = 0;
        pixels[p + 3] = 255;
      } else {
        const nz = Math.sqrt(1 - d2);
        pixels[p]     = m00 * nx + m01 * ny + m02 * nz + k;
        pixels[p + 1] = m10 * nx + m11 * ny + m12 * nz + k;
        pixels[p + 2] = m20 * nx + m21 * ny + m22 * nz + k;
        pixels[p + 3] = 255;
      }
    }
  }
  img.updatePixels();
}
