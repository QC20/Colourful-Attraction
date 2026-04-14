# Colourful Attraction

A real-time generative visualization that sends 100,000 particles through a series of mathematical strange attractors, rendered entirely on the GPU with p5.js and WebGL2. The system cycles through twelve distinct attractor types, morphing smoothly between them by blending their underlying velocity fields directly in shader code. No particles are reset or respawned during transitions. The entire swarm reshapes itself organically as one force field fades into the next.

## What You Are Looking At

The screen fills with particles tracing invisible force fields in three-dimensional space. Each force field is a strange attractor, a system of differential equations whose solutions never settle into a fixed point or a simple repeating loop. Instead, they carve out intricate, self-similar structures that exist somewhere between order and chaos. Dense regions glow bright where particles converge, while sparse filaments trail off into darkness.

Everything runs on the GPU. Particle positions are stored in a floating-point texture, and a fragment shader performs twelve Euler integration steps per frame for each particle. A separate vertex shader reads those positions back and renders each one as a small billboard quad. Additive blending with a MAX function means overlapping particles accumulate brightness, giving the forms a volumetric, almost gaseous quality. Depth-based shading adds a sense of three-dimensionality, with particles closer to the viewer appearing brighter than those further away.

## The Attractor Family

All twelve attractors in this project descend from the same mathematical idea. They are variations of a velocity field built on cyclic coordinate permutation, where the x-component of force depends on y, the y-component depends on z, and the z-component depends on x. The simplest version of this looks like

```
dx/dt = sin(y) - b*x
dy/dt = sin(z) - b*y
dz/dt = sin(x) - b*z
```

This system is known as Thomas' cyclically symmetric attractor, originally studied by Rene Thomas in the context of biological feedback loops. The parameter `b` acts as a dissipative term that pulls particles back toward the origin, while the sine functions push them outward and around. When these competing forces find a balance, particle trajectories settle into a structure that folds and wraps through space without ever quite repeating.

<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/Thomas%27_cyclically_symmetric_attractor.png" alt="Thomas cyclically symmetric attractor rendered as a 3D particle trace" width="480">
  <br>
  <em>Thomas' cyclically symmetric attractor. The three-fold rotational symmetry emerges directly from the cyclic<br>permutation of coordinates in the equations. The first attractor in this project uses this exact formulation.</em>
</p>

The first attractor in this project (Halvorsen Web) is essentially this system. From there, each subsequent type introduces a different twist. Some swap cosine for sine to shift the phase. Some apply different frequencies to each axis, stretching the form asymmetrically. Others nest one sine inside another, producing knotted structures reminiscent of frequency modulation in audio synthesis, where the output of one oscillator modulates the pitch of another. And a few use product forms or radial modulation to create lattice-like intersections or concentric shell patterns.

## The Twelve Attractors

| # | Name | What Changes |
|---|------|-------------|
| 1 | Halvorsen Web | The base case. Classic cyclic-sine map with three-fold rotational symmetry |
| 2 | Cosine Bloom | Swaps sine for cosine, shifting the phase by pi/2 and opening up rounder, petal-like lobes |
| 3 | Anisotropic Veil | Applies different forcing frequencies per axis (1.0, 1.7, 0.6), breaking the symmetry and stretching the form |
| 4 | Modulated Lattice | A cosine envelope modulates the amplitude, creating nested shells with alternating bright and void bands |
| 5 | Nested Resonance | Nests one sine inside another's argument, producing braided, knotted structures through frequency modulation |
| 6 | Harmonic Overtones | Adds a second harmonic (2x frequency) with a phase offset, introducing finer internal detail |
| 7 | Triaxial Weave | Multiplies two cyclic sine terms together so force drops to zero on grid planes, producing crystalline lattice intersections |
| 8 | Concentric Shell | Modulates force by radial distance from the origin, making the sign alternate across concentric spherical shells |
| 9 | Recursive Fold | Three levels of nested sine functions. The deepest nesting in the set, creating fractal-like knotted filaments |
| 10 | Hyperbolic Bloom | Uses tanh instead of sine. The hyperbolic tangent saturates at plus/minus 1, producing smoother, denser volumes |
| 11 | Phase Spiral | A quadratic phase shift makes the spiraling position-dependent, creating braided arms that wind tighter near the center |
| 12 | Dual Web | Sums two different cyclic permutations, breaking the strict three-fold symmetry into something more complex |

Each attractor also has its own slowly oscillating damping parameter `b` that drifts the form over time, so the shape is always subtly evolving even before a transition begins.

## Morphing Between Forms

When a transition triggers, the GPU begins computing two velocity vectors for every particle on every integration step. One comes from the current attractor, the other from the next. These two vectors are blended using a factor that ramps from 0 to 1 over 120 frames (roughly two seconds at 60fps).

```glsl
vec3 v = mix(vel(typeA, pos, b), vel(typeB, pos, b), blend);
pos += (1.0 / 128.0) * v;
```

The blend factor passes through a smoothstep function before reaching the shader. Smoothstep is a cubic Hermite curve that starts and ends with zero slope, meaning the transition accelerates gently from standstill, reaches its fastest point at the midway mark, and then decelerates smoothly into the new form. Without this easing, both the start and end of each transition would feel abrupt and mechanical.

<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Smoothstep_and_Smootherstep.svg/400px-Smoothstep_and_Smootherstep.svg.png" alt="Graph comparing smoothstep and smootherstep interpolation curves" width="380">
  <br>
  <em>The smoothstep function (orange) and its higher-order cousin smootherstep (blue). This project uses<br>smoothstep to ease the blend factor between attractor types, avoiding hard starts and stops in transitions.</em>
</p>

The result is that particles never jump or pop. They trace a continuous path from one attractor's orbit into another, and during the brief overlap you can see hybrid forms that don't belong to either attractor alone.

## Making It Your Own

The project is a single JavaScript file with all shaders embedded as strings, so everything is straightforward to find and modify. A few parameters are particularly worth experimenting with.

**Particle count** (`N` at the top of the file, currently 100,000). Pushing this higher creates denser, more detailed structures but demands more from the GPU. On a capable machine you could try 500,000 or more. Dropping it to 20,000 or 30,000 makes it run comfortably on integrated graphics or older hardware. The change affects the perceived materiality of the forms. At low counts the attractor reads as a sparse constellation of points. At high counts it starts to feel more like smoke or plasma.

**Particle size** (`BLOCK_SIZE`, currently 0.008). Making particles larger gives the visualization a bolder, chunkier quality, almost like a pointillist painting. Smaller particles produce finer detail and more photographic depth of field.

**Blend duration** (`BLEND_FRAMES`, currently 120). Longer transitions let you watch the intermediate hybrid forms develop more slowly. Setting this to 300 or 400 frames produces slow, meditative morphs where the in-between states become the main event. Very short values (20-30 frames) give the cycling a snappier, more rhythmic feel.

**The attractor equations themselves**. Each velocity function lives as a few lines of GLSL inside the update shader. If you are comfortable with shader math, try modifying the formulas. Replacing `sin` with `cos` changes the phase relationships. Multiplying coordinates by irrational numbers before passing them to trigonometric functions breaks the symmetry in unexpected ways. Adding a time-varying term can make the attractor breathe or rotate continuously on its own.

**Depth coloring**. The current shader maps depth to luminance (brighter when closer). You could replace this with velocity-magnitude coloring, distance-from-origin gradients, or map HSL hue to one of the spatial axes for a fully chromatic result.

## Controls

| Input | Action |
|-------|--------|
| Left-drag | Orbit the camera around the attractor |
| Right-drag or Shift + Left-drag | Pan the view |
| Scroll wheel | Zoom in and out |
| Ctrl + Scroll | Zoom faster |
| Spacebar | Trigger transition to the next attractor |
| S | Save a screenshot as .jpg |

## Running Locally

No build step or package manager needed. The only dependency is p5.js, loaded from a CDN. Serve the project root with any static file server and open it in a WebGL2-capable browser (Chrome, Firefox, Edge, Safari 15+).

```bash
npx serve .
# or
python3 -m http.server 8080
```

Opening `index.html` directly via `file://` will not work due to browser CORS restrictions on shader loading. On mobile, GPU memory is more limited, so consider reducing the particle count if performance is an issue.

To grab a copy of the project, clone the repository with `git clone https://github.com/QC20/Colourful-Attraction.git`.

## License

MIT. See [LICENSE](LICENSE).
