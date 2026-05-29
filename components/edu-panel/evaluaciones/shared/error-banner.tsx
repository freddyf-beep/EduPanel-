"use client"

import { AlertCircle, RefreshCw, X } from "lucide-react"

import { cn } from "@/lib/utils"

export type ErrorBannerTone = "error" | "warning"

export interface ErrorBannerProps {
  /** Mensaje principal mostrado al usuario. */
  message: string
  /**
   * Handler opcional para el botón "Reintentar". Si no se provee,
   * el botón no se renderiza.
   */
  onRetry?: () => void
  /** Handler obligatorio para cerrar/descartar el banner. */
  onDismiss: () => void
  /**
   * Tono visual del banner.
   * - `error` (default): tonos rojos para fallos.
   * - `warning`: tonos ámbar para advertencias no críticas.
   */
  tone?: ErrorBannerTone
}

/**
 * Banner inline, no bloqueante, para reportar errores o advertencias en la
 * parte superior del contenido de los hubs y editores de Pruebas y Guías.
 *
 * - Layout full-width en una sola fila con icono `AlertCircle`, mensaje
 *   y botones de acción a la derecha. NO es un modal.
 * - Soporta dos tonos (`error` rojo, `warning` ámbar) con clases dark-mode.
 * - El botón "Reintentar" solo aparece cuando se provee `onRetry`.
 * - Ambos botones tienen `aria-label` y anillo `focus-visible` en el color
 *   del tono actual.
 *
 * Refs: Req 13.3, Req 13.4
 */
export function ErrorBanner({
  message,
  onRetry,
  onDismiss,
  tone = "error",
}: ErrorBannerProps) {
  const styles = getToneStyles(tone)

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 rounded-[12px] border p-3",
        styles.container,
      )}
    >
      <AlertCircle
        aria-hidden="true"
        className={cn("mt-0.5 h-4 w-4 flex-shrink-0", styles.icon)}
      />

      <p className="flex-1 min-w-0 text-[13px] leading-snug">{message}</p>

      <div className="flex flex-shrink-0 items-center gap-1">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Reintentar"
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              styles.retryButton,
            )}
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            Reintentar
          </button>
        ) : null}

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            styles.dismissButton,
          )}
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export default ErrorBanner

interface ToneStyles {
  container: string
  icon: string
  retryButton: string
  dismissButton: string
}

function getToneStyles(tone: ErrorBannerTone): ToneStyles {
  if (tone === "warning") {
    return {
      container:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200",
      icon: "text-amber-600 dark:text-amber-300",
      retryButton:
        "border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 focus-visible:ring-amber-500 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100 dark:hover:bg-amber-900/50",
      dismissButton:
        "text-amber-700 hover:bg-amber-100 focus-visible:ring-amber-500 dark:text-amber-200 dark:hover:bg-amber-900/40",
    }
  }

  return {
    container:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200",
    icon: "text-red-600 dark:text-red-300",
    retryButton:
      "border border-red-300 bg-white text-red-800 hover:bg-red-100 focus-visible:ring-red-500 dark:border-red-700 dark:bg-red-900/30 dark:text-red-100 dark:hover:bg-red-900/50",
    dismissButton:
      "text-red-700 hover:bg-red-100 focus-visible:ring-red-500 dark:text-red-200 dark:hover:bg-red-900/40",
  }
}
