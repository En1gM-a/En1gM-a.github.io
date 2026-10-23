/**
 * The young universe's layout, shared by the intro's two layers so they agree:
 * the plasma shader clears the fog around each protocluster as its first stars
 * switch on, and the particle layer lights those stars and gathers galaxies there.
 */

/** A protocluster: position in screen heights from the centre, its mass (0…1), and when its first stars ignite (s after the bang) */
export type Clump = { x: number; y: number; m: number; ignite: number }

/** Protoclusters on a loose grid over (and a little past) the screen, so no part of the sky is left empty */
export function makeClumps(w: number, h: number): Clump[] {
  const aspect = w / h
  const cols = aspect > 1 ? 4 : 2
  const rows = aspect > 1 ? 3 : 4
  const out: Clump[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({
        x: ((c + 0.5 + (Math.random() - 0.5) * 0.8) / cols - 0.5) * aspect * 1.05,
        y: ((r + 0.5 + (Math.random() - 0.5) * 0.8) / rows - 0.5) * 1.05,
        m: 0.35 + 0.65 * Math.random(),
        // The first stars switch on within a few tenths of a second of each other, all over the sky
        ignite: 0.62 + Math.random() * 0.38,
      })
  return out
}

/** The most the shader takes (its uniform array's length) */
export const MAX_CLUMPS = 12

/** How far space has stretched since the bang for something at depth z (0 far … 1 near): nearer things drift out faster */
export const drift = (t: number, z = 0.5) => 1 + t * 0.12 * (0.4 + 1.2 * z)
