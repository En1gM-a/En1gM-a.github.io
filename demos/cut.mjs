// Cuts a render of this reel into the site's demo clips: each project's 10 s slot, cropped to the screen of its
// card's frame (see each scene's header), plus a still from the middle of it as the poster.
// Usage, with ffmpeg on PATH:  node cut.mjs <render.mp4>  → ../src/media/demos/<name>.mp4 and <name>.webp
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const [, , master] = process.argv
if (!master) throw new Error("Usage: node cut.mjs <render.mp4>")
const out = (file) => fileURLToPath(new URL(`../src/media/demos/${file}`, import.meta.url))
const ffmpeg = (...args) => execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", ...args], { stdio: "inherit" })

// name, slot start (s), crop w:h:x:y in the 1280x800 render, poster time within the slot (s)
const CLIPS = [
  ["sugbo", 0, "1280:696:0:52", 3.6],
  ["kuryentipid", 10, "1280:696:0:52", 3.2],
  ["planado", 20, "544:800:368:0", 1.0],
  ["minutemeeting", 30, "1280:800:0:0", 4.9],
  ["pantawid", 40, "1280:728:0:36", 3.4],
  ["clinic", 50, "1280:728:0:36", 8.6],
]

for (const [name, start, crop, still] of CLIPS) {
  ffmpeg("-ss", String(start), "-i", master, "-t", "10", "-vf", `crop=${crop}`, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
    "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out(`${name}.mp4`))
  ffmpeg("-ss", String(start + still), "-i", master, "-frames:v", "1", "-vf", `crop=${crop}`, "-c:v", "libwebp", "-quality", "82", out(`${name}.webp`))
  console.log(name)
}
