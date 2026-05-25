/*

 Original code "Accretion" by @XorDev
 https://www.shadertoy.com/view/WcKXDV

 Adapted for p5.js with interactive uniforms.

*/

// These are necessary definitions that let you graphics card know how to render the shader
#ifdef GL_ES
precision highp float;
#endif

// Passed in from p5.js sketch
uniform vec2  iResolution;
uniform float iTime;

// ── Tunable parameters (set via p5 theShader.setUniform) ──────────────────
uniform float iRadialScale;   // Size of the accretion disk ring        (default 5.0)
uniform float iDepthAtten;    // Depth attenuation along the ray         (default 0.2)
uniform float iAngleSquish;   // Vertical compression of the disk        (default 0.2)
uniform float iInitOffset;    // Starting depth offset of the camera ray (default 0.1)
uniform float iTimeSpeed;     // Animation rate multiplier               (default 1.0)
uniform float iColorR;        // Red channel phase in cosine palette     (default 6.0)
uniform float iColorG;        // Green channel phase                     (default 1.0)
uniform float iColorB;        // Blue channel phase                      (default 9.0)

// Custom tanh approximation — WebGL 1.0 has no built-in tanh().
float tanh_approx(float x) {
    x = clamp(x, -3.0, 3.0);
    float x2 = x * x;
    return x * (27.0 + x2) / (27.0 + 9.0 * x2);
}

varying vec2 vTexCoord;

void main() {
    // Map vTexCoord to normalized device coordinates (NDC) [-1, 1]
    vec2 uv = vTexCoord * 2.0 - 1.0;

    // Correct for aspect ratio
    uv.x *= iResolution.x / iResolution.y;

    // ========================
    // Configuration (compile-time constants — loop bounds must be const in WebGL 1.0)
    // ========================
    const int   MAX_STEPS       = 20; // Raymarching steps
    const int   NOISE_ITERS     = 7;  // Fractal noise layers

    // ========================
    // Initialize
    // ========================
    float rayDepth     = 0.0;
    float stepDistance = 0.0;
    vec4  finalColor   = vec4(0.0);

    // Scaled time drives the animation
    float t = iTime * iTimeSpeed;

    // Camera ray direction from the UV coordinates
    vec3 rayDirection = normalize(vec3(uv, 1.0));

    // ========================
    // Raymarching loop
    // ========================
    for (int step = 0; step < MAX_STEPS; step++)
    {
        // Current position along the ray
        vec3 position = rayDepth * rayDirection + iInitOffset;

        // ========================
        // Polar coordinate transformation
        // ========================
        float angle  = atan(position.y / iAngleSquish, position.x) * 2.0;
        float radius = length(position.xy) - iRadialScale - rayDepth * iDepthAtten;
        float height = position.z / 3.0;
        position = vec3(angle, height, radius);

        // ========================
        // Fractal sine-noise displacement (7 octaves)
        // ========================
        for (int n = 1; n <= NOISE_ITERS; n++)
        {
            float ns = float(n);
            vec3 noiseInput = position.yzx * ns + t + 0.3 * float(step);
            position += sin(noiseInput) / ns;
        }

        // ========================
        // Distance estimation
        // ========================
        vec3 surfacePattern = 0.4 * cos(position) - 0.4;
        stepDistance = length(vec4(surfacePattern, position.z));
        rayDepth += stepDistance;

        // ========================
        // Colour accumulation — cosine palette driven by tunable phase offsets
        // ========================
        float colorPhase   = position.x + float(step) * 0.4 + rayDepth;
        vec4  colorPattern = vec4(iColorR, iColorG, iColorB, 0.0);
        finalColor += (1.0 + cos(colorPhase + colorPattern)) / stepDistance;
    }

    // ========================
    // Post-processing: square → tanh tone-map → output
    // ========================
    vec4 processedColor = finalColor * finalColor / 400.0;
    processedColor.r = tanh_approx(processedColor.r);
    processedColor.g = tanh_approx(processedColor.g);
    processedColor.b = tanh_approx(processedColor.b);
    processedColor.a = 1.0;

    gl_FragColor = processedColor;
}
