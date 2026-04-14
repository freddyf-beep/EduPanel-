"use client"

import { useState, useEffect } from "react"
import { Sun, Moon, Palette, Check } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  type ColorTheme,
  COLOR_THEMES,
  THEME_META,
  setColorTheme,
  setDarkMode,
  getColorTheme,
  getDarkMode,
} from "@/lib/theme"

export function ThemeSelector() {
  const [color, setColor] = useState<ColorTheme>("pink")
  const [dark, setDark]   = useState(false)

  // Leer desde localStorage solo en cliente
  useEffect(() => {
    setColor(getColorTheme())
    setDark(getDarkMode())
  }, [])

  const handleColor = (c: ColorTheme) => {
    setColor(c)
    setColorTheme(c)
  }

  const handleDark = () => {
    const next = !dark
    setDark(next)
    setDarkMode(next)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background focus:outline-none"
          title="Personalizar apariencia"
          aria-label="Personalizar apariencia"
        >
          <Palette className="h-[17px] w-[17px]" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[230px] rounded-2xl border-border p-4 shadow-xl animate-in slide-in-from-top-2"
      >
        {/* Color */}
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Color de la app
        </p>
        <div className="mb-3 flex items-center gap-2.5">
          {COLOR_THEMES.map((c) => {
            const meta = THEME_META[c]
            const active = color === c
            return (
              <button
                key={c}
                title={meta.label}
                aria-label={meta.label}
                onClick={() => handleColor(c)}
                className="relative h-7 w-7 rounded-full transition-all hover:scale-110 focus:outline-none"
                style={{
                  background: meta.hex,
                  boxShadow: active
                    ? `0 0 0 3px var(--card), 0 0 0 5px ${meta.hex}`
                    : undefined,
                }}
              >
                {active && (
                  <Check
                    className="absolute inset-0 m-auto h-3.5 w-3.5 text-white"
                    strokeWidth={3}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Nombre del color activo */}
        <p className="mb-4 text-[12px] font-semibold" style={{ color: THEME_META[color].hex }}>
          {THEME_META[color].label}
        </p>

        {/* Dark / Light toggle */}
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Modo
        </p>
        <button
          onClick={handleDark}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5 text-[13px] font-semibold transition-colors hover:border-primary"
        >
          <span className="flex items-center gap-2">
            {dark
              ? <Moon className="h-4 w-4 text-primary" />
              : <Sun  className="h-4 w-4 text-primary" />
            }
            {dark ? "Modo oscuro" : "Modo claro"}
          </span>

          {/* Toggle pill */}
          <div
            className="relative h-5 w-9 rounded-full transition-colors"
            style={{ background: dark ? THEME_META[color].hex : "var(--border)" }}
          >
            <div
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
              style={{ transform: dark ? "translateX(18px)" : "translateX(2px)" }}
            />
          </div>
        </button>
      </PopoverContent>
    </Popover>
  )
}
