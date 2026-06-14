"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"

export interface UnsavedChangesGuardProps {
  /**
   * Cuando es `true`, el guard activa la protección contra navegación accidental.
   * Cuando es `false`, los listeners se desmontan y el componente nunca renderiza
   * el modal.
   */
  dirty: boolean
  /**
   * Handler opcional invocado cuando el docente elige "Guardar y salir".
   * Puede ser síncrono o asíncrono. Si se provee, el botón "Guardar y salir"
   * se renderiza como acción primaria del modal. El modal cerrará y la
   * navegación interceptada se reanudará una vez que la promesa resuelva.
   */
  onSaveAndExit?: () => Promise<void> | void
  /** Texto del título del modal. Default: "Tienes cambios sin guardar". */
  title?: string
  /** Texto del cuerpo del modal. */
  message?: string
}

/**
 * UnsavedChangesGuard — protege al docente contra navegaciones accidentales
 * cuando hay cambios pendientes en el editor de Pruebas o Guías.
 *
 * Comportamiento:
 *
 * 1. **Tab close / refresh / navegación externa:** Mientras `dirty` sea `true`,
 *    se registra un listener `beforeunload` que dispara la confirmación nativa
 *    del navegador (texto controlado por el browser, no por la app).
 *
 * 2. **Navegación interna por click en links:** Mientras `dirty` sea `true`,
 *    se intercepta a nivel de documento cualquier click sobre un anchor
 *    (`<a href>`) que apunte a una ruta same-origin distinta. En vez de seguir
 *    el link, el guard abre un modal con tres acciones:
 *      - "Salir sin guardar" (destructiva): descarta los cambios y navega.
 *      - "Cancelar" (neutral): cierra el modal y permanece en la página.
 *      - "Guardar y salir" (primaria, solo si `onSaveAndExit` está provisto):
 *        ejecuta el callback y luego navega.
 *
 * Limitaciones conocidas (best-effort):
 *   - No se intercepta `router.push` programático invocado desde código de
 *     la app. Componentes que disparen navegación programática deben consultar
 *     `dirty` antes de navegar.
 *   - No se intercepta `popstate` (botones atrás/adelante del navegador). El
 *     listener `beforeunload` cubre el caso de salida real del documento, pero
 *     navegaciones SPA por historial no se confirman in-app.
 *   - Clicks con modificadores (Ctrl/Cmd/Shift/Alt), `target="_blank"`,
 *     atributo `download`, o esquemas `mailto:` / `tel:` no se interceptan
 *     (son acciones donde el usuario claramente quiere otra cosa que reemplazar
 *     la pestaña actual).
 *
 * Refs: Req 5.19, Req 6.16
 */
export function UnsavedChangesGuard({
  dirty,
  onSaveAndExit,
  title = "Tienes cambios sin guardar",
  message = "Si sales ahora perderás los cambios que no se hayan guardado.",
}: UnsavedChangesGuardProps) {
  const router = useRouter()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dialogRef = useRef<HTMLDivElement | null>(null)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  // ── 1. Native beforeunload (tab close / refresh / external navigation) ──
  useEffect(() => {
    if (!dirty) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Required by older browsers; modern Chrome/Firefox ignore the string and
      // show a generic message, but `returnValue = ""` still triggers the prompt.
      e.returnValue = ""
    }

    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  // ── 2. In-app anchor click interception ──
  useEffect(() => {
    if (!dirty) return

    const handler = (e: MouseEvent) => {
      // Respect explicit cancellations from upstream listeners.
      if (e.defaultPrevented) return
      // Modified clicks → user is opening in new tab/window, not navigating.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      // Only primary button.
      if (e.button !== 0) return

      const target = e.target as HTMLElement | null
      if (!target) return

      const anchor = target.closest("a")
      if (!anchor) return

      const href = anchor.getAttribute("href")
      if (!href) return

      // New tab / explicit downloads / external schemes → leave alone.
      const targetAttr = anchor.getAttribute("target")
      if (targetAttr === "_blank") return
      if (anchor.hasAttribute("download")) return
      if (/^(mailto:|tel:|javascript:)/i.test(href)) return

      // Pure hash (same-page anchor) → no real navigation.
      if (href.startsWith("#")) return

      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }

      // Cross-origin → let the browser handle it; beforeunload covers the warn.
      if (url.origin !== window.location.origin) return

      // Same path + same search → not actually navigating away.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return
      }

      e.preventDefault()
      e.stopPropagation()

      setPendingHref(url.pathname + url.search + url.hash)
    }

    // Capture phase so we run before frameworks/components that listen
    // in the bubble phase.
    document.addEventListener("click", handler, true)
    return () => document.removeEventListener("click", handler, true)
  }, [dirty])

  // ── 3. Modal lifecycle: focus management + Esc + basic focus trap ──
  useEffect(() => {
    if (!pendingHref) {
      // Restore focus to whatever was focused before the modal opened.
      const prev = previouslyFocusedRef.current
      previouslyFocusedRef.current = null
      if (prev && typeof prev.focus === "function") {
        prev.focus()
      }
      return
    }

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    // Defer focus to next frame so the dialog has mounted.
    const raf = requestAnimationFrame(() => {
      cancelButtonRef.current?.focus()
    })

    return () => cancelAnimationFrame(raf)
  }, [pendingHref])

  const handleCancel = useCallback(() => {
    setPendingHref(null)
  }, [])

  useEffect(() => {
    if (!pendingHref) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        handleCancel()
        return
      }

      if (e.key === "Tab") {
        const dialog = dialogRef.current
        if (!dialog) return

        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute("aria-hidden"))

        if (focusables.length === 0) return

        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement | null
        const inside = active ? dialog.contains(active) : false

        if (e.shiftKey) {
          if (!inside || active === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (!inside || active === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [pendingHref, handleCancel])

  function handleDiscard() {
    const target = pendingHref
    setPendingHref(null)
    if (target) router.push(target)
  }

  async function handleSaveAndExit() {
    if (!onSaveAndExit) return
    const target = pendingHref
    setSaving(true)
    try {
      await onSaveAndExit()
      setPendingHref(null)
      if (target) router.push(target)
    } finally {
      setSaving(false)
    }
  }

  if (!pendingHref) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) handleCancel()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-guard-title"
        aria-describedby="unsaved-changes-guard-message"
        className="w-full max-w-md rounded-[14px] border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="unsaved-changes-guard-title"
          className="text-[15px] font-extrabold text-foreground"
        >
          {title}
        </h2>

        <p
          id="unsaved-changes-guard-message"
          className="mt-2 text-[13px] leading-relaxed text-muted-foreground"
        >
          {message}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={saving}
            aria-label="Salir sin guardar"
            className={cn(
              "inline-flex items-center justify-center rounded-[10px] px-4 py-2 text-[12px] font-bold transition-colors",
              "border border-red-300 bg-white text-red-700 hover:bg-red-50",
              "dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-900/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-red-500",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            Salir sin guardar
          </button>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-2">
            <button
              type="button"
              ref={cancelButtonRef}
              onClick={handleCancel}
              disabled={saving}
              aria-label="Cancelar"
              className={cn(
                "inline-flex items-center justify-center rounded-[10px] border border-border bg-card px-4 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[var(--accent-pruebas)]",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              Cancelar
            </button>

            {onSaveAndExit ? (
              <button
                type="button"
                onClick={handleSaveAndExit}
                disabled={saving}
                aria-label="Guardar y salir"
                className={cn(
                  "inline-flex items-center justify-center rounded-[10px] px-4 py-2 text-[12px] font-bold text-white transition-opacity",
                  "bg-[var(--accent-pruebas)] hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[var(--accent-pruebas)]",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {saving ? "Guardando..." : "Guardar y salir"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default UnsavedChangesGuard
