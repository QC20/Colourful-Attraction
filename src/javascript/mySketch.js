/**
 * Colourful Attraction - Multi-Attractor Edition (Block Particles)
 *
 * Six distinct strange attractors rendered with 100,000 GPU particles,
 * each drawn as a tiny solid white square billboard.
 *
 * Controls:
 *   Left-drag        Orbit (rotate around the attractor)
 *   Right-drag       Pan
 *   Shift + drag     Pan (alternative)
 *   Scroll wheel     Zoom in / out
 *   Spacebar         Cross-fade to next attractor (loops)
 *   S                Save screenshot
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const N         = 100000;
const FB_WIDE   = 1024;
const FB_HIGH   = Math.ceil(N / FB_WIDE);

const BLEND_FRAMES = 60 * 8;   // 8 s cross-fade

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

const BLOCK_SIZE = 0.008;

// ---------------------------------------------------------------------------
// Camera state (arcball orbit + pan + zoom)
// ---------------------------------------------------------------------------

let camRotX   = 0.5;     // pitch
let camRotY   = 0.0;     // yaw
let camDist   = 3.0;     // zoom distance from look-at point
let panX      = 0.0;     // horizontal pan offset
let panY      = 0.0;     // vertical pan offset

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

let oldPos, newPos;
let updateShdr, drawShdr;

let currentType   = 0;
let nextType      = 1;
let blendProgress = 0;
let isBlending    = false;
let b             = 0.17;
let hudOpacity    = 0;
let hudTimer      = 0;

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

vec3 vel0(vec3 p, float b) { return sin(p.yzx) - b * p; }
vec3 vel1(vec3 p, float b) { return cos(p.yzx) - b * p; }
vec3 vel2(vec3 p, float b) { return sin(p.yzx * vec3(1.0, 1.7, 0.6)) - b * p; }
vec3 vel3(vec3 p, float b) { return sin(p.yzx) * (1.0 + 0.5 * cos(p.zxy)) - b * p; }
vec3 vel4(vec3 p, float b) { return sin(p.yzx + 0.8 * sin(p.zxy)) - b * p; }
vec3 vel5(vec3 p, float b) { return 0.7 * sin(p.yzx) + 0.4 * sin(2.0 * p.yzx + 1.0) - b * p; }

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
// GLSL: Draw pass (block billboards)
// ---------------------------------------------------------------------------

const vsDraw = `#version 300 es
precision highp float;
precision highp int;

uniform mat4  uModelViewMatrix;
uniform mat4  uProjectionMatrix;
uniform sampler2D posData;
uniform float b;
uniform float blockSize;

out vec4 vColor;

const vec2 OFFSETS[6] = vec2[6](
  vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
  vec2(-1.0, -1.0), vec2( 1.0,  1.0), vec2(-1.0,  1.0)
);

void main() {
  int particleIdx = gl_VertexID / 6;
  int cornerIdx   = gl_VertexID % 6;

  ivec2 res = textureSize(posData, 0);
  ivec2 ij  = ivec2(particleIdx % res.x, particleIdx / res.x);
  vec4  p   = texelFetch(posData, ij, 0);

  p.xyz *= 1.6 * b;

  vec4 viewPos = uModelViewMatrix * p;

  vec2 off  = OFFSETS[cornerIdx] * blockSize;
  viewPos.x += off.x;
  viewPos.y += off.y;

  gl_Position = uProjectionMatrix * viewPos;

  float depth = clamp((4.5 + viewPos.z) / 2.5, 0.0, 1.0);
  float lum   = pow(depth, 0.8);
  vColor = vec4(vec3(lum), 1.0);
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
  createCanvas(windowWidth, windowHeight, WEBGL);

  updateShdr = createShader(vsUpdate, fsUpdate);
  drawShdr   = createShader(vsDraw, fsDraw);

  const fbOptions = {
    format: FLOAT, depth: false, antialias: false, density: 1,
    width: FB_WIDE, height: FB_HIGH,
  };
  oldPos = createFramebuffer(fbOptions);
  newPos = createFramebuffer(fbOptions);

  oldPos.loadPixels();
  for (let i = 0; i < N; i++) {
    oldPos.pixels[4*i    ] = random(-1, 1);
    oldPos.pixels[4*i + 1] = random(-1, 1);
    oldPos.pixels[4*i + 2] = 2.0 * i / N - 1;
    oldPos.pixels[4*i + 3] = 1.0;
  }
  oldPos.updatePixels();

  hudEl      = document.getElementById('hud');
  hudNameEl  = document.getElementById('hud-name');
  hudIndexEl = document.getElementById('hud-index');
  showHUD(currentType);

  // Prevent context menu on right-click so right-drag pans
  let cnv = document.querySelector('canvas');
  cnv.addEventListener('contextmenu', e => e.preventDefault());

  // Wheel zoom (intercept to prevent page scroll)
  cnv.addEventListener('wheel', handleWheel, { passive: false });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ---------------------------------------------------------------------------
// Mouse: orbit + pan
// ---------------------------------------------------------------------------

function mouseDragged() {
  let dx = mouseX - pmouseX;
  let dy = mouseY - pmouseY;

  if (mouseButton === LEFT && !keyIsDown(SHIFT)) {
    // Orbit
    camRotY += dx * 0.007;
    camRotX += dy * 0.007;
    camRotX = constrain(camRotX, -HALF_PI * 0.95, HALF_PI * 0.95);
  } else {
    // Pan (right-drag or shift+left-drag)
    let factor = camDist * 0.001;
    panX -= dx * factor;
    panY += dy * factor;
  }
}

// ---------------------------------------------------------------------------
// Wheel: zoom
// ---------------------------------------------------------------------------

function handleWheel(e) {
  e.preventDefault();
  if (e.ctrlKey) {
    camDist *= 1 + e.deltaY * 0.01;
  } else {
    camDist *= 1 + e.deltaY * 0.002;
  }
  camDist = constrain(camDist, 0.5, 20.0);
}

function mouseWheel() {}

// ---------------------------------------------------------------------------
// Keyboard: spacebar = next attractor, S = screenshot
// ---------------------------------------------------------------------------

function keyPressed() {
  if (key === ' ') {
    if (!isBlending) {
      nextType = (currentType + 1) % B_PARAMS.length;
      isBlending    = true;
      blendProgress = 0;
    }
    return false; // prevent page scroll
  }
  if (key === 's' || key === 'S') {
    const ts = `${month()}-${day()}_${hour()}-${minute()}-${second()}`;
    save(`img_${ts}.jpg`);
  }
}

// ---------------------------------------------------------------------------
// HUD helpers
// ---------------------------------------------------------------------------

function showHUD(idx) {
  hudTimer = 0;
  updateHUD(idx);
}

function updateHUD(idx) {
  if (!hudEl) return;
  if (hudNameEl)  hudNameEl.textContent  = ATTRACTOR_NAMES[idx];
  if (hudIndexEl) hudIndexEl.textContent = `${idx + 1} / ${B_PARAMS.length}`;
  hudEl.style.opacity = hudOpacity;
}

// ---------------------------------------------------------------------------
// Draw loop
// ---------------------------------------------------------------------------

function draw() {
  const t = frameCount / 60.0;

  // --- Blend sequencing (triggered by spacebar) ---------------------------
  if (isBlending) {
    blendProgress += 1.0 / BLEND_FRAMES;
    if (blendProgress >= 1.0) {
      currentType   = nextType;
      isBlending    = false;
      blendProgress = 0;
      showHUD(currentType);
    }
  }

  const sm = sstep(blendProgress);

  // --- b parameter (oscillates within current attractor) ------------------
  const [bA0, bA1, bA2] = B_PARAMS[currentType];
  const [bB0, bB1, bB2] = B_PARAMS[nextType];
  const bBase = lerpN(bA0, bB0, sm);
  const bAmp  = lerpN(bA1, bB1, sm);
  const bPer  = lerpN(bA2, bB2, sm);
  b = bBase + bAmp * Math.sin(TAU * t / bPer);

  // --- HUD fade: show ~4 s then fade out ---------------------------------
  hudTimer++;
  if      (hudTimer <  60)  hudOpacity = hudTimer / 60;
  else if (hudTimer < 180)  hudOpacity = 1;
  else if (hudTimer < 240)  hudOpacity = 1 - (hudTimer - 180) / 60;
  else                       hudOpacity = 0;

  if (isBlending) hudOpacity = Math.max(0, hudOpacity - 0.03);
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

  // --- Draw pass with manual arcball camera -------------------------------
  let eyeX = panX + camDist * Math.sin(camRotY) * Math.cos(camRotX);
  let eyeY = panY + camDist * Math.sin(camRotX);
  let eyeZ =        camDist * Math.cos(camRotY) * Math.cos(camRotX);

  camera(eyeX, eyeY, eyeZ,  panX, panY, 0,  0, 1, 0);
  perspective(PI / 3, width / height, 0.1, 100);
  background(0);

  const gl = this._renderer.GL;
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.MAX);

  drawShdr.bindShader();
  drawShdr.setUniform('posData',   newPos);
  drawShdr.setUniform('b',         b);
  drawShdr.setUniform('blockSize', BLOCK_SIZE);
  drawShdr.bindTextures();

  gl.drawArrays(gl.TRIANGLES, 0, 6 * N);

  gl.disable(gl.BLEND);
  drawShdr.unbindTextures();
  drawShdr.unbindShader();

  // Swap framebuffers
  const tmp = oldPos; oldPos = newPos; newPos = tmp;
}