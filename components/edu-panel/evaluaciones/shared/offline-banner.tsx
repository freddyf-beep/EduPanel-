"use client"

import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"

export interface OfflineBannerProps {
  /**
   * Callback ejecutado automáticamente cuando vuelve la conexión a la red.
   * Permite que componentes consumidores reintenten cargas o sincronizaciones
   * sin requerir acción del usuario.
   */
  onReconnect?: () => void
  /**
   * Callback opcional ejecutado cuando el usuario presiona el botón "Reintentar"
   * mientras el banner está visible (usuario sin red intentando manualmente).
   */
  onManualRetry?: () => void
}

/**
 * Banner que se muestra cuando el navegador detecta que está sin conexión.
 *
 * - Inicializa `online` en `true` para evitar mismatch de hidratación SSR; tras
 *   montarse sincroniza el estado real con `navigator.onLine`.
 * - Escucha eventos `online` / `offline` del `window`.
 * - Cuando vuelve la red dispara `onReconnect` automáticamente y oculta el banner.
 *
 * Refs: Req 13.6, Req 13.7
 */
export function OfflineBanner({ onReconnect, onManualRetry }: OfflineBannerProps) {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setOnline(navigator.onLine)
    }

    const handleOnline = () => {
      setOnline(true)
      onReconnect?.()
    }
    const handleOffline = () => {
      setOnline(false)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [onReconnect])

  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
    >
      <WifiOff className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold leading-tight">Sin conexión</p>
        <p className="mt-0.5 text-[12px] leading-snug">
          Se restablecerá automáticamente al volver la red. Tus cambios locales no se han perdido.
        </p>
      </div>
      {onManualRetry && (
        <button
          type="button"
          onClick={onManualRetry}
          className="flex-shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-amber-800 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100 dark:hover:bg-amber-900/50"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}

export default OfflineBanner
