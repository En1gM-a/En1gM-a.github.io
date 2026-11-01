import { useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"
import { BrowserFrame, PhoneFrame, TerminalFrame, WindowFrame } from "./frames"
// Demo clips rendered with HyperFrames from demos/ (see its README section); imported so their URLs carry a hash
import sugbo from "../../media/demos/sugbo.mp4"
import sugboPoster from "../../media/demos/sugbo.webp"
import kuryentipid from "../../media/demos/kuryentipid.mp4"
import kuryentipidPoster from "../../media/demos/kuryentipid.webp"
import planado from "../../media/demos/planado.mp4"
import planadoPoster from "../../media/demos/planado.webp"
import minutemeeting from "../../media/demos/minutemeeting.mp4"
import minutemeetingPoster from "../../media/demos/minutemeeting.webp"
import pantawid from "../../media/demos/pantawid.mp4"
import pantawidPoster from "../../media/demos/pantawid.webp"
import clinic from "../../media/demos/clinic.mp4"
import clinicPoster from "../../media/demos/clinic.webp"

export type PreviewKind = "sugbo" | "kuryentipid" | "planado" | "minutemeeting" | "pantawid" | "clinic"

/**
 * A project's demo loop, filling the screen of its frame. Nothing downloads until the card is in view; out of view
 * it pauses, and with reduced motion it stays on its poster, a still from the middle of the demo
 */
function Demo({ src, poster, play }: { src: string; poster: string; play: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (play && !reduce) video.play().catch(() => {})
    else video.pause()
  }, [play, reduce])
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden
      className="absolute inset-0 h-full w-full object-cover"
    />
  )
}

export function ProjectPreview({ kind, play }: { kind: PreviewKind; play: boolean }) {
  switch (kind) {
    case "sugbo":
      return (
        <BrowserFrame url="sugbo-now · in development">
          <Demo src={sugbo} poster={sugboPoster} play={play} />
        </BrowserFrame>
      )
    case "kuryentipid":
      return (
        <BrowserFrame url="kuryentipid.vercel.app · backend paused">
          <Demo src={kuryentipid} poster={kuryentipidPoster} play={play} />
        </BrowserFrame>
      )
    case "planado":
      return (
        // Right of centre, so the card's "Recreated preview" tag sits beside the phone instead of over it
        <div className="flex h-full items-center justify-end pr-[6%]">
          {/* Shaped like the clip (544x800 inside the frame's 6px bezel), so none of the phone's screen is cut off */}
          <div className="aspect-[0.692] h-full">
            <PhoneFrame>
              <Demo src={planado} poster={planadoPoster} play={play} />
            </PhoneFrame>
          </div>
        </div>
      )
    case "minutemeeting":
      return (
        <div className="relative h-full overflow-hidden rounded-xl border border-white/10 bg-[#313338] shadow-2xl shadow-black/50">
          <Demo src={minutemeeting} poster={minutemeetingPoster} play={play} />
        </div>
      )
    case "pantawid":
      return (
        <WindowFrame title="Pantawid Pasada — Fuel Subsidy System">
          <Demo src={pantawid} poster={pantawidPoster} play={play} />
        </WindowFrame>
      )
    case "clinic":
      return (
        <TerminalFrame title="FinalProject.exe — Clinic Management System">
          <Demo src={clinic} poster={clinicPoster} play={play} />
        </TerminalFrame>
      )
  }
}
