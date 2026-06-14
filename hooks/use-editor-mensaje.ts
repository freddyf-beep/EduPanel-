"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface EditorMensaje {
  tipo: "ok" | "err"
  texto: string
}

/**
 * Estado + helpers para mensajes efímeros en los editores de documentos.
 * `flash` muestra un mensaje que se auto-limpia tras `ms` milisegundos.
 */
export function useEditorMensaje(defaultMs = 2000) {
  const [mensaje, setMensaje] = useState<EditorMensaje | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const flash = useCallback(
    (tipo: "ok" | "err", texto: string, ms = defaultMs) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setMensaje({ tipo, texto })
      timerRef.current = setTimeout(() => setMensaje(null), ms)
    },
    [defaultMs],
  )

  return { mensaje, setMensaje, flash }
}
