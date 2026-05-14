"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, ChevronRight, FileText, Loader2, UploadCloud, Wand2, X } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import { DriveSheet } from "@/components/edu-panel/drive/drive-sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiFetch } from "@/lib/api-client"
import {
  descargarArchivoDrive,
  getGoogleDriveErrorMessage,
  getGoogleDriveToken,
  isGoogleDriveConnected,
  type DriveItem,
  type DriveResourceContext,
} from "@/lib/google-drive"
import {
  cargarMapeosFormatoPlanificacion,
  guardarMapeoFormatoPlanificacion,
  type MapeoFormatoPlanificacion,
} from "@/lib/configuracion-formato"
import type { CampoPlanificacionDestino, SeccionPlanificacionParseada } from "@/lib/import/parse-planificacion"
import type { OAEditado } from "@/lib/curriculo"
import { cn } from "@/lib/utils"

const CAMPOS: Array<{ value: CampoPlanificacionDestino; label: string }> = [
  { value: "ignorar", label: "Ignorar" },
  { value: "objetivo", label: "Objetivo" },
  { value: "inicio", label: "Inicio" },
  { value: "desarrollo", label: "Desarrollo" },
  { value: "cierre", label: "Cierre" },
  { value: "materiales", label: "Materiales" },
  { value: "tics", label: "TICs" },
  { value: "oas", label: "OA vinculados" },
  { value: "habilidades", label: "Habilidades" },
  { value: "actitudes", label: "Actitudes" },
  { value: "adecuacion", label: "Adecuacion PIE/DUA" },
]

type ImportPayload = Partial<Record<Exclude<CampoPlanificacionDestino, "ignorar">, string | string[]>>

// Paso del wizard: "mapeo" → "vincular" → listo
type Step = "mapeo" | "vincular"

interface ImportWordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (payload: ImportPayload) => void
  driveContext?: DriveResourceContext
  /** OAs disponibles de la unidad para vincular */
  oasDisponibles?: OAEditado[]
  /** Habilidades disponibles de la unidad */
  habilidadesDisponibles?: string[]
  /** Actitudes disponibles de la unidad */
  actitudesDisponibles?: string[]
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

export function ImportWordModal({
  open,
  onOpenChange,
  onImport,
  driveContext,
  oasDisponibles = [],
  habilidadesDisponibles = [],
  actitudesDisponibles = [],
}: ImportWordModalProps) {
  const { signInWithGoogleDrive } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [secciones, setSecciones] = useState<SeccionPlanificacionParseada[]>([])
  const [mapping, setMapping] = useState<Record<number, CampoPlanificacionDestino>>({})
  const [mapeos, setMapeos] = useState<MapeoFormatoPlanificacion[]>([])
  const [selectedMapeoId, setSelectedMapeoId] = useState("")
  const [guardarMapeo, setGuardarMapeo] = useState(false)
  const [nombreMapeo, setNombreMapeo] = useState("Mi formato")
  const [step, setStep] = useState<Step>("mapeo")

  // Vinculación de OA
  const [oasSeleccionados, setOasSeleccionados] = useState<string[]>([])
  const [habilidadesSeleccionadas, setHabilidadesSeleccionadas] = useState<string[]>([])
  const [actitudesSeleccionadas, setActitudesSeleccionadas] = useState<string[]>([])
  const [expandedOA, setExpandedOA] = useState<string | null>(null)

  // Reset al abrir/cerrar
  useEffect(() => {
    if (!open) {
      setSecciones([])
      setMapping({})
      setError("")
      setStep("mapeo")
      setOasSeleccionados([])
      setHabilidadesSeleccionadas([])
      setActitudesSeleccionadas([])
    } else {
      cargarMapeosFormatoPlanificacion().then(setMapeos).catch(() => setMapeos([]))
    }
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
    setStep("mapeo")
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

  const handleDriveFile = async (item: DriveItem) => {
    const supported = item.mimeType === "application/vnd.google-apps.document" ||
      item.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      item.name.toLowerCase().endsWith(".docx")
    if (!supported) {
      setError("Selecciona un Google Docs o un archivo Word .docx.")
      return
    }
    setLoading(true)
    setError("")
    try {
      let token = getGoogleDriveToken()
      if (!token || !isGoogleDriveConnected()) {
        await signInWithGoogleDrive()
        token = getGoogleDriveToken()
      }
      if (!token) throw new Error("No se recibio autorizacion de Google Drive.")
      const blob = await descargarArchivoDrive(token, item)
      const fileName = item.name.toLowerCase().endsWith(".docx") ? item.name : `${item.name}.docx`
      await handleFile(new File([blob], fileName, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }))
    } catch (error) {
      setError(getGoogleDriveErrorMessage(error))
      setLoading(false)
    }
  }

  const buildPayload = (): ImportPayload => {
    const payload: ImportPayload = {}
    secciones.forEach((section, index) => {
      const field = mapping[index]
      if (!field || field === "ignorar") return
      if (field === "materiales" || field === "tics" || field === "oas" || field === "habilidades" || field === "actitudes") {
        const list = splitList(section.contenido_html)
        payload[field] = [...((payload[field] as string[] | undefined) || []), ...list]
        return
      }
      const current = typeof payload[field] === "string" ? payload[field] as string : ""
      payload[field] = [current, section.contenido_html].filter(Boolean).join("\n")
    })

    // Agregar OA/habilidades/actitudes seleccionados manualmente en el paso de vinculación
    if (oasSeleccionados.length > 0) {
      const existing = (payload.oas as string[] | undefined) || []
      payload.oas = Array.from(new Set([...existing, ...oasSeleccionados]))
    }
    if (habilidadesSeleccionadas.length > 0) {
      const existing = (payload.habilidades as string[] | undefined) || []
      payload.habilidades = Array.from(new Set([...existing, ...habilidadesSeleccionadas]))
    }
    if (actitudesSeleccionadas.length > 0) {
      const existing = (payload.actitudes as string[] | undefined) || []
      payload.actitudes = Array.from(new Set([...existing, ...actitudesSeleccionadas]))
    }

    return payload
  }

  const handleContinuarAVincular = async () => {
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
    // Si no hay OAs disponibles, importar directo
    if (oasDisponibles.length === 0 && habilidadesDisponibles.length === 0 && actitudesDisponibles.length === 0) {
      onImport(buildPayload())
      onOpenChange(false)
      return
    }
    setStep("vincular")
  }

  const handleImportFinal = () => {
    onImport(buildPayload())
    onOpenChange(false)
  }

  const toggleOA = (oaId: string) => {
    setOasSeleccionados(prev =>
      prev.includes(oaId) ? prev.filter(id => id !== oaId) : [...prev, oaId]
    )
  }

  const toggleHabilidad = (h: string) => {
    setHabilidadesSeleccionadas(prev =>
      prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h]
    )
  }

  const toggleActitud = (a: string) => {
    setActitudesSeleccionadas(prev =>
      prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar planificacion Word</DialogTitle>
          <DialogDescription>
            {step === "mapeo"
              ? "Sube o elige un DOCX y mapea cada sección al campo correcto."
              : "Vincula los OA, habilidades y actitudes de la unidad a esta planificación importada."}
          </DialogDescription>
        </DialogHeader>

        {/* Indicador de pasos */}
        {hasSections && (
          <div className="flex items-center gap-2 text-[11px] font-bold">
            <span className={cn("rounded-full px-2.5 py-1", step === "mapeo" ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
              1. Mapeo de secciones
            </span>
            <span className="text-muted-foreground">→</span>
            <span className={cn("rounded-full px-2.5 py-1", step === "vincular" ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
              2. Vincular OA y elementos
            </span>
          </div>
        )}

        {/* ── PASO 1: Mapeo ── */}
        {step === "mapeo" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
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
              <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-border bg-background px-4 py-8 text-center">
                {loading ? <Loader2 className="mb-2 h-6 w-6 animate-spin text-muted-foreground" /> : <FileText className="mb-2 h-6 w-6 text-muted-foreground" />}
                <span className="text-[13px] font-bold text-foreground">Importar desde Drive</span>
                <span className="mb-3 text-[11px] text-muted-foreground">Google Docs o Word .docx</span>
                <DriveSheet
                  context={driveContext}
                  label="Elegir archivo"
                  title="Importar planificacion desde Drive"
                  description="Selecciona un Google Docs o Word para mapearlo a la clase actual."
                  buttonClassName="px-3 py-1.5 text-[11px]"
                  onSelectFile={handleDriveFile}
                  selectLabel="Importar"
                />
              </div>
            </div>

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
                  onClick={handleContinuarAVincular}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[12px] font-bold text-white hover:opacity-90"
                >
                  <Wand2 className="h-4 w-4" />
                  {oasDisponibles.length > 0 || habilidadesDisponibles.length > 0 || actitudesDisponibles.length > 0
                    ? "Continuar → Vincular OA y elementos"
                    : "Importar a clase actual"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── PASO 2: Vincular OA, habilidades y actitudes ── */}
        {step === "vincular" && (
          <div className="space-y-5">
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Selecciona los OA, habilidades y actitudes de la unidad que corresponden a esta planificación importada. Puedes omitir este paso si no aplica.
            </p>

            {/* OA */}
            {oasDisponibles.length > 0 && (
              <div className="rounded-[12px] border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-[13px] font-extrabold">Objetivos de Aprendizaje</p>
                  <p className="text-[11px] text-muted-foreground">{oasSeleccionados.length} de {oasDisponibles.length} seleccionados</p>
                </div>
                <div className="divide-y divide-border">
                  {oasDisponibles.map((oa, i) => {
                    const selected = oasSeleccionados.includes(oa.id)
                    const isExpanded = expandedOA === oa.id
                    const indicadores = (oa.indicadores || []).filter(ind => ind.seleccionado)
                    return (
                      <div key={oa.id}>
                        <div className="flex items-start gap-3 px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleOA(oa.id)}
                            className={cn(
                              "mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded border-2 transition-colors",
                              selected ? "border-primary bg-primary text-white" : "border-border bg-background"
                            )}
                          >
                            {selected && <Check className="h-3 w-3" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-extrabold text-primary">
                                {oa.tipo === "oat" ? "OAT" : oa.numero ? `OA ${oa.numero}` : "OA"}
                              </span>
                              {oa.esPropio && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">Propio</span>
                              )}
                            </div>
                            <p className="text-[12px] leading-snug text-foreground">{oa.descripcion}</p>
                            {indicadores.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedOA(isExpanded ? null : oa.id)}
                                className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-70"
                              >
                                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                {indicadores.length} indicador{indicadores.length !== 1 ? "es" : ""}
                              </button>
                            )}
                          </div>
                        </div>
                        {isExpanded && indicadores.length > 0 && (
                          <div className="border-t border-border bg-muted/30 px-4 py-2.5 space-y-1.5">
                            {indicadores.map(ind => (
                              <p key={ind.id} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/50" />
                                {ind.texto}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Habilidades */}
            {habilidadesDisponibles.length > 0 && (
              <div className="rounded-[12px] border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-[13px] font-extrabold">Habilidades</p>
                  <p className="text-[11px] text-muted-foreground">{habilidadesSeleccionadas.length} de {habilidadesDisponibles.length} seleccionadas</p>
                </div>
                <div className="flex flex-wrap gap-2 p-4">
                  {habilidadesDisponibles.map((h, i) => {
                    const selected = habilidadesSeleccionadas.includes(h)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleHabilidad(h)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all",
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-background text-muted-foreground hover:border-primary/50"
                        )}
                      >
                        {selected && <Check className="h-3 w-3" />}
                        {h}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Actitudes */}
            {actitudesDisponibles.length > 0 && (
              <div className="rounded-[12px] border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-[13px] font-extrabold">Actitudes</p>
                  <p className="text-[11px] text-muted-foreground">{actitudesSeleccionadas.length} de {actitudesDisponibles.length} seleccionadas</p>
                </div>
                <div className="flex flex-wrap gap-2 p-4">
                  {actitudesDisponibles.map((a, i) => {
                    const selected = actitudesSeleccionadas.includes(a)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleActitud(a)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all",
                          selected
                            ? "border-amber-500 bg-amber-500 text-white"
                            : "border-border bg-background text-muted-foreground hover:border-amber-400/50"
                        )}
                      >
                        {selected && <Check className="h-3 w-3" />}
                        {a}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("mapeo")}
                className="flex-1 rounded-[10px] border border-border bg-background px-4 py-2.5 text-[12px] font-bold text-muted-foreground hover:bg-muted"
              >
                ← Volver al mapeo
              </button>
              <button
                type="button"
                onClick={handleImportFinal}
                className="flex-[2] inline-flex items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[12px] font-bold text-white hover:opacity-90"
              >
                <Wand2 className="h-4 w-4" />
                Importar a clase actual
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
