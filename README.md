# Karl Adrian Bensi — Portfolio

Personal portfolio for Karl Adrian Bensi, BSCpE student and full stack developer. The theme is outer space with a light cybersecurity layer:

- **Intro** — the Big Bang: a singularity gathers matter, then a flash and shockwave blast out the first stars. The letters of KARL fly out of the explosion with an RGB split, glitch-decrypt into PORTFOLIO, and stars stream in to assemble a black-and-white dot portrait behind the title. It stays made of stars: they push away from the cursor, get a periodic scan sweep, and scatter as you scroll away.
- **Galaxy** — a real-time Three.js spiral galaxy (GPU-animated, differential rotation, nebula clouds, a radar pulse) sits behind the page. The camera follows a path as you scroll and drifts with the mouse; it dims behind each section so content leads.
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

There are two photos. [`public/karl-face.webp`](public/karl-face.webp) is a face cut-out with a transparent background; the hero redraws it as an interactive black-and-white dot portrait behind the title. [`public/karl-full.webp`](public/karl-full.webp) is shown whole on the crew card in About (its panel uses `aspect-[416/952]`, so update that if you swap in a photo with a different shape).

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
| `src/components/Projects.tsx` | Scroll choreography for the voyage (desktop) and the stacked list (phones, reduced motion) |
| `src/three/galaxy.ts` | The Three.js galaxy scene, camera path and warp |
| `src/components/GalaxyBackground.tsx` | Lazy-loads the galaxy, dims it per section, falls back to `Starfield.tsx` without WebGL |
| `src/components/fx/` | Shared interactions: 3D tilt, magnetic pull, count-up, targeting reticle |
| `src/components/previews/` | Device frames and the animated project previews |
| `src/hooks/useScramble.ts` | The decrypt text effect |

## Accessibility and motion

Every animation respects `prefers-reduced-motion`: the intro is skipped, the portrait and the galaxy render as still frames, the Projects voyage becomes a plain list, and the glitch, tilt, magnetic and reticle effects switch off. The intro can always be skipped with the button or <kbd>Esc</kbd>.
