"use client"

/**
 * Atajos de teclado cross-platform para el módulo de Pruebas y Guías unificado.
 *
 * Provee un hook React (`useShortcuts`) que registra un único listener de
 * `keydown` en `document` y dispara el primer atajo cuyo patrón coincida con el
 * evento. Los modificadores se mapean automáticamente entre plataformas:
 * `Ctrl` se interpreta como `Cmd` (metaKey) en macOS y como `Ctrl` (ctrlKey) en
 * Windows/Linux, para mantener la convención esperada por cada usuario.
 *
 * Refs: Req 5.17, Req 6.13.
 */

import { useEffect } from "react"

// -------------------------------------------------------------
// Tipos públicos
// -------------------------------------------------------------

export interface ShortcutDefinition {
  /**
   * Combinación de teclas en formato legible. Ejemplos: `"Ctrl+S"`,
   * `"Ctrl+Shift+P"`, `"Esc"`. La parte `Ctrl` se mapea a `Cmd` en macOS de
   * forma transparente; usa `Cmd` explícitamente solo si necesitas forzar
   * `metaKey` también en otras plataformas.
   */
  keys: string
  /** Handler que recibe el `KeyboardEvent` original ya interceptado. */
  handler: (e: KeyboardEvent) => void
  /**
   * Si es `true`, el handler se dispara incluso cuando el foco está dentro de
   * un `<input>`, `<textarea>`, `<select>` o `[contenteditable="true"]`. Por
   * defecto los atajos se ignoran en esos contextos para no romper la
   * escritura, salvo `Esc`, que siempre se dispara para permitir cerrar
   * paneles/modales.
   */
  allowInInputs?: boolean
  /** Descripción opcional para tooltip o cheat-sheet visible en la UI. */
  description?: string
}

export interface UseShortcutsOptions {
  /**
   * Permite habilitar/deshabilitar el bloque completo de atajos (útil para
   * desactivarlos cuando un modal pide entrada exclusiva, por ejemplo).
   * Default: `true`.
   */
  enabled?: boolean
}

// -------------------------------------------------------------
// Constantes públicas
// -------------------------------------------------------------

/**
 * Catálogo de atajos canónicos del módulo. Útil para mantener consistencia
 * entre Editor_Prueba, Editor_Guia y otros consumidores.
 */
export const COMMON_SHORTCUTS = {
  GUARDAR: "Ctrl+S",
  VISTA_ALUMNO: "Ctrl+P",
  PAUTA: "Ctrl+Shift+P",
  PANEL_IA: "Ctrl+I",
  BANCO: "Ctrl+B",
  HISTORIAL: "Ctrl+H",
  NUEVA_SECCION: "Ctrl+Shift+N",
  CERRAR: "Esc",
} as const

// -------------------------------------------------------------
// Helpers internos
// -------------------------------------------------------------

interface ParsedShortcut {
  ctrl: boolean
  meta: boolean
  shift: boolean
  alt: boolean
  key: string // ya en lowercase, p.ej. "s", "escape", "arrowleft"
}

/** Detección perezosa y segura de macOS (no rompe en SSR). */
function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  const platform = navigator.platform || ""
  const ua = navigator.userAgent || ""
  return /Mac|iPad|iPhone|iPod/i.test(platform) || /Mac OS X/i.test(ua)
}

/**
 * Normaliza un nombre de tecla a la forma usada por `KeyboardEvent.key` en
 * minúsculas. Acepta alias frecuentes como `Esc`, `Spacebar`, `Up`, etc.
 */
function normalizeKey(raw: string): string {
  const k = raw.trim().toLowerCase()
  switch (k) {
    case "esc":
    case "escape":
      return "escape"
    case "space":
    case "spacebar":
      return " "
    case "up":
    case "arrowup":
      return "arrowup"
    case "down":
    case "arrowdown":
      return "arrowdown"
    case "left":
    case "arrowleft":
      return "arrowleft"
    case "right":
    case "arrowright":
      return "arrowright"
    case "del":
    case "delete":
      return "delete"
    case "ins":
    case "insert":
      return "insert"
    case "return":
    case "enter":
      return "enter"
    case "plus":
      return "+"
    default:
      return k
  }
}

/**
 * Parsea una combinación tipo `"Ctrl+Shift+P"` en flags de modificadores y la
 * tecla principal. Lanza un `Error` si la combinación está vacía.
 */
function parseShortcut(keys: string): ParsedShortcut {
  const parts = keys
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    throw new Error(`[keyboard-shortcuts] Combinación inválida: "${keys}"`)
  }

  const result: ParsedShortcut = {
    ctrl: false,
    meta: false,
    shift: false,
    alt: false,
    key: "",
  }

  parts.forEach((part, idx) => {
    const lower = part.toLowerCase()
    const isLast = idx === parts.length - 1
    if (!isLast) {
      if (lower === "ctrl" || lower === "control") result.ctrl = true
      else if (lower === "cmd" || lower === "meta" || lower === "command") result.meta = true
      else if (lower === "shift") result.shift = true
      else if (lower === "alt" || lower === "option" || lower === "opt") result.alt = true
      else {
        // Si aparece un token desconocido antes del último, lo tratamos como
        // tecla principal y descartamos los siguientes.
        result.key = normalizeKey(part)
      }
    } else {
      result.key = normalizeKey(part)
    }
  })

  return result
}

/**
 * Determina si el `target` del evento corresponde a un campo editable donde
 * deberíamos ignorar atajos por defecto.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  return false
}

/**
 * Compara un `KeyboardEvent` con un atajo parseado, considerando el mapeo
 * cross-platform entre `Ctrl` y `Cmd`.
 */
function matchesShortcut(e: KeyboardEvent, parsed: ParsedShortcut, mac: boolean): boolean {
  // Ctrl en la definición se interpreta como metaKey en macOS o ctrlKey en
  // el resto. Si la definición usa explícitamente Cmd, exige metaKey en
  // cualquier plataforma.
  const expectsCtrlOrCmd = parsed.ctrl || parsed.meta
  const ctrlOrCmdPressed = mac
    ? // En mac, "Ctrl" → metaKey. "Cmd" también → metaKey.
      e.metaKey
    : // En otros sistemas, "Ctrl" → ctrlKey. "Cmd" se interpreta como metaKey
      // solo si la definición fue explícita.
      parsed.meta
      ? e.metaKey
      : e.ctrlKey

  if (expectsCtrlOrCmd && !ctrlOrCmdPressed) return false
  if (!expectsCtrlOrCmd && (e.ctrlKey || e.metaKey)) return false

  if (parsed.shift !== e.shiftKey) return false
  if (parsed.alt !== e.altKey) return false

  const eventKey = (e.key || "").toLowerCase()
  return eventKey === parsed.key
}

// -------------------------------------------------------------
// Hook principal
// -------------------------------------------------------------

/**
 * Registra una lista de atajos a nivel `document` mientras el componente esté
 * montado. La primera definición que coincida con el evento detiene la
 * propagación (`preventDefault`) y ejecuta su handler.
 *
 * @example
 * ```tsx
 * useShortcuts([
 *   { keys: COMMON_SHORTCUTS.GUARDAR, handler: () => guardar() },
 *   { keys: COMMON_SHORTCUTS.CERRAR, handler: () => cerrarPanel() },
 * ])
 * ```
 */
export function useShortcuts(
  shortcuts: ShortcutDefinition[],
  opts: UseShortcutsOptions = {},
): void {
  const enabled = opts.enabled !== false

  useEffect(() => {
    if (!enabled) return
    if (typeof document === "undefined") return
    if (shortcuts.length === 0) return

    const mac = isMacPlatform()

    // Pre-parseamos una vez para evitar trabajo en cada keydown.
    const parsed = shortcuts.map((s) => ({ def: s, parsed: parseShortcut(s.keys) }))

    function onKeyDown(e: KeyboardEvent) {
      const editable = isEditableTarget(e.target)

      for (const { def, parsed: p } of parsed) {
        if (!matchesShortcut(e, p, mac)) continue

        // Esc siempre puede dispararse aunque el foco esté en un input, para
        // permitir cerrar modales/paneles desde cualquier contexto.
        const isEscape = p.key === "escape"
        if (editable && !def.allowInInputs && !isEscape) continue

        e.preventDefault()
        def.handler(e)
        return
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [shortcuts, enabled])
}

// -------------------------------------------------------------
// Helpers de presentación
// -------------------------------------------------------------

/**
 * Formatea una combinación para mostrarla en tooltips o cheat-sheets,
 * adaptando los símbolos al sistema operativo del usuario. En macOS usa
 * glifos compactos (`⌘`, `⇧`, `⌥`, `⌃`) sin separadores, mientras que en el
 * resto conserva la notación `Ctrl+Shift+S`.
 *
 * @example
 * formatShortcut("Ctrl+S")          // → "⌘S" en macOS, "Ctrl+S" en otros
 * formatShortcut("Ctrl+Shift+P")    // → "⇧⌘P" en macOS, "Ctrl+Shift+P" en otros
 * formatShortcut("Esc")             // → "Esc"
 */
export function formatShortcut(keys: string): string {
  const parsed = parseShortcut(keys)
  const mac = isMacPlatform()

  const mainKey = renderMainKey(parsed.key)

  if (mac) {
    let out = ""
    if (parsed.ctrl) out += "⌘"
    if (parsed.meta && !parsed.ctrl) out += "⌘"
    if (parsed.alt) out = "⌥" + out
    if (parsed.shift) out = "⇧" + out
    return out + mainKey
  }

  const segments: string[] = []
  if (parsed.ctrl) segments.push("Ctrl")
  if (parsed.meta && !parsed.ctrl) segments.push("Win")
  if (parsed.alt) segments.push("Alt")
  if (parsed.shift) segments.push("Shift")
  segments.push(mainKey)
  return segments.join("+")
}

/** Convierte la tecla parseada (lowercase) a una etiqueta legible. */
function renderMainKey(key: string): string {
  switch (key) {
    case "escape":
      return "Esc"
    case " ":
      return "Space"
    case "arrowup":
      return "↑"
    case "arrowdown":
      return "↓"
    case "arrowleft":
      return "←"
    case "arrowright":
      return "→"
    case "enter":
      return "Enter"
    case "delete":
      return "Del"
    case "insert":
      return "Ins"
    default:
      return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1)
  }
}
