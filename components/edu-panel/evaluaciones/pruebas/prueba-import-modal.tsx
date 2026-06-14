"use client"

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import { Upload, X, Loader2, AlertCircle, CheckCircle2, FileText } from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { importarPruebaDesdeDocx } from "@/lib/import/prueba-import"
import { guardarPrueba } from "@/lib/pruebas"
import { ErrorBanner } from "@/components/edu-panel/evaluaciones/shared/error-banner"
import { cn } from "@/lib/utils"

interface Props {
  curso: string
  abierto: boolean
  onClose: () => void
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const INVALID_FILE_MSG = "Archivo inválido: solo .docx hasta 10 MB"

/**
 * Modal de importación de pruebas desde Word (.docx).
 *
 * - Drop zone con drag & drop, click y teclado (Enter/Espacio) para abrir el
 *   selector nativo de archivos.
 * - Validación cliente del archivo: extensión `.docx` (case-insensitive),
 *   MIME `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
 *   (cuando está presente) y tamaño máximo 10 MB.
 * - Errores discretos con `ErrorBanner` shared.
 * - Reutiliza `importarPruebaDesdeDocx` sin cambiar su firma.
 *
 * Refs: Req 4.8, Req 4.9, Req 4.10, Req 16.6
 */
export function PruebaImportModal({ curso, abierto, onClose }: Props) {
  const router = useRouter()
  const { asignatura } = useActiveSubject()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<"idle" | "subiendo" | "ok" | "err">("idle")
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pruebaImportadaId, setPruebaImportadaId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // Resetear el estado interno cuando se abre/cierra el modal.
  useEffect(() => {
    if (!abierto) {
      setEstado("idle")
      setWarnings([])
      setError(null)
      setPruebaImportadaId(null)
      setIsDragOver(false)
    }
  }, [abierto])

  // Cerrar con Escape (excepto durante la subida).
  useEffect(() => {
    if (!abierto) return
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && estado !== "subiendo") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [abierto, estado, onClose])

  if (!abierto) return null

  const validarArchivo = (file: File): string | null => {
    const nameOk = file.name.toLowerCase().endsWith(".docx")
    // El MIME puede venir vacío en algunos navegadores tras drag&drop; en ese
    // caso confiamos en la extensión. Si viene, debe coincidir.
    const mimeOk = !file.type || file.type === DOCX_MIME
    if (!nameOk || !mimeOk) return INVALID_FILE_MSG
    if (file.size > MAX_FILE_BYTES) return INVALID_FILE_MSG
    return null
  }

  const procesar = async (file: File) => {
    const validationError = validarArchivo(file)
    if (validationError) {
      setError(validationError)
      setEstado("err")
      return
    }
    if (!curso) {
      setError("Selecciona un curso primero")
      setEstado("err")
      return
    }

    setEstado("subiendo")
    setError(null)
    setWarnings([])
    try {
      const { prueba, warnings: w } = await importarPruebaDesdeDocx(file, asignatura, curso)
      await guardarPrueba(prueba)
      setPruebaImportadaId(prueba.id)
      setWarnings(w)
      setEstado("ok")
    } catch (e: any) {
      setError(e?.message || "Error al importar")
      setEstado("err")
    }
  }

  const irAlEditor = () => {
    if (!pruebaImportadaId) return
    router.push(buildUrl("/evaluaciones", withAsignatura({
      tab: "pruebas", view: "editor", pruebaId: pruebaImportadaId,
    }, asignatura)))
    onClose()
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (estado === "subiendo") return
    const file = e.dataTransfer.files?.[0]
    if (file) void procesar(file)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (estado === "subiendo") return
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
    setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    // Solo desactivar si el drag sale del propio drop zone, no de un hijo.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setIsDragOver(false)
  }

  const handleDropZoneKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  const handleBackdropClick = () => {
    if (estado === "subiendo") return
    onClose()
  }

  const reintentar = () => {
    setError(null)
    setEstado("idle")
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Importar prueba desde Word"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-lg rounded-[16px] border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-[16px] font-extrabold">
              <Upload className="h-4 w-4 text-primary" aria-hidden="true" />
              Importar prueba desde Word
            </h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Sube un .docx con preguntas. La detección es aproximada — revisa el resultado.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={estado === "subiendo"}
            aria-label="Cerrar"
            className={cn(
              "rounded p-1 transition-colors hover:bg-muted/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              estado === "subiendo" && "cursor-not-allowed opacity-50",
            )}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {error && estado === "err" && (
          <div className="mb-3">
            <ErrorBanner
              message={error}
              onRetry={reintentar}
              onDismiss={reintentar}
            />
          </div>
        )}

        {estado !== "ok" && estado !== "subiendo" && (
          <div
            ref={dropZoneRef}
            role="button"
            tabIndex={0}
            aria-label="Subir archivo .docx"
            onClick={() => inputRef.current?.click()}
            onKeyDown={handleDropZoneKeyDown}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed p-8 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isDragOver
                ? "border-primary bg-pink-light/60"
                : "border-primary/40 bg-pink-light/30 hover:border-primary hover:bg-pink-light/60",
            )}
          >
            <FileText className="h-10 w-10 text-primary/60" aria-hidden="true" />
            <div className="text-center text-[13px] font-bold text-foreground">
              {isDragOver
                ? "Suelta el archivo para importar"
                : "Arrastra un .docx aquí o haz clic para seleccionar"}
            </div>
            <div className="text-center text-[11px] text-muted-foreground">
              El sistema detectará secciones, preguntas y alternativas · máx. 10 MB
            </div>
          </div>
        )}

        {estado === "subiendo" && (
          <div
            className="flex flex-col items-center justify-center gap-2 p-8"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <div className="text-[12.5px] text-muted-foreground">Procesando archivo…</div>
          </div>
        )}

        {estado === "ok" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <div>Prueba importada y guardada como borrador.</div>
            </div>
            {warnings.length > 0 && (
              <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
                <div className="mb-2 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                  <span className="text-[11px] font-bold uppercase text-amber-700 dark:text-amber-200">Avisos</span>
                </div>
                <ul className="space-y-1 text-[11.5px] text-amber-800 dark:text-amber-100">
                  {warnings.slice(0, 5).map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              onClick={irAlEditor}
              className={cn(
                "w-full rounded-[10px] bg-primary px-4 py-2.5 text-[12.5px] font-bold text-primary-foreground hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              Abrir en el editor
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void procesar(f)
            e.target.value = ""
          }}
        />
      </div>
    </div>
  )
}
