/**
 * Colourful Attraction - Multi-Attractor Edition
 *
 * Six distinct strange attractors rendered with 500,000 GPU particles.
 * Every ~25 seconds the sketch cross-fades to the next attractor by
 * blending the two velocity fields on the GPU, so particles organically
 * morph from one shape into the next without any discontinuity.
 *
 * Press any key to save a screenshot.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const N         = 500000;
const FB_WIDE   = 1024;
const FB_HIGH   = Math.ceil(N / FB_WIDE);

// How long (frames at ~60 fps) to hold each attractor before fading
const HOLD_FRAMES  = 60 * 25;  // 25 s dwell
const BLEND_FRAMES = 60 * 8;   //  8 s cross-fade

/**
 * b controls damping/contraction.
 * Each attractor oscillates: b = base + amp * sin(TAU * t / period)
 * Format: [base, amplitude, period_in_seconds]
 */
const B_PARAMS = [
  [0.17, 0.050, 37.0],   // 0  Halvorsen Web
  [0.16, 0.050, 41.0],   // 1  Cosine Bloom
  [0.18, 0.040, 29.0],   // 2  Anisotropic Veil
  [0.15, 0.060, 53.0],   // 3  Modulated Lattice
  [0.19, 0.040, 43.0],   // 4  Nested Resonance
  [0.17, 0.050, 31.0],   // 5  Harmonic Overtones
];

const ATTRACTOR_NAMES = [
  'Halvorsen Web',
  'Cosine Bloom',
  'Anisotropic Veil',
  'Modulated Lattice',
  'Nested Resonance',
  'Harmonic Overtones',
];

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

let oldPos, newPos;
let updateShdr, drawShdr;

let currentType   = 0;
let nextType      = 1;
let blendProgress = 0;    // 0 = fully currentType, 1 = fully nextType
let holdTimer     = 0;
let isBlending    = false;
let b             = 0.17;
let hudOpacity    = 0;

// Cached DOM handles
let hudEl, hudNameEl, hudIndexEl;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sstep(x) {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3.0 - 2.0 * x);
}

function lerpN(a, b, t) {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// GLSL: Update pass
// Advances every particle one step along the blended velocity field.
// ---------------------------------------------------------------------------

const vsUpdate = `#version 300 es
precision highp float;
precision highp int;
void main() {
  gl_Position = vec4( 4*ivec2(gl_VertexID&1, gl_VertexID&2)-1, 0., 1. );
}
`;

const fsUpdate = `#version 300 es
precision highp float;

uniform sampler2D data;
uniform float b;
uniform int   typeA;
uniform int   typeB;
uniform float blend;

out vec4 fragColor;

// 0  Halvorsen Web -------------------------------------------------------
// Classic cyclic-sin map with 3-fold rotational symmetry.
// Produces an interlocking web of curved filaments.
vec3 vel0(vec3 p, float b) {
  return sin(p.yzx) - b * p;
}

// 1  Cosine Bloom --------------------------------------------------------
// A pi/2 phase shift completely changes the fixed-point topology,
// opening up rounder, petal-like lobes.
vec3 vel1(vec3 p, float b) {
  return cos(p.yzx) - b * p;
}

// 2  Anisotropic Veil ----------------------------------------------------
// Different forcing frequencies per axis stretch the attractor
// asymmetrically into elongated, draped curtain-like forms.
vec3 vel2(vec3 p, float b) {
  return sin(p.yzx * vec3(1.0, 1.7, 0.6)) - b * p;
}

// 3  Modulated Lattice ---------------------------------------------------
// A cosine envelope multiplies the base field, creating nested
// shells of density with alternating bright and void bands.
vec3 vel3(vec3 p, float b) {
  return sin(p.yzx) * (1.0 + 0.5 * cos(p.zxy)) - b * p;
}

// 4  Nested Resonance ----------------------------------------------------
// Frequency modulation: the sin argument is itself warped by a second
// sin, producing intricate braided and knotted structures.
vec3 vel4(vec3 p, float b) {
  return sin(p.yzx + 0.8 * sin(p.zxy)) - b * p;
}

// 5  Harmonic Overtones --------------------------------------------------
// Fundamental plus a phase-offset second harmonic. The interference
// pattern adds finer internal structure without breaking global form.
vec3 vel5(vec3 p, float b) {
  return 0.7 * sin(p.yzx) + 0.4 * sin(2.0 * p.yzx + 1.0) - b * p;
}

vec3 vel(int t, vec3 p, float b) {
  if      (t == 0) return vel0(p, b);
  else if (t == 1) return vel1(p, b);
  else if (t == 2) return vel2(p, b);
  else if (t == 3) return vel3(p, b);
  else if (t == 4) return vel4(p, b);
  else             return vel5(p, b);
}

void main() {
  vec3 pos = texelFetch(data, ivec2(gl_FragCoord.xy), 0).xyz;
  for (int i = 0; i < 12; i++) {
    vec3 v = mix( vel(typeA, pos, b), vel(typeB, pos, b), blend );
    pos += (1.0 / 128.0) * v;
  }
  fragColor = vec4(pos, 1.0);
}
`;

// ---------------------------------------------------------------------------
// GLSL: Draw pass
// Renders a coloured line segment per particle between old and new position.
// ---------------------------------------------------------------------------

const vsDraw = `#version 300 es
precision highp float;
precision highp int;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform sampler2D dataA;
uniform sampler2D dataB;
uniform int   N;
uniform float b;

out vec4 vColor;

vec3 hsb2rgb(in vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0, 0.0, 1.0);
  rgb = rgb * rgb * (3.0 - 2.0*rgb);
  return c.z * mix(vec3(1.0), rgb, c.y);
}

void main() {
  ivec2 res = textureSize(dataA, 0);
  int   idx = gl_VertexID / 2;
  ivec2 ij  = ivec2(idx % res.x, idx / res.x);
  vec4 p0   = texelFetch(dataA, ij, 0);
  vec4 p1   = texelFetch(dataB, ij, 0);
  vec4 p    = ((gl_VertexID & 1) > 0) ? p0 : p1;
  p.xyz    *= 1.6 * b;
  p         = uModelViewMatrix * p;
  gl_Position = uProjectionMatrix * p;
  float u = float(gl_VertexID) / float(N);
  vec3 c  = hsb2rgb(vec3(u, 0.7, pow(clamp((4.5 + p.z) / 2.5, 0.0, 1.0), 1.0)));
  vColor  = vec4(c, 1.0);
}
`;

const fsDraw = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 fragColor;
void main() { fragColor = vColor; }
`;

// ---------------------------------------------------------------------------
// p5.js lifecycle
// ---------------------------------------------------------------------------

function setup() {
  createCanvas(windowHeight * 4 / 3, windowHeight, WEBGL);

  updateShdr = createShader(vsUpdate, fsUpdate);
  drawShdr   = createShader(vsDraw, fsDraw);

  const fbOptions = {
    format: FLOAT, depth: false, antialias: false, density: 1,
    width: FB_WIDE, height: FB_HIGH,
  };
  oldPos = createFramebuffer(fbOptions);
  newPos = createFramebuffer(fbOptions);

  // Seed: xy random in [-1, 1], z encodes normalised particle index for hue
  oldPos.loadPixels();
  for (let i = 0; i < N; i++) {
    oldPos.pixels[4*i    ] = random(-1, 1);
    oldPos.pixels[4*i + 1] = random(-1, 1);
    oldPos.pixels[4*i + 2] = 2.0 * i / N - 1;
    oldPos.pixels[4*i + 3] = 1.0;
  }
  oldPos.updatePixels();

  // Cache DOM handles
  hudEl      = document.getElementById('hud');
  hudNameEl  = document.getElementById('hud-name');
  hudIndexEl = document.getElementById('hud-index');
  updateHUD(currentType);
}

function windowResized() {
  resizeCanvas(windowHeight * 4 / 3, windowHeight);
}

function draw() {
  const t = frameCount / 60.0;

  // --- Attractor sequencing -------------------------------------------
  holdTimer++;

  if (!isBlending && holdTimer >= HOLD_FRAMES) {
    isBlending    = true;
    blendProgress = 0;
  }

  if (isBlending) {
    blendProgress += 1.0 / BLEND_FRAMES;
    if (blendProgress >= 1.0) {
      // Blend complete: advance the sequence
      currentType   = nextType;
      nextType      = (nextType + 1) % B_PARAMS.length;
      isBlending    = false;
      holdTimer     = 0;
      blendProgress = 0;   // reset so sm=0 means "fully currentType"
    }
  }

  const sm = sstep(blendProgress);   // smooth blend factor for GPU

  // --- Blended b ----------------------------------------------------------
  const [bA0, bA1, bA2] = B_PARAMS[currentType];
  const [bB0, bB1, bB2] = B_PARAMS[nextType];
  const bBase = lerpN(bA0, bB0, sm);
  const bAmp  = lerpN(bA1, bB1, sm);
  const bPer  = lerpN(bA2, bB2, sm);
  b = bBase + bAmp * Math.sin(TAU * t / bPer);

  // --- HUD: fade in for first 3 s of each dwell, then fade out ------------
  if (!isBlending) {
    if      (holdTimer <  60)  hudOpacity = holdTimer / 60;
    else if (holdTimer < 180)  hudOpacity = 1;
    else if (holdTimer < 240)  hudOpacity = 1 - (holdTimer - 180) / 60;
    else                       hudOpacity = 0;
  } else {
    hudOpacity = Math.max(0, hudOpacity - 0.025);
  }
  updateHUD(currentType);

  // --- GPU update pass ----------------------------------------------------
  newPos.begin();
  updateShdr.bindShader();
  updateShdr.setUniform('data',  oldPos);
  updateShdr.setUniform('b',     b);
  updateShdr.setUniform('typeA', currentType);
  updateShdr.setUniform('typeB', nextType);
  updateShdr.setUniform('blend', sm);
  updateShdr.bindTextures();
  const glUpd = newPos.gl;
  glUpd.drawArrays(glUpd.TRIANGLES, 0, 3);
  updateShdr.unbindTextures();
  updateShdr.unbindShader();
  newPos.end();

  // --- Draw pass ----------------------------------------------------------
  camera(0, 0, -3,  0, 0.1, 0,  0, 1, 0);
  perspective(PI / 3, width / height, 1, 10);
  rotateX(0.5);
  rotateY(TAU * 0.05 * t);
  background(0);

  const gl = this._renderer.GL;
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.MAX);
  gl.lineWidth(0.5);

  drawShdr.bindShader();
  drawShdr.setUniform('dataA', oldPos);
  drawShdr.setUniform('dataB', newPos);
  drawShdr.setUniform('N',     N);
  drawShdr.setUniform('b',     b);
  drawShdr.bindTextures();
  gl.drawArrays(gl.LINES, 0, 2 * N);
  gl.disable(gl.BLEND);
  drawShdr.unbindTextures();
  drawShdr.unbindShader();

  // Swap framebuffers
  const tmp = oldPos; oldPos = newPos; newPos = tmp;
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function updateHUD(idx) {
  if (!hudEl) return;
  if (hudNameEl)  hudNameEl.textContent  = ATTRACTOR_NAMES[idx];
  if (hudIndexEl) hudIndexEl.textContent = `${idx + 1} / ${B_PARAMS.length}`;
  hudEl.style.opacity = hudOpacity;
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

function keyPressed() {
  const ts = `${month()}-${day()}_${hour()}-${minute()}-${second()}`;
  save(`img_${ts}.jpg`);
}
