# Karl Adrian Bensi — Portfolio

Personal portfolio for Karl Adrian Bensi, BSCpE student and full stack developer. The theme is outer space with a light cybersecurity layer:

- **Intro** — the Big Bang: a singularity gathers matter, then a flash and shockwave blast out the first stars. The letters of KARL fly out of the explosion with an RGB split, glitch-decrypt into PORTFOLIO, and stars stream in to assemble a black-and-white dot portrait behind the title. It stays made of stars: they push away from the cursor, get a periodic scan sweep, and scatter as you scroll away.
- **Galaxy** — a real-time Three.js spiral galaxy (GPU-animated, differential rotation, nebula clouds, a radar pulse) sits behind the page. The camera follows a path as you scroll and drifts with the mouse; it dims behind each section so content leads.
- **Backdrop life** — an astronaut in NASA's EVA suit drifts beside each section on a glowing data tether. Grab him with the mouse and throw him (he tumbles, then the tether reels him back), tap him on a phone to send him spinning; in the Projects voyage he floats in the open corner beside each planet, clear of the project details. Around him: Hubble-palette gas clouds, stars with diffraction spikes, asteroids, a satellite, shooting stars and drifting dust, kept to the open edges so the text stays readable.
- **Navigation** — nav links jump through hyperspace instead of scrolling past every section, and "Back to orbit" blows the page up in a supernova and replays the Big Bang.
- **Sections** — a scroll word-reveal and a crew ID card that tilts and flips (About), an interactive orbital system plus a tech ticker (Skills), a scroll-driven voyage where every project is its own planet and you warp between them (Projects), and a magnetic email button that sends the galaxy into warp (Contact).

Built with React, Vite, Tailwind CSS, [Motion](https://motion.dev) and [Three.js](https://threejs.org).

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Edit the content

Name, bio, contact links, projects and skills live in [`src/data/content.ts`](src/data/content.ts). In the bio, wrap text in `**double asterisks**` to highlight it. A project's `status` can be `"live"` or `"wip"` (shows the amber "In development" badge).

There are two photos. [`public/karl-grad.webp`](public/karl-grad.webp) is the graduation portrait, cut out with a transparent background; the hero redraws it as an interactive black-and-white dot portrait behind the title. [`public/karl-full.webp`](public/karl-full.webp) is shown whole on the crew card in About (its panel uses `aspect-[416/952]`, so update that if you swap in a photo with a different shape).

### Project previews

Each project also has a `planet` (name and colour palette) for its stop in the voyage; set `wip: true` in the palette to give a planet the amber "under construction" ring.

Each project has a `preview` key that picks a component in [`src/components/previews/index.tsx`](src/components/previews/index.tsx):

| Preview | What it shows |
| --- | --- |
| `kuryentipid` | A real screenshot of the live site ([`public/projects/kuryentipid.webp`](public/projects/kuryentipid.webp)) |
| `sugbo`, `planado`, `minutemeeting`, `pantawid`, `clinic` | Animated recreations of each app, built from its README and labelled "Recreated preview" on the card |

To use a real screenshot for another project, save it to `public/projects/<name>.webp` and render it inside a `BrowserFrame` the same way `KuryentipidPreview` does.

## Deploy

Pushing to `main` builds the site and publishes it to GitHub Pages through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once.

Name the repository `En1gM-a.github.io` to serve the site at https://en1gm-a.github.io. If you use a different repository name, set `base: "/<repo-name>/"` in `vite.config.ts` and update the URLs in `index.html`, `public/robots.txt` and `public/sitemap.xml`.

## Structure

| Path | What it does |
| --- | --- |
| `src/hooks/useIntro.ts` | Intro timeline (waits for fonts, then runs the beats), skip and reduced-motion handling |
| `src/components/BigBang.tsx` | The opening canvas: matter spiralling into the singularity, then the explosion of stars |
| `src/components/Hero.tsx` | The intro stage, the PORTFOLIO title and the hero layout |
| `src/components/ParticlePortrait.tsx` | The halftone star portrait: fly-in, cursor repel, scan sweep, scatter on scroll |
| `src/three/voyage.ts` | The Projects voyage: one shader-lit planet per project, its own galaxy and nebula, warp streaks, camera route |
| `src/components/Projects.tsx` | Scroll choreography for the voyage, and the plain list used with reduced motion |
| `src/three/galaxy.ts` | The Three.js galaxy scene, camera path, warp and per-section dimming |
| `src/three/props.ts` | The backdrop's life: astronaut placement and grab/throw physics, gas clouds, spiked stars, asteroids, satellite, shooting stars, dust |
| `src/three/astronaut.ts`, `src/three/emu.ts` | The astronaut (NASA suit, tether, drift) and the loader that cleans up and shares the suit model |
| `src/components/WarpJump.tsx`, `src/components/Supernova.tsx` | The hyperspace jump between sections and the Back to orbit supernova |
| `src/components/GalaxyBackground.tsx` | Lazy-loads the galaxy, hides it during the voyage, falls back to `Starfield.tsx` without WebGL |
| `src/components/fx/` | Shared interactions: 3D tilt, magnetic pull, count-up, targeting reticle |
| `src/components/previews/` | Device frames and the animated project previews |
| `src/hooks/useScramble.ts` | The decrypt text effect |

## Accessibility and motion

Every animation respects `prefers-reduced-motion`: the intro is skipped, the portrait, the galaxy and the astronaut render as still frames, the Projects voyage becomes a plain list, nav links jump straight to their section, and the glitch, tilt, magnetic and reticle effects switch off. The intro can always be skipped with the button or <kbd>Esc</kbd>.

## Credits

The astronaut is the Extravehicular Mobility Unit model from [NASA's 3D Resources](https://github.com/nasa/NASA-3D-Resources) (`public/models/emu.glb`), used under [NASA's media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). The Draco decoder in `public/draco/` comes from three.js.
