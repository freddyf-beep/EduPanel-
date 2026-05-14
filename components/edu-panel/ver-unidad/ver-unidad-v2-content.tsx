"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ArrowLeft, Bookmark, CalendarDays, Check, CheckCircle2, Circle,
  ClipboardList, Download, FileText, Layers, Loader2, Plus, Target,
  Trash2, BookOpen, Clock, Heart, Pencil, ArrowRight, Eye, X, AlertCircle,
  MoreHorizontal, FolderOpen, UploadCloud, HardDrive
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  applyPlanSelection,
  buildMatrixCellKey,
  cargarCronogramaUnidad,
  cargarPlanCurso,
  cargarPlanificacion,
  cargarVerUnidad,
  emptyMatrizSeleccion,
  getUnidadCompleta,
  guardarPlanificacion,
  guardarVerUnidad,
  initElems,
  initOAs,
  mergeElementos,
  mergeOAs,
} from "@/lib/curriculo"
import type {
  ActividadDocente,
  ElementoCurricular,
  EstrategiaEvaluacionUnidad,
  OAEditado,
  Unidad,
  UnidadPlan,
} from "@/lib/curriculo"
import { ActividadesEmbedded } from "@/components/edu-panel/actividades/actividades-content"
import { CronogramaUnidadContent } from "@/components/edu-panel/cronograma-unidad/cronograma-unidad-content"
import { DriveSheet } from "@/components/edu-panel/drive/drive-sheet"
import { DriveWorkspaceActions } from "@/components/edu-panel/drive/drive-workspace-actions"
import {
  actualizarUnidadEnRespaldoVivoDrive,
  getGoogleDriveToken,
  isGoogleDriveAutosaveEnabled,
} from "@/lib/google-drive"
import {
  cargarCursoTipos,
  cargarNivelMapping,
  resolveNivel,
  resolveTipoCurricular,
  type CursoTipoMap,
  type TipoCurricular,
} from "@/lib/nivel-mapping"
import { cargarHorarioSemanal } from "@/lib/horario"
import type { ClaseHorario } from "@/lib/horario"
import { buildUrl, UNIT_COLORS, withAsignatura } from "@/lib/shared"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { useIsMobile } from "@/components/ui/use-mobile"

type TabKey = "curriculo" | "cronograma" | "actividades"

function unitIndexFrom(value: string): number {
  const n = parseInt(value.replace(/\D/g, ""), 10)
  return Number.isFinite(n) && n > 0 ? n - 1 : 0
}

function parseFechaDDMMYYYY(value: string): Date | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizarCursoHorario(value: string): string {
  return value
    .replace("°", "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

function diaHorarioFromDate(date: Date): ClaseHorario["dia"] | null {
  const map: Record<number, ClaseHorario["dia"]> = {
    1: "Lunes",
    2: "Martes",
    3: "Miércoles",
    4: "Jueves",
    5: "Viernes",
  }
  return map[date.getDay()] || null
}

function horaToMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

function duracionBloque(bloque: ClaseHorario): number {
  return Math.max(0, horaToMinutos(bloque.horaFin) - horaToMinutos(bloque.horaInicio))
}

function calcularMinutosUnidad(
  clases: Array<{ fecha?: string }>,
  horario: ClaseHorario[],
  curso: string
): { minutos: number; clasesConHorario: number; clasesConFecha: number } {
  const cursoNormalizado = normalizarCursoHorario(curso)
  const bloquesCurso = horario
    .filter(bloque => bloque.tipo !== "almuerzo" && bloque.tipo !== "planificacion" && bloque.tipo !== "recreo" && bloque.tipo !== "libre")
    .filter(bloque => normalizarCursoHorario(bloque.resumen) === cursoNormalizado)

  const fechas = clases
    .map(clase => (clase.fecha || "").trim())
    .filter(Boolean)

  const porFecha = new Map<string, number>()
  fechas.forEach(fecha => porFecha.set(fecha, (porFecha.get(fecha) || 0) + 1))

  let minutos = 0
  let clasesConHorario = 0

  porFecha.forEach((cantidad, fecha) => {
    const date = parseFechaDDMMYYYY(fecha)
    const dia = date ? diaHorarioFromDate(date) : null
    if (!dia) return
    const bloquesDia = bloquesCurso
      .filter(bloque => bloque.dia === dia)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
    if (!bloquesDia.length) return

    for (let i = 0; i < cantidad; i++) {
      const bloque = bloquesDia[Math.min(i, bloquesDia.length - 1)]
      minutos += duracionBloque(bloque)
      clasesConHorario += 1
    }
  })

  return { minutos, clasesConHorario, clasesConFecha: fechas.length }
}

function formatHorasUnidad(minutos: number): string {
  if (minutos <= 0) return "Pendiente"
  const horas = minutos / 60
  return Number.isInteger(horas) ? `${horas} h` : `${horas.toFixed(1)} h`
}

function formatFechaDDMMYYYY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}/${date.getFullYear()}`
}

function compactText(text: string, max = 180): string {
  return text.length > max ? `${text.slice(0, max).trim()}...` : text
}

function selectedItems(items: ElementoCurricular[]) {
  return items.filter(item => item.seleccionado)
}

function selectedOas(oas: OAEditado[]) {
  return oas.filter(oa => oa.seleccionado)
}

function findPlanUnit(units: UnidadPlan[], unidadLocalParam: string, unidadParam: string): UnidadPlan | null {
  const numeric = unidadLocalParam.replace(/\D/g, "")
  return units.find(unit =>
    String(unit.id) === unidadLocalParam ||
    String(unit.id) === numeric ||
    unit.unidadCurricularId === unidadParam
  ) || null
}

function deriveCronogramaDates(clases: Array<{ fecha?: string }> | undefined) {
  const dates = (clases || [])
    .map(clase => parseFechaDDMMYYYY((clase.fecha || "").trim()))
    .filter((date): date is Date => !!date)
    .sort((a, b) => a.getTime() - b.getTime())

  if (!dates.length) return null
  return {
    start: formatFechaDDMMYYYY(dates[0]),
    end: formatFechaDDMMYYYY(dates[dates.length - 1]),
    datedCount: dates.length,
    totalCount: clases?.length || 0,
  }
}

function makeElemento(kind: string, texto: string): ElementoCurricular {
  return {
    id: `${kind}_${Date.now()}`,
    texto: texto.trim(),
    seleccionado: true,
    esPropio: true,
  }
}

function StatusPill({ status }: { status: "idle" | "saving_silent" | "saved" | "error" }) {
  if (status === "saving_silent") {
    return <span className="text-[11px] font-semibold text-muted-foreground animate-pulse">Guardando...</span>
  }
  if (status === "saved") {
    return <span className="flex items-center gap-1 text-[11px] font-bold text-green-600"><Check className="h-3.5 w-3.5" /> Guardado</span>
  }
  if (status === "error") {
    return <span className="text-[11px] font-bold text-red-500">Error al guardar</span>
  }
  return null
}

function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full border transition-colors",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
      )}
    >
      {selected && <Check className="h-2.5 w-2.5" />}
    </span>
  )
}

function DetalleOAModal({
  oas,
  cursoParam,
  onClose,
  onChange,
}: {
  oas: OAEditado[]
  cursoParam: string
  onClose: () => void
  onChange: (next: OAEditado[]) => void
}) {
  const [selectedId, setSelectedId] = useState<string>(oas.find(oa => oa.seleccionado)?.id || oas[0]?.id || "")
  const selected = oas.find(oa => oa.id === selectedId) || null

  const toggleOA = (id: string) => {
    onChange(oas.map(oa => oa.id === id ? { ...oa, seleccionado: !oa.seleccionado } : oa))
  }

  const toggleIndicador = (oaId: string, indicadorId: string) => {
    onChange(oas.map(oa => oa.id === oaId
      ? { ...oa, indicadores: (oa.indicadores || []).map(ind => ind.id === indicadorId ? { ...ind, seleccionado: !ind.seleccionado } : ind) }
      : oa
    ))
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[70vh] w-full max-w-[920px] flex-col overflow-hidden rounded-[18px] border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[16px] font-extrabold">{cursoParam}: Objetivos de Aprendizaje</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Selecciona o quita OA e indicadores de la unidad.</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-background text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 md:grid-cols-[44%_1fr]">
          <div className="overflow-y-auto border-b border-border md:border-b-0 md:border-r">
            {oas.map((oa, index) => (
              <button
                key={oa.id}
                type="button"
                onClick={() => setSelectedId(oa.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors",
                  selectedId === oa.id ? "bg-primary/10" : "hover:bg-muted/40"
                )}
              >
                <span onClick={event => { event.stopPropagation(); toggleOA(oa.id) }}>
                  <SelectionMark selected={oa.seleccionado} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: UNIT_COLORS[index % UNIT_COLORS.length] }} />
                    <span className="text-[11px] font-extrabold text-primary">{oa.tipo === "oat" ? "OAT" : oa.numero ? `OA ${oa.numero}` : "OA"}</span>
                  </div>
                  <p className={cn("text-[12px] leading-snug", !oa.seleccionado && "text-muted-foreground line-through")}>
                    {compactText(oa.descripcion, 140)}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="min-h-0 overflow-y-auto">
            {selected ? (
              <div className="p-4">
                <div className="mb-3">
                  <p className="text-[11px] font-extrabold uppercase text-muted-foreground">
                    {selected.tipo === "oat" ? "OAT" : selected.numero ? `OA ${selected.numero}` : "OA"}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed">{selected.descripcion}</p>
                </div>
                <div className="space-y-2">
                  {(selected.indicadores || []).length === 0 ? (
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-3 text-[12px] text-muted-foreground">
                      <AlertCircle className="h-4 w-4" /> Sin indicadores asociados.
                    </div>
                  ) : (selected.indicadores || []).map(ind => (
                    <button
                      key={ind.id}
                      type="button"
                      onClick={() => toggleIndicador(selected.id, ind.id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-[12px] transition-colors",
                        ind.seleccionado ? "border-green-200 bg-green-50 text-green-900" : "border-border bg-background text-muted-foreground hover:bg-muted/40"
                      )}
                    >
                      <SelectionMark selected={ind.seleccionado} />
                      <span>{ind.texto}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">Selecciona un OA</div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-[12px] text-muted-foreground">{oas.filter(oa => oa.seleccionado).length}/{oas.length} OA seleccionados</span>
          <button onClick={onClose} className="rounded-[10px] bg-primary px-5 py-2 text-[12px] font-bold text-primary-foreground hover:opacity-90">Listo</button>
        </div>
      </div>
    </div>
  )
}

function DetalleElementosModal({
  titulo,
  cursoParam,
  elementos,
  onClose,
  onChange,
}: {
  titulo: string
  cursoParam: string
  elementos: ElementoCurricular[]
  onClose: () => void
  onChange: (next: ElementoCurricular[]) => void
}) {
  const toggle = (id: string) => {
    onChange(elementos.map(item => item.id === id ? { ...item, seleccionado: !item.seleccionado } : item))
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[65vh] w-full max-w-[620px] flex-col overflow-hidden rounded-[18px] border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[16px] font-extrabold">{cursoParam}: {titulo}</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Selecciona o quita elementos de la unidad.</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-background text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {elementos.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className={cn(
                "flex w-full items-start gap-2 border-b border-border px-4 py-3 text-left text-[12px] transition-colors",
                item.seleccionado ? "bg-primary/5 text-foreground" : "text-muted-foreground hover:bg-muted/40"
              )}
            >
              <SelectionMark selected={item.seleccionado} />
              <span className={cn("leading-snug", !item.seleccionado && "line-through")}>{item.texto}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-[12px] text-muted-foreground">{elementos.filter(item => item.seleccionado).length}/{elementos.length} seleccionados</span>
          <button onClick={onClose} className="rounded-[10px] bg-primary px-5 py-2 text-[12px] font-bold text-primary-foreground hover:opacity-90">Listo</button>
        </div>
      </div>
    </div>
  )
}

function ElementosCompactos({
  title,
  icon,
  kind,
  items,
  onChange,
}: {
  title: string
  icon: ReactNode
  kind: string
  items: ElementoCurricular[]
  onChange: (next: ElementoCurricular[]) => void
}) {
  const [nuevo, setNuevo] = useState("")
  const seleccionados = selectedItems(items)

  const toggle = (id: string) => {
    onChange(items.map(item => item.id === id ? { ...item, seleccionado: !item.seleccionado } : item))
  }

  const add = () => {
    if (!nuevo.trim()) return
    onChange([...items, makeElemento(kind, nuevo)])
    setNuevo("")
  }

  const remove = (id: string) => {
    onChange(items.filter(item => item.id !== id))
  }

  return (
    <section className="rounded-[10px] border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h3 className="text-[12px] font-extrabold">{title}</h3>
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {seleccionados.length}/{items.length}
          </span>
        </div>
      </div>
      <div className="space-y-2 p-2.5">
        <div className="flex gap-2">
          <input
            value={nuevo}
            onChange={event => setNuevo(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add() } }}
            placeholder={`Agregar ${title.toLowerCase()}...`}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-[11px] outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={add}
            disabled={!nuevo.trim()}
            className="grid h-8 w-8 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted disabled:opacity-40"
            title="Agregar"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="max-h-[180px] overflow-y-auto rounded-md border border-border bg-background">
          {items.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-muted-foreground">Sin elementos cargados.</p>
          ) : items.map(item => (
            <div
              key={item.id}
              className={cn(
                "flex items-start gap-2 border-b border-border px-2.5 py-1.5 text-[11px] transition-colors last:border-b-0",
                item.seleccionado ? "bg-primary/5 text-foreground" : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <button
                type="button"
                onClick={() => toggle(item.id)}
                className="flex min-w-0 flex-1 items-start gap-2 text-left"
              >
                <SelectionMark selected={item.seleccionado} />
                <span className="min-w-0 flex-1 leading-snug">{item.texto}</span>
              </button>
              {item.esPropio && (
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Menú de acciones secundarias del header ─────────────────────────────────
function HeaderMoreMenu({
  onOpenFolder,
  onBackup,
  legacyHref,
}: {
  onOpenFolder: () => Promise<void>
  onBackup: () => Promise<void>
  legacyHref: string
}) {
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState<"folder" | "backup" | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const run = async (key: "folder" | "backup", fn: () => Promise<void>) => {
    setWorking(key)
    setOpen(false)
    try { await fn() } finally { setWorking(null) }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="grid h-9 w-9 place-items-center rounded-[10px] border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        title="Más acciones"
      >
        {working ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MoreHorizontal className="h-4 w-4" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-[12px] border border-border bg-card p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.12)]">
          <button
            type="button"
            onClick={() => run("folder", onOpenFolder)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] font-semibold text-foreground hover:bg-background"
          >
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            Abrir carpeta en Drive
          </button>
          <button
            type="button"
            onClick={() => run("backup", onBackup)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] font-semibold text-foreground hover:bg-background"
          >
            <UploadCloud className="h-4 w-4 text-muted-foreground" />
            Respaldar en Drive
          </button>
          <div className="my-1 h-px bg-border" />
          <Link
            href={legacyHref}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] font-semibold text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <Clock className="h-3.5 w-3.5" />
            Diseño anterior
          </Link>
        </div>
      )}
    </div>
  )
}

function VerUnidadV2Inner() {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const searchParams = useSearchParams()
  const unidadParam = searchParams.get("unidad") || "unidad_1"
  const unidadLocalParam = searchParams.get("unitIdLocal") || unidadParam
  const cursoParam = searchParams.get("curso") || "1° A"
  const unitIndex = unitIndexFrom(unidadLocalParam)

  const [activeTab, setActiveTab] = useState<TabKey>("curriculo")
  const [unidad, setUnidad] = useState<Unidad | null>(null)
  const [planUnit, setPlanUnit] = useState<UnidadPlan | null>(null)
  const [cronogramaDates, setCronogramaDates] = useState<{ start: string; end: string; datedCount: number; totalCount: number } | null>(null)
  const [cronogramaClases, setCronogramaClases] = useState<Array<{ fecha?: string }>>([])
  const [horarioBase, setHorarioBase] = useState<ClaseHorario[]>([])
  const [nivelAsignado, setNivelAsignado] = useState("")
  const [tipoCurricular, setTipoCurricular] = useState<TipoCurricular>("oficial")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving_silent" | "saved" | "error">("idle")

  const [descripcion, setDescripcion] = useState("")
  const [contextoDocente, setContextoDocente] = useState("")
  const [objetivoDocente, setObjetivoDocente] = useState("")
  const [horas, setHoras] = useState(16)
  const [clases, setClases] = useState(8)
  const [oas, setOas] = useState<OAEditado[]>([])
  const [habilidades, setHabilidades] = useState<ElementoCurricular[]>([])
  const [conocimientos, setConocimientos] = useState<ElementoCurricular[]>([])
  const [actitudes, setActitudes] = useState<ElementoCurricular[]>([])
  const [actividades, setActividades] = useState<ActividadDocente[]>([])
  const [conocimientosPrevios, setConocimientosPrevios] = useState("")
  const [recursosMaterialesUnidad, setRecursosMaterialesUnidad] = useState<string[]>([])
  const [estrategiasEvaluacion, setEstrategiasEvaluacion] = useState<EstrategiaEvaluacionUnidad[]>([])
  const [recursoDraft, setRecursoDraft] = useState("")
  const [evalDraft, setEvalDraft] = useState({ nombre: "", instrumento: "", ponderacion: "" })
  const [expandedResumen, setExpandedResumen] = useState({
    oas: false,
    habilidades: false,
    conocimientos: false,
    actitudes: false,
  })
  const [modalOA, setModalOA] = useState(false)
  const [modalHab, setModalHab] = useState(false)
  const [modalCon, setModalCon] = useState(false)
  const [modalAct, setModalAct] = useState(false)
  const [showPdf, setShowPdf] = useState(false)
  const [pdfPos, setPdfPos] = useState({ right: 32, bottom: 32 })
  const [isDraggingPdf, setIsDraggingPdf] = useState(false)
  const pdfDragRef = useRef<{ startX: number, startY: number, startRight: number, startBottom: number } | null>(null)
  const isMobile = useIsMobile()
  const ignoreNextSaveRef = useRef(true)

  const handlePdfPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pdfDragRef.current = { startX: e.clientX, startY: e.clientY, startRight: pdfPos.right, startBottom: pdfPos.bottom }
    setIsDraggingPdf(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePdfPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingPdf && pdfDragRef.current) {
      setPdfPos({
        right: pdfDragRef.current.startRight - (e.clientX - pdfDragRef.current.startX),
        bottom: pdfDragRef.current.startBottom - (e.clientY - pdfDragRef.current.startY)
      })
    }
  }

  const handlePdfPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingPdf(false)
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [mapping, tipos] = await Promise.all([
          cargarNivelMapping(),
          cargarCursoTipos().catch(() => ({} as CursoTipoMap)),
        ])
        const tipo = resolveTipoCurricular(cursoParam, tipos)
        setTipoCurricular(tipo)

        const [guardada, planificacion, planCurso, cronograma, horario] = await Promise.all([
          cargarVerUnidad(ASIGNATURA, cursoParam, unidadLocalParam),
          cargarPlanificacion(ASIGNATURA, cursoParam),
          cargarPlanCurso(ASIGNATURA, cursoParam).catch(() => null),
          cargarCronogramaUnidad(ASIGNATURA, cursoParam, unidadLocalParam).catch(() => null),
          cargarHorarioSemanal().catch(() => []),
        ])
        const planUnitEncontrada = findPlanUnit(planCurso?.units || [], unidadLocalParam, unidadParam)

        let u: Unidad | null = null
        if (tipo === "oficial") {
          const nivel = resolveNivel(cursoParam, mapping)
          if (!nivel) {
            setError(`No hay bases curriculares configuradas para "${cursoParam}". Ve a Mi Perfil > Asignaturas y selecciona el nivel curricular, o marca el curso como Taller/Libre.`)
            return
          }
          setNivelAsignado(nivel)
          u = await getUnidadCompleta(ASIGNATURA, nivel, unidadParam)
          if (!u) {
            setError(`Unidad no encontrada en las bases curriculares de ${nivel}.`)
            return
          }
        } else {
          const etiqueta = tipo === "taller" ? "Taller sin curriculum oficial" : "Libre sin curriculum oficial"
          setNivelAsignado(etiqueta)
          u = {
            id: unidadParam,
            numero_unidad: unitIndex + 1,
            nombre_unidad: planUnitEncontrada?.name || `Unidad ${unitIndex + 1}`,
            proposito: "Unidad personalizada para un curso sin curriculum oficial.",
            palabras_clave: [],
            conocimientos: [],
            habilidades: [],
            actitudes: [],
            conocimientos_previos: [],
            adecuaciones_dua: "",
            objetivos_aprendizaje: [],
            actividades_sugeridas: [],
            ejemplos_evaluacion: [],
          }
        }

        const baseOas = mergeOAs(initOAs(u, ASIGNATURA), guardada?.oas || [])
        const baseHabilidades = mergeElementos(initElems(u.habilidades || [], "habilidades"), guardada?.habilidades || [])
        const baseConocimientos = mergeElementos(initElems(u.conocimientos || [], "conocimientos"), guardada?.conocimientos || [])
        const baseActitudes = mergeElementos(initElems(u.actitudes || [], "actitudes"), guardada?.actitudes || [])

        setUnidad(u)
        setPlanUnit(planUnitEncontrada)
        setCronogramaDates(deriveCronogramaDates(cronograma?.clases))
        setCronogramaClases(cronograma?.clases || [])
        setHorarioBase(horario || [])
        setDescripcion(guardada?.descripcion || u.proposito || "")
        setContextoDocente(guardada?.contextoDocente || "")
        setObjetivoDocente(guardada?.objetivoDocente || "")
        setHoras(guardada?.horas || 16)
        setClases(cronograma?.totalClases || cronograma?.clases?.length || guardada?.clases || 8)
        setOas(applyPlanSelection(baseOas, planificacion?.matriz.oa, unitIndex))
        setHabilidades(applyPlanSelection(baseHabilidades, planificacion?.matriz.habilidades, unitIndex))
        setConocimientos(applyPlanSelection(baseConocimientos, planificacion?.matriz.conocimientos, unitIndex))
        setActitudes(applyPlanSelection(baseActitudes, planificacion?.matriz.actitudes, unitIndex))
        setActividades(guardada?.actividades || [])
        setConocimientosPrevios(guardada?.conocimientosPrevios || (u.conocimientos_previos || []).join("\n"))
        setRecursosMaterialesUnidad(guardada?.recursosMaterialesUnidad || [])
        setEstrategiasEvaluacion(guardada?.estrategiasEvaluacion || [])
      } catch (err: any) {
        setError(err?.message || "No se pudo cargar la unidad.")
      } finally {
        ignoreNextSaveRef.current = true
        setLoading(false)
      }
    }

    load()
  }, [ASIGNATURA, cursoParam, unidadLocalParam, unidadParam, unitIndex])

  const handleGuardar = async (isAutoSave = false) => {
    if (!isAutoSave) setSaving(true)
    if (isAutoSave) setSaveStatus("saving_silent")
    try {
      await guardarVerUnidad(ASIGNATURA, cursoParam, unidadLocalParam, {
        descripcion,
        contextoDocente,
        objetivoDocente,
        horas: horasParaGuardar,
        clases,
        oas,
        habilidades,
        conocimientos,
        actitudes,
        actividades,
        conocimientosPrevios,
        recursosMaterialesUnidad,
        estrategiasEvaluacion,
      })

      const planificacion = await cargarPlanificacion(ASIGNATURA, cursoParam)
      const matriz = planificacion?.matriz || emptyMatrizSeleccion()
      oas.forEach(oa => { matriz.oa[buildMatrixCellKey(oa.id, unitIndex)] = !!oa.seleccionado })
      habilidades.forEach(item => { matriz.habilidades[buildMatrixCellKey(item.id, unitIndex)] = !!item.seleccionado })
      conocimientos.forEach(item => { matriz.conocimientos[buildMatrixCellKey(item.id, unitIndex)] = !!item.seleccionado })
      actitudes.forEach(item => { matriz.actitudes[buildMatrixCellKey(item.id, unitIndex)] = !!item.seleccionado })
      await guardarPlanificacion(ASIGNATURA, cursoParam, planificacion?.fechas || {}, matriz)

      const driveToken = isGoogleDriveAutosaveEnabled() ? getGoogleDriveToken() : null
      if (driveToken) {
        try {
          await actualizarUnidadEnRespaldoVivoDrive(driveToken, {
            context: {
              tipo: "unidad",
              asignatura: ASIGNATURA,
              curso: cursoParam,
              unidadId: unidadLocalParam,
              unidadNombre: planUnit?.name || unidad?.nombre_unidad,
            },
            data: {
              asignatura: ASIGNATURA,
              curso: cursoParam,
              unidadId: unidadLocalParam,
              unidadCurricularId: unidadParam,
              nombre: planUnit?.name || unidad?.nombre_unidad,
              numeroClases: clases,
              horas: horasParaGuardar,
              verUnidad: {
                descripcion,
                contextoDocente,
                objetivoDocente,
                oas,
                habilidades,
                conocimientos,
                actitudes,
                actividades,
                conocimientosPrevios,
                recursosMaterialesUnidad,
                estrategiasEvaluacion,
              },
              cronograma: {
                fechas: cronogramaDates,
                clases: cronogramaClases,
              },
            },
          })
        } catch (error) {
          console.warn("[drive-autosave:unidad]", error)
        }
      }

      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2500)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (loading) return
    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false
      return
    }
    const timer = setTimeout(() => handleGuardar(true), 1600)
    return () => clearTimeout(timer)
  }, [
    descripcion,
    contextoDocente,
    objetivoDocente,
    horas,
    clases,
    oas,
    habilidades,
    conocimientos,
    actitudes,
    actividades,
    conocimientosPrevios,
    recursosMaterialesUnidad,
    estrategiasEvaluacion,
    loading,
  ])

  const oasSeleccionados = useMemo(() => selectedOas(oas), [oas])
  const oasBasales = useMemo(() => oasSeleccionados.filter(oa => oa.tipo !== "oat"), [oasSeleccionados])
  const oatSeleccionados = useMemo(() => oasSeleccionados.filter(oa => oa.tipo === "oat"), [oasSeleccionados])
  const indicadoresSeleccionados = useMemo(
    () => oasBasales.reduce((sum, oa) => sum + (oa.indicadores || []).filter(ind => ind.seleccionado).length, 0),
    [oasBasales]
  )
  const habsSel = selectedItems(habilidades)
  const consSel = selectedItems(conocimientos)
  const actsSel = selectedItems(actitudes)
  const cargaCalculada = useMemo(
    () => calcularMinutosUnidad(cronogramaClases, horarioBase, cursoParam),
    [cronogramaClases, horarioBase, cursoParam]
  )
  const horasParaGuardar = cargaCalculada.minutos > 0
    ? Math.max(1, Math.round((cargaCalculada.minutos / 60) * 10) / 10)
    : horas

  const fechasFormato = cronogramaDates || (
    planUnit?.start || planUnit?.end ? { start: planUnit.start || "", end: planUnit.end || "", datedCount: 0, totalCount: 0 } : null
  )
  const fechaFuente = cronogramaDates ? "Cronograma de unidad" : planUnit?.start || planUnit?.end ? "Planificacion anual" : "Sin fechas"

  const checklist = [
    { label: "Fechas", done: !!(fechasFormato?.start && fechasFormato?.end) },
    { label: "Proposito", done: !!descripcion.trim() },
    { label: "Conocimientos previos", done: !!conocimientosPrevios.trim() },
    { label: "Conocimientos a desarrollar", done: consSel.length > 0 },
    { label: "Habilidades", done: habsSel.length > 0 },
    { label: "Actitudes / OAT", done: actsSel.length > 0 || oatSeleccionados.length > 0 },
    { label: "OA e indicadores", done: oasBasales.length > 0 && indicadoresSeleccionados > 0 },
    { label: "Estrategia evaluativa", done: estrategiasEvaluacion.some(item => item.nombre.trim() && item.instrumento.trim() && item.ponderacion !== null) },
    { label: "Recursos / materiales", done: recursosMaterialesUnidad.length > 0 },
  ]
  const completed = checklist.filter(item => item.done).length
  const progressPct = Math.round((completed / checklist.length) * 100)
  const oasResumen = expandedResumen.oas ? oasSeleccionados : oasSeleccionados.slice(0, 3)
  const habsResumen = expandedResumen.habilidades ? habsSel : habsSel.slice(0, 6)
  const consResumen = expandedResumen.conocimientos ? consSel : consSel.slice(0, 4)
  const actsResumen = expandedResumen.actitudes ? actsSel : actsSel.slice(0, 4)

  const toggleOA = (oaId: string) => {
    setOas(prev => prev.map(oa => oa.id === oaId ? { ...oa, seleccionado: !oa.seleccionado } : oa))
  }

  const toggleIndicador = (oaId: string, indicadorId: string) => {
    setOas(prev => prev.map(oa => oa.id === oaId
      ? { ...oa, indicadores: (oa.indicadores || []).map(ind => ind.id === indicadorId ? { ...ind, seleccionado: !ind.seleccionado } : ind) }
      : oa
    ))
  }

  const addRecurso = () => {
    const text = recursoDraft.trim()
    if (!text) return
    setRecursosMaterialesUnidad(prev => [...prev, text])
    setRecursoDraft("")
  }

  const ajustarTotalClases = (next: number) => {
    const safe = Math.min(60, Math.max(1, Math.round(next || 1)))
    setClases(safe)
  }

  const addEstrategia = () => {
    if (!evalDraft.nombre.trim() || !evalDraft.instrumento.trim()) return
    const ponderacion = evalDraft.ponderacion.trim() ? Number(evalDraft.ponderacion) : null
    setEstrategiasEvaluacion(prev => [...prev, {
      id: `eval_${Date.now()}`,
      nombre: evalDraft.nombre.trim(),
      instrumento: evalDraft.instrumento.trim(),
      ponderacion: Number.isFinite(ponderacion) ? ponderacion : null,
    }])
    setEvalDraft({ nombre: "", instrumento: "", ponderacion: "" })
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-[14px] font-medium">Cargando unidad...</span>
      </div>
    )
  }

  if (error || !unidad) {
    return (
      <div className="mx-auto max-w-[980px] px-4 py-10">
        <Link
          href={buildUrl("/planificaciones", withAsignatura({ curso: cursoParam }, ASIGNATURA))}
          className="mb-4 inline-flex items-center gap-2 text-[12px] font-bold text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <div className="rounded-[14px] border border-border bg-card p-6">
          <h1 className="text-[18px] font-extrabold">No pude abrir esta unidad</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">{error || "Unidad no encontrada."}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1500px] px-3 py-5 sm:px-5">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={buildUrl("/planificaciones", withAsignatura({ curso: cursoParam }, ASIGNATURA))}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-background"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: planUnit?.color || UNIT_COLORS[unitIndex % UNIT_COLORS.length] }} />
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">{ASIGNATURA} / {nivelAsignado} / {cursoParam}</p>
            <h1 className="truncate text-[18px] font-extrabold leading-tight sm:text-[22px]">
              {planUnit?.name || unidad.nombre_unidad}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={saveStatus} />

          {/* Drive — explorador contextualizado a la unidad */}
          <DriveSheet
            context={{
              tipo: "unidad",
              asignatura: ASIGNATURA,
              curso: cursoParam,
              unidadId: unidadLocalParam,
              unidadNombre: planUnit?.name || unidad.nombre_unidad,
            }}
            title="Drive de esta unidad"
            description="Tu Drive personal a mano para guias, pruebas, rubricas y materiales de la unidad."
            label="Drive"
            buttonClassName="gap-1.5 rounded-[10px] border border-border bg-card px-3 py-2 text-[12px] font-bold text-muted-foreground hover:border-primary hover:text-primary"
          />

          {/* Programa Oficial — solo si el curso tiene curriculum oficial */}
          {tipoCurricular === "oficial" && (
            <button
              onClick={() => setShowPdf(true)}
              className="flex items-center gap-[7px] rounded-[10px] border-[1.5px] border-primary bg-pink-light/30 px-3 py-2 text-[12px] font-bold text-primary transition-colors hover:bg-pink-light/60 sm:px-4 sm:py-2.5 sm:text-[13px]"
            >
              <FileText className="h-[15px] w-[15px]" />
              <span className="hidden sm:inline">Programa Oficial</span>
              <span className="sm:hidden">Programa</span>
            </button>
          )}

          {/* Menú ⋯ — acciones secundarias de Drive + diseño anterior */}
          <HeaderMoreMenu
            onOpenFolder={async () => {
              const { ensureEduPanelWorkspaceForContext, getGoogleDriveToken: getToken, buildDriveFolderUrl } = await import("@/lib/google-drive")
              const token = getToken()
              if (!token) { alert("Conecta Google Drive primero."); return }
              const ws = await ensureEduPanelWorkspaceForContext(token, {
                tipo: "unidad",
                asignatura: ASIGNATURA,
                curso: cursoParam,
                unidadId: unidadLocalParam,
                unidadNombre: planUnit?.name || unidad.nombre_unidad,
              })
              window.open(ws.focusFolder.webViewLink || buildDriveFolderUrl(ws.focusFolder.id), "_blank", "noopener,noreferrer")
            }}
            onBackup={async () => {
              const { respaldarCursoVivoJsonDrive, getGoogleDriveToken: getToken, getGoogleDriveErrorMessage } = await import("@/lib/google-drive")
              const token = getToken()
              if (!token) { alert("Conecta Google Drive primero."); return }
              try {
                await respaldarCursoVivoJsonDrive(token, {
                  context: {
                    tipo: "unidad",
                    asignatura: ASIGNATURA,
                    curso: cursoParam,
                    unidadId: unidadLocalParam,
                    unidadNombre: planUnit?.name || unidad.nombre_unidad,
                  },
                  data: {
                    asignatura: ASIGNATURA,
                    curso: cursoParam,
                    unidadId: unidadLocalParam,
                    unidadCurricularId: unidadParam,
                    nombre: planUnit?.name || unidad.nombre_unidad,
                    numeroClases: clases,
                    horas: horasParaGuardar,
                    verUnidad: { descripcion, contextoDocente, objetivoDocente, oas, habilidades, conocimientos, actitudes, actividades, conocimientosPrevios, recursosMaterialesUnidad, estrategiasEvaluacion },
                    cronograma: { fechas: cronogramaDates, clases: cronogramaClases },
                  },
                })
                alert("Respaldo guardado en Drive.")
              } catch (err) {
                const { getGoogleDriveErrorMessage: msg } = await import("@/lib/google-drive")
                alert(msg(err))
              }
            }}
            legacyHref={buildUrl("/ver-unidad", withAsignatura({ curso: cursoParam, unidad: unidadParam, unitIdLocal: unidadLocalParam }, ASIGNATURA))}
          />

          {/* Guardar */}
          <button
            onClick={() => handleGuardar(false)}
            disabled={saving || saveStatus === "saving_silent"}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12px] font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
            Guardar
          </button>
        </div>
      </header>

      <div className="mb-5 flex gap-0 overflow-x-auto border-b-2 border-border">
        {([
          { key: "curriculo", label: "Curriculo", icon: BookOpen },
          { key: "cronograma", label: "Cronograma", icon: CalendarDays },
          { key: "actividades", label: "Actividades", icon: ClipboardList },
        ] as const).map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] font-bold transition-colors -mb-[2px]",
                activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === "cronograma" && (
        <CronogramaUnidadContent
          oas={oas}
          totalClases={clases}
          curso={cursoParam}
          unidadId={unidadLocalParam}
          unidadCurricularId={unidadParam}
        />
      )}

      {activeTab === "actividades" && (
        <Suspense fallback={
          <div className="flex h-48 items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-[14px]">Cargando actividades...</span>
          </div>
        }>
          <ActividadesEmbedded
            cursoOverride={cursoParam}
            unidadOverride={unidadLocalParam}
            unidadCurricularOverride={unidadParam}
            compact
            oasOverride={oas}
          />
        </Suspense>
      )}

      {activeTab === "curriculo" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-4">
            {tipoCurricular !== "oficial" && (
              <section className="rounded-[12px] border border-primary/30 bg-primary/5 px-4 py-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <div>
                    <h2 className="text-[13px] font-extrabold text-foreground">
                      Unidad personalizada sin curriculum oficial
                    </h2>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      Este curso esta marcado como {tipoCurricular === "taller" ? "Taller" : "Libre"} en Mi Perfil. Puedes completar contexto, objetivo, cronograma y actividades sin asociar OAs Mineduc.
                    </p>
                  </div>
                </div>
              </section>
            )}
            <section className="rounded-[12px] border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-[14px] font-extrabold">Base pedagogica de la unidad</h2>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Esta informacion orienta la planificacion y luego alimenta el formato anual.
                </p>
              </div>
              <div className="space-y-4 p-4">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase text-muted-foreground">Proposito</span>
                  <div className="rounded-lg border border-border bg-background px-3 py-3 text-[12px] leading-relaxed text-foreground">
                    {descripcion || "Sin proposito definido."}
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[11px] font-bold uppercase text-muted-foreground">Contexto docente</span>
                  <textarea
                    value={contextoDocente}
                    onChange={event => setContextoDocente(event.target.value)}
                    rows={6}
                    placeholder="Foco real del curso, necesidades, ritmos, intereses..."
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-primary"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-bold uppercase text-muted-foreground">Objetivo docente</span>
                  <textarea
                    value={objetivoDocente}
                    onChange={event => setObjetivoDocente(event.target.value)}
                    rows={6}
                    placeholder="Meta pedagogica propia para esta unidad..."
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-primary"
                  />
                </label>
                </div>
              </div>
            </section>

            <section className="rounded-[12px] border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <h2 className="text-[14px] font-extrabold">Objetivos de Aprendizaje</h2>
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{oasSeleccionados.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOA(true)}
                  className="flex items-center gap-1.5 rounded-full border border-primary px-3 py-1 text-[11px] font-bold text-primary hover:bg-primary/10"
                >
                  <Eye className="h-3.5 w-3.5" /> Ver detalles
                </button>
              </div>
              <div className="space-y-2">
                {oasResumen.map((oa, index) => (
                  <div key={oa.id} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-[12px]">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: UNIT_COLORS[index % UNIT_COLORS.length] }} />
                    <p className="min-w-0 truncate">
                      <b>{oa.tipo === "oat" ? "OAT" : oa.numero ? `OA ${oa.numero}` : "OA"}:</b> {oa.descripcion}
                    </p>
                  </div>
                ))}
                {oasSeleccionados.length === 0 && <p className="py-3 text-center text-[12px] text-muted-foreground">Sin OA seleccionados.</p>}
                {!expandedResumen.oas && oasSeleccionados.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setExpandedResumen(prev => ({ ...prev, oas: true }))}
                    className="pl-2 text-[12px] font-bold text-primary hover:underline"
                  >
                    + {oasSeleccionados.length - 3} más...
                  </button>
                )}
              </div>
            </section>

            <section className="rounded-[12px] border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  <h2 className="text-[14px] font-extrabold">Habilidades</h2>
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{habsSel.length}</span>
                </div>
                <button type="button" onClick={() => setModalHab(true)} className="flex items-center gap-1.5 rounded-full border border-primary px-3 py-1 text-[11px] font-bold text-primary hover:bg-primary/10">
                  <Eye className="h-3.5 w-3.5" /> Ver detalles
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {habsResumen.map((hab, index) => (
                  <span key={hab.id} className="rounded-full px-3 py-1.5 text-[11px] font-bold text-white" style={{ background: UNIT_COLORS[index % UNIT_COLORS.length] }}>
                    {compactText(hab.texto, 48)}
                  </span>
                ))}
                {habsSel.length === 0 && <p className="text-[12px] text-muted-foreground">Sin habilidades seleccionadas.</p>}
              </div>
              {!expandedResumen.habilidades && habsSel.length > 6 && (
                <button type="button" onClick={() => setExpandedResumen(prev => ({ ...prev, habilidades: true }))} className="mt-3 text-[12px] font-bold text-primary hover:underline">
                  + {habsSel.length - 6} más...
                </button>
              )}
            </section>

            <section className="rounded-[12px] border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-500" />
                  <h2 className="text-[14px] font-extrabold">Conocimientos</h2>
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{consSel.length}</span>
                </div>
                <button type="button" onClick={() => setModalCon(true)} className="flex items-center gap-1.5 rounded-full border border-primary px-3 py-1 text-[11px] font-bold text-primary hover:bg-primary/10">
                  <Eye className="h-3.5 w-3.5" /> Ver detalles
                </button>
              </div>
              <div className="space-y-2">
                {consResumen.map(con => (
                  <p key={con.id} className="flex items-start gap-2 text-[12px]">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" /> {con.texto}
                  </p>
                ))}
                {consSel.length === 0 && <p className="text-[12px] text-muted-foreground">Sin conocimientos seleccionados.</p>}
              </div>
              {!expandedResumen.conocimientos && consSel.length > 4 && (
                <button type="button" onClick={() => setExpandedResumen(prev => ({ ...prev, conocimientos: true }))} className="mt-3 text-[12px] font-bold text-primary hover:underline">
                  + {consSel.length - 4} más...
                </button>
              )}
            </section>

            <section className="rounded-[12px] border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-red-500" />
                  <h2 className="text-[14px] font-extrabold">Actitudes</h2>
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{actsSel.length}</span>
                </div>
                <button type="button" onClick={() => setModalAct(true)} className="flex items-center gap-1.5 rounded-full border border-primary px-3 py-1 text-[11px] font-bold text-primary hover:bg-primary/10">
                  <Eye className="h-3.5 w-3.5" /> Ver detalles
                </button>
              </div>
              <div className="space-y-2">
                {actsResumen.map(act => (
                  <p key={act.id} className="flex items-start gap-2 text-[12px]">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-400" /> {act.texto}
                  </p>
                ))}
                {actsSel.length === 0 && <p className="text-[12px] text-muted-foreground">Sin actitudes seleccionadas.</p>}
              </div>
              {!expandedResumen.actitudes && actsSel.length > 4 && (
                <button type="button" onClick={() => setExpandedResumen(prev => ({ ...prev, actitudes: true }))} className="mt-3 text-[12px] font-bold text-primary hover:underline">
                  + {actsSel.length - 4} más...
                </button>
              )}
            </section>
          </main>

          <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
            <section className="rounded-[12px] border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[13px] font-extrabold">Formato anual</h2>
                  <p className="text-[11px] text-muted-foreground">{completed}/{checklist.length} completo</p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-full border border-border bg-background text-[13px] font-extrabold text-primary">
                  {progressPct}%
                </div>
              </div>
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-border/50">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="space-y-1.5">
                {checklist.map(item => (
                  <div key={item.label} className="flex items-center gap-2 text-[12px]">
                    {item.done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground/60" />}
                    <span className={item.done ? "font-semibold text-foreground" : "text-muted-foreground"}>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[12px] border border-border bg-card p-4">
              <h3 className="mb-3 text-[13px] font-extrabold">Fechas y carga</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Inicio</div>
                  <p className="text-[13px] font-bold">{fechasFormato?.start || "Sin fecha"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Termino</div>
                  <p className="text-[13px] font-bold">{fechasFormato?.end || "Sin fecha"}</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">Fuente: {fechaFuente}</p>
              {cronogramaDates ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {cronogramaDates.datedCount}/{cronogramaDates.totalCount} clases tienen fecha en el cronograma.
                </p>
              ) : (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
                  El cronograma aun no tiene fechas. Completa la pestaña Cronograma para que esta carga se arme sola.
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border bg-background p-3">
                  <span className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground"><ClipboardList className="h-3.5 w-3.5" /> Clases</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => ajustarTotalClases(clases - 1)}
                      disabled={clases <= 1}
                      className="grid h-7 w-7 place-items-center rounded-md border border-border text-[14px] font-extrabold text-muted-foreground hover:bg-card disabled:opacity-40"
                      title="Quitar una clase"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={clases}
                      onChange={event => ajustarTotalClases(Number(event.target.value))}
                      className="h-7 w-14 rounded-md border border-border bg-card text-center text-[13px] font-extrabold outline-none focus:border-primary"
                      aria-label="Numero de clases de la unidad"
                    />
                    <button
                      type="button"
                      onClick={() => ajustarTotalClases(clases + 1)}
                      disabled={clases >= 60}
                      className="grid h-7 w-7 place-items-center rounded-md border border-border text-[14px] font-extrabold text-muted-foreground hover:bg-card disabled:opacity-40"
                      title="Agregar una clase"
                    >
                      +
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Ajusta la cantidad antes de armar el cronograma.
                  </p>
                </div>
                <label className="rounded-lg border border-border bg-background p-3">
                  <span className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Horas</span>
                  <p className="text-[14px] font-extrabold">{formatHorasUnidad(cargaCalculada.minutos)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {cargaCalculada.minutos > 0
                      ? `${cargaCalculada.minutos} min / ${cargaCalculada.clasesConHorario} clases con horario`
                      : "Cruza cronograma y horario del perfil"}
                  </p>
                </label>
              </div>
              {cargaCalculada.clasesConFecha > 0 && cargaCalculada.clasesConHorario < cargaCalculada.clasesConFecha && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
                  Hay {cargaCalculada.clasesConFecha - cargaCalculada.clasesConHorario} clase(s) con fecha que no calzan con bloques del horario del curso.
                </div>
              )}
              {!cronogramaDates && (
                <button
                  type="button"
                  onClick={() => setActiveTab("cronograma")}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-[12px] font-bold text-primary hover:bg-primary/10"
                >
                  Ir a Cronograma <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </section>

            <section className="rounded-[12px] border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <Pencil className="h-4 w-4 text-primary" />
                <h3 className="text-[13px] font-extrabold">Campos faltantes</h3>
              </div>
              <label className="mb-3 block space-y-1">
                <span className="text-[11px] font-bold uppercase text-muted-foreground">Conocimientos previos</span>
                <textarea
                  value={conocimientosPrevios}
                  onChange={event => setConocimientosPrevios(event.target.value)}
                  rows={4}
                  placeholder="Lo que el curso debe manejar antes de iniciar..."
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[12px] outline-none focus:border-primary"
                />
              </label>

              <div className="mb-3 space-y-2">
                <span className="text-[11px] font-bold uppercase text-muted-foreground">Recursos / materiales</span>
                <div className="flex gap-2">
                  <input
                    value={recursoDraft}
                    onChange={event => setRecursoDraft(event.target.value)}
                    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addRecurso() } }}
                    placeholder="Ej: parlante, cuaderno, guia..."
                    className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={addRecurso}
                    disabled={!recursoDraft.trim()}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recursosMaterialesUnidad.map((item, idx) => (
                    <button
                      key={`${item}-${idx}`}
                      type="button"
                      onClick={() => setRecursosMaterialesUnidad(prev => prev.filter((_, i) => i !== idx))}
                      className="rounded-full border border-border bg-background px-2 py-1 text-[11px] font-semibold hover:border-red-200 hover:text-red-500"
                      title="Click para quitar"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase text-muted-foreground">Estrategia de evaluacion</span>
                <input
                  value={evalDraft.nombre}
                  onChange={event => setEvalDraft(prev => ({ ...prev, nombre: event.target.value }))}
                  placeholder="Estrategia"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary"
                />
                <div className="grid grid-cols-[1fr_90px] gap-2">
                  <input
                    value={evalDraft.instrumento}
                    onChange={event => setEvalDraft(prev => ({ ...prev, instrumento: event.target.value }))}
                    placeholder="Instrumento"
                    className="h-9 min-w-0 rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary"
                  />
                  <input
                    value={evalDraft.ponderacion}
                    onChange={event => setEvalDraft(prev => ({ ...prev, ponderacion: event.target.value.replace(/[^\d]/g, "") }))}
                    placeholder="%"
                    className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={addEstrategia}
                  disabled={!evalDraft.nombre.trim() || !evalDraft.instrumento.trim()}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 text-[12px] font-bold text-primary hover:bg-primary/10 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" /> Agregar evaluacion
                </button>
                <div className="space-y-1.5">
                  {estrategiasEvaluacion.map(item => (
                    <div key={item.id} className="flex items-start gap-2 rounded-lg border border-border bg-background p-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-bold">{item.nombre}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.instrumento}{item.ponderacion !== null ? ` / ${item.ponderacion}%` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEstrategiasEvaluacion(prev => prev.filter(x => x.id !== item.id))}
                        className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <Link
              href={buildUrl("/cronograma", withAsignatura({ curso: cursoParam }, ASIGNATURA))}
              className="flex items-center justify-center gap-2 rounded-[12px] border border-border bg-card px-4 py-3 text-[12px] font-bold text-muted-foreground hover:bg-muted"
            >
              Ir al cronograma general <ArrowRight className="h-4 w-4" />
            </Link>
          </aside>
        </div>
      )}

      {modalOA && (
        <DetalleOAModal
          oas={oas}
          cursoParam={cursoParam}
          onClose={() => setModalOA(false)}
          onChange={setOas}
        />
      )}
      {modalHab && (
        <DetalleElementosModal
          titulo="Habilidades"
          cursoParam={cursoParam}
          elementos={habilidades}
          onClose={() => setModalHab(false)}
          onChange={setHabilidades}
        />
      )}
      {modalCon && (
        <DetalleElementosModal
          titulo="Conocimientos"
          cursoParam={cursoParam}
          elementos={conocimientos}
          onClose={() => setModalCon(false)}
          onChange={setConocimientos}
        />
      )}
      {modalAct && (
        <DetalleElementosModal
          titulo="Actitudes"
          cursoParam={cursoParam}
          elementos={actitudes}
          onClose={() => setModalAct(false)}
          onChange={setActitudes}
        />
      )}

      {/* Ventana flotante Programa Oficial (PDF Mineduc) */}
      {showPdf && tipoCurricular === "oficial" && (
        <div
          className={cn(
            "fixed z-[600] flex flex-col border-[2px] border-border bg-card transition-shadow",
            isMobile ? "inset-3 rounded-[18px]" : "rounded-[18px]",
            isDraggingPdf ? "opacity-95 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)]" : "opacity-100 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]"
          )}
          style={isMobile ? { overflow: "hidden" } : { right: `${pdfPos.right}px`, bottom: `${pdfPos.bottom}px`, width: "520px", height: "70vh", resize: "both", overflow: "hidden" }}
        >
          <div
            className={cn("flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur", isMobile ? "" : "cursor-move touch-none")}
            onPointerDown={isMobile ? undefined : handlePdfPointerDown}
            onPointerMove={isMobile ? undefined : handlePdfPointerMove}
            onPointerUp={isMobile ? undefined : handlePdfPointerUp}
            onPointerCancel={isMobile ? undefined : handlePdfPointerUp}
          >
            <div className="flex items-center gap-2.5">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-pink-light pointer-events-none">
                <FileText className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="pointer-events-none">
                <h3 className="text-[13px] font-extrabold leading-none text-foreground">Programa Oficial</h3>
                <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{ASIGNATURA} — {nivelAsignado || cursoParam}</p>
              </div>
            </div>
            <div className="flex gap-1.5" onPointerDown={e => e.stopPropagation()}>
              <button
                onClick={() => window.open(`https://www.curriculumnacional.cl/sites/default/files/adjuntos/recursos/2024-12/${encodeURIComponent(`${ASIGNATURA} ${cursoParam.charAt(0)}.pdf`)}`, "_blank")}
                className="grid h-8 w-8 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted"
                title="Abrir en pestaña nueva"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setShowPdf(false)}
                className="grid h-8 w-8 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted"
                title="Cerrar ventana"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="relative flex-1 bg-muted">
            {isDraggingPdf && <div className="absolute inset-0 z-10" />}
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(`https://www.curriculumnacional.cl/sites/default/files/adjuntos/recursos/2024-12/${ASIGNATURA} ${cursoParam.charAt(0)}.pdf`)}&embedded=true`}
              className="absolute inset-0 h-full w-full border-none bg-white"
              title="Programa de Estudio"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function VerUnidadV2Content() {
  return (
    <Suspense fallback={
      <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-[14px] font-medium">Cargando...</span>
      </div>
    }>
      <VerUnidadV2Inner />
    </Suspense>
  )
}
