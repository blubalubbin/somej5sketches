// Navier-Stokes fluid simulation with 2^15 particle tracers.
// Based on Jos Stam's "Real-Time Fluid Dynamics for Games" (GDC 2003):
// http://www.dgp.toronto.edu/people/stam/reality/Research/pdf/GDC03.pdf

// ── Simulation parameters (read & set by the UI inline script) ───────────────
let fluidViscosity      = 0.00025; // Fluid thickness; lower = less resistance
let fluidDiffusion      = 0.03;    // How quickly velocity spreads across grid cells
let velocityScaleFactor = 10;      // Amplifies mouse strokes into fluid forces
let maxMouseVelocity    = 10;      // Caps raw mouse speed before applying force
let particleHue         = 180;     // HSV hue of particles (0–360), 180 = cyan
let trailOpacity        = 40;      // Alpha of the per-frame fade rect (lower = longer trails)

// Cached RGB for the particle colour (updated whenever particleHue changes).
let _particleR = 0, _particleG = 255, _particleB = 255;

// ── Setters called by the UI ─────────────────────────────────────────────────
function setViscosity(v)    { fluidViscosity = v; }
function setDiffusion(v)    { fluidDiffusion = v; }
function setForceScale(v)   { velocityScaleFactor = v; }
function setMaxMouse(v)     { maxMouseVelocity = v; }
function setTrailOpacity(v) { trailOpacity = v; }
function setParticleHue(v)  { particleHue = v; _computeParticleColor(); }

function resetAll() {
  fluidViscosity      = 0.00025;
  fluidDiffusion      = 0.03;
  velocityScaleFactor = 10;
  maxMouseVelocity    = 10;
  trailOpacity        = 40;
  particleHue         = 180;
  _computeParticleColor();
}

// ── Settings serialisation (used by share-link + screenshot export) ──────────
function encodeSettings() {
  return [
    'v=' + fluidViscosity,
    'd=' + fluidDiffusion,
    'f=' + velocityScaleFactor,
    'm=' + maxMouseVelocity,
    'h=' + particleHue,
    't=' + trailOpacity,
  ].join('&');
}

function applySettingsFromHash() {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  const params = {};
  for (const kv of hash.split('&')) {
    const i = kv.indexOf('=');
    if (i < 0) continue;
    params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
  }
  if ('v' in params) fluidViscosity      = parseFloat(params.v) || fluidViscosity;
  if ('d' in params) fluidDiffusion      = parseFloat(params.d) || fluidDiffusion;
  if ('f' in params) velocityScaleFactor = parseFloat(params.f) || velocityScaleFactor;
  if ('m' in params) maxMouseVelocity    = parseFloat(params.m) || maxMouseVelocity;
  if ('h' in params) particleHue        = parseFloat(params.h) || particleHue;
  if ('t' in params) trailOpacity       = parseFloat(params.t) || trailOpacity;
  _computeParticleColor();
}

// ── Full-saturation/brightness HSV → RGB ────────────────────────────────────
// Converts hue (0–360) at S=100%, V=100% to (R, G, B) 0–255.
// Cached into _particleR/G/B because the per-frame pixel loop reads them ~32k times.
function _computeParticleColor() {
  const h  = ((particleHue % 360) + 360) % 360;
  const hi = Math.floor(h / 60);
  const f  = h / 60 - hi;
  const V  = 255;
  const p0 = 0;                        // p = V*(1-S) = 0 at full saturation
  const qv = Math.round(V * (1 - f));  // q = V*(1-S*f)
  const tv = Math.round(V * f);        // t = V*(1-S*(1-f))
  switch (hi % 6) {
    case 0: _particleR = V;  _particleG = tv; _particleB = p0; break;
    case 1: _particleR = qv; _particleG = V;  _particleB = p0; break;
    case 2: _particleR = p0; _particleG = V;  _particleB = tv; break;
    case 3: _particleR = p0; _particleG = qv; _particleB = V;  break;
    case 4: _particleR = tv; _particleG = p0; _particleB = V;  break;
    case 5: _particleR = V;  _particleG = p0; _particleB = qv; break;
  }
}

// ── NavierStokesFluidSolver ──────────────────────────────────────────────────
class NavierStokesFluidSolver {
  constructor() {
    const N   = NavierStokesFluidSolver.GRID_SIZE;
    const tot = (N + 2) * (N + 2);
    this.velocityX         = new Float64Array(tot); // Current X-component of fluid velocity
    this.velocityY         = new Float64Array(tot); // Current Y-component of fluid velocity
    this.previousVelocityX = new Float64Array(tot); // Scratch buffer (pressure / divergence)
    this.previousVelocityY = new Float64Array(tot); // Scratch buffer
    this._tmp              = new Float64Array(tot); // Temporary for array swaps
  }

  // Convert 2D grid coordinates (including 1-cell boundary border) to 1D index.
  index(i, j) {
    return i + (NavierStokesFluidSolver.GRID_SIZE + 2) * j;
  }

  // Public velocity accessors (cell 0 = first interior cell, no boundary offset needed).
  getVelocityX(x, y) { return this.velocityX[this.index(x + 1, y + 1)]; }
  getVelocityY(x, y) { return this.velocityY[this.index(x + 1, y + 1)]; }

  // Apply mouse force to a cell; blends with existing velocity for smooth input.
  applyForce(cellX, cellY, forceX, forceY) {
    cellX += 1; // Shift into interior (past boundary cells)
    cellY += 1;
    const idx  = this.index(cellX, cellY);
    const curX = this.velocityX[idx];
    const curY = this.velocityY[idx];
    // lerp(force, current, 0.85): blends 15% new force into 85% existing velocity.
    this.velocityX[idx] = (forceX !== 0) ? forceX + (curX - forceX) * 0.85 : curX;
    this.velocityY[idx] = (forceY !== 0) ? forceY + (curY - forceY) * 0.85 : curY;
  }

  // Advance the fluid state by one time step.
  updateSimulation(timeStep, viscosity) {
    this._updateVelocity(
      this.velocityX, this.velocityY,
      this.previousVelocityX, this.previousVelocityY,
      viscosity, timeStep
    );
  }

  // ── Internal solver steps ────────────────────────────────────────────────

  _swapArrays(a, b) {
    this._tmp.set(a);
    a.set(b);
    b.set(this._tmp);
  }

  // Diffuse a scalar field via Gauss-Seidel relaxation (20 iterations).
  _diffuse(boundaryType, current, previous, diffusionRate, timeStep) {
    const N     = NavierStokesFluidSolver.GRID_SIZE;
    const k     = timeStep * diffusionRate * N * N;
    const denom = 1 + 4 * k;
    for (let iter = 0; iter < 20; iter++) {
      for (let i = 1; i <= N; i++) {
        for (let j = 1; j <= N; j++) {
          current[this.index(i, j)] = (
            previous[this.index(i, j)] + k * (
              current[this.index(i - 1, j)] + current[this.index(i + 1, j)] +
              current[this.index(i, j - 1)] + current[this.index(i, j + 1)]
            )
          ) / denom;
        }
      }
      this._setBoundaryConditions(boundaryType, current);
    }
  }

  // Advect a field along the velocity field (back-trace, bilinear interpolation).
  _advect(boundaryType, current, previous, velX, velY, timeStep) {
    const N   = NavierStokesFluidSolver.GRID_SIZE;
    const dt0 = timeStep * N;
    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= N; j++) {
        let x = i - dt0 * velX[this.index(i, j)];
        let y = j - dt0 * velY[this.index(i, j)];
        if (x < 0.5)     x = 0.5;
        if (x > N + 0.5) x = N + 0.5;
        const i0 = Math.trunc(x), i1 = i0 + 1;
        if (y < 0.5)     y = 0.5;
        if (y > N + 0.5) y = N + 0.5;
        const j0 = Math.trunc(y), j1 = j0 + 1;
        const s1 = x - i0, s0 = 1 - s1;
        const t1 = y - j0, t0 = 1 - t1;
        current[this.index(i, j)] =
          s0 * (t0 * previous[this.index(i0, j0)] + t1 * previous[this.index(i0, j1)]) +
          s1 * (t0 * previous[this.index(i1, j0)] + t1 * previous[this.index(i1, j1)]);
      }
    }
    this._setBoundaryConditions(boundaryType, current);
  }

  // Enforce boundary conditions: negate normal component at walls, average corners.
  _setBoundaryConditions(boundaryType, arr) {
    const N = NavierStokesFluidSolver.GRID_SIZE;
    for (let i = 1; i <= N; i++) {
      arr[this.index(0,     i)] = (boundaryType === 1) ? -arr[this.index(1, i)] : arr[this.index(1, i)];
      arr[this.index(N + 1, i)] = (boundaryType === 1) ? -arr[this.index(N, i)] : arr[this.index(N, i)];
      arr[this.index(i,     0)] = (boundaryType === 2) ? -arr[this.index(i, 1)] : arr[this.index(i, 1)];
      arr[this.index(i, N + 1)] = (boundaryType === 2) ? -arr[this.index(i, N)] : arr[this.index(i, N)];
    }
    arr[this.index(0,     0)]     = 0.5 * (arr[this.index(1, 0)]     + arr[this.index(0, 1)]);
    arr[this.index(0,     N + 1)] = 0.5 * (arr[this.index(1, N + 1)] + arr[this.index(0, N)]);
    arr[this.index(N + 1, 0)]     = 0.5 * (arr[this.index(N, 0)]     + arr[this.index(N + 1, 1)]);
    arr[this.index(N + 1, N + 1)] = 0.5 * (arr[this.index(N, N + 1)] + arr[this.index(N + 1, N)]);
  }

  // Diffuse velocities then remove divergence to enforce incompressibility.
  _updateVelocity(velX, velY, prevVelX, prevVelY, viscosity, timeStep) {
    // Diffuse in-place (Gauss-Seidel; same array for current and previous is intentional).
    this._diffuse(1, velX, velX, viscosity, timeStep);
    this._diffuse(2, velY, velY, viscosity, timeStep);
    // Project to make the field divergence-free (prevVelX/Y used as pressure/divergence scratch).
    this._projectVelocity(velX, velY, prevVelX, prevVelY);
  }

  // Hodge decomposition: subtract the gradient of pressure to zero out divergence.
  _projectVelocity(velX, velY, pressure, divergence) {
    const N = NavierStokesFluidSolver.GRID_SIZE;
    const h = 1.0 / N; // Cell size in normalised coordinates
    // Compute divergence and initialise pressure to zero.
    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= N; j++) {
        divergence[this.index(i, j)] = -0.5 * h * (
          velX[this.index(i + 1, j)] - velX[this.index(i - 1, j)] +
          velY[this.index(i, j + 1)] - velY[this.index(i, j - 1)]
        );
        pressure[this.index(i, j)] = 0;
      }
    }
    this._setBoundaryConditions(0, divergence);
    this._setBoundaryConditions(0, pressure);
    // Solve for pressure via Gauss-Seidel (20 iterations).
    for (let iter = 0; iter < 20; iter++) {
      for (let i = 1; i <= N; i++) {
        for (let j = 1; j <= N; j++) {
          pressure[this.index(i, j)] = (
            divergence[this.index(i, j)] +
            pressure[this.index(i - 1, j)] + pressure[this.index(i + 1, j)] +
            pressure[this.index(i, j - 1)] + pressure[this.index(i, j + 1)]
          ) / 4;
        }
      }
      this._setBoundaryConditions(0, pressure);
    }
    // Subtract pressure gradient to recover divergence-free velocity.
    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= N; j++) {
        velX[this.index(i, j)] -= 0.5 * (pressure[this.index(i + 1, j)] - pressure[this.index(i - 1, j)]) / h;
        velY[this.index(i, j)] -= 0.5 * (pressure[this.index(i, j + 1)] - pressure[this.index(i, j - 1)]) / h;
      }
    }
    this._setBoundaryConditions(1, velX);
    this._setBoundaryConditions(2, velY);
  }
}
NavierStokesFluidSolver.GRID_SIZE = 16; // 16×16 fluid grid (+ 2-cell boundary)

// ── p5.js sketch ─────────────────────────────────────────────────────────────
const NUM_PARTICLES = 1 << 15; // 32 768 particle tracers

let fluidSolver;
let particles;
let _prevMouseX = 1, _prevMouseY = 1;
let _particleVelocityScale;

function setup() {
  createCanvas(768, 768);
  pixelDensity(1); // Keep 1:1 logical/physical pixels for the pixel-array loop
  background(0);

  fluidSolver = new NavierStokesFluidSolver();
  particles   = Array.from({ length: NUM_PARTICLES }, () => ({
    x: Math.random() * 768,
    y: Math.random() * 768,
  }));
  _computeParticleColor(); // Derive RGB from the default particleHue
  applySettingsFromHash(); // Load any hash-encoded settings from the URL
}

function draw() {
  _updateMouseInteraction();
  _clearCanvas();

  const dt = 1.0 / max(frameRate(), 1);
  fluidSolver.updateSimulation(dt, fluidViscosity);
  _particleVelocityScale = velocityScaleFactor * 60.0 / max(frameRate(), 1);
  _renderParticles();
}

// Draw a semi-transparent dark rectangle to fade the previous frame.
// Lower trailOpacity → slower fade → longer motion trails.
function _clearCanvas() {
  noStroke();
  fill(0, 0, 0, trailOpacity);
  rect(0, 0, width, height);
}

// Advance each particle along the interpolated velocity field, then draw it
// directly into the pixel buffer (much faster than calling set() per particle).
function _renderParticles() {
  const N     = NavierStokesFluidSolver.GRID_SIZE;
  const cellW = width  / N;
  const cellH = height / N;

  loadPixels(); // Snapshot the current canvas (including the fade rect) into pixels[]

  for (let pi = 0; pi < NUM_PARTICLES; pi++) {
    const p = particles[pi];

    // Grid cell containing this particle
    const cellX = floor(p.x / cellW);
    const cellY = floor(p.y / cellH);

    // Fluid velocity at the cell centre
    let vx = fluidSolver.getVelocityX(cellX, cellY);
    let vy = fluidSolver.getVelocityY(cellX, cellY);

    // Sub-cell offset (for bilinear interpolation towards neighbouring cells)
    const localX = p.x - cellX * cellW - cellW * 0.5;
    const localY = p.y - cellY * cellH - cellH * 0.5;

    const nbrX = (localX > 0) ? Math.min(N - 1, cellX + 1) : Math.max(0, cellX - 1);
    const nbrY = (localY > 0) ? Math.min(N - 1, cellY + 1) : Math.max(0, cellY - 1);
    const xDir = (localX > 0) ? 1 : -1;
    const yDir = (localY > 0) ? 1 : -1;

    const vxNX  = fluidSolver.getVelocityX(nbrX,  cellY);
    const vxNY  = fluidSolver.getVelocityX(cellX, nbrY);
    const vxNXY = fluidSolver.getVelocityX(nbrX,  nbrY);
    const vyNX  = fluidSolver.getVelocityY(nbrX,  cellY);
    const vyNY  = fluidSolver.getVelocityY(cellX, nbrY);
    const vyNXY = fluidSolver.getVelocityY(nbrX,  nbrY);

    const tx = xDir * localX / cellW;
    const ty = yDir * localY / cellH;
    // Bilinear interpolation in both axes
    vx = lerp(lerp(vx, vxNX, tx), lerp(vxNY, vxNXY, tx), ty);
    vy = lerp(lerp(vy, vyNX, tx), lerp(vyNY, vyNXY, tx), ty);

    p.x += vx * _particleVelocityScale;
    p.y += vy * _particleVelocityScale;

    // Respawn off-screen particles at a random position
    if (p.x < 0 || p.x >= width)  { p.x = Math.random() * width;  continue; }
    if (p.y < 0 || p.y >= height) { p.y = Math.random() * height; continue; }

    // Write directly to the pixel buffer (avoids per-call overhead of set())
    const px  = Math.trunc(p.x);
    const py  = Math.trunc(p.y);
    const idx = 4 * (py * width + px);
    pixels[idx]     = _particleR;
    pixels[idx + 1] = _particleG;
    pixels[idx + 2] = _particleB;
    pixels[idx + 3] = 255;
  }

  updatePixels(); // Write the modified pixel buffer back to the canvas
}

// Convert mouse movement into a velocity impulse on the grid cell under the cursor.
function _updateMouseInteraction() {
  const mX = max(1, mouseX);
  const mY = max(1, mouseY);

  // Pause the canvas push while the user is working a slider/button, so adjusting
  // controls never disturbs the flow. Keep prevMouse current to avoid a jump when
  // interaction resumes.
  if (window.SketchUI && SketchUI.controlsBusy && SketchUI.controlsBusy()) {
    _prevMouseX = mX;
    _prevMouseY = mY;
    return;
  }

  const N     = NavierStokesFluidSolver.GRID_SIZE;
  const cellW = width  / N;
  const cellH = height / N;

  let dvX = mX - _prevMouseX;
  let dvY = mY - _prevMouseY;

  // Clamp raw mouse speed so extreme fast swipes don't blow up the simulation.
  const spd = Math.sqrt(dvX * dvX + dvY * dvY);
  if (spd > maxMouseVelocity) {
    dvX = (dvX / spd) * maxMouseVelocity;
    dvY = (dvY / spd) * maxMouseVelocity;
  }

  const cellX = floor(mX / cellW);
  const cellY = floor(mY / cellH);
  fluidSolver.applyForce(cellX, cellY, dvX, dvY);

  _prevMouseX = mX;
  _prevMouseY = mY;
}
