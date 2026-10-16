export const profile = {
  name: "Karl Adrian Bensi",
  role: "Full Stack Developer",
  education: "BSCpE Student",
  email: "karladrianremultabensi@gmail.com",
  github: "https://github.com/En1gM-a",
  githubHandle: "En1gM-a",
  facebook: "https://www.facebook.com/karladrian.bensi",
  // Large statement at the top of About, revealed word by word on scroll
  statement: "Curious about how things work, and focused on building them well.",
  // **double asterisks** render as highlighted text
  bio: [
    "Hi, I'm **Karl Adrian Bensi**, a Computer Engineering student and full-stack developer. I've been interested in both software and hardware for as long as I can remember, and that interest is what led me to **Computer Engineering**.",
    "I build **full-stack applications** for the web, mobile and desktop, from a real-time city information platform and AI-assisted tools to Android apps and Windows systems. I enjoy working through difficult problems and turning them into clear, maintainable solutions.",
    "I'm currently **open to internships, freelance projects and full-time roles**, and I'm always happy to talk about new ideas.",
  ],
  footnote: "Outside of code, I'm a lifelong space enthusiast — hence the theme.",
}

import type { PreviewKind } from "../components/previews"
import type { Palette } from "../three/voyage"

export type Project = {
  code: string
  name: string
  summary: string
  highlights: string[]
  stack: string[]
  repo: string
  live?: string
  kind: string
  status?: "live" | "wip"
  preview: PreviewKind
  /** The destination planet this project is shown on in the Projects voyage */
  planet: { name: string; palette: Palette }
}

const gh = (repo: string) => `https://github.com/En1gM-a/${repo}`

export const projects: Project[] = [
  {
    code: "MSN-001",
    name: "Sugbo Now",
    kind: "Web platform",
    status: "wip",
    preview: "sugbo",
    planet: { name: "Sugbo", palette: { a: "#04202e", b: "#0e7490", c: "#5eead4", atmo: "#67e8f9", wip: true } },
    summary:
      "A daily intelligence platform for Cebu. It pulls live traffic, weather, flooding, road closures, power and water interruptions and local news, matches them against each user's schedule, and writes a personalized AI daily brief with a suggested leave time.",
    highlights: ["Real-time data from 4 sources", "AI-written daily brief", "Interactive traffic map"],
    stack: ["React", "TypeScript", "Tailwind", "Node.js", "Express", "Supabase", "Leaflet"],
    repo: gh("SugboNow"),
  },
  {
    code: "MSN-002",
    name: "Kuryentipid",
    kind: "Web app",
    status: "live",
    preview: "kuryentipid",
    planet: { name: "Volta", palette: { a: "#1e1b4b", b: "#4338ca", c: "#facc15", atmo: "#fde047" } },
    summary:
      "An electricity-savings tracker. Log your appliances, see what they cost each month, compare provider rates on a map, and get recommendations to lower your bill.",
    highlights: ["Bill optimizer", "Monthly history charts", "Provider rate map"],
    stack: ["React", "Vite", "Tailwind", "Supabase", "Recharts", "Leaflet"],
    repo: gh("Kuryentipid"),
    live: "https://kuryentipid.vercel.app",
  },
  {
    code: "MSN-003",
    name: "Planado",
    kind: "Mobile app",
    preview: "planado",
    planet: { name: "Calendra", palette: { a: "#0f1a4a", b: "#4a61e8", c: "#c7d2fe", atmo: "#93c5fd", ring: "#c7d2fe" } },
    summary:
      "A group planning app. Create or join groups, schedule events on a shared calendar, get notified, and check upcoming plans from an Android home-screen widget.",
    highlights: ["Shared group calendars", "Native Android widget", "Supabase auth & sync"],
    stack: ["React Native", "Expo", "TypeScript", "Supabase", "Kotlin"],
    repo: gh("Planado"),
  },
  {
    code: "MSN-004",
    name: "MinuteMeeting",
    kind: "Discord bot + desktop app",
    preview: "minutemeeting",
    planet: { name: "Echo", palette: { a: "#1a1442", b: "#5865f2", c: "#f0abfc", atmo: "#a5b4fc", ring: "#e9d5ff" } },
    summary:
      "A Discord bot that turns meeting-channel messages into AI meeting minutes. It refreshes the summary every five minutes, exports to Markdown, Word or PDF, and ships with a dashboard and a Windows desktop app.",
    highlights: ["Gemini-powered summaries", "Slash commands", "Electron installer"],
    stack: ["Python", "discord.py", "Gemini API", "Node.js", "Electron"],
    repo: gh("MinuteMeeting"),
  },
  {
    code: "MSN-005",
    name: "Pantawid Pasada",
    kind: "Desktop app",
    preview: "pantawid",
    planet: { name: "Ignis", palette: { a: "#2a0d04", b: "#c2410c", c: "#fdba74", atmo: "#fb923c" } },
    summary:
      "A role-based fuel subsidy management system for drivers, administrators, government reviewers and fuel editors — with application review workflows, fuel price tracking and dashboards.",
    highlights: ["4 user roles", "Approval workflow", "LiveCharts dashboards"],
    stack: ["C#", ".NET", "WinForms", "MySQL"],
    repo: gh("PantawidPasada"),
  },
  {
    code: "MSN-006",
    name: "Clinic Management System",
    kind: "Console app",
    preview: "clinic",
    planet: { name: "Medica", palette: { a: "#03241d", b: "#059669", c: "#d1fae5", atmo: "#6ee7b7" } },
    summary:
      "A console app for running a clinic: doctor, patient and secretary accounts, appointment booking and confirmation, diagnoses, and doctor schedules — all behind arrow-key menus.",
    highlights: ["3 account roles", "Custom console UI", "JSON persistence"],
    stack: ["C#", ".NET", "System.Text.Json"],
    repo: gh("Clinic-Appointment-Management-System"),
  },
]

export const archive = [
  { name: "Student Utility System", lang: "C#", repo: gh("Student-Utility-System") },
  { name: "Survey", lang: "C#", repo: gh("Survey") },
  { name: "Calculator", lang: "C#", repo: gh("Calculator") },
]

export const skillGroups = [
  {
    id: "SYS-A",
    title: "Frontend",
    items: ["React", "TypeScript", "JavaScript", "Tailwind CSS", "Vite", "HTML & CSS"],
  },
  {
    id: "SYS-B",
    title: "Backend & Data",
    items: ["Node.js", "Express", "Supabase", "PostgreSQL", "MySQL", "REST APIs"],
  },
  {
    id: "SYS-C",
    title: "Mobile & Desktop",
    items: ["React Native", "Expo", "Kotlin", "Electron", "C# / .NET", "WinForms"],
  },
  {
    id: "SYS-D",
    title: "Automation & AI",
    items: ["Python", "Discord bots", "Gemini API", "Playwright", "Web scraping", "Cron jobs"],
  },
]

export const stats = [
  { value: "10", label: "GitHub repos" },
  { value: "6", label: "Languages" },
  { value: "3", label: "Platforms" },
]
