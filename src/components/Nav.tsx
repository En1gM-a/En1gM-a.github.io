import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { CloseIcon, MenuIcon } from "./icons"
import { profile } from "../data/content"

const LINKS = [
  { id: "home", label: "Home" },
  { id: "about", label: "About" },
  { id: "skills", label: "Skills" },
  { id: "projects", label: "Projects" },
  { id: "contact", label: "Contact" },
]

export function Nav({ visible }: { visible: boolean }) {
  const [active, setActive] = useState("home")
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: "-45% 0px -50% 0px" },
    )
    LINKS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    })
    return () => {
      window.removeEventListener("scroll", onScroll)
      io.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  // The number keys 1-5 go to the sections the way the links do, hyperspace jump and all
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      const link = LINKS[Number(e.key) - 1]
      if (!link || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as Element | null)?.closest?.("input, textarea, select, [contenteditable]")) return
      document.querySelector<HTMLAnchorElement>(`header a[href="#${link.id}"]`)?.click()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [visible])

  return (
    <motion.header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color] duration-300 ${
        scrolled ? "border-b border-line bg-void/70 backdrop-blur-xl" : "border-b border-transparent"
      }`}
      initial={{ opacity: 0, y: -12 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: -12 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      inert={!visible}
    >
      <nav aria-label="Primary" className="gutter flex h-16 items-center justify-between">
        <a href="#home" className="flex min-h-11 items-center text-[13px] font-extrabold tracking-[0.18em] uppercase">
          {profile.name}
        </a>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l, i) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                aria-keyshortcuts={String(i + 1)}
                aria-current={active === l.id ? "true" : undefined}
                className={`relative block px-3 py-2 text-[11px] font-semibold tracking-[0.16em] uppercase transition-colors ${
                  active === l.id ? "text-ink" : "text-dim hover:text-ink"
                }`}
              >
                {l.label}
                {active === l.id && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-3 -bottom-0.5 h-px bg-cyan"
                    transition={{ type: "spring", bounce: 0.2, visualDuration: 0.35 }}
                  />
                )}
              </a>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="grid size-11 place-items-center rounded-full border border-line md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            className="gutter fixed inset-x-0 top-16 bottom-0 bg-void/95 pt-6 backdrop-blur-xl md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            <ul className="flex flex-col">
              {LINKS.map((l, i) => (
                <motion.li
                  key={l.id}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i, type: "spring", bounce: 0, visualDuration: 0.3 }}
                >
                  <a
                    href={`#${l.id}`}
                    onClick={() => setOpen(false)}
                    className="display flex items-baseline gap-4 border-b border-line py-5 text-4xl"
                  >
                    <span className="label w-6">0{i}</span>
                    <span className={active === l.id ? "text-ink" : "text-dim"}>{l.label}</span>
                  </a>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
