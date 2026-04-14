"use client"
import { useEffect, useRef, useState } from "react"

export type SaveStatus = "idle" | "saving_silent" | "saved" | "error"

interface UseAutosaveOptions {
  /** Milisegundos de debounce antes de guardar. Default: 2500 */
  debounceMs?: number
  /** Si true, no ejecutar el autosave (ej: mientras carga la página) */
  skip?: boolean
  /** Milisegundos que dura el estado "saved" antes de volver a "idle". Default: 3000 */
  savedDuration?: number
}

interface UseAutosaveReturn {
  saveStatus: SaveStatus
  setSaveStatus: (status: SaveStatus) => void
}

/**
 * Hook reutilizable de autosave con debounce.
 *
 * Llama `onSave` automáticamente cuando cambia `data`, después de `debounceMs`.
 * Ignora el primer cambio (carga inicial).
 *
 * Uso:
 *   const { saveStatus } = useAutosave(
 *     { estudiantes, evaluaciones },
 *     async () => handleGuardar(true),
 *     { debounceMs: 2500, skip: loading }
 *   )
 */
export function useAutosave<T>(
  data: T,
  onSave: () => Promise<void>,
  options: UseAutosaveOptions = {}
): UseAutosaveReturn {
  const { debounceMs = 2500, skip = false, savedDuration = 3000 } = options

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const ignoreNextRef = useRef(true)

  useEffect(() => {
    if (skip) {
      ignoreNextRef.current = true
      return
    }
    if (ignoreNextRef.current) {
      ignoreNextRef.current = false
      return
    }

    setSaveStatus("saving_silent")
    const timer = setTimeout(async () => {
      try {
        await onSave()
        setSaveStatus("saved")
        setTimeout(() => setSaveStatus("idle"), savedDuration)
      } catch {
        setSaveStatus("error")
        setTimeout(() => setSaveStatus("idle"), 7000)
      }
    }, debounceMs)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, skip])

  return { saveStatus, setSaveStatus }
}
