import { useEffect, useState, type MouseEvent } from "react"
import { MotionConfig, motion, useReducedMotion, useScroll, useSpring } from "motion/react"
import { GalaxyBackground } from "./components/GalaxyBackground"
import { Nav } from "./components/Nav"
import { Reticle } from "./components/fx/Reticle"
import { Hero } from "./components/Hero"
import { About } from "./components/About"
import { Skills } from "./components/Skills"
import { Projects } from "./components/Projects"
import { Contact } from "./components/Contact"
import { BlackHole } from "./components/BlackHole"
import { preloadHoleFilm } from "./components/hole"
import { WarpJump } from "./components/WarpJump"
import { STAGE, useIntro } from "./hooks/useIntro"
import { profile } from "./data/content"
import { startSmoothScroll } from "./smoothScroll"

function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 300, damping: 40 })
  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-cyan via-violet to-cyan"
      style={{ scaleX }}
    />
  )
}

export default function App() {
  const { stage, skipped, skip, replay } = useIntro()
  const online = stage >= STAGE.done
  const reduce = useReducedMotion()
  const [falling, setFalling] = useState(false)
  // Smooth (inertial) wheel scrolling, except with reduced motion
  useEffect(() => (reduce ? undefined : startSmoothScroll()), [reduce])

  // "Back to orbit": a black hole takes the page and the Big Bang replays from its singularity (a plain jump with reduced motion)
  const backToOrbit = (e: MouseEvent<HTMLAnchorElement>) => {
    if (reduce || falling) return
    e.preventDefault()
    setFalling(true)
  }
  const restart = () => {
    window.scrollTo({ top: 0, behavior: "instant" })
    replay()
  }

  return (
    <MotionConfig reducedMotion="user">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <GalaxyBackground shown={stage >= STAGE.decrypt} arrived={stage >= STAGE.settle} />
      <div
        aria-hidden
        data-backdrop
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_60%_40%_at_85%_10%,rgb(167_139_250/0.10),transparent_70%),radial-gradient(ellipse_50%_40%_at_5%_90%,rgb(103_232_249/0.07),transparent_70%)]"
      />
      {online && <ScrollProgress />}
      {online && <Reticle />}
      <Nav visible={online} />

      <main id="main">
        <Hero stage={stage} skipped={skipped} onSkip={skip} />
        <div inert={!online}>
          <About />
          <Skills />
          <Projects />
          <Contact />
        </div>
      </main>

      {/* The film behind "Back to orbit" loads as the footer comes near, so only visitors who get this far fetch it */}
      <motion.footer
        onViewportEnter={reduce ? undefined : preloadHoleFilm}
        viewport={{ once: true, margin: "1200px" }}
        className="gutter flex flex-col gap-3 border-t border-line py-8 font-mono text-xs text-faint sm:flex-row sm:items-center sm:justify-between"
      >
        <p>
          © {new Date().getFullYear()} {profile.name} <span className="text-cyan">//</span> Transmission end
        </p>
        <a href="#home" onClick={backToOrbit} className="flex min-h-11 items-center hover:text-ink">
          Back to orbit ↑
        </a>
      </motion.footer>
      {falling && <BlackHole onBlackout={restart} onDone={() => setFalling(false)} />}
      <WarpJump />
    </MotionConfig>
  )
}
