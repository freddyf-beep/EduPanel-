"use client"

import { useMemo, useState, type ComponentType } from "react"
import { FileText, Printer, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  buildDocumentHtml,
  descargarComoDOCX,
  documentFileName,
  imprimirHtml,
  type DocumentHtmlOptions,
} from "./document-download"
import { cn } from "@/lib/utils"

type DocumentPreviewModalProps = DocumentHtmlOptions & {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DocumentPreviewModal({
  open,
  onOpenChange,
  ...options
}: DocumentPreviewModalProps) {
  const [busy, setBusy] = useState<"print" | "docx" | null>(null)
  const html = useMemo(() => buildDocumentHtml(options), [
    options.tipo,
    options.documento,
    options.colegio,
    options.profesorNombre,
    options.modo,
    options.alumno,
  ])
  const title = options.tipo === "prueba"
    ? options.documento.nombre || "Prueba"
    : options.documento.nombre || "Guia"
  const modeLabel = options.modo === "con_pauta" ? "Pauta" : "Vista alumno"

  const run = async (kind: "print" | "docx") => {
    setBusy(kind)
    try {
      if (kind === "print") await imprimirHtml(html)
      if (kind === "docx") await descargarComoDOCX(options)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-[min(1120px,calc(100vw-24px))] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-[15px] font-bold">
                {modeLabel}: {title}
              </DialogTitle>
              <DialogDescription className="text-[12px]">
                Previsualizacion dentro de EduPanel. Usa Imprimir o Guardar como PDF desde el dialogo del navegador.
              </DialogDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <PreviewButton
                icon={Printer}
                label={busy === "print" ? "Preparando..." : "Imprimir / guardar PDF"}
                onClick={() => void run("print")}
                disabled={busy !== null}
              />
              <PreviewButton
                icon={FileText}
                label={busy === "docx" ? "Generando..." : "Descargar DOCX"}
                onClick={() => void run("docx")}
                disabled={busy !== null}
              />
              <PreviewButton
                icon={X}
                label="Cerrar"
                onClick={() => onOpenChange(false)}
                disabled={busy !== null}
              />
            </div>
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 bg-muted/40 p-3">
          <iframe
            title={`Preview ${documentFileName(options, "html")}`}
            srcDoc={html}
            className="h-full w-full rounded-[8px] border border-border bg-white shadow-sm"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PreviewButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-border bg-card px-2.5",
        "text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
