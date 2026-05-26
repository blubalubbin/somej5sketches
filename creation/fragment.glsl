/*

 Original "Creation" by Silexars (Danilo Guanabara)
 https://www.shadertoy.com/view/XsXXDn

 Adapted for p5.js with interactive uniforms. The original packs the whole
 effect into a 3-iteration loop (one per colour channel): each ripples the UV
 outward from centre, then accumulates a glowing line through a tiled grid.

*/

#ifdef GL_ES
precision highp float;
#endif

// Passed in from the p5.js sketch
uniform vec2  iResolution;
uniform float iTime;

// ── Tunable parameters (set via p5 theShader.setUniform) ──────────────────
uniform float iTimeSpeed;   // Animation rate multiplier        (default 1.0)
uniform float iLayerPhase;  // Per-channel phase offset (the 0.07 z step) (default 0.07)
uniform float iRippleFreq;  // Radial ripple frequency          (default 9.0)
uniform float iGlow;        // Line glow / brightness           (default 0.01)
uniform float iExposure;    // Overall output exposure          (default 1.0)

varying vec2 vTexCoord;

void main() {
    vec3 c;
    float l, z = iTime * iTimeSpeed;
    for (int i = 0; i < 3; i++) {
        // vTexCoord is 0..1 across the canvas — the p5 equivalent of
        // fragCoord.xy / iResolution in the ShaderToy original.
        vec2 uv, p = vTexCoord;
        uv = p;
        p -= 0.5;
        p.x *= iResolution.x / iResolution.y;   // aspect correction
        z += iLayerPhase;
        l = length(p);
        uv += p / l * (sin(z) + 1.0) * abs(sin(l * iRippleFreq - z - z));
        c[i] = iGlow / length(mod(uv, 1.0) - 0.5);
    }
    gl_FragColor = vec4(c / l * iExposure, 1.0);
}
