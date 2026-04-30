"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // En produccion, aqui se reportaria a Sentry/Vercel Logs
    console.error("[app/error.tsx]", error)
  }, [error])

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-[14px] p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 grid place-items-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-xl font-extrabold mb-2">Algo salio mal</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Ocurrio un error inesperado. Puedes reintentar o volver al inicio.
        </p>
        {error.digest && (
          <p className="text-[11px] text-muted-foreground mb-4 font-mono">
            ID: {error.digest}
          </p>
        )}
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="bg-primary text-primary-foreground rounded-xl px-4 py-2 font-bold hover:opacity-90 transition"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="border border-border rounded-xl px-4 py-2 font-bold hover:bg-muted/60 transition"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
