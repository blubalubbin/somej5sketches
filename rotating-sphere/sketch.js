let rotationVector;
let cx, cy, cz;          // Float32Array of unit-sphere coords
let UVmap;
let RM;                  // flat 9-entry rotation matrix (scaled by 127.5)

function setup() {
  createCanvas(floor(displayWidth/4*3), floor(displayHeight/5*3));
  pixelDensity(1);

  rotationVector = createVector(Math.sqrt(3) / 3, Math.sqrt(3) / 3, Math.sqrt(3) / 3);

  const N = width * height;
  cx = new Float32Array(N);
  cy = new Float32Array(N);
  cz = new Float32Array(N);
  RM = new Float64Array(9);

  UVmap = createImage(width, height);
  buildCoordsVector(cx, cy, cz, height, width);
}

function draw() {
  const theta = frameCount * 0.01 + (8 * Math.PI * mouseX / width);
  buildRotationMatrix(RM, rotationVector, theta);
  renderSphere(UVmap, RM, cx, cy, cz);
  image(UVmap, 0, 0);
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
