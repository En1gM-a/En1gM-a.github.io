import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/archivo/wdth.css"
import "@fontsource-variable/archivo/wdth-italic.css"
import "@fontsource-variable/jetbrains-mono"
import "./index.css"
import App from "./App"
import { startBoot } from "./boot"

startBoot()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
