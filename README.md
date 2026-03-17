# Colourful Attraction

A GPU-accelerated strange attractor rendered in real time with 500,000 particles, built with [p5.js](https://p5js.org/) and WebGL2.

The sketch browses through six distinct attractor types, cross-fading smoothly between them every ~25 seconds. The transition blends the two velocity fields directly on the GPU, so all 500k particles morph organically from one shape into the next without any discontinuity.

## Attractors

| # | Name | Description |
|---|------|-------------|
| 1 | Halvorsen Web | Classic cyclic-sin map with 3-fold rotational symmetry |
| 2 | Cosine Bloom | A pi/2 phase shift opens up rounder, petal-like lobes |
| 3 | Anisotropic Veil | Different forcing frequencies per axis stretch the attractor asymmetrically |
| 4 | Modulated Lattice | Cosine envelope creates nested shells with alternating bright and void bands |
| 5 | Nested Resonance | Frequency-modulated sin argument produces braided, knotted structures |
| 6 | Harmonic Overtones | Fundamental plus phase-offset second harmonic adds finer internal structure |

Each attractor also has its own slowly oscillating damping parameter `b`, which drifts the shape continuously within its type before the next cross-fade begins.

## Live demo

[View on GitHub Pages](https://YOUR_USERNAME.github.io/Colourful-Attraction/)

## Controls

| Input | Action |
|-------|--------|
| Any key | Save screenshot as `.jpg` |

## File structure

```
Colourful-Attraction/
├── index.html      # Entry point (GitHub Pages serves this)
├── style.css       # Full-screen canvas + minimal HUD styling
├── mySketch.js     # p5.js sketch with GLSL shaders and attractor sequencer
├── README.md
└── LICENSE
```

## How the blending works

Each GPU update step computes two velocity vectors for every particle (one from `typeA`, one from `typeB`) and mixes them with a smoothstepped blend factor:

```glsl
vec3 v = mix( vel(typeA, pos, b), vel(typeB, pos, b), blend );
pos += (1.0 / 128.0) * v;
```

The blend factor ramps from 0 to 1 over 8 seconds, driven by a cubic smoothstep on the CPU side. Once the blend finishes, the types are swapped and the cycle continues.

## Running locally

No build step needed. Serve the repo root with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Do not open `index.html` directly via `file://` as the browser will block shader loading due to CORS restrictions.

## Enabling GitHub Pages

1. Push all files to your `main` branch.
2. Go to **Settings > Pages**.
3. Under **Source**, select **Deploy from a branch**, choose `main` / `(root)`, and click **Save**.
4. Your sketch will be live at `https://YOUR_USERNAME.github.io/Colourful-Attraction/` within a minute or two.

## Browser requirements

WebGL2 is required (Chrome, Firefox, Edge, Safari 15+). Mobile support is limited by GPU memory; you can reduce `N` in `mySketch.js` to improve compatibility on lower-end devices.

## License

MIT. See [LICENSE](LICENSE).
