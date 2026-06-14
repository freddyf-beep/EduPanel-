"use client"

// ═══════════════════════════════════════════════════════════════════════════
// SnapshotStagedBanner — vista previa de un snapshot restaurado
// ─────────────────────────────────────────────────────────────────────────
// Banner informativo (no error) que se renderiza encima del editor de Pruebas
// o Guías cuando el docente restauró un Snapshot_Version desde el panel de
// historial. La restauración carga el JSON del snapshot como nuevo estado del
// editor en memoria, pero NO escribe a Firestore hasta que el docente guarde
// explícitamente. Este banner avisa al docente de ese estado intermedio y le
// ofrece "Descartar previsualización" para volver al documento actual.
//
// Características clave:
//  • "use client" REQUERIDO (componente interactivo).
//  • Tono ámbar (informativo) — visualmente consistente con `OfflineBanner`.
//  • Icono `History` (lucide-react).
//  • Copy: "Vista del snapshot del {fecha} — guarda para confirmar."
//  • Botón secundario "Descartar previsualización" que invoca `onDescartar`.
//  • El prop `accent` se acepta para permitir variantes contextuales futuras
//    (Pruebas → rose, Guías → violet); por ahora la UI conserva la paleta
//    ámbar para reforzar el tono "atención requerida".
//  • Soporta dark mode usando las variantes `dark:` de Tailwind.
//
// Refs: Req 14.3
// ═══════════════════════════════════════════════════════════════════════════

import { History } from "lucide-react"

export interface SnapshotStagedBannerProps {
  /** Fecha del snapshot que está siendo previsualizado. */
  fecha: string
  /** Acción para descartar la previsualización y volver al documento actual de Firestore. */
  onDescartar: () => void
  /** Acento contextual ("rose" para Pruebas, "violet" para Guías). */
  accent: "rose" | "violet"
}

export function SnapshotStagedBanner({
  fecha,
  onDescartar,
  accent: _accent,
}: SnapshotStagedBannerProps) {
  // El acento se acepta a propósito y se ignora en la paleta visual: el banner
  // mantiene tono ámbar informativo independientemente del editor anfitrión
  // para que el docente reconozca al instante el estado "vista previa".
  void _accent

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
    >
      <History className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] leading-snug">
          Vista del snapshot del{" "}
          <span className="font-semibold">{fecha}</span> — guarda para
          confirmar.
        </p>
      </div>
      <button
        type="button"
        onClick={onDescartar}
        className="flex-shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-amber-800 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100 dark:hover:bg-amber-900/50"
      >
        Descartar previsualización
      </button>
    </div>
  )
}

export default SnapshotStagedBanner
