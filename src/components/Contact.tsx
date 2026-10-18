import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { SectionHeading, reveal } from "./SectionHeading"
import { CheckIcon, CopyIcon, FacebookIcon, GitHubIcon, MailIcon } from "./icons"
import { Magnetic } from "./fx/Magnetic"
import { galaxyBus } from "../three/bus"
import { profile } from "../data/content"

export function Contact() {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profile.email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.location.href = `mailto:${profile.email}`
    }
  }

  return (
    <section id="contact" className="gutter relative scroll-mt-16 py-24 sm:py-32">
      <SectionHeading title="Contact" note="Email is the best way to reach me. GitHub and Facebook are below." />

      <motion.div {...reveal} className="panel brackets relative overflow-hidden rounded-2xl">
        <div className="border-b border-line px-6 py-4 font-mono text-[13px] text-faint sm:px-9">
          <span className="text-cyan">$</span> ping karl --channel=secure
          <br />
          <span className="text-signal">&gt;</span> reply received · open to internships, freelance and full-time roles
        </div>

        <div className="p-6 sm:p-9">
          <p className="max-w-2xl text-2xl leading-snug font-semibold tracking-tight sm:text-4xl">
            Have a project or an opportunity in mind? <span className="text-dim">I'd be glad to hear about it.</span>
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Magnetic className="min-w-0">
              <a
                href={`mailto:${profile.email}`}
                onPointerEnter={() => galaxyBus.warp(0.55)}
                onPointerLeave={() => galaxyBus.warp(0)}
                onFocus={() => galaxyBus.warp(0.55)}
                onBlur={() => galaxyBus.warp(0)}
                className="flex min-h-12 min-w-0 items-center gap-3 rounded-full bg-ink px-6 font-semibold text-void shadow-[0_0_40px_rgba(103,232,249,0.25)] transition-[opacity,box-shadow] hover:shadow-[0_0_60px_rgba(103,232,249,0.45)]"
              >
                <MailIcon className="shrink-0" />
                <span className="truncate max-sm:hidden">{profile.email}</span>
                <span className="sm:hidden">Email me</span>
              </a>
            </Magnetic>
            <button
              type="button"
              onClick={copy}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line px-5 text-sm transition-colors hover:border-white/30 hover:bg-white/5"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={copied ? "done" : "copy"}
                  className="flex items-center gap-2"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {copied ? <CheckIcon className="text-signal" /> : <CopyIcon />}
                  {copied ? "Copied" : "Copy email"}
                </motion.span>
              </AnimatePresence>
            </button>
            <span role="status" className="sr-only">
              {copied ? "Email address copied to clipboard" : ""}
            </span>
            <p className="font-mono text-[13px] break-all text-dim sm:hidden">{profile.email}</p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
            <a
              href={profile.facebook}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center gap-2 rounded-full border border-line px-5 text-sm transition-colors hover:border-white/30 hover:bg-white/5"
            >
              <FacebookIcon width={16} height={16} /> Facebook
              <span className="sr-only"> (opens in new tab)</span>
            </a>
            <a
              href={profile.github}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center gap-2 rounded-full border border-line px-5 text-sm transition-colors hover:border-white/30 hover:bg-white/5"
            >
              <GitHubIcon width={16} height={16} /> GitHub
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  )
}
