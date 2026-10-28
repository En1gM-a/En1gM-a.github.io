# Karl Adrian Bensi — Portfolio

Personal portfolio for Karl Adrian Bensi, BSCpE student and full stack developer. The theme is outer space with a light cybersecurity layer:

- **Loader** — a singularity gathering at the centre of the screen, with real progress, paints before any script runs. Behind it the galaxy, NASA's suit and every heavy shader are prepared (shaders compile off the main thread), so the intro then plays without a stutter.
- **Intro** — the Big Bang after NASA's own visualisation of it, which is not an explosion: no centre, no fireball, no fire. A violet point of light blooms into a cool glow that fills everything, the tiniest ripples inside it stretched to the size of the sky (inflation). The whole universe then glows as a deep, wispy fog that dims as it cools; the first stars ignite in protoclusters as huge blue flares, and their light clears bubbles in the fog that grow and merge (reionization) until it opens onto a deep field: far galaxies small and reddened, near ones drifting past faster, faint lensed arcs around the heaviest cluster. A cosmic clock counts the universe's age and temperature from 10⁻⁴³ s and 10³² K to today's 13.8 billion years and 2.7 K. The letters of KARL condense out of the fog where they stand with an RGB split, glitch-decrypt into PORTFOLIO, and thousands of small asteroids fly in to assemble a 3D portrait behind the title: faceted rocks on a gentle dome, slate to pale stone, a few with a violet or rusty mineral cast. It turns toward the cursor, rocks get shoved aside where it passes, a scan sweeps it now and then, and it drifts apart as you scroll away.
- **Galaxy** — a real-time Three.js spiral galaxy (GPU-animated, differential rotation, nebula clouds, a radar pulse) sits behind the page. The camera follows a path as you scroll and drifts with the mouse; it dims behind each section so content leads.
- **Backdrop life** — an astronaut in NASA's EVA suit drifts beside each section on a glowing data tether. Grab him with the mouse and throw him (he tumbles, then the tether reels him back), tap him on a phone to send him spinning; in the Projects voyage he floats in the open corner beside each planet, clear of the project details. Around him: Hubble-palette gas clouds, stars with diffraction spikes, asteroids, a satellite, shooting stars and drifting dust, kept to the open edges so the text stays readable.
- **Navigation** — nav links jump through hyperspace instead of scrolling past every section, and "Back to orbit" opens a small black hole that grows as it pulls in the page, the nav and the sky until it swallows the view; the Big Bang replays from the point of light left in the dark.
- **Sections** — a scroll word-reveal and a crew ID card that tilts and flips (About), an interactive orbital system plus a tech ticker (Skills), a scroll-driven voyage where every project is its own planet and you warp between them (Projects): living worlds with oceans, drifting clouds and city lights at night, gas giants with storms, zonal winds and lightning, a molten world with glowing rifts, each in its own Hubble-palette nebula with its galaxy overhead, and a magnetic email button that sends the galaxy into warp (Contact).

Built with React, Vite, Tailwind CSS, [Motion](https://motion.dev), [Three.js](https://threejs.org) and [Lenis](https://lenis.darkroom.engineering) for smooth wheel scrolling.

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
| `src/boot.ts`, `index.html` | The loader: what the first load waits for (with a cap), its progress, and the hand-off to the intro |
| `src/hooks/useIntro.ts` | Intro timeline (starts when the loader lets go), skip and reduced-motion handling |
| `src/components/BigBang.tsx` | The opening's first stars (blue flares at each protocluster) and deep field: six kinds of galaxy at different depths, reddened far off, with lensed arcs; also the stars and dust spiralling into the black hole |
| `src/components/Plasma.tsx` | The young universe's light in one low-resolution shader: the violet point, the bloom of inflation with its stretched ripples, the wispy two-layer fog and the bubbles the first stars clear in it; also the black hole, its photon ring and its disk of infalling gas |
| `src/components/cosmos.ts` | The protoclusters both intro layers share, so the fog clears exactly where the first stars ignite |
| `src/components/Hero.tsx` | The intro stage, the PORTFOLIO title and the hero layout |
| `src/components/ParticlePortrait.tsx` | The halftone star portrait: fly-in, cursor repel, scan sweep, scatter on scroll |
| `src/three/voyage.ts` | The Projects voyage: planets, nebulae and galaxies per destination, the astronaut beside each planet, warp streaks, camera route |
| `src/three/planets.ts` | Planet surfaces and cloud layers, baked once into mipmapped textures (so a frame only reads them), then bump-lit with winds, ocean glints, city lights, lava glow and atmosphere |
| `src/three/nebula.ts`, `src/three/env.ts` | Baked Hubble-palette gas clouds shared by both scenes, and the sky the metal and visor reflect |
| `src/components/Projects.tsx` | Scroll choreography for the voyage, and the plain list used with reduced motion |
| `src/three/galaxy.ts` | The Three.js galaxy scene, camera path, warp and per-section dimming |
| `src/three/props.ts` | The backdrop's life: astronaut placement and grab/throw physics, gas clouds, spiked stars, asteroids, satellite, shooting stars, dust |
| `src/three/astronaut.ts`, `src/three/emu.ts` | The astronaut (NASA suit, tether, drift) and the loader that cleans up and shares the suit model |
| `src/components/WarpJump.tsx`, `src/components/BlackHole.tsx` | The hyperspace jump between sections and the Back to orbit black hole |
| `src/components/GalaxyBackground.tsx` | Lazy-loads the galaxy, hides it during the voyage, falls back to `Starfield.tsx` without WebGL |
| `src/components/fx/` | Shared interactions: 3D tilt, magnetic pull, count-up, targeting reticle |
| `src/components/previews/` | Device frames and the animated project previews |
| `src/hooks/useScramble.ts` | The decrypt text effect |

## Accessibility and motion

Every animation respects `prefers-reduced-motion`: the intro is skipped, the portrait, the galaxy and the astronaut render as still frames, the Projects voyage becomes a plain list, nav links jump straight to their section, and the glitch, tilt, magnetic and reticle effects switch off. The intro can always be skipped with the button or <kbd>Esc</kbd>.

## Credits

The astronaut is the Extravehicular Mobility Unit model from [NASA's 3D Resources](https://github.com/nasa/NASA-3D-Resources) (`public/models/emu.glb`), used under [NASA's media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). The Draco decoder in `public/draco/` comes from three.js.
