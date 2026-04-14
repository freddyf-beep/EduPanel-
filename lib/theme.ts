/**
 * EduPanel Theme System
 * Gestiona el color de brand y el modo oscuro via atributos en <html>.
 * Se persiste en localStorage. Anti-flash se maneja en layout.tsx.
 */

export const COLOR_THEMES = ["pink", "indigo", "ocean", "emerald", "violet"] as const
export type ColorTheme = typeof COLOR_THEMES[number]

export const THEME_META: Record<ColorTheme, { label: string; hex: string; darkHex: string }> = {
  pink:    { label: "Rosa",      hex: "#F03E6E", darkHex: "#d6335e" },
  indigo:  { label: "Índigo",    hex: "#4F46E5", darkHex: "#3730A3" },
  ocean:   { label: "Océano",    hex: "#0EA5E9", darkHex: "#0284C7" },
  emerald: { label: "Esmeralda", hex: "#10B981", darkHex: "#059669" },
  violet:  { label: "Violeta",   hex: "#7C3AED", darkHex: "#6D28D9" },
}

const LS_COLOR = "edu-color"
const LS_DARK  = "edu-dark"

/** Aplica tema al DOM sin pasar por React */
export function applyTheme(color: ColorTheme, dark: boolean) {
  const html = document.documentElement
  html.setAttribute("data-color", color)
  html.setAttribute("data-theme", dark ? "dark" : "light")
}

/** Persiste y aplica color de brand */
export function setColorTheme(color: ColorTheme) {
  try { localStorage.setItem(LS_COLOR, color) } catch {}
  const dark = getDarkMode()
  applyTheme(color, dark)
}

/** Persiste y aplica modo oscuro */
export function setDarkMode(on: boolean) {
  try { localStorage.setItem(LS_DARK, String(on)) } catch {}
  const color = getColorTheme()
  applyTheme(color, on)
}

/** Lee color guardado */
export function getColorTheme(): ColorTheme {
  try {
    const stored = localStorage.getItem(LS_COLOR)
    if (stored && (COLOR_THEMES as readonly string[]).includes(stored)) {
      return stored as ColorTheme
    }
  } catch {}
  return "pink"
}

/** Lee modo oscuro guardado */
export function getDarkMode(): boolean {
  try { return localStorage.getItem(LS_DARK) === "true" } catch {}
  return false
}

/** Inicializa tema desde localStorage — llamar solo en cliente */
export function initTheme() {
  if (typeof window === "undefined") return
  applyTheme(getColorTheme(), getDarkMode())
}
