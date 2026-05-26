/*

 Original code "Starship" by @XorDev
 https://www.shadertoy.com/view/l3cfW4

 Inspired by the debris from SpaceX's 7th Starship test. Fifty point-light
 "particles" are walked across the screen; each one flashes exponentially,
 smears into a long trail and is tinted by a per-channel sine, then the whole
 field is "tanh" tone-mapped over a sky gradient.

 Adapted for p5.js with interactive uniforms. Two WebGL-1.0 substitutions vs the
 ShaderToy original:
   • iChannel0 (a noise texture sampled for the trails' cloudy depth) is replaced
     by the procedural value-noise below — no texture dependency.
   • tanh() / a dynamic float loop bound are unavailable, so we use a rational
     tanh approximation and a const-bounded loop with an early break.

*/

#ifdef GL_ES
precision highp float;
#endif

// Passed in from the p5.js sketch
uniform vec2  iResolution;
uniform float iTime;

// ── Tunable parameters (set via p5 theShader.setUniform) ──────────────────
uniform float iTimeSpeed;   // Animation rate multiplier              (default 1.0)
uniform float iCount;       // Number of debris particles (1..50)     (default 50.0)
uniform float iExposure;    // Brightness of the accumulated light     (default 1.0)
uniform float iColorR;      // Red channel colour frequency            (default 1.0)
uniform float iColorG;      // Green channel colour frequency          (default 2.0)
uniform float iColorB;      // Blue channel colour frequency           (default 3.0)

varying vec2 vTexCoord;

// Per-component tanh approximation — WebGL 1.0 has no built-in tanh().
// Rational (Padé) fit, exact at the clamp edges so it saturates to +/-1.
vec4 tanh4(vec4 v) {
    v = clamp(v, -3.0, 3.0);
    vec4 v2 = v * v;
    return v * (27.0 + v2) / (27.0 + 9.0 * v2);
}

// Procedural value noise standing in for ShaderToy's iChannel0 noise texture.
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);           // smoothstep interpolation
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    vec2 r = iResolution.xy;
    // Reconstruct ShaderToy's fragCoord (bottom-left origin) from vTexCoord.
    vec2 I = vec2(vTexCoord.x, 1.0 - vTexCoord.y) * r;
    // Center, rotate and scale (the original's mat2(3,4,4,-3) / 1e2).
    vec2 p = (I + I - r) / r.y * mat2(3.0, 4.0, 4.0, -3.0) / 1e2;

    // Time, trailing time, colour frequencies and the accumulated sum.
    float t = iTime * iTimeSpeed;
    float T = 0.1 * t + p.y;
    vec3  colf = vec3(iColorR, iColorG, iColorB);
    vec4  S = vec4(0.0);

    // Iterate through up to 50 particles (const bound + early break for WebGL 1.0).
    for (int idx = 0; idx < 50; idx++) {
        if (float(idx) >= iCount) break;
        float i = float(idx) + 1.0;     // i = 1 .. 50, matching the original i++

        // Shift this particle's position. Frequencies (1,3) distribute x/y
        // independently; i*i hides the sine periods; T drags it along with time.
        p += 0.02 * cos(i * (vec2(1.0, 3.0) + 8.0 + i) + T + T);

        // Colour: sine gives an index in [-1,1] per channel; +1 keeps it positive.
        vec4 col = cos(sin(i) * vec4(colf, 0.0)) + 1.0;

        // Flashing brightness fluxuates exponentially between 1/e and e.
        float flash = exp(sin(i + i * T));

        // Trail with attenuating point-light falloff. max() scales the +/-
        // directions independently: x is squished for a long trail, y is
        // stretched (divisor from noise) for a cloudy glare.
        vec2  nuv = p / exp(sin(i)) + vec2(i, t) / 8.0;
        float n   = vnoise(nuv) * 40.0;
        float fall = length(max(p, p / vec2(2.0, n)));

        S += col * flash / fall / 1e4;
    }

    // Add sky background gradient (p.x * (C-1)) and "tanh" tone-map. Force the
    // alpha opaque so the buffer composites like ShaderToy's RGB display.
    vec4 outc = tanh4(p.x * (vec4(1.0, 2.0, 3.0, 0.0) - 1.0) + S * S * iExposure);
    gl_FragColor = vec4(outc.rgb, 1.0);
}
