"use client"

import { useEffect, useMemo, useState } from "react"
import { FileText, Loader2, UploadCloud, Wand2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiFetch } from "@/lib/api-client"
import {
  cargarMapeosFormatoPlanificacion,
  guardarMapeoFormatoPlanificacion,
  type MapeoFormatoPlanificacion,
} from "@/lib/configuracion-formato"
import type { CampoPlanificacionDestino, SeccionPlanificacionParseada } from "@/lib/import/parse-planificacion"

const CAMPOS: Array<{ value: CampoPlanificacionDestino; label: string }> = [
  { value: "ignorar", label: "Ignorar" },
  { value: "objetivo", label: "Objetivo" },
  { value: "inicio", label: "Inicio" },
  { value: "desarrollo", label: "Desarrollo" },
  { value: "cierre", label: "Cierre" },
  { value: "materiales", label: "Materiales" },
  { value: "tics", label: "TICs" },
  { value: "adecuacion", label: "Adecuacion PIE/DUA" },
]

type ImportPayload = Partial<Record<Exclude<CampoPlanificacionDestino, "ignorar">, string | string[]>>

interface ImportWordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (payload: ImportPayload) => void
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function splitList(html: string): string[] {
  return htmlToText(html)
    .split(/\n|;|,/)
    .map(item => item.trim())
    .filter(Boolean)
}

export function ImportWordModal({ open, onOpenChange, onImport }: ImportWordModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [secciones, setSecciones] = useState<SeccionPlanificacionParseada[]>([])
  const [mapping, setMapping] = useState<Record<number, CampoPlanificacionDestino>>({})
  const [mapeos, setMapeos] = useState<MapeoFormatoPlanificacion[]>([])
  const [selectedMapeoId, setSelectedMapeoId] = useState("")
  const [guardarMapeo, setGuardarMapeo] = useState(false)
  const [nombreMapeo, setNombreMapeo] = useState("Mi formato")

  useEffect(() => {
    if (!open) return
    cargarMapeosFormatoPlanificacion().then(setMapeos).catch(() => setMapeos([]))
  }, [open])

  const hasSections = secciones.length > 0

  const preview = useMemo(() => {
    return secciones.slice(0, 4).map(section => `${section.titulo}: ${htmlToText(section.contenido_html).slice(0, 120)}`)
  }, [secciones])

  const aplicarMapeoGuardado = (mapeoId: string) => {
    setSelectedMapeoId(mapeoId)
    const mapeo = mapeos.find(item => item.id === mapeoId)
    if (!mapeo) return
    setMapping(prev => {
      const next = { ...prev }
      secciones.forEach((section, index) => {
        const regla = mapeo.reglas.find(item =>
          item.patronSeccion.toLowerCase() === section.titulo.toLowerCase() ||
          (item.estiloDocx && item.estiloDocx === section.estilo)
        )
        if (regla) next[index] = regla.campoDestino
      })
      return next
    })
  }

  const handleFile = async (file: File) => {
    setLoading(true)
    setError("")
    setSecciones([])
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await apiFetch("/api/parse-planificacion", { method: "POST", body: form })
      const data = await res.json()
      const parsed = Array.isArray(data.secciones) ? data.secciones as SeccionPlanificacionParseada[] : []
      setSecciones(parsed)
      setMapping(Object.fromEntries(parsed.map((section, index) => [index, section.campoSugerido])))
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el Word.")
    } finally {
      setLoading(false)
    }
  }

  const buildPayload = (): ImportPayload => {
    const payload: ImportPayload = {}
    secciones.forEach((section, index) => {
      const field = mapping[index]
      if (!field || field === "ignorar") return
      if (field === "materiales" || field === "tics") {
        const list = splitList(section.contenido_html)
        payload[field] = [...((payload[field] as string[] | undefined) || []), ...list]
        return
      }
      const current = typeof payload[field] === "string" ? payload[field] as string : ""
      payload[field] = [current, section.contenido_html].filter(Boolean).join("\n")
    })
    return payload
  }

  const handleImport = async () => {
    const payload = buildPayload()
    if (guardarMapeo) {
      const saved = await guardarMapeoFormatoPlanificacion({
        nombre: nombreMapeo,
        reglas: secciones.map((section, index) => ({
          patronSeccion: section.titulo,
          estiloDocx: section.estilo,
          campoDestino: mapping[index] || "ignorar",
        })),
      })
      setMapeos(prev => [...prev.filter(item => item.id !== saved.id), saved])
    }
    onImport(payload)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar planificacion Word</DialogTitle>
          <DialogDescription>Parsea una clase desde DOCX y revisa el mapeo antes de aplicarlo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed border-border bg-background px-4 py-8 text-center hover:border-primary/60">
            {loading ? <Loader2 className="mb-2 h-6 w-6 animate-spin text-muted-foreground" /> : <UploadCloud className="mb-2 h-6 w-6 text-muted-foreground" />}
            <span className="text-[13px] font-bold text-foreground">Subir DOCX</span>
            <span className="text-[11px] text-muted-foreground">Una clase por importacion</span>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
                e.currentTarget.value = ""
              }}
            />
          </label>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{error}</p>}

          {hasSections && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedMapeoId}
                  onChange={e => aplicarMapeoGuardado(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] outline-none"
                >
                  <option value="">Mapeo automatico</option>
                  {mapeos.map(mapeo => <option key={mapeo.id} value={mapeo.id}>{mapeo.nombre}</option>)}
                </select>
                <label className="flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
                  <input type="checkbox" checked={guardarMapeo} onChange={e => setGuardarMapeo(e.target.checked)} />
                  Guardar mapeo
                </label>
                {guardarMapeo && (
                  <input
                    value={nombreMapeo}
                    onChange={e => setNombreMapeo(e.target.value)}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] outline-none"
                  />
                )}
              </div>

              <div className="space-y-2">
                {secciones.map((section, index) => (
                  <div key={`${section.titulo}-${index}`} className="rounded-[12px] border border-border bg-background p-3">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-foreground">{section.titulo}</p>
                        <p className="text-[10px] font-semibold text-muted-foreground">{section.estilo || "sin estilo"}</p>
                      </div>
                      <select
                        value={mapping[index] || "ignorar"}
                        onChange={e => setMapping(prev => ({ ...prev, [index]: e.target.value as CampoPlanificacionDestino }))}
                        className="h-9 rounded-lg border border-border bg-card px-3 text-[12px] outline-none"
                      >
                        {CAMPOS.map(campo => <option key={campo.value} value={campo.value}>{campo.label}</option>)}
                      </select>
                    </div>
                    <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{htmlToText(section.contenido_html)}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-[12px] border border-border bg-muted/30 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" /> Preview
                </p>
                <ul className="space-y-1 text-[11px] text-muted-foreground">
                  {preview.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>

              <button
                type="button"
                onClick={handleImport}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[12px] font-bold text-white hover:opacity-90"
              >
                <Wand2 className="h-4 w-4" />
                Importar a clase actual
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
