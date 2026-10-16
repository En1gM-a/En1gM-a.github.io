import { useEffect, useState, type ReactNode } from "react"
import { useReducedMotion } from "motion/react"

/**
 * Steps 0..count-1 on an interval while `play` is true; used to sequence preview animations.
 * Returns -1 when it isn't looping (out of view, or reduced motion) so previews show their complete state.
 */
export function useLoop(count: number, every: number, play: boolean) {
  const reduce = useReducedMotion()
  const live = play && !reduce
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!live) return
    setStep(0)
    const id = window.setInterval(() => setStep((s) => (s + 1) % count), every)
    return () => window.clearInterval(id)
  }, [count, every, live])
  return live ? step : -1
}

export function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0f1f] shadow-2xl shadow-black/50">
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex-1 truncate rounded-md bg-white/[0.06] px-3 py-1 text-center font-mono text-[10px] text-white/55">{url}</span>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}

export function WindowFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#f3f4f8] shadow-2xl shadow-black/50">
      <div className="flex items-center justify-between bg-[#1f3a8a] px-3 py-1.5 text-[10px] text-white">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-amber-300" />
          {title}
        </span>
        <span className="flex gap-3 font-mono text-white/80">
          <span>—</span>
          <span>☐</span>
          <span>✕</span>
        </span>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[2rem] border-[6px] border-[#1d2233] bg-white shadow-2xl shadow-black/60">
      <div className="absolute top-1.5 left-1/2 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-[#1d2233]" />
      {children}
    </div>
  )
}

export function TerminalFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0c0c0c] shadow-2xl shadow-black/60">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#1b1b1b] px-3 py-1.5 font-mono text-[10px] text-white/70">
        <span>{title}</span>
        <span className="flex gap-3">
          <span>—</span>
          <span>☐</span>
          <span>✕</span>
        </span>
      </div>
      <div className="relative min-h-0 flex-1 p-4 font-mono text-[11px] leading-relaxed text-[#cccccc]">{children}</div>
    </div>
  )
}
