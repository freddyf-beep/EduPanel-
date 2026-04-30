"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import Link from "next/link"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import {
  Download, Calendar, Plus, MoreHorizontal, X,
  ChevronRight, ExternalLink, Scissors, RefreshCw,
  EyeOff, Pencil, ArrowRight, Clock, Bookmark,
  Loader2, Check, BookOpen, Layers, Link2, AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { guardarPlanCurso, cargarPlanCurso, getAsignaturasDisponibles, getUnidades } from "@/lib/curriculo"
import type { UnidadPlan, Unidad } from "@/lib/curriculo"
import { buildUrl, unidadIdFromIndex, withAsignatura } from "@/lib/shared"
import { cargarHorarioSemanal } from "@/lib/horario"
import { cargarNivelMapping, guardarNivelMapping, getNivelesDisponibles, NivelMapping } from "@/lib/nivel-mapping"
import { apiFetch } from "@/lib/api-client"
import { useActiveSubject } from "@/hooks/use-active-subject"

const COLORS = ["#F59E0B","#3B82F6","#EF4444","#22C55E","#8B5CF6","#F03E6E","#06B6D4","#D97706"]
const MAX_UNIDADES = 12

type UnitType = "tradicional" | "invertida" | "proyecto" | "unidad0"

const TYPE_BADGES: Record<UnitType, { emoji: string; label: string }> = {
  unidad0:     { emoji: "0️⃣", label: "Unidad 0" },
  tradicional: { emoji: "📘", label: "Tradicional" },
  invertida:   { emoji: "🔄", label: "Invertida" },
  proyecto:    { emoji: "🎯", label: "Proyecto" },
}

const MODAL_OPTIONS: { type: UnitType; emoji: string; title: string; desc: string }[] = [
  { type:"unidad0",     emoji:"0️⃣", title:"Unidad 0",          desc:"Introductoria para diagnóstico y ambientación." },
  { type:"tradicional", emoji:"📘", title:"Unidad tradicional", desc:"Planificación secuencial con objetivos y evaluación." },
  { type:"invertida",   emoji:"🔄", title:"Unidad invertida",   desc:"El estudiante explora primero, el docente profundiza." },
  { type:"proyecto",    emoji:"🎯", title:"Proyecto",           desc:"Aprendizaje basado en proyectos con producto final." },
]

function toISO(s: string) { const [d,m,y]=s.split("/"); return `${y}-${m}-${d}` }
function toDisplay(s: string) { const [y,m,d]=s.split("-"); return `${d}/${m}/${y}` }

// ── Dropdown menú de unidad ───────────────────────────────────────────────────
function UnitMenu({ unit, onRename, onDivide, onConvert, onDeactivate }: {
  unit: UnidadPlan
  onRename: () => void
  onDivide: () => void
  onConvert: () => void
  onDeactivate: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  const item = (icon: React.ReactNode, label: string, cb: () => void, danger = false) => (
    <button onClick={() => { setOpen(false); cb() }}
      className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
        danger ? "text-red-500 hover:bg-red-50" : "text-foreground hover:bg-background"
      )}>
      {icon}{label}
    </button>
  )

  return (
    <div ref={ref} className="relative">
      <button onMouseDown={e => { e.stopPropagation(); setOpen(v => !v) }}
        className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground transition-colors">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-[12px] border border-border bg-card p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.12)]">
          {item(<Pencil className="h-[15px] w-[15px] text-muted-foreground" />, "Renombrar", onRename)}
          {item(<Scissors className="h-[15px] w-[15px] text-muted-foreground" />, "Dividir unidad", onDivide)}
          {item(<RefreshCw className="h-[15px] w-[15px] text-muted-foreground" />, `Convertir a ${unit.type === "invertida" ? "tradicional" : "invertida"}`, onConvert)}
          <div className="my-1 h-px bg-border" />
          {item(<EyeOff className="h-[15px] w-[15px]" />, "Eliminar", onDeactivate, true)}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
function PlanificacionesInner({ cursoParam }: { cursoParam: string }) {
  const { asignatura: ASIGNATURA, setAsignatura } = useActiveSubject()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [curso, setCurso]               = useState(cursoParam)
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [subjectOptions, setSubjectOptions] = useState<string[]>([])
  const [curriculumUnits, setCurriculumUnits] = useState<Unidad[]>([])
  const [units, setUnits]               = useState<UnidadPlan[]>([])
  const [nextId, setNextId]             = useState(1)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [saveStatus, setSaveStatus]     = useState<"idle"|"saving_silent"|"saved"|"error">("idle")

  // Modales
  const [showCreate, setShowCreate]     = useState(false)
  const [selectedType, setSelectedType] = useState<UnitType | null>(null)
  const [dpUnit, setDpUnit]             = useState<UnidadPlan | null>(null)
  const [deactUnit, setDeactUnit]       = useState<UnidadPlan | null>(null)
  const [divideUnit, setDivideUnit]     = useState<UnidadPlan | null>(null)
  const [renameUnit, setRenameUnit]     = useState<UnidadPlan | null>(null)
  const [renameVal, setRenameVal]       = useState("")

  // Drag
  const [dragId, setDragId]             = useState<number | null>(null)
  const [overId, setOverId]             = useState<number | null>(null)

  // Toast
  const [toast, setToast]               = useState<string | null>(null)

  // Nivel curricular mapping
  const [nivelMapping, setNivelMapping]       = useState<NivelMapping>({})
  const [nivelesDisponibles, setNivelesDisponibles] = useState<string[]>([])
  const [savingNivel, setSavingNivel]         = useState(false)
  const [savedNivel, setSavedNivel]           = useState(false)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  // ── Cargar cursos disponibles + nivel mapping + niveles en Firestore ────────
  useEffect(() => {
    Promise.all([
      cargarHorarioSemanal(),
      cargarNivelMapping(),
      getNivelesDisponibles(ASIGNATURA),
      getAsignaturasDisponibles().catch(() => [ASIGNATURA]),
    ]).then(([hData, mapping, disponibles, asignaturasDisponibles]) => {
      const unique = Array.from(new Set(hData.map(h => h.resumen)))
      setCursosDisponibles(unique)
      if (!cursoParam && unique.length > 0) setCurso(unique[0])
      setNivelMapping(mapping)
      setNivelesDisponibles(disponibles)
      setSubjectOptions(Array.from(new Set([ASIGNATURA, ...asignaturasDisponibles])))
    })
  }, [cursoParam, ASIGNATURA])

  useEffect(() => {
    const nivelSeleccionado = curso ? (nivelMapping[curso] ?? "") : ""
    if (!nivelSeleccionado) {
      setCurriculumUnits([])
      return
    }

    getUnidades(ASIGNATURA, nivelSeleccionado)
      .then((unidades) => setCurriculumUnits(unidades))
      .catch(() => setCurriculumUnits([]))
  }, [ASIGNATURA, curso, nivelMapping])

  // ── Cargar desde Firestore cuando cambia el curso ─────────────────────────
  useEffect(() => {
    if (!curso) return
    setLoading(true)
    setUnits([])
    cargarPlanCurso(ASIGNATURA, curso)
      .then(data => {
        if (data?.units) {
          setUnits(data.units)
          setNextId((Math.max(0, ...data.units.map(u => u.id)) + 1))
        } else {
          setUnits([])
          setNextId(1)
        }
      })
      .catch(() => { setUnits([]); setNextId(1) })
      .finally(() => {
        setLoading(false)
        ignoreNextSaveRef.current = true;
      })
  }, [curso, ASIGNATURA])

  const handleSubjectChange = (newSubject: string) => {
    setAsignatura(newSubject)
    const currentParams = Object.fromEntries(searchParams.entries())
    router.replace(buildUrl(pathname, withAsignatura(currentParams, newSubject)))
  }


  const ignoreNextSaveRef = useRef(true);
  useEffect(() => {
    if (loading) return;
    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false;
      return;
    }
    setSaveStatus("saving_silent");
    const timer = setTimeout(() => {
      handleGuardar(true);
    }, 2500)
    return () => clearTimeout(timer);
  }, [units])

  // ── Warn al salir con cambios sin guardar ──
  useEffect(() => {
    const isDirty = saveStatus === "saving_silent" || saving
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = "Tienes cambios sin guardar. ¿Seguro que quieres salir?"
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [saveStatus, saving])

  // ── Guardar plan ──────────────────────────────────────────────────────────
  const handleGuardar = async (isAutoSave = false) => {
    if (!isAutoSave) setSaving(true)
    try {
      await guardarPlanCurso(ASIGNATURA, curso, units)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 7000)
    } finally {
      if (!isAutoSave) setSaving(false)
    }
  }

  // ── Guardar nivel mapping ─────────────────────────────────────────────────
  const handleSaveNivel = async (nivel: string) => {
    const updated = { ...nivelMapping, [curso]: nivel }
    setNivelMapping(updated)
    setSavingNivel(true)
    setSavedNivel(false)
    try {
      await guardarNivelMapping(updated)
      setSavedNivel(true)
      setTimeout(() => setSavedNivel(false), 2000)
    } finally {
      setSavingNivel(false)
    }
  }

  // ── Acciones ──────────────────────────────────────────────────────────────
  const showToast = (msg: string) => setToast(msg)

  const createUnit = () => {
    if (!selectedType) return
    if (units.length >= MAX_UNIDADES) {
      showToast(`Máximo ${MAX_UNIDADES} unidades por curso`)
      return
    }
    const n = units.length + 1
    const names: Record<UnitType, string> = {
      unidad0: "Unidad 0",
      tradicional: `Unidad ${n}`,
      invertida: `Unidad ${n}`,
      proyecto: `Proyecto ${n}`,
    }
    const newUnit: UnidadPlan = {
      id: nextId,
      name: names[selectedType],
      color: COLORS[units.length % COLORS.length],
      hours: 16,
      start: "", end: "",
      type: selectedType,
      unidadCurricularId: `unidad_${Math.min(units.length + 1, 4)}`,
    }
    setUnits(prev => [...prev, newUnit])
    setNextId(id => id + 1)
    setShowCreate(false)
    setSelectedType(null)
    showToast(`"${newUnit.name}" creada ✓`)
  }

  const saveDates = (start: string, end: string) => {
    if (!dpUnit) return
    setUnits(prev => prev.map(u => u.id === dpUnit.id ? { ...u, start: toDisplay(start), end: toDisplay(end) } : u))
    setDpUnit(null)
    showToast("Fechas guardadas ✓")
  }

  const deactivate = () => {
    if (!deactUnit) return
    const name = deactUnit.name
    setUnits(prev => prev.filter(u => u.id !== deactUnit.id))
    setDeactUnit(null)
    showToast(`"${name}" eliminada`)
  }

  const divide = (nameA: string, nameB: string) => {
    if (!divideUnit) return
    if (units.length >= MAX_UNIDADES) { showToast(`Máximo ${MAX_UNIDADES} unidades`); setDivideUnit(null); return }
    const idx  = units.findIndex(u => u.id === divideUnit.id)
    const half = Math.ceil(divideUnit.hours / 2)
    const a: UnidadPlan = { ...divideUnit, id: nextId,   name: nameA || divideUnit.name+"A", hours: half, end: "" }
    const b: UnidadPlan = { ...divideUnit, id: nextId+1, name: nameB || divideUnit.name+"B", hours: divideUnit.hours-half, start: "", color: COLORS[(idx+1)%COLORS.length] }
    const next = [...units]
    next.splice(idx, 1, a, b)
    setUnits(next)
    setNextId(id => id + 2)
    setDivideUnit(null)
    showToast(`"${divideUnit.name}" dividida ✓`)
  }

  const rename = () => {
    if (!renameUnit || !renameVal.trim()) return
    setUnits(prev => prev.map(u => u.id === renameUnit.id ? { ...u, name: renameVal.trim() } : u))
    showToast(`Renombrada a "${renameVal.trim()}" ✓`)
    setRenameUnit(null)
  }

  const convertType = (u: UnidadPlan) => {
    setUnits(prev => prev.map(x => x.id === u.id ? { ...x, type: x.type === "invertida" ? "tradicional" : "invertida" } : x))
    showToast(`"${u.name}" convertida`)
  }

  const onDrop = (toId: number) => {
    if (!dragId || dragId === toId) return
    const from = units.findIndex(u => u.id === dragId)
    const to   = units.findIndex(u => u.id === toId)
    const next = [...units]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setUnits(next)
    setDragId(null); setOverId(null)
  }

  const completadas = units.filter(u => u.start && u.end).length

  const [downloading, setDownloading] = useState(false)

  const handleDescargar = async () => {
    if (units.length === 0 || downloading) return
    setDownloading(true)
    try {
      const { cargarVerUnidad, cargarActividadClase } = await import("@/lib/curriculo")
      const { htmlToPlainTextForExport } = await import("@/lib/export/planificacion-docx")

      // Resolver nivel curricular
      const nivelCurricular = nivelMapping[curso] || "Sin nivel configurado"

      // Armar datos de cada unidad
      const unidadesExport = await Promise.all(
        units.map(async (unit, idx) => {
          const unidadId = unit.id ? `unidad_${unit.id}` : unidadIdFromIndex(idx)

          // Ver unidad (OAs editados, indicadores)
          const verUnidad = await cargarVerUnidad(ASIGNATURA, curso, unidadId).catch(() => null)

          // OAs basales y complementarios desde la unidad editada
          const oasBasales: string[] = []
          const oasComplementarios: string[] = []
          if (verUnidad?.oas) {
            for (const oa of verUnidad.oas) {
              if (!oa.seleccionado) continue
              const label = `${oa.numero ? `OA ${oa.numero}` : oa.id}: ${oa.descripcion || ""}`.trim()
              if (oa.tipo === "oat") oasComplementarios.push(label)
              else oasBasales.push(label)
            }
          }

          // Cargar actividades de clase (hasta 30 clases)
          const clasesExport = []
          for (let claseNum = 1; claseNum <= 30; claseNum++) {
            const actividad = await cargarActividadClase(curso, unidadId, claseNum, ASIGNATURA).catch(() => null)
            if (!actividad) continue
            // Solo exportar si tiene algún contenido relevante
            const tieneContenido = actividad.objetivo || actividad.inicio || actividad.desarrollo || actividad.cierre
            if (!tieneContenido) continue
            const oasOcupados = (verUnidad?.oas || [])
              .filter(oa => (actividad.oaIds || []).includes(oa.id))
              .map(oa => `${oa.numero ? `OA ${oa.numero}` : oa.id}: ${oa.descripcion || ""}`.trim())
            const indicadores = (verUnidad?.oas || [])
              .filter(oa => (actividad.oaIds || []).includes(oa.id))
              .flatMap(oa => {
                const selectedIds = actividad.indicadoresPorOa?.[oa.id]
                return (oa.indicadores || [])
                  .filter(ind => ind.seleccionado)
                  .filter(ind => !selectedIds || selectedIds.includes(ind.id))
                  .map(ind => `${oa.numero ? `OA ${oa.numero}` : oa.id}: ${ind.texto}`)
              })

            clasesExport.push({
              numero: claseNum,
              oasOcupados,
              indicadores,
              objetivo: htmlToPlainTextForExport(actividad.objetivo || ""),
              inicio: htmlToPlainTextForExport(actividad.inicio || ""),
              actividadInicio: "",
              desarrollo: htmlToPlainTextForExport(actividad.desarrollo || ""),
              cierre: htmlToPlainTextForExport(actividad.cierre || ""),
              recursos: actividad.materiales || [],
              tics: actividad.tics || [],
              criteriosEvaluacion: [],
            })
          }

          return {
            numero: idx + 1,
            nombre: unit.name || `Unidad ${idx + 1}`,
            oasBasales,
            oasComplementarios,
            clases: clasesExport,
          }
        })
      )

      const exportData = {
        nivel: nivelCurricular,
        asignatura: ASIGNATURA,
        unidades: unidadesExport,
      }

      const res = await apiFetch("/api/export-planificacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportData),
      })

      if (!res.ok) throw new Error("Error al generar el documento")

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `Planificacion_${ASIGNATURA}_${curso}_${new Date().getFullYear()}.docx`
      a.click()
      URL.revokeObjectURL(url)
      setToast("Planificación descargada exitosamente")
    } catch (err) {
      console.error("[handleDescargar]", err)
      setToast("Error al generar el documento. Intenta de nuevo.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <div className="mb-5 sm:mb-6 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[18px] sm:text-[22px] font-extrabold animate-fade-up">Mis Planificaciones</h1>
        <div className="flex w-full flex-wrap items-center gap-2 sm:gap-2.5 sm:w-auto sm:justify-end">
          {saveStatus === "saving_silent" && (
            <span className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground animate-pulse">
              Guardando...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-green-600">
              <Check className="w-4 h-4" /> Guardado
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-[13px] font-semibold text-red-600">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> Error al guardar — intenta nuevamente
            </span>
          )}
          <button
            onClick={() => handleGuardar(false)}
            disabled={saving || units.length === 0 || saveStatus === "saving_silent"}
            className="flex items-center gap-[7px] bg-primary text-primary-foreground border-none rounded-[10px] px-5 py-2.5 text-[13px] font-bold hover:bg-pink-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <><Loader2 className="w-[15px] h-[15px] animate-spin" /> <span className="hidden sm:inline">Guardando…</span></> : <><Bookmark className="w-[15px] h-[15px]" /> <span className="hidden sm:inline">Guardar mis cambios</span><span className="sm:hidden">Guardar</span></>}
          </button>
        </div>
      </div>

      {/* Selector de curso + nivel curricular */}
      <div className="mb-7 flex flex-wrap items-end gap-4 animate-fade-up">
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-[11px] font-semibold text-muted-foreground">Asignatura</label>
          <select
            value={ASIGNATURA}
            onChange={(e) => handleSubjectChange(e.target.value)}
            className="w-full appearance-none rounded-[10px] border-[1.5px] border-primary bg-card px-3.5 py-2.5 pr-9 text-[13px] font-semibold text-foreground outline-none focus:shadow-[0_0_0_3px_color-mix(in srgb,var(--primary) 15%,transparent)] transition-shadow cursor-pointer sm:min-w-[180px]"
            style={{ backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' viewBox='0 0 24 24' stroke='%23F03E6E' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")", backgroundRepeat:"no-repeat", backgroundPosition:"right 10px center" }}
          >
            {(subjectOptions.length > 0 ? subjectOptions : [ASIGNATURA]).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-[11px] font-semibold text-muted-foreground">para el curso</label>
          <select
            value={curso}
            onChange={e => setCurso(e.target.value)}
            className="w-full appearance-none rounded-[10px] border-[1.5px] border-primary bg-card px-3.5 py-2.5 pr-9 text-[13px] font-semibold text-foreground outline-none focus:shadow-[0_0_0_3px_color-mix(in srgb,var(--primary) 15%,transparent)] transition-shadow cursor-pointer sm:min-w-[200px]"
            style={{ backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' viewBox='0 0 24 24' stroke='%23F03E6E' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")", backgroundRepeat:"no-repeat", backgroundPosition:"right 10px center" }}
          >
            {cursosDisponibles.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {/* Nivel curricular selector */}
        {curso && (
          <div className="flex w-full flex-col gap-1 sm:w-auto">
            <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <Link2 className="w-3 h-3" /> Bases curriculares de
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={nivelMapping[curso] ?? ""}
                onChange={e => handleSaveNivel(e.target.value)}
                className="w-full appearance-none rounded-[10px] border-[1.5px] border-amber-400 bg-amber-500/10 px-3.5 py-2.5 pr-9 text-[13px] font-semibold text-foreground outline-none focus:shadow-[0_0_0_3px_rgba(245,158,11,0.2)] transition-shadow cursor-pointer sm:min-w-[200px]"
                style={{ backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' viewBox='0 0 24 24' stroke='%23D97706' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")", backgroundRepeat:"no-repeat", backgroundPosition:"right 10px center" }}
              >
                <option value="">-- Seleccionar nivel --</option>
                {nivelesDisponibles.length === 0
                  ? <option disabled>Cargando niveles…</option>
                  : nivelesDisponibles.map(n => <option key={n} value={n}>{n}</option>)
                }
              </select>
              {savingNivel && <Loader2 className="w-4 h-4 animate-spin text-amber-500" />}
              {savedNivel && <Check className="w-4 h-4 text-green-500" />}
            </div>
          </div>
        )}
      </div>

      {/* Resumen del curso */}
      <div className="mb-8 rounded-[14px] border border-border bg-card px-4 py-5 animate-fade-up sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1">
            <h2 className="mb-2 text-[15px] font-extrabold">Planificación Anual — {curso}</h2>
            {units.length === 0 ? (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Aún no has planificado este curso. Crea tus unidades abajo.
              </p>
            ) : (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Tienes <span className="font-semibold text-foreground">{units.length} de {MAX_UNIDADES}</span> unidades creadas.{" "}
                {completadas > 0 && <><span className="font-semibold text-foreground">{completadas}</span> con fechas definidas.</>}
              </p>
            )}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              onClick={handleDescargar}
              disabled={units.length === 0 || downloading}
              className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-primary bg-card px-4 py-2 text-[13px] font-semibold text-primary hover:bg-pink-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Descargar planificación en formato Word (.docx)"
            >
              {downloading
                ? <><Loader2 className="h-[14px] w-[14px] animate-spin" /> Generando…</>
                : <><Download className="h-[14px] w-[14px]" /> Descargar .docx</>
              }
            </button>
          </div>
        </div>

        {/* Barra de progreso */}
        {units.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5 text-[11px] text-muted-foreground">
              <span>Unidades con fechas</span>
              <span>{completadas}/{units.length}</span>
            </div>
            <div className="h-2 rounded-full bg-background overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(completadas/units.length)*100}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Header kanban */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 animate-fade-up">
        <div className="flex items-center gap-3">
          <h2 className="text-[17px] font-extrabold">Unidades y proyectos</h2>
          {units.length > 0 && (
            <span className="text-[12px] font-semibold text-muted-foreground bg-background border border-border rounded-full px-2.5 py-0.5">
              {units.length}/{MAX_UNIDADES}
            </span>
          )}
        </div>
        <button
          onClick={() => { setSelectedType(null); setShowCreate(true) }}
          disabled={units.length >= MAX_UNIDADES}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-bold text-primary-foreground shadow-[0_4px_14px_color-mix(in srgb,var(--primary) 30%,transparent)] transition-all hover:-translate-y-px hover:bg-pink-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:translate-y-0 disabled:shadow-none sm:w-auto"
        >
          <Plus className="h-[15px] w-[15px]" /> + Crear unidad
        </button>
      </div>

      {/* Estado de carga */}
      {loading || !curso ? (
        <div className="flex items-center gap-3 text-muted-foreground py-16 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[14px]">Cargando planificación {curso ? `de ${curso}` : ""}…</span>
        </div>
      ) : units.length === 0 ? (
        /* Estado vacío */
        <div className="flex flex-col items-center justify-center py-16 gap-4 border-2 border-dashed border-border rounded-[14px] animate-fade-up">
          <div className="w-14 h-14 rounded-full bg-pink-light grid place-items-center">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-[15px] font-bold mb-1">Sin planificación para {curso}</p>
            <p className="text-[13px] text-muted-foreground">Crea hasta {MAX_UNIDADES} unidades para este curso.</p>
          </div>
          <button
            onClick={() => { setSelectedType(null); setShowCreate(true) }}
            className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-[13px] font-bold text-primary-foreground hover:bg-pink-dark transition-colors"
          >
            <Plus className="h-[15px] w-[15px]" /> Crear primera unidad
          </button>
        </div>
      ) : (
        /* Kanban grid */
        <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {units.map((u, i) => (
            <div
              key={u.id}
              draggable
              onDragStart={() => setDragId(u.id)}
              onDragOver={e => { e.preventDefault(); setOverId(u.id) }}
              onDrop={() => onDrop(u.id)}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              className={cn(
                "rounded-[14px] border bg-card transition-all animate-fade-up",
                dragId === u.id && "opacity-40 scale-[0.98]",
                overId === u.id && dragId !== u.id ? "border-primary shadow-[0_0_0_3px_color-mix(in srgb,var(--primary) 12%,transparent)]" : "border-border",
                dragId !== u.id && "hover:shadow-md"
              )}
              style={{ animationDelay: `${0.08+i*0.05}s` }}
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: u.color }} />
                  <span className="text-[13px] font-bold truncate">{u.name}</span>
                  <span className="text-[10px] font-semibold capitalize px-2 py-0.5 rounded bg-background text-muted-foreground border border-border">
                    {TYPE_BADGES[u.type as UnitType]?.emoji} {TYPE_BADGES[u.type as UnitType]?.label ?? u.type}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setDpUnit(u)}
                    title="Definir fechas"
                    className={cn(
                      "rounded-md p-1 transition-colors",
                      u.start && u.end
                        ? "text-primary hover:bg-background"
                        : "text-muted-foreground hover:bg-background hover:text-foreground"
                    )}
                  >
                    <Calendar className="h-4 w-4" />
                  </button>
                  <UnitMenu
                    unit={u}
                    onRename={() => { setRenameUnit(u); setRenameVal(u.name) }}
                    onDivide={() => setDivideUnit(u)}
                    onConvert={() => convertType(u)}
                    onDeactivate={() => setDeactUnit(u)}
                  />
                </div>
              </div>

              {/* Card body */}
              <div className="px-4 flex flex-col gap-3 pb-3">

                {/* Fechas */}
                {(u.start || u.end) && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-background px-3 py-1.5 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3 flex-shrink-0" />
                    {u.start && u.end
                      ? <span>{u.start} <ArrowRight className="inline h-2.5 w-2.5 mx-0.5" /> {u.end}</span>
                      : u.start ? <span>Desde {u.start}</span>
                      : <span>Hasta {u.end}</span>
                    }
                  </div>
                )}

                {/* Links */}
                <div className="flex flex-col gap-0.5 mt-2">
                  <div className="flex items-center justify-between px-3 py-2 text-[12px] font-medium text-muted-foreground border border-dashed border-border rounded-lg bg-background/50 mb-1">
                    <span className="flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Base Curricular</span>
                    <select
                      value={u.unidadCurricularId || "unidad_1"}
                      onChange={e => {
                        const val = e.target.value;
                        setUnits(prev => prev.map(x => x.id === u.id ? { ...x, unidadCurricularId: val } : x));
                      }}
                      className="bg-transparent text-primary font-bold outline-none cursor-pointer text-right appearance-none hover:opacity-70"
                    >
                      {(curriculumUnits.length > 0
                        ? curriculumUnits
                        : [
                            { id: "unidad_1", numero_unidad: 1, nombre_unidad: "Unidad 1" } as Unidad,
                            { id: "unidad_2", numero_unidad: 2, nombre_unidad: "Unidad 2" } as Unidad,
                            { id: "unidad_3", numero_unidad: 3, nombre_unidad: "Unidad 3" } as Unidad,
                            { id: "unidad_4", numero_unidad: 4, nombre_unidad: "Unidad 4" } as Unidad,
                          ]
                      ).map((curriculumUnit) => (
                        <option key={curriculumUnit.id} value={curriculumUnit.id}>
                          {curriculumUnit.nombre_unidad || `Unidad ${curriculumUnit.numero_unidad}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Link
                    href={buildUrl("/ver-unidad", withAsignatura({ curso, unidad: u.unidadCurricularId || "unidad_1", unitIdLocal: String(u.id) }, ASIGNATURA))}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[13px] font-semibold text-foreground hover:bg-background hover:border-primary transition-colors"
                  >
                    Ver unidad <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                  <Link
                    href={buildUrl("/cronograma", withAsignatura({ curso }, ASIGNATURA))}
                    className="flex items-center justify-between px-3 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-background rounded-lg transition-colors"
                  >
                    Cronograma <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MODALES ── */}

      {/* Crear unidad */}
      {showCreate && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-5" onClick={() => setShowCreate(false)}>
          <div className="relative w-full max-w-[540px] rounded-[20px] bg-card p-5 shadow-2xl sm:p-7" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCreate(false)} className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-full bg-background text-muted-foreground hover:bg-border transition-colors">
              <X className="h-4 w-4" />
            </button>
            <h2 className="mb-1.5 text-[18px] font-extrabold">Crear unidad para {curso}</h2>
            <p className="mb-5 text-[13px] text-muted-foreground">Selecciona el tipo de planificación.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {MODAL_OPTIONS.map(opt => (
                <div key={opt.type} onClick={() => setSelectedType(opt.type)}
                  className={cn("cursor-pointer rounded-[14px] border-[1.5px] p-5 transition-all hover:-translate-y-px",
                    selectedType === opt.type ? "border-primary bg-pink-light shadow-[0_4px_16px_color-mix(in srgb,var(--primary) 12%,transparent)]" : "border-border bg-background hover:border-primary"
                  )}>
                  <div className="mb-2 text-[24px] leading-none">{opt.emoji}</div>
                  <h3 className="mb-1.5 text-[13px] font-extrabold">{opt.title}</h3>
                  <p className="mb-3.5 text-[11px] leading-snug text-muted-foreground">{opt.desc}</p>
                  <button className={cn("rounded-lg border-[1.5px] px-4 py-1.5 text-[12px] font-semibold transition-colors",
                    selectedType === opt.type ? "border-primary bg-primary text-white" : "border-border bg-card text-foreground hover:bg-background"
                  )}>
                    {selectedType === opt.type ? "Seleccionado ✓" : "Seleccionar"}
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2.5 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <button onClick={() => setShowCreate(false)} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-background transition-colors">Cancelar</button>
              <button onClick={createUnit} disabled={!selectedType}
                className={cn("rounded-[10px] px-5 py-2.5 text-[13px] font-bold text-white transition-colors",
                  selectedType ? "bg-primary hover:bg-pink-dark cursor-pointer" : "cursor-not-allowed bg-border"
                )}>
                Crear planificación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fechas */}
      {dpUnit && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40" onClick={() => setDpUnit(null)}>
          <div className="w-[440px] max-w-[96vw] rounded-[18px] bg-card p-5 shadow-2xl sm:p-7" onClick={e => e.stopPropagation()}>
            <h3 className="mb-5 text-[15px] font-extrabold">Fechas – {dpUnit.name}</h3>
            <div className="mb-5 grid grid-cols-1 items-end gap-2.5 sm:grid-cols-[1fr_auto_1fr]">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Fecha inicio</label>
                <input id="dp-s" type="date" defaultValue={dpUnit.start ? toISO(dpUnit.start) : ""}
                  className="rounded-[10px] border-[1.5px] border-border px-3.5 py-2.5 text-[13px] font-semibold outline-none focus:border-primary transition-colors" />
              </div>
              <span className="hidden pb-2.5 text-center text-muted-foreground sm:block">→</span>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Fecha término</label>
                <input id="dp-e" type="date" defaultValue={dpUnit.end ? toISO(dpUnit.end) : ""}
                  className="rounded-[10px] border-[1.5px] border-border px-3.5 py-2.5 text-[13px] font-semibold outline-none focus:border-primary transition-colors" />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button onClick={() => setDpUnit(null)} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-background transition-colors">Cancelar</button>
              <button onClick={() => { const s=(document.getElementById("dp-s") as HTMLInputElement).value; const e=(document.getElementById("dp-e") as HTMLInputElement).value; if(s&&e) saveDates(s,e) }}
                className="rounded-[10px] bg-primary px-5 py-2.5 text-[13px] font-bold text-white hover:bg-pink-dark transition-colors">
                Guardar fechas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Eliminar */}
      {deactUnit && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40" onClick={() => setDeactUnit(null)}>
          <div className="w-[360px] max-w-[96vw] rounded-[16px] bg-card p-5 shadow-2xl sm:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="mb-2 text-[15px] font-extrabold">Eliminar {deactUnit.name}</h3>
            <p className="mb-5 text-[13px] text-muted-foreground">Esta unidad se eliminará de la planificación de {curso}.</p>
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button onClick={() => setDeactUnit(null)} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-background transition-colors">Cancelar</button>
              <button onClick={deactivate} className="rounded-[10px] bg-red-500 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-red-600 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Dividir */}
      {divideUnit && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40" onClick={() => setDivideUnit(null)}>
          <div className="w-[420px] max-w-[96vw] rounded-[18px] bg-card p-5 shadow-2xl sm:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="mb-1.5 text-[15px] font-extrabold">Dividir {divideUnit.name}</h3>
            <p className="mb-4 text-[12px] text-muted-foreground">Solo si no superas el límite de {MAX_UNIDADES} unidades.</p>
            {(["a","b"] as const).map(part => (
              <div key={part} className="mb-3.5 flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Parte {part.toUpperCase()}</label>
                <input id={`div-${part}`} type="text" defaultValue={divideUnit.name+part.toUpperCase()}
                  className="rounded-[10px] border-[1.5px] border-border px-3.5 py-2.5 text-[13px] font-semibold outline-none focus:border-primary transition-colors" />
              </div>
            ))}
            <div className="mt-4 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button onClick={() => setDivideUnit(null)} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-background transition-colors">Cancelar</button>
              <button onClick={() => { const a=(document.getElementById("div-a") as HTMLInputElement).value; const b=(document.getElementById("div-b") as HTMLInputElement).value; divide(a,b) }}
                className="rounded-[10px] bg-primary px-5 py-2.5 text-[13px] font-bold text-white hover:bg-pink-dark transition-colors">
                Dividir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renombrar */}
      {renameUnit && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40" onClick={() => setRenameUnit(null)}>
          <div className="w-[380px] max-w-[96vw] rounded-[16px] bg-card p-5 shadow-2xl sm:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="mb-4 text-[15px] font-extrabold">Renombrar unidad</h3>
            <input value={renameVal} onChange={e => setRenameVal(e.target.value)} onKeyDown={e => { if(e.key==="Enter") rename() }}
              className="mb-4 w-full rounded-[10px] border-[1.5px] border-primary px-3.5 py-2.5 text-[13px] font-semibold outline-none focus:shadow-[0_0_0_3px_color-mix(in srgb,var(--primary) 10%,transparent)] transition-all" autoFocus />
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button onClick={() => setRenameUnit(null)} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-background transition-colors">Cancelar</button>
              <button onClick={rename} className="rounded-[10px] bg-primary px-5 py-2.5 text-[13px] font-bold text-white hover:bg-pink-dark transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[999] -translate-x-1/2 rounded-[10px] bg-foreground px-5 py-3 text-[13px] font-semibold text-background shadow-lg animate-fade-up">
          {toast}
        </div>
      )}
    </div>
  )
}

export function PlanificacionesContent({ cursoParam }: { cursoParam: string }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[14px]">Cargando Mis Planificaciones…</span>
      </div>
    }>
      <PlanificacionesInner cursoParam={cursoParam} />
    </Suspense>
  )
}
