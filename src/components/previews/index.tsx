import { AnimatePresence, motion } from "motion/react"
import { BrowserFrame, PhoneFrame, TerminalFrame, WindowFrame, useLoop } from "./frames"

export type PreviewKind = "sugbo" | "kuryentipid" | "planado" | "minutemeeting" | "pantawid" | "clinic"

const pop = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { type: "spring", bounce: 0.3, visualDuration: 0.4 } } as const

/* ---------------------------------------------------------------- Sugbo Now */

const ALERTS = [
  { label: "Heavy traffic · Osmeña Blvd", tint: "#fbbf24", x: 38, y: 40 },
  { label: "Flood advisory · Mambaling", tint: "#60a5fa", x: 22, y: 68 },
  { label: "Power interruption · Talamban", tint: "#a78bfa", x: 70, y: 22 },
  { label: "Light rain after 3 PM", tint: "#67e8f9", x: 78, y: 62 },
]
const BRIEF = "Heavy traffic on Osmeña Blvd until 8:30. Light rain after 3 PM — bring an umbrella."

function SugboPreview({ play }: { play: boolean }) {
  const step = useLoop(ALERTS.length + 2, 1300, play)
  const typed = step < 0 ? BRIEF : BRIEF.slice(0, Math.min(BRIEF.length, 18 + step * 14))
  return (
    <BrowserFrame url="sugbo-now · in development">
      <div className="grid h-full grid-cols-5 gap-2 bg-[#0a1020] p-2.5 text-white">
        <div className="col-span-2 flex flex-col gap-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
            <p className="font-mono text-[8px] tracking-widest text-cyan uppercase">Cebu Daily Brief</p>
            <p className="mt-1 text-[11px] font-semibold">Good morning, Karl</p>
            <p className="mt-1 min-h-[3.6em] text-[9.5px] leading-snug text-white/70">
              {typed}
              <span className="ml-0.5 inline-block h-2.5 w-1 motion-safe:animate-pulse bg-cyan align-middle" />
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-amber-300/30 bg-amber-300/10 p-2.5">
            <span className="text-[9px] text-amber-200/80">Suggested leave time</span>
            <span className="font-mono text-[13px] font-bold text-amber-200">7:12 AM</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {(step < 0 ? ALERTS : ALERTS.slice(0, Math.max(1, Math.min(ALERTS.length, step)))).map((a) => (
              <motion.li key={a.label} {...pop} className="flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-[8.5px] text-white/75">
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: a.tint }} />
                {a.label}
              </motion.li>
            ))}
          </ul>
        </div>
        <div className="relative col-span-3 overflow-hidden rounded-lg border border-white/10 bg-[#0d1830]">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <path d="M0 30 C 30 35, 50 20, 100 28" stroke="rgb(255 255 255 / 0.12)" strokeWidth="1.6" fill="none" />
            <path d="M10 100 C 20 70, 40 60, 55 40 S 80 10, 92 0" stroke="rgb(255 255 255 / 0.12)" strokeWidth="1.6" fill="none" />
            <path d="M0 75 C 30 70, 60 82, 100 70" stroke="rgb(255 255 255 / 0.08)" strokeWidth="1.2" fill="none" />
            <path d="M60 100 L 64 60 L 85 45" stroke="rgb(255 255 255 / 0.08)" strokeWidth="1.2" fill="none" />
            {/* Commute route */}
            <path
              d="M12 92 C 22 70, 38 58, 52 44 S 76 26, 88 12"
              stroke="#67e8f9"
              strokeWidth="1.4"
              fill="none"
              strokeDasharray="3 2.2"
              className="motion-safe:animate-[route_2.4s_linear_infinite]"
            />
          </svg>
          {ALERTS.map((a, i) => (
            <span key={a.label} className="absolute" style={{ left: `${a.x}%`, top: `${a.y}%` }}>
              <span className="absolute -inset-2 motion-safe:animate-ping rounded-full opacity-40" style={{ background: a.tint, animationDelay: `${i * 0.4}s` }} />
              <span className="relative block size-2.5 rounded-full border-2 border-[#0d1830]" style={{ background: a.tint }} />
            </span>
          ))}
          <span className="absolute bottom-2 left-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[8px] text-white/60">TomTom · Open-Meteo · SunStar</span>
        </div>
      </div>
    </BrowserFrame>
  )
}

/* ---------------------------------------------------------------- Kuryentipid */

function KuryentipidPreview() {
  return (
    <BrowserFrame url="kuryentipid.vercel.app">
      <img
        src="/projects/kuryentipid.webp"
        alt="Kuryentipid sign-in screen: Master your energy costs"
        width={1200}
        height={750}
        loading="lazy"
        className="h-full w-full object-cover object-left-top transition-transform duration-700 group-hover:scale-[1.04]"
      />
    </BrowserFrame>
  )
}

/* ---------------------------------------------------------------- Planado */

const EVENTS = [
  { day: 9, title: "Group study", meta: "CpE 3A · 2:00 PM" },
  { day: 14, title: "Capstone sync", meta: "Team Orbit · 4:30 PM" },
  { day: 22, title: "Org meeting", meta: "Room 402 · 5:00 PM" },
]

function PlanadoPreview({ play }: { play: boolean }) {
  const step = useLoop(EVENTS.length, 1600, play)
  const ev = EVENTS[Math.max(0, step)]
  return (
    <div className="relative flex h-full items-center justify-center gap-4" style={{ transformStyle: "preserve-3d" }}>
      <div className="h-full max-h-[100%] w-[46%] max-w-[230px]">
        <PhoneFrame>
          <div className="flex h-full flex-col bg-[#f5f6fb] px-3 pt-7 pb-3 text-[#24246b]">
            <div className="flex items-center gap-1.5">
              <img src="/projects/planado-logo.webp" alt="" width={256} height={256} className="size-5" />
              <span className="text-[12px] font-extrabold">Planado</span>
            </div>
            <p className="mt-3 text-[10px] font-bold">October</p>
            <div className="mt-1.5 grid grid-cols-7 gap-1 text-center text-[7.5px]">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => {
                const has = EVENTS.some((e) => e.day === d)
                const on = ev.day === d
                return (
                  <span
                    key={d}
                    className={`relative grid aspect-square place-items-center rounded-md transition-colors duration-300 ${
                      on ? "bg-[#4a61e8] font-bold text-white" : "bg-white text-[#24246b]/70"
                    }`}
                  >
                    {d}
                    {has && !on && <span className="absolute bottom-0.5 size-1 rounded-full bg-[#4a61e8]" />}
                  </span>
                )
              })}
            </div>
            <p className="mt-3 text-[9px] font-bold text-[#24246b]/60 uppercase">Upcoming</p>
            <AnimatePresence mode="wait">
              <motion.div key={ev.title} {...pop} exit={{ opacity: 0, y: -6 }} className="mt-1.5 rounded-lg bg-white p-2 shadow-sm">
                <p className="text-[10px] font-bold">{ev.title}</p>
                <p className="text-[8.5px] text-[#24246b]/60">{ev.meta}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </PhoneFrame>
      </div>
      {/* Home-screen widget, floating closer to the viewer */}
      <div
        className="w-[38%] max-w-[180px] rounded-2xl border border-white/15 bg-[#4a61e8] p-3 text-white shadow-xl shadow-black/40"
        style={{ transform: "translateZ(60px)" }}
      >
        <p className="font-mono text-[8px] tracking-widest uppercase opacity-70">Widget · Next up</p>
        <AnimatePresence mode="wait">
          <motion.div key={ev.title} {...pop} exit={{ opacity: 0 }}>
            <p className="mt-1.5 text-[13px] leading-tight font-bold">{ev.title}</p>
            <p className="text-[9px] opacity-80">Oct {ev.day} · {ev.meta.split(" · ")[1]}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- MinuteMeeting */

type Msg = { who: string; text?: string; bot?: { title: string; lines?: string[]; exports?: boolean } }
const CHAT: Msg[] = [
  { who: "karl", text: "/meeting start" },
  { who: "MinuteMeeting", bot: { title: "Meeting started · recording #meeting-room" } },
  { who: "jai", text: "Let's ship the dashboard on Friday" },
  { who: "karl", text: "I'll take the export bug" },
  { who: "MinuteMeeting", bot: { title: "Minutes updated · 5 min", lines: ["Decision: ship dashboard Friday", "Action: Karl — fix export bug"] } },
  { who: "karl", text: "/meeting export" },
  { who: "MinuteMeeting", bot: { title: "Minutes exported", exports: true } },
]

function MinuteMeetingPreview({ play }: { play: boolean }) {
  const step = useLoop(CHAT.length + 2, 1100, play)
  const shown = step < 0 ? CHAT : CHAT.slice(0, Math.min(CHAT.length, step + 1))
  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-white/10 bg-[#313338] text-white shadow-2xl shadow-black/50">
      <div className="hidden w-[28%] flex-col gap-1 bg-[#2b2d31] p-2.5 text-[10px] text-white/50 sm:flex">
        <p className="mb-1 font-bold text-white/80">Team Orbit</p>
        <p># general</p>
        <p className="rounded bg-white/10 px-1.5 py-0.5 text-white"># meeting-room</p>
        <p># resources</p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="border-b border-black/30 px-3 py-2 text-[10px] font-semibold text-white/85">
          # meeting-room <span className="font-normal text-white/40">· daily stand-up</span>
        </p>
        <div className="flex flex-1 flex-col justify-end gap-2 overflow-hidden p-3">
        <AnimatePresence initial={false}>
          {shown.slice(-5).map((m) => (
            <motion.div key={CHAT.indexOf(m)} layout="position" {...pop} className="flex gap-2">
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[8px] font-bold ${
                  m.bot ? "bg-[#5865f2]" : m.who === "karl" ? "bg-cyan/80 text-black" : "bg-pink-400/80 text-black"
                }`}
              >
                {m.bot ? "MM" : m.who[0].toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold text-white/80">
                  {m.who}
                  {m.bot && <span className="ml-1 rounded bg-[#5865f2] px-1 text-[7px]">BOT</span>}
                </p>
                {m.text && <p className={`text-[10px] ${m.text.startsWith("/") ? "font-mono text-[#c9cdfb]" : "text-white/85"}`}>{m.text}</p>}
                {m.bot && (
                  <div className="mt-1 rounded border-l-2 border-[#5865f2] bg-[#2b2d31] px-2 py-1.5">
                    <p className="text-[9.5px] font-semibold">{m.bot.title}</p>
                    {m.bot.lines?.map((l) => (
                      <p key={l} className="text-[9px] text-white/70">
                        • {l}
                      </p>
                    ))}
                    {m.bot.exports && (
                      <div className="mt-1 flex gap-1">
                        {[".md", ".docx", ".pdf"].map((x) => (
                          <span key={x} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[8px]">
                            {x}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Pantawid Pasada */

const FUEL = [
  { label: "Diesel", value: 0.62 },
  { label: "Unleaded", value: 0.78 },
  { label: "Premium", value: 0.9 },
]
const APPS = [
  { name: "R. Dela Cruz", status: "Approved", tint: "bg-emerald-100 text-emerald-700" },
  { name: "M. Santos", status: "Under review", tint: "bg-amber-100 text-amber-700" },
  { name: "J. Reyes", status: "On hold", tint: "bg-slate-200 text-slate-600" },
]

function PantawidPreview({ play }: { play: boolean }) {
  return (
    <WindowFrame title="Pantawid Pasada — Fuel Subsidy System">
      <div className="flex h-full text-[#1e293b]">
        <div className="w-[26%] space-y-1 bg-[#e2e8f0] p-2 text-[9px]">
          <p className="mb-2 rounded bg-[#1f3a8a] px-1.5 py-1 text-[8px] text-white">Government reviewer</p>
          {["Dashboard", "Applications", "Fuel prices", "Fare matrix", "Accounts"].map((n, i) => (
            <p key={n} className={`rounded px-1.5 py-1 ${i === 0 ? "bg-white font-semibold" : "text-slate-600"}`}>
              {n}
            </p>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-2.5">
          <div className="grid grid-cols-3 gap-1.5">
            {[
              ["Applications", "128"],
              ["Approved", "86"],
              ["Under review", "31"],
            ].map(([k, v]) => (
              <div key={k} className="rounded bg-white p-1.5 shadow-sm">
                <p className="text-[7.5px] text-slate-500">{k}</p>
                <p className="text-[14px] font-bold">{v}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-1 items-end gap-3 rounded bg-white p-2 shadow-sm">
            <p className="self-start text-[8px] font-semibold text-slate-500">Fuel prices ₱/L</p>
            {FUEL.map((f, i) => (
              <div key={f.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <motion.div
                  className="w-full origin-bottom rounded-t bg-gradient-to-t from-[#1f3a8a] to-[#3b82f6]"
                  style={{ height: `${f.value * 100}%` }}
                  initial={{ scaleY: 0.1 }}
                  animate={{ scaleY: play ? 1 : 0.1 }}
                  transition={{ type: "spring", bounce: 0.2, visualDuration: 0.8, delay: i * 0.12 }}
                />
                <span className="text-[7.5px] text-slate-500">{f.label}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1 rounded bg-white p-1.5 shadow-sm">
            {APPS.map((a, i) => (
              <motion.div
                key={a.name}
                className="flex items-center justify-between text-[8.5px]"
                initial={{ opacity: 0, x: -8 }}
                animate={play ? { opacity: 1, x: 0 } : undefined}
                transition={{ delay: 0.3 + i * 0.12 }}
              >
                <span>{a.name}</span>
                <span className={`rounded px-1.5 py-0.5 text-[7.5px] font-semibold ${a.tint}`}>{a.status}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </WindowFrame>
  )
}

/* ---------------------------------------------------------------- Clinic */

const MENU = ["Login", "Sign Up", "Exit"]
// Figlet "standard" lettering
const BANNER = [
  "  ____ _     ___ _   _ ___ ____ ",
  " / ___| |   |_ _| \\ | |_ _/ ___|",
  "| |   | |    | ||  \\| || | |    ",
  "| |___| |___ | || |\\  || | |___ ",
  " \\____|_____|___|_| \\_|___\\____|",
].join("\n")

function ClinicPreview({ play }: { play: boolean }) {
  const step = useLoop(6, 900, play)
  const selected = step < 0 ? 0 : [0, 1, 2, 1, 0, 0][step]
  return (
    <TerminalFrame title="FinalProject.exe — Clinic Management System">
      <pre className="text-center text-[9px] leading-tight text-cyan sm:text-[10px]">{BANNER}</pre>
      <p className="mt-2 text-center text-[10px] text-white/50">Doctor · Patient · Secretary</p>
      <ul className="mx-auto mt-4 w-40 space-y-1">
        {MENU.map((m, i) => (
          <li
            key={m}
            className={`flex justify-between rounded px-2 py-0.5 transition-colors duration-150 ${
              selected === i ? "bg-[#cccccc] text-black" : "text-[#cccccc]"
            }`}
          >
            <span>{selected === i ? "►" : " "}</span>
            <span className="flex-1 text-center">{m}</span>
            <span>{selected === i ? "◄" : " "}</span>
          </li>
        ))}
      </ul>
      <p className="absolute right-4 bottom-3 left-4 hidden text-center text-[9px] text-white/40 sm:block">
        [↑/↓] navigate · [Enter] select · [TAB] manage · [V] diagnosis
      </p>
    </TerminalFrame>
  )
}

export function ProjectPreview({ kind, play }: { kind: PreviewKind; play: boolean }) {
  switch (kind) {
    case "sugbo":
      return <SugboPreview play={play} />
    case "kuryentipid":
      return <KuryentipidPreview />
    case "planado":
      return <PlanadoPreview play={play} />
    case "minutemeeting":
      return <MinuteMeetingPreview play={play} />
    case "pantawid":
      return <PantawidPreview play={play} />
    case "clinic":
      return <ClinicPreview play={play} />
  }
}
