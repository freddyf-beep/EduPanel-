"use client"

// ═══════════════════════════════════════════════════════════════════════════
// SnapshotPanel — historial de versiones de pruebas y guías
// ─────────────────────────────────────────────────────────────────────────
// Panel deslizante (drawer derecho ≥1024px / modal full-screen <1024px) que
// lista los Snapshot_Version de un documento en orden descendente por
// timestamp, permitiendo "Ver" el payload JSON, "Restaurar" la versión al
// editor (vía callback) o "Eliminar" el snapshot.
//
// Características clave:
//  • "use client" REQUERIDO (estado, efectos, document.addEventListener).
//  • Cuando `open` pasa a true, dispara `cargarSnapshots(tipo, docId)` y
//    almacena la lista en estado. Loading + error se renderizan inline.
//  • Cada fila muestra fecha "DD/MM/YYYY HH:mm" + autor + acciones
//    (Ver / Restaurar / Eliminar). "Ver" abre un sub-diálogo con el JSON
//    crudo del payload. "Restaurar" pide confirmación inline antes de
//    invocar `onRestaurar`. "Eliminar" pide confirmación, ejecuta
//    `eliminarSnapshot` y refresca la lista.
//  • Empty state cuando no hay snapshots.
//  • Botones primarios usan los tokens CSS de acento (`--accent-pruebas` /
//    `--accent-guias`) según el prop `accent`.
//  • Cierra con Esc.
//
// Refs: Req 14.2
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Eye,
  History,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  cargarSnapshots,
  eliminarSnapshot,
  type Snapshot,
  type TipoDocumento,
} from "@/lib/snapshots"
import ErrorBanner from "./error-banner"

// ─── Props ──────────────────────────────────────────────────────────────────

export interface SnapshotPanelProps<T = unknown> {
  open: boolean
  onClose: () => void
  tipo: TipoDocumento
  docId: string
  accent: "rose" | "violet"
  /** Callback cuando el usuario confirma "Restaurar". Recibe el payload completo. */
  onRestaurar: (snapshot: Snapshot<T>) => void
}

// ─── Componente principal ──────────────────────────────────────────────────

export function SnapshotPanel<T = unknown>({
  open,
  onClose,
  tipo,
  docId,
  accent,
  onRestaurar,
}: SnapshotPanelProps<T>) {
  const styles = getAccentStyles(accent)

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sub-diálogos: ver payload, confirmar restaurar, confirmar eliminar.
  const [viewing, setViewing] = useState<Snapshot | null>(null)
  const [confirmingRestore, setConfirmingRestore] = useState<Snapshot | null>(
    null,
  )
  const [confirmingDelete, setConfirmingDelete] = useState<Snapshot | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)

  // ── Carga / refresco de snapshots ──────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!docId) {
      setSnapshots([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await cargarSnapshots(tipo, docId)
      setSnapshots(list)
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo cargar el historial"
      setError(msg)
      setSnapshots([])
    } finally {
      setLoading(false)
    }
  }, [tipo, docId])

  useEffect(() => {
    if (open) {
      void cargar()
    } else {
      // Cerrar también limpia los sub-diálogos para evitar parpadeos al reabrir.
      setViewing(null)
      setConfirmingRestore(null)
      setConfirmingDelete(null)
    }
  }, [open, cargar])

  // ── ESC cierra el panel (o el sub-diálogo abierto, si lo hay) ─────────
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      if (viewing) {
        setViewing(null)
        return
      }
      if (confirmingRestore) {
        setConfirmingRestore(null)
        return
      }
      if (confirmingDelete) {
        setConfirmingDelete(null)
        return
      }
      onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose, viewing, confirmingRestore, confirmingDelete])

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleConfirmRestore = useCallback(() => {
    if (!confirmingRestore) return
    onRestaurar(confirmingRestore as Snapshot<T>)
    setConfirmingRestore(null)
    onClose()
  }, [confirmingRestore, onRestaurar, onClose])

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmingDelete) return
    setDeleting(true)
    setError(null)
    try {
      await eliminarSnapshot(tipo, docId, confirmingDelete.id)
      setConfirmingDelete(null)
      await cargar()
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo eliminar la versión"
      setError(msg)
    } finally {
      setDeleting(false)
    }
  }, [confirmingDelete, tipo, docId, cargar])

  if (!open) return null

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Historial de versiones"
        className={cn(
          // Mobile/tablet: modal full-screen.
          "fixed inset-0 z-40 flex flex-col bg-card",
          // Desktop ≥1024px: drawer derecho ancla.
          "lg:left-auto lg:top-0 lg:right-0 lg:h-full lg:w-[380px] lg:border-l lg:border-border",
        )}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-border bg-card px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <History
                aria-hidden="true"
                className={cn("h-4 w-4", styles.iconText)}
              />
              <h2 className="text-[15px] font-black tracking-tight text-foreground">
                Historial de versiones
              </h2>
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {snapshots.length > 0
                ? `${snapshots.length} ${snapshots.length === 1 ? "versión guardada" : "versiones guardadas"}`
                : "Versiones guardadas del documento"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar historial"
            className={cn(
              "grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] border border-border bg-card text-muted-foreground",
              "transition-colors hover:bg-muted/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              styles.focusRing,
            )}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        {/* Body con scroll */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {error ? (
            <div className="mb-3">
              <ErrorBanner
                message={error}
                onRetry={() => void cargar()}
                onDismiss={() => setError(null)}
              />
            </div>
          ) : null}

          {loading ? (
            <LoadingState />
          ) : snapshots.length === 0 && !error ? (
            <EmptyState />
          ) : (
            <ul className="flex flex-col gap-2">
              {snapshots.map((snap) => (
                <li key={snap.id}>
                  <SnapshotRow
                    snapshot={snap}
                    accent={accent}
                    onView={() => setViewing(snap)}
                    onRestore={() => setConfirmingRestore(snap)}
                    onDelete={() => setConfirmingDelete(snap)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Sub-diálogo: ver payload JSON */}
      {viewing ? (
        <ViewPayloadDialog
          snapshot={viewing}
          accent={accent}
          onClose={() => setViewing(null)}
        />
      ) : null}

      {/* Sub-diálogo: confirmar restaurar */}
      {confirmingRestore ? (
        <ConfirmDialog
          title="Restaurar esta versión"
          message={`Cargarás la versión del ${formatTimestamp(confirmingRestore.timestamp)} en el editor. Tus cambios actuales no se perderán hasta que guardes explícitamente.`}
          confirmLabel="Restaurar"
          confirmTone={accent}
          onConfirm={handleConfirmRestore}
          onCancel={() => setConfirmingRestore(null)}
        />
      ) : null}

      {/* Sub-diálogo: confirmar eliminar */}
      {confirmingDelete ? (
        <ConfirmDialog
          title="Eliminar esta versión"
          message={`Vas a eliminar permanentemente la versión del ${formatTimestamp(confirmingDelete.timestamp)}. Esta acción no se puede deshacer.`}
          confirmLabel={deleting ? "Eliminando..." : "Eliminar"}
          confirmTone="danger"
          confirmDisabled={deleting}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => (deleting ? undefined : setConfirmingDelete(null))}
        />
      ) : null}
    </>
  )
}

export default SnapshotPanel

// ─── Subcomponentes ─────────────────────────────────────────────────────────

interface SnapshotRowProps {
  snapshot: Snapshot
  accent: "rose" | "violet"
  onView: () => void
  onRestore: () => void
  onDelete: () => void
}

function SnapshotRow({
  snapshot,
  accent,
  onView,
  onRestore,
  onDelete,
}: SnapshotRowProps) {
  const styles = getAccentStyles(accent)
  const fecha = formatTimestamp(snapshot.timestamp)
  const autor = snapshot.autor?.trim() || "Autor desconocido"

  return (
    <div className="rounded-[12px] border border-border bg-background px-3 py-2.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-bold text-foreground">{fecha}</span>
        <span className="truncate text-[11.5px] text-muted-foreground">
          {autor}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onView}
          aria-label="Ver versión"
          className={cn(
            "inline-flex items-center gap-1 rounded-[8px] border border-border bg-card px-2.5 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            styles.focusRing,
          )}
        >
          <Eye aria-hidden="true" className="h-3.5 w-3.5" />
          Ver
        </button>

        <button
          type="button"
          onClick={onRestore}
          aria-label="Restaurar versión"
          className={cn(
            "inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-bold text-white transition-opacity",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            styles.primaryButton,
          )}
        >
          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
          Restaurar
        </button>

        <button
          type="button"
          onClick={onDelete}
          aria-label="Eliminar versión"
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-[8px] border border-red-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-red-700 transition-colors hover:bg-red-50",
            "dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-900/40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-red-500",
          )}
        >
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          Eliminar
        </button>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 py-12 text-muted-foreground"
    >
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      <span className="text-[13px]">Cargando versiones...</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-[14px] border-2 border-dashed border-border bg-card/40 p-6 text-center">
      <History
        aria-hidden="true"
        className="mx-auto h-8 w-8 text-muted-foreground/60"
      />
      <h3 className="mt-3 text-[13.5px] font-extrabold text-foreground">
        Aún no hay versiones guardadas.
      </h3>
      <p className="mx-auto mt-1 max-w-xs text-[12px] leading-5 text-muted-foreground">
        Las versiones se crean cada vez que guardas el documento.
      </p>
    </div>
  )
}

interface ViewPayloadDialogProps {
  snapshot: Snapshot
  accent: "rose" | "violet"
  onClose: () => void
}

function ViewPayloadDialog({
  snapshot,
  accent,
  onClose,
}: ViewPayloadDialogProps) {
  const styles = getAccentStyles(accent)
  const json = useMemo(() => {
    try {
      return JSON.stringify(snapshot.payload, null, 2)
    } catch {
      return "// No se pudo serializar el payload."
    }
  }, [snapshot])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa de la versión"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={cn(
          "relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-card shadow-xl",
          "sm:h-auto sm:max-h-[85vh] sm:rounded-[16px] sm:border sm:border-border",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-extrabold text-foreground">
              Vista previa de la versión
            </h3>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {formatTimestamp(snapshot.timestamp)} ·{" "}
              {snapshot.autor?.trim() || "Autor desconocido"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista previa"
            className={cn(
              "grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] border border-border bg-card text-muted-foreground",
              "transition-colors hover:bg-muted/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              styles.focusRing,
            )}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-muted/30 px-4 py-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-foreground">
            {json}
          </pre>
        </div>
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  confirmTone: "rose" | "violet" | "danger"
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmTone,
  confirmDisabled,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmClass = getConfirmButtonClass(confirmTone)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="w-full max-w-md rounded-[14px] border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-extrabold text-foreground">{title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {message}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar"
            className={cn(
              "inline-flex items-center justify-center rounded-[10px] border border-border bg-card px-4 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground",
            )}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            aria-label={confirmLabel}
            className={cn(
              "inline-flex items-center justify-center rounded-[10px] px-4 py-2 text-[12px] font-bold text-white transition-opacity",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-60",
              confirmClass,
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface AccentStyles {
  focusRing: string
  iconText: string
  primaryButton: string
}

function getAccentStyles(accent: "rose" | "violet"): AccentStyles {
  if (accent === "violet") {
    return {
      focusRing: "focus-visible:ring-[var(--accent-guias)]",
      iconText: "text-[var(--accent-guias)]",
      primaryButton:
        "bg-[var(--accent-guias)] hover:opacity-90 focus-visible:ring-[var(--accent-guias)]",
    }
  }
  return {
    focusRing: "focus-visible:ring-[var(--accent-pruebas)]",
    iconText: "text-[var(--accent-pruebas)]",
    primaryButton:
      "bg-[var(--accent-pruebas)] hover:opacity-90 focus-visible:ring-[var(--accent-pruebas)]",
  }
}

function getConfirmButtonClass(tone: "rose" | "violet" | "danger"): string {
  if (tone === "violet") {
    return "bg-[var(--accent-guias)] hover:opacity-90 focus-visible:ring-[var(--accent-guias)]"
  }
  if (tone === "danger") {
    return "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500 dark:bg-red-700 dark:hover:bg-red-800"
  }
  return "bg-[var(--accent-pruebas)] hover:opacity-90 focus-visible:ring-[var(--accent-pruebas)]"
}

/**
 * Formatea un Firestore Timestamp como "DD/MM/YYYY HH:mm" en zona local.
 * Cuando el snapshot es muy reciente, `timestamp` puede ser `null` mientras
 * Firestore resuelve el `serverTimestamp()`. En ese caso devolvemos una
 * etiqueta amistosa para no mostrar "Invalid Date".
 */
function formatTimestamp(ts: Snapshot["timestamp"]): string {
  if (!ts) return "Hace unos segundos"
  let date: Date
  try {
    date = ts.toDate()
  } catch {
    return "Fecha desconocida"
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "Fecha desconocida"
  }
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, "0")
  const mi = String(date.getMinutes()).padStart(2, "0")
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
}
