"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ChevronLeft, Sparkles, FileText, ArrowRight, Target, Clock,
  Calendar, Check, CheckCircle2, Circle, AlertCircle, Bookmark,
  Layers, Copy, Trash2, Loader2, RefreshCw, Pencil, Info, CalendarDays,
  Shuffle, ListOrdered, BarChart2
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  cargarCronogramaUnidad,
  cargarPlanificacion,
  cargarPlanCurso,
  cargarVerUnidad,
  emptyMatrizSeleccion,
  guardarCronogramaUnidad,
  guardarPlanificacion,
  guardarVerUnidad,
  buildMatrixCellKey,
  getUnidadCompleta,
} from "@/lib/curriculo"
import type {
  OAEditado,
  ClaseCronograma,
  Unidad,
  UnidadPlan,
} from "@/lib/curriculo"
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
import { toast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api-client"

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

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

function diaSemanaIndex(dia: string): number {
  const key = dia
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
  const map: Record<string, number> = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5 }
  return map[key] ?? 1
}

function fechaInputToDate(fechaInicio?: string): Date {
  if (!fechaInicio) return new Date()
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fechaInicio)) {
    const [day, month, year] = fechaInicio.split("/").map(Number)
    if (!year || !month || !day) return new Date()
    return new Date(year, month - 1, day)
  }
  const [year, month, day] = fechaInicio.split("-").map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

function fechaDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}/${d.getFullYear()}`
}

function generarFechasAutomaticas(
  curso: string,
  totalClases: number,
  horarioBase: ClaseHorario[],
  fechaInicio?: string
): string[] {
  const cursoNormalizado = normalizarCursoHorario(curso)
  const bloques = horarioBase
    .filter(h => normalizarCursoHorario(h.resumen) === cursoNormalizado)
    .sort((a, b) => diaSemanaIndex(a.dia) - diaSemanaIndex(b.dia) || a.horaInicio.localeCompare(b.horaInicio))
  if (!bloques.length) return Array(totalClases).fill("")

  const bloquesPorDia = new Map<number, ClaseHorario[]>()
  bloques.forEach(bloque => {
    const dia = diaSemanaIndex(bloque.dia)
    bloquesPorDia.set(dia, [...(bloquesPorDia.get(dia) || []), bloque])
  })

  const fechas: string[] = []
  const d = fechaInputToDate(fechaInicio)

  while (fechas.length < totalClases) {
    const bloquesDia = bloquesPorDia.get(d.getDay()) || []
    for (let i = 0; i < bloquesDia.length; i++) {
      if (fechas.length >= totalClases) break
      fechas.push(fechaDDMMYYYY(d))
    }
    d.setDate(d.getDate() + 1)
  }
  return fechas
}

function formatFechaCorta(f: string): string {
  if (!f) return ""
  const [d, m] = f.split("/")
  return `${parseInt(d)} ${MESES[parseInt(m)-1]}`
}

function formatFechaDDMMYYYY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}/${date.getFullYear()}`
}

function fechaCronogramaToInput(value?: string): string {
  const parsed = parseFechaDDMMYYYY((value || "").trim())
  if (!parsed) return ""
  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, "0")
  const dd = String(parsed.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function inputToFechaCronograma(value: string): string {
  if (!value) return ""
  const [year, month, day] = value.split("-")
  if (!year || !month || !day) return ""
  return `${day}/${month}/${year}`
}

function CronogramaOACard({ oa, color }: { oa: OAEditado; color: string }) {
  const indicadores = oa.indicadores?.filter(ind => ind.seleccionado) || []

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-extrabold uppercase" style={{ color }}>
            {oa.esPropio ? "Propio" : `OA ${oa.numero}`}
          </span>
          <p className="mt-0.5 text-[12px] font-medium leading-snug text-foreground">{oa.descripcion}</p>
          {indicadores.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[10.5px] font-medium leading-relaxed text-muted-foreground">
              {indicadores.slice(0, 3).map(ind => (
                <li key={ind.id}>{ind.texto}</li>
              ))}
              {indicadores.length > 3 && (
                <li className="list-none text-primary font-bold">+{indicadores.length - 3} indicador(es)</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function findPlanUnit(units: UnidadPlan[], unidadLocalParam: string, unidadParam: string): UnidadPlan | null {
  const numeric = unidadLocalParam.replace(/\D/g, "")
  return units.find(unit =>
    String(unit.id) === unidadLocalParam ||
    String(unit.id) === numeric ||
    unit.unidadCurricularId === unidadParam
  ) || null
}

export function VerUnidadV3Cronograma() {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const searchParams = useSearchParams()
  const [simpleMode, setSimpleMode] = useState(false)

  useEffect(() => {
    void Promise.resolve().then(() => {
      setSimpleMode(window.localStorage.getItem("eduSimpleMode") === "true")
    })
    const handler = () => setSimpleMode(localStorage.getItem("eduSimpleMode") === "true")
    window.addEventListener("eduSimpleModeChange", handler)
    return () => window.removeEventListener("eduSimpleModeChange", handler)
  }, [])

  const unidadParam = searchParams.get("unidad") || "unidad_1"
  const unidadLocalParam = searchParams.get("unitIdLocal") || unidadParam
  const cursoParam = searchParams.get("curso") || "1° A"
  const unitIndex = unitIndexFrom(unidadLocalParam)

  const [unidad, setUnidad] = useState<Unidad | null>(null)
  const [planUnit, setPlanUnit] = useState<UnidadPlan | null>(null)
  const [rawVerUnidad, setRawVerUnidad] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving_silent" | "saved" | "error">("idle")

  // States
  const [clasesCount, setClasesCount] = useState(8)
  const [clases, setClases] = useState<ClaseCronograma[]>([])
  const [oas, setOas] = useState<OAEditado[]>([])
  const [horarioBase, setHorarioBase] = useState<ClaseHorario[]>([])
  const [fechaInicioUnidad, setFechaInicioUnidad] = useState("")

  // UI Modes
  const [showAutoWarn, setShowAutoWarn] = useState(false)
  const [autoRellenando, setAutoRellenando] = useState(false)
  const [editFecha, setEditFecha] = useState<number | null>(null)
  const [fechaTemp, setFechaTemp] = useState("")
  const [selectedClase, setSelectedClase] = useState(1)

  const ignoreNextSaveRef = useRef(true)
  const handleGuardarRef = useRef<((isAutoSave?: boolean) => Promise<boolean>) | null>(null)

  // Load from Firestore
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

        const [guardada, planificacion, planCurso, cronograma, horario] = await Promise.all([
          cargarVerUnidad(ASIGNATURA, cursoParam, unidadLocalParam),
          cargarPlanificacion(ASIGNATURA, cursoParam),
          cargarPlanCurso(ASIGNATURA, cursoParam).catch(() => null),
          cargarCronogramaUnidad(ASIGNATURA, cursoParam, unidadLocalParam).catch(() => null),
          cargarHorarioSemanal().catch(() => []),
        ])
        setRawVerUnidad(guardada)
        setHorarioBase(horario || [])

        const planUnitEncontrada = findPlanUnit(planCurso?.units || [], unidadLocalParam, unidadParam)
        setPlanUnit(planUnitEncontrada)

        let u: Unidad | null = null
        if (tipo === "oficial") {
          const nivel = resolveNivel(cursoParam, mapping, ASIGNATURA)
          if (!nivel) {
            setError(`No hay bases curriculares configuradas para "${cursoParam}" con "${ASIGNATURA}".`)
            return
          }
          u = await getUnidadCompleta(ASIGNATURA, nivel, unidadParam)
          if (!u) {
            setError(`Unidad no encontrada en las bases curriculares de ${nivel}.`)
            return
          }
        } else {
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
        setUnidad(u)

        // Selectable OAs from unit selection
        const baseOas = guardada?.oas || []
        // Only load the selected OAs in unit dashboard
        const selectedOasOnly = baseOas.filter((oa: any) => oa.seleccionado)
        setOas(selectedOasOnly)

        // Handle total classes count
        const totalC = cronograma?.totalClases || cronograma?.clases?.length || guardada?.clases || 8
        setClasesCount(totalC)

        // Setup classes cronograma
        if (cronograma && cronograma.clases.length > 0) {
          const saved = cronograma.clases.map((clase: ClaseCronograma) => ({
            ...clase,
            oaIds: Array.from(new Set(clase.oaIds || [])),
          }))
          if (saved.length < totalC) {
            const extra = Array.from({ length: totalC - saved.length }, (_, i) => ({
              numero: saved.length + i + 1,
              fecha: "",
              oaIds: [],
            }))
            setClases([...saved, ...extra])
          } else {
            setClases(saved.slice(0, totalC))
          }
        } else {
          setClases(Array.from({ length: totalC }, (_, i) => ({
            numero: i + 1,
            fecha: "",
            oaIds: [],
          })))
        }

        // Derive initial starting date if available
        const firstWithDate = cronograma?.clases?.find((c: any) => c.fecha?.trim())
        if (firstWithDate) {
          const parsed = parseFechaDDMMYYYY(firstWithDate.fecha)
          if (parsed) {
            const yyyy = parsed.getFullYear()
            const mm = String(parsed.getMonth() + 1).padStart(2, "0")
            const dd = String(parsed.getDate()).padStart(2, "0")
            setFechaInicioUnidad(`${yyyy}-${mm}-${dd}`)
          }
        }

      } catch (err: any) {
        setError(err?.message || "No se pudo cargar el cronograma.")
      } finally {
        ignoreNextSaveRef.current = true
        setLoading(false)
      }
    }

    load()
  }, [ASIGNATURA, cursoParam, unidadLocalParam, unidadParam, unitIndex])

  // Save changes
  const handleGuardar = async (isAutoSave = false): Promise<boolean> => {
    if (!isAutoSave) setSaving(true)
    if (isAutoSave) setSaveStatus("saving_silent")
    try {
      const clasesParaGuardar = clases.map(clase => ({
        ...clase,
        oaIds: Array.from(new Set(clase.oaIds || [])),
      }))

      // 1. Save Cronograma document
      await guardarCronogramaUnidad(ASIGNATURA, cursoParam, unidadLocalParam, clasesCount, clasesParaGuardar)

      // 2. Sync clases count in the main ver_unidad document
      await guardarVerUnidad(ASIGNATURA, cursoParam, unidadLocalParam, {
        descripcion: rawVerUnidad?.descripcion || unidad?.proposito || "",
        contextoDocente: rawVerUnidad?.contextoDocente || "",
        objetivoDocente: rawVerUnidad?.objetivoDocente || "",
        horas: rawVerUnidad?.horas || 16,
        clases: clasesCount,
        oas: rawVerUnidad?.oas || [],
        habilidades: rawVerUnidad?.habilidades || [],
        conocimientos: rawVerUnidad?.conocimientos || [],
        actitudes: rawVerUnidad?.actitudes || [],
        actividades: rawVerUnidad?.actividades || [],
        conocimientosPrevios: rawVerUnidad?.conocimientosPrevios || "",
        recursosMaterialesUnidad: rawVerUnidad?.recursosMaterialesUnidad || [],
        recursosMaterialesUnidadArchivos: rawVerUnidad?.recursosMaterialesUnidadArchivos || [],
        estrategiasEvaluacion: rawVerUnidad?.estrategiasEvaluacion || [],
      })

      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2500)
      return true
    } catch (err) {
      console.error("[V3CronogramaSaveError]", err)
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
      return false
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    handleGuardarRef.current = handleGuardar
  })

  // Auto-save trigger
  useEffect(() => {
    if (loading) return
    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false
      return
    }
    const timer = setTimeout(() => {
      void handleGuardarRef.current?.(true)
    }, 1600)
    return () => clearTimeout(timer)
  }, [clases, clasesCount, loading])

  useEffect(() => {
    if (loading) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) setSelectedClase(prev => Math.min(Math.max(1, prev), Math.max(1, clasesCount)))
    })
    return () => {
      cancelled = true
    }
  }, [clasesCount, loading])

  // Adjust total classes count
  const ajustarTotalClases = (next: number) => {
    const safe = Math.min(60, Math.max(1, Math.round(next || 1)))
    setClasesCount(safe)
    setClases(prev => {
      if (prev.length < safe) {
        const extra = Array.from({ length: safe - prev.length }, (_, i) => ({
          numero: prev.length + i + 1,
          fecha: "",
          oaIds: [],
        }))
        return [...prev, ...extra]
      } else {
        return prev.slice(0, safe)
      }
    })
  }

  // Toggle OA in a class
  const toggleOA = (claseNum: number, oaId: string) => {
    setClases(prev => prev.map(c => {
      if (c.numero !== claseNum) return c
      const ya = c.oaIds.includes(oaId)
      return {
        ...c,
        oaIds: ya ? c.oaIds.filter(id => id !== oaId) : [...c.oaIds, oaId]
      }
    }))
  }

  // Duplicar clase
  const duplicarClase = (claseNum: number) => {
    const original = clases.find(c => c.numero === claseNum)
    if (!original) return
    const nuevaClase: ClaseCronograma = {
      numero: clases.length + 1,
      fecha: "",
      oaIds: [...original.oaIds],
      duplicadaDe: claseNum,
    }
    setClasesCount(clases.length + 1)
    setClases(prev => [...prev, nuevaClase])
    setSelectedClase(nuevaClase.numero)
    toast({ title: `Clase ${claseNum} duplicada`, description: `Se añadió la Clase ${clases.length + 1}.` })
  }

  // Edit Date Inline
  const guardarFecha = (claseNum: number) => {
    if (!fechaTemp) { setEditFecha(null); return }
    const [y, m, d] = fechaTemp.split("-")
    const fmtd = `${d}/${m}/${y}`
    setClases(prev => prev.map(c => c.numero === claseNum ? { ...c, fecha: fmtd } : c))
    setEditFecha(null)
    setFechaTemp("")
  }

  const actualizarFechaClase = (claseNum: number, value: string) => {
    setClases(prev => prev.map(c => (
      c.numero === claseNum ? { ...c, fecha: inputToFechaCronograma(value) } : c
    )))
  }

  // Auto Dates Solver
  const handleCalcularFechas = () => {
    const fechaDesdeClase = clases.find(clase => clase.fecha?.trim())?.fecha || ""
    const fechaBase = fechaDesdeClase || (fechaInicioUnidad ? fechaDDMMYYYY(new Date(fechaInicioUnidad + "T12:00:00")) : "")

    if (!fechaBase) {
      toast({
        title: "Falta fecha base",
        description: "Agrega una fecha en alguna clase o selecciona una fecha de inicio para calcular.",
        variant: "destructive"
      })
      return
    }

    const fechas = generarFechasAutomaticas(cursoParam, clasesCount, horarioBase, fechaBase)
    if (!fechas.some(Boolean)) {
      toast({
        title: "Horario no configurado",
        description: `No se encontraron bloques de clase para "${cursoParam}" en tu horario semanal.`,
        variant: "destructive"
      })
      return
    }

    setClases(prev => prev.map((c, i) => ({ ...c, fecha: fechas[i] || "" })))
    toast({
      title: "Fechas Calculadas",
      description: fechaDesdeClase
        ? `Fechas recalculadas desde la primera clase fechada: ${fechaDesdeClase}.`
        : "Fechas calculadas desde la fecha de inicio seleccionada."
    })
  }

  // Auto-fill logic
  const aplicarDistribucion = (distribucion: Array<{ clase: number; oaIds: string[] }>) => {
    const byClase = new Map(distribucion.map(item => [item.clase, item.oaIds]))
    setClases(prev => prev.map(c => ({ ...c, oaIds: byClase.get(c.numero) || c.oaIds })))
    setShowAutoWarn(false)
    toast({ title: "Distribución aplicada" })
  }

  const distribucionAleatoria = () => {
    return clases.map((c, i) => ({
      clase: c.numero,
      oaIds: oas.length ? [oas[i % oas.length].id] : []
    }))
  }

  const distribucionCurricular = () => {
    if (oas.length === 0) return []
    const sortedOas = [...oas].sort((a, b) => (a.numero ?? 999) - (b.numero ?? 999))
    const clasesEnsenanza = clasesCount > 2 ? clasesCount - 1 : clasesCount
    const oasPorClase = Math.max(1, Math.ceil(sortedOas.length / clasesEnsenanza))
    const distribucion: Array<{ clase: number; oaIds: string[] }> = []

    for (let i = 0; i < clasesCount; i++) {
      if (i >= clasesEnsenanza) {
        const cierre = sortedOas.slice(Math.max(0, sortedOas.length - Math.max(2, oasPorClase))).map(oa => oa.id)
        distribucion.push({ clase: i + 1, oaIds: cierre })
        continue
      }
      const start = i * oasPorClase
      const bloque = sortedOas.slice(start, start + oasPorClase)
      distribucion.push({
        clase: i + 1,
        oaIds: bloque.length ? bloque.map(oa => oa.id) : [sortedOas[sortedOas.length - 1].id]
      })
    }
    return distribucion
  }

  const handleAutorelleno = async (modo: "aleatorio" | "curricular" | "ia") => {
    if (modo === "aleatorio") {
      aplicarDistribucion(distribucionAleatoria())
      return
    }
    if (modo === "curricular") {
      aplicarDistribucion(distribucionCurricular())
      return
    }

    setAutoRellenando(true)
    try {
      const res = await apiFetch("/api/distribuir-oas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asignatura: ASIGNATURA,
          curso: cursoParam,
          totalClases: clasesCount,
          oas: oas.map(oa => ({ id: oa.id, numero: oa.numero, descripcion: oa.descripcion })),
        }),
      })
      if (!res.ok) throw new Error("IA no disponible")
      const data = await res.json()
      if (!Array.isArray(data.distribucion)) throw new Error("Respuesta inválida")
      aplicarDistribucion(data.distribucion)
    } catch {
      toast({ title: "Copiloto IA no disponible", description: "Aplicando distribución curricular predeterminada." })
      aplicarDistribucion(distribucionCurricular())
    } finally {
      setAutoRellenando(false)
    }
  }

  // Computed ranges & coverages
  const cronogramaDates = useMemo(() => {
    const dates = clases
      .map(clase => parseFechaDDMMYYYY((clase.fecha || "").trim()))
      .filter((date): date is Date => !!date)
      .sort((a, b) => a.getTime() - b.getTime())

    if (!dates.length) return null
    return {
      start: formatFechaCorta(formatFechaDDMMYYYY(dates[0])),
      end: formatFechaCorta(formatFechaDDMMYYYY(dates[dates.length - 1])),
      datedCount: dates.length,
      totalCount: clases.length,
    }
  }, [clases])

  const oasConClase = useMemo(() => {
    return oas.filter(oa => clases.some(c => c.oaIds.includes(oa.id)))
  }, [oas, clases])

  const coberturaPct = useMemo(() => {
    if (oas.length === 0) return 0
    return Math.round((oasConClase.length / oas.length) * 100)
  }, [oasConClase, oas])

  // Count of classes per OA for sidebar
  const oasCoverageCounts = useMemo(() => {
    const map = new Map<string, number>()
    oas.forEach(oa => map.set(oa.id, 0))
    clases.forEach(c => {
      Array.from(new Set(c.oaIds || [])).forEach(id => {
        if (map.has(id)) {
          map.set(id, (map.get(id) || 0) + 1)
        }
      })
    })
    return map
  }, [oas, clases])

  // Alerts logic
  const alertas = useMemo(() => {
    const list: string[] = []
    oas.forEach(oa => {
      const count = oasCoverageCounts.get(oa.id) || 0
      if (count === 0) {
        list.push(`Falta asignar clases para el OA ${oa.numero || oa.id.substring(0, 5)}...`)
      }
    })
    const sinFecha = clases.filter(c => !c.fecha?.trim()).length
    if (sinFecha > 0) {
      list.push(`Hay ${sinFecha} clases sin fecha asignada en el calendario.`)
    }
    return list
  }, [oas, oasCoverageCounts, clases])

  const selectedClaseData = useMemo(() => {
    return clases.find(clase => clase.numero === selectedClase) || clases[0] || null
  }, [clases, selectedClase])

  const oasById = useMemo(() => new Map(oas.map(oa => [oa.id, oa])), [oas])

  const oasClaseActiva = useMemo(() => {
    if (!selectedClaseData) return []
    return Array.from(new Set(selectedClaseData.oaIds || []))
      .map(id => oasById.get(id))
      .filter((oa): oa is OAEditado => !!oa)
  }, [selectedClaseData, oasById])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-[14px] font-medium">Cargando cronograma v3…</span>
      </div>
    )
  }

  if (error || !unidad) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
        <AlertCircle className="w-8 h-8 text-amber-500" />
        <p className="text-[14px] text-muted-foreground max-w-md leading-relaxed">{error || "Unidad no encontrada"}</p>
        <Link href={buildUrl("/ver-unidad", { curso: cursoParam, unidad: unidadParam, unitIdLocal: unidadLocalParam })}
          className="flex items-center gap-2 text-[13px] font-semibold text-primary hover:underline">
          <ChevronLeft className="w-4 h-4" /> Volver al Dashboard de la Unidad
        </Link>
      </div>
    )
  }

  const queryParams = { curso: cursoParam, unidad: unidadParam, unitIdLocal: unidadLocalParam }
  const unitColor = UNIT_COLORS[unitIndex % UNIT_COLORS.length]

  return (
    <div className={cn("mx-auto px-4 py-6 sm:px-6", simpleMode ? "max-w-[1120px]" : "max-w-[1320px]")}>
      
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link href={buildUrl("/ver-unidad", withAsignatura(queryParams, ASIGNATURA))}
            className="w-9 h-9 border border-border rounded-xl bg-card grid place-items-center text-muted-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
            title="Volver al Dashboard">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <span>{cursoParam}</span>
              <span>/</span>
              <span className="truncate">{planUnit?.name || unidad?.nombre_unidad}</span>
              <span>/</span>
              <span className="text-foreground font-bold">Cronograma</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold truncate text-foreground mt-1 flex items-center gap-2">
              Cronograma de Clases
              {!simpleMode && (
                <span className="text-xs text-muted-foreground font-semibold px-2 py-0.5 bg-muted rounded border ml-2">V3 Matrix</span>
              )}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          {saveStatus === "saving_silent" && (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground animate-pulse">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Guardando...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-status-green-text bg-status-green-bg px-2.5 py-1 rounded-full border border-status-green-border">
              <Check className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-status-red-text bg-status-red-bg px-2.5 py-1 rounded-full border border-status-red-border">
              <AlertCircle className="w-3.5 h-3.5" /> Error al guardar
            </span>
          )}

          <button
            onClick={() => handleGuardar(false)}
            disabled={saving || saveStatus === "saving_silent"}
            className="flex items-center gap-2 bg-primary text-primary-foreground border-none rounded-xl px-5 py-2.5 text-[13px] font-bold hover:bg-pink-dark transition-colors disabled:opacity-60 shadow-sm cursor-pointer"
          >
            {saving ? (
              <><Loader2 className="w-[15px] h-[15px] animate-spin" /> Guardando…</>
            ) : (
              <><Bookmark className="w-[15px] h-[15px]" /> Guardar cambios</>
            )}
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-6 border-b border-border mb-6">
        <Link
          href={buildUrl("/ver-unidad", withAsignatura(queryParams, ASIGNATURA))}
          className="font-semibold text-[13.5px] text-muted-foreground hover:text-primary transition-colors pb-3"
        >
          Unidad
        </Link>
        <Link
          href={buildUrl("/ver-unidad/cronograma", withAsignatura(queryParams, ASIGNATURA))}
          className="font-bold text-[13.5px] text-primary border-b-2 border-primary pb-3"
        >
          Cronograma
        </Link>
        <Link
          href={buildUrl("/ver-unidad/clases", withAsignatura(queryParams, ASIGNATURA))}
          className="font-semibold text-[13.5px] text-muted-foreground hover:text-primary transition-colors pb-3"
        >
          Clases
        </Link>
      </div>

      {/* Content Workspace Grid */}
      <div className={cn(
        "grid grid-cols-1 gap-6 items-start",
        simpleMode ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_280px]"
      )}>

        {/* Main Column */}
        <div className={cn("space-y-5", simpleMode && "mx-auto w-full max-w-[980px]")}>
          {selectedClaseData && (
            <div className="rounded-[18px] border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-primary">
                      Clase {selectedClaseData.numero}
                    </span>
                    <span className="rounded-full border border-border bg-muted/20 px-3 py-1 text-[11px] font-bold text-muted-foreground">
                      {oasClaseActiva.length === 1 ? "1 OA asignado" : `${oasClaseActiva.length} OA asignados`}
                    </span>
                  </div>
                  <h2 className="text-[17px] font-extrabold text-foreground">Vista rapida de la clase</h2>
                  <p className="mt-1 max-w-2xl text-[12px] font-medium leading-relaxed text-muted-foreground">
                    Revisa la fecha y los objetivos de esta clase antes de editar la matriz.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={fechaCronogramaToInput(selectedClaseData.fecha)}
                    onChange={e => actualizarFechaClase(selectedClaseData.numero, e.target.value)}
                    className="h-10 rounded-xl border border-border bg-background px-3 text-[12px] font-bold text-foreground outline-none focus:border-primary"
                    title="Fecha de esta clase"
                  />
                  {!selectedClaseData.suspendida ? (
                    <Link
                      href={buildUrl("/ver-unidad/clases", withAsignatura({
                        curso: cursoParam,
                        unidad: unidadLocalParam,
                        clase: String(selectedClaseData.numero)
                      }, ASIGNATURA))}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[12px] font-extrabold text-primary-foreground shadow-sm transition-colors hover:bg-pink-dark"
                    >
                      Planificar clase <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <span className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-100 dark:bg-red-950/20 px-4 text-[12px] font-extrabold text-red-700 dark:text-red-300">
                      🚫 Clase Suspendida
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {oasClaseActiva.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/10 p-4 text-center md:col-span-2">
                    <Target className="mx-auto mb-2 h-5 w-5 text-muted-foreground/50" />
                    <p className="text-[12px] font-bold text-muted-foreground">Esta clase aun no tiene OA asignados.</p>
                    <p className="mt-1 text-[11px] font-medium text-muted-foreground">Haz clic en la matriz para vincular objetivos.</p>
                  </div>
                ) : (
                  oasClaseActiva.map(oa => (
                    <CronogramaOACard
                      key={oa.id}
                      oa={oa}
                      color={UNIT_COLORS[oas.indexOf(oa) % UNIT_COLORS.length]}
                    />
                  ))
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`suspendida-${selectedClaseData.numero}`}
                    checked={!!selectedClaseData.suspendida}
                    onChange={e => {
                      const val = e.target.checked
                      setClases(prev => prev.map(c => c.numero === selectedClaseData.numero ? { ...c, suspendida: val, oaIds: val ? [] : c.oaIds } : c))
                    }}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                  <label htmlFor={`suspendida-${selectedClaseData.numero}`} className="text-[12px] font-bold text-foreground cursor-pointer select-none">
                    Suspender clase (Feriado, evento interno, etc.)
                  </label>
                </div>

                {selectedClaseData.suspendida && (
                  <div className="flex-1 max-w-md">
                    <input
                      type="text"
                      value={selectedClaseData.motivoSuspension || ""}
                      onChange={e => {
                        const val = e.target.value
                        setClases(prev => prev.map(c => c.numero === selectedClaseData.numero ? { ...c, motivoSuspension: val } : c))
                      }}
                      placeholder="Motivo (ej: Feriado nacional, Día del colegio...)"
                      className="w-full h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-medium outline-none focus:border-primary text-foreground"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Controls Bar */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-card border border-border p-4 rounded-xl shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              
              {/* Clases Totales Indicator */}
              <div className="flex items-center gap-2 bg-muted/40 dark:bg-muted/10 px-3 py-1.5 rounded border border-border/80">
                <ListOrdered className="h-4 w-4 text-muted-foreground" />
                <span className="text-[12px] font-bold text-foreground">{clasesCount} Clases</span>
              </div>

              {/* Rango de Fechas Indicator */}
              <div className="flex items-center gap-2 bg-muted/40 dark:bg-muted/10 px-3 py-1.5 rounded border border-border/80">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span className="text-[12px] font-bold text-foreground">
                  {cronogramaDates ? `${cronogramaDates.start} - ${cronogramaDates.end}` : "Sin fechas"}
                </span>
              </div>

              {/* Cobertura Badge */}
              <div className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded border font-bold text-[12px]",
                coberturaPct === 100
                  ? "bg-status-green-bg border-status-green-border text-status-green-text"
                  : coberturaPct > 0
                    ? "bg-status-amber-bg border-status-amber-border text-status-amber-text"
                    : "bg-status-red-bg border-status-red-border text-status-red-text"
              )}>
                <CheckCircle2 className="h-4 w-4" />
                <span>{coberturaPct}% Cobertura</span>
              </div>
            </div>

            {/* Inputs & Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={fechaInicioUnidad}
                onChange={e => setFechaInicioUnidad(e.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-medium text-foreground outline-none focus:border-primary focus:ring-0 w-full sm:w-auto"
                title="Fecha de inicio de la unidad"
              />
              <button
                onClick={handleCalcularFechas}
                className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-muted/30 border border-border rounded-lg text-foreground font-semibold text-[12px] transition-colors cursor-pointer w-full sm:w-auto justify-center"
              >
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Calcular fechas
              </button>
              <button
                onClick={() => setShowAutoWarn(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-muted/30 border border-border rounded-lg text-foreground font-semibold text-[12px] transition-colors cursor-pointer w-full sm:w-auto justify-center"
              >
                <Shuffle className="w-3.5 h-3.5 text-muted-foreground" />
                Autorelleno
              </button>
            </div>
          </div>

          {/* Autorelleno Warning Card */}
          {showAutoWarn && (
            <div className="rounded-xl border border-status-amber-border bg-status-amber-bg p-4 animate-fade-up">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-status-amber-text flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-[13px] font-bold text-status-amber-text mb-1">Estrategia de Autorelleno</p>
                  <p className="text-[12px] text-foreground opacity-90 leading-relaxed mb-3.5">
                    Elige cómo deseas distribuir tus Objetivos de Aprendizaje (OAs) a lo largo de las clases de la unidad. Esta acción sobrescribirá las asignaciones actuales.
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <button
                      onClick={() => handleAutorelleno("curricular")}
                      className="rounded-lg bg-status-amber-text text-white px-3.5 py-2 text-left text-[11.5px] font-bold hover:opacity-90 transition-opacity cursor-pointer flex flex-col justify-between"
                    >
                      <span className="flex items-center gap-1.5"><ListOrdered className="h-3.5 w-3.5" /> Secuencia Curricular</span>
                      <span className="mt-1 block text-[10px] opacity-80 font-normal">Sigue el orden de los OAs</span>
                    </button>
                    <button
                      onClick={() => handleAutorelleno("ia")}
                      disabled={autoRellenando || oas.length === 0}
                      className="rounded-lg border border-status-amber-border bg-card text-foreground px-3.5 py-2 text-left text-[11.5px] font-bold hover:bg-muted/30 transition-colors disabled:opacity-50 cursor-pointer flex flex-col justify-between"
                    >
                      <span className="flex items-center gap-1.5">
                        {autoRellenando ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                        Copiloto IA
                      </span>
                      <span className="mt-1 block text-[10px] text-muted-foreground font-normal">Propuesta inteligente avanzada</span>
                    </button>
                    <button
                      onClick={() => handleAutorelleno("aleatorio")}
                      className="rounded-lg border border-status-amber-border bg-card text-foreground px-3.5 py-2 text-left text-[11.5px] font-bold hover:bg-muted/30 transition-colors cursor-pointer flex flex-col justify-between"
                    >
                      <span className="flex items-center gap-1.5"><Shuffle className="h-3.5 w-3.5 text-muted-foreground" /> Relleno Aleatorio</span>
                      <span className="mt-1 block text-[10px] text-muted-foreground font-normal">Distribución rápida</span>
                    </button>
                  </div>
                  <div className="mt-3.5 flex justify-end">
                    <button
                      onClick={() => setShowAutoWarn(false)}
                      className="text-[11.5px] font-semibold text-muted-foreground hover:text-foreground hover:underline border-none bg-transparent cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Matrix Table Area */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            
            {/* Horizontal scroll support indicator */}
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2">
              <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
                Desliza la tabla hacia la derecha para ver clases adicionales.
              </span>
              <div className="flex gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: unitColor }} />
                <span className="text-[11px] text-muted-foreground font-semibold">Color de la Unidad</span>
              </div>
            </div>

            {/* Table Container with native scroll styling */}
            <div className="overflow-x-auto w-full scroll-hint-x">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    {/* Sticky Left Objective Header */}
                    <th className="p-3 font-semibold text-[11.5px] text-muted-foreground uppercase tracking-wider w-[200px] border-r border-border sticky left-0 z-20 bg-card">
                      OA / OBJETIVO
                    </th>

                    {/* Classes Header Columns */}
                    {clases.map(clase => {
                      const isActiveClass = clase.numero === selectedClaseData?.numero
                      return (
                      <th
                        key={clase.numero}
                        className={cn(
                          "p-3 border-r border-border last:border-r-0 align-top min-w-[100px] hover:bg-muted/10 transition-colors",
                          isActiveClass && "bg-primary/10 shadow-[inset_0_3px_0_hsl(var(--primary))]",
                          clase.suspendida && "bg-red-50/20 dark:bg-red-950/5 text-muted-foreground"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setSelectedClase(clase.numero)}
                            className={cn(
                              "font-bold text-[12px] hover:underline",
                              clase.suspendida ? "text-red-600 dark:text-red-400" : "text-primary"
                            )}
                          >
                            C{clase.numero}
                          </button>
                          {!clase.suspendida && (
                            <button
                              onClick={() => duplicarClase(clase.numero)}
                              className="text-muted-foreground hover:text-primary transition-colors p-0.5 rounded"
                              title="Duplicar clase"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        {/* Editable Date */}
                        <div className="mt-1">
                          {editFecha === clase.numero ? (
                            <input
                              type="date"
                              autoFocus
                              onChange={e => setFechaTemp(e.target.value)}
                              onBlur={() => guardarFecha(clase.numero)}
                              onKeyDown={e => {
                                if (e.key === "Enter") guardarFecha(clase.numero)
                                if (e.key === "Escape") setEditFecha(null)
                              }}
                              className="w-full text-[10px] border border-primary rounded px-1 py-0.5 bg-background text-foreground focus:outline-none"
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedClase(clase.numero)
                                setEditFecha(clase.numero)
                                setFechaTemp("")
                              }}
                              className={cn(
                                "text-[11px] text-left hover:bg-muted/40 px-1 py-0.5 rounded transition-colors w-full block truncate",
                                clase.fecha ? "text-foreground font-semibold" : "text-muted-foreground italic",
                                clase.suspendida && "text-red-700 dark:text-red-300 opacity-80"
                              )}
                              title="Hacer click para editar la fecha"
                            >
                              {clase.fecha ? formatFechaCorta(clase.fecha) : "Definir fecha"}
                            </button>
                          )}
                        </div>

                        {/* Link to activities / Suspended Badge */}
                        {clase.suspendida ? (
                          <div className="mt-1.5 flex flex-col gap-0.5" title={clase.motivoSuspension || "Clase suspendida"}>
                            <span className="inline-flex items-center gap-0.5 rounded bg-red-100 dark:bg-red-950/30 px-1 py-0.5 text-[8.5px] font-extrabold uppercase text-red-700 dark:text-red-300 w-fit">
                              🚫 Feriado/Event
                            </span>
                            {clase.motivoSuspension && (
                              <span className="text-[9.5px] text-red-600 dark:text-red-400 font-medium truncate block max-w-[90px]">
                                {clase.motivoSuspension}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Link
                            href={buildUrl("/ver-unidad/clases", withAsignatura({
                              curso: cursoParam,
                              unidad: unidadLocalParam,
                              clase: String(clase.numero)
                            }, ASIGNATURA))}
                            className="font-semibold text-[10px] text-edu-blue hover:underline mt-2 block transition-colors"
                          >
                            Ver →
                          </Link>
                        )}
                      </th>
                    )})}
                  </tr>
                </thead>
                
                <tbody>
                  {oas.length === 0 ? (
                    <tr>
                      <td colSpan={clases.length + 1} className="p-8 text-center text-[13px] text-muted-foreground">
                        No hay objetivos seleccionados para esta unidad. Ve a la pestaña de{" "}
                        <Link
                          href={buildUrl("/ver-unidad", withAsignatura(queryParams, ASIGNATURA))}
                          className="text-primary font-bold hover:underline"
                        >
                          Currículo
                        </Link>{" "}
                        para configurarlos primero.
                      </td>
                    </tr>
                  ) : (
                    oas.map((oa, ri) => (
                      <tr key={oa.id} className="border-b border-border last:border-b-0 hover:bg-muted/10 transition-colors">
                        
                        {/* Sticky Left OA Cell */}
                        <td className="p-3 border-r border-border sticky left-0 z-10 bg-card align-middle">
                          <div className="flex items-start gap-2.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                              style={{ background: UNIT_COLORS[ri % UNIT_COLORS.length] }}
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-[12px]" style={{ color: UNIT_COLORS[ri % UNIT_COLORS.length] }}>
                                {oa.esPropio ? "Objetivo Propio" : `OA ${oa.numero}`}
                              </div>
                              <div
                                className="font-medium text-[10px] text-muted-foreground leading-tight mt-0.5 truncate max-w-[150px]"
                                title={oa.descripcion}
                              >
                                {oa.descripcion}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Toggles Intersections Cells */}
                        {clases.map(clase => {
                          const isAssigned = clase.oaIds.includes(oa.id)
                          const isActiveClass = clase.numero === selectedClaseData?.numero
                          return (
                            <td
                              key={clase.numero}
                              onClick={() => {
                                if (clase.suspendida) return
                                setSelectedClase(clase.numero)
                                toggleOA(clase.numero, oa.id)
                              }}
                              className={cn(
                                "p-0 text-center align-middle border-r border-border last:border-r-0 transition-colors",
                                clase.suspendida
                                  ? "bg-red-50/20 dark:bg-red-950/5 cursor-not-allowed"
                                  : "cursor-pointer hover:bg-muted/20",
                                isActiveClass && "bg-primary/5"
                              )}
                              title={
                                clase.suspendida
                                  ? `Esta clase está suspendida: ${clase.motivoSuspension || "Feriado/Evento"}`
                                  : `${isAssigned ? "Quitar" : "Asignar"} ${oa.esPropio ? "Objetivo Propio" : `OA ${oa.numero}`} de la Clase ${clase.numero}`
                              }
                            >
                              <div className="flex items-center justify-center h-12">
                                {!clase.suspendida && (
                                  <span
                                    className={cn(
                                      "w-3.5 h-3.5 rounded-full inline-block transition-all transform duration-150",
                                      isAssigned ? "scale-100 hover:scale-120" : "scale-0"
                                    )}
                                    style={{ background: UNIT_COLORS[ri % UNIT_COLORS.length] }}
                                  />
                                )}
                              </div>
                            </td>
                          )
                        })}

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer Instructions */}
            <div className="p-3.5 border-t border-border flex items-center gap-2 font-semibold text-[11px] text-muted-foreground bg-muted/10">
              <span>Instrucción:</span>
              <span className="font-medium">Haz clic en cualquier celda vacía de la matriz para asignar o quitar el OA de esa clase.</span>
            </div>
          </div>

        </div>

        {/* Sidebar Info Column */}
        {!simpleMode && (
        <div className="space-y-5">
          
          {/* Cobertura Curricular Progress Card */}
          <div className="bg-card rounded-xl border border-border p-4.5 shadow-sm">
            <div className="flex items-center gap-2 mb-3.5 border-b pb-2 border-border/85">
              <BarChart2 className="text-primary h-4.5 w-4.5" />
              <h3 className="font-bold text-[11.5px] text-foreground uppercase tracking-wider">
                Resumen de Cobertura
              </h3>
            </div>
            
            {oas.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground leading-relaxed text-center py-2">
                Sin objetivos asignados a la unidad.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {oas.map((oa, ri) => {
                  const count = oasCoverageCounts.get(oa.id) || 0
                  
                  // Coverage progress width & color mapping
                  let barColor = "bg-primary"
                  let progressPct = 0
                  if (count === 1) {
                    barColor = "bg-warning-amber"
                    progressPct = 33
                  } else if (count === 2) {
                    barColor = "bg-warning-amber"
                    progressPct = 66
                  } else if (count >= 3) {
                    barColor = "bg-success-emerald"
                    progressPct = 100
                  }

                  return (
                    <div key={oa.id} className="text-[11px]">
                      <div className="flex justify-between items-end mb-1">
                        <span className="font-bold text-foreground">
                          {oa.esPropio ? "OA Propio" : `OA ${oa.numero}`}
                        </span>
                        <span className="text-muted-foreground text-[10px] font-semibold">
                          {count === 1 ? "1 Clase" : `${count} Clases`}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-300", barColor)}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Alertas Panel Card */}
          <div className="bg-card rounded-xl border border-border p-4.5 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />
            <div className="flex items-center gap-2 mb-3.5 border-b pb-2 border-border/85 pl-1.5">
              <AlertCircle className="text-primary h-4.5 w-4.5" />
              <h3 className="font-bold text-[11.5px] text-foreground uppercase tracking-wider">
                Alertas y Sugerencias
              </h3>
            </div>

            {alertas.length === 0 ? (
              <div className="flex items-start gap-2 pl-1.5">
                <CheckCircle2 className="h-4.5 w-4.5 text-status-green-text shrink-0" />
                <p className="text-[11.5px] text-foreground leading-relaxed">
                  ¡Todo listo! Todos los objetivos están cubiertos y las clases tienen fecha en el calendario.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5 pl-1.5">
                {alertas.map((al, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-[11px] text-foreground opacity-90 leading-relaxed font-medium">
                      {al}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => toast({ title: "Copiloto activado", description: "La IA está evaluando tu cronograma..." })}
              className="mt-4 text-primary font-bold text-[10.5px] hover:underline w-full flex items-center justify-between opacity-90 hover:opacity-100 pl-1.5 bg-transparent border-none cursor-pointer"
            >
              <span>Resolver con IA</span>
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          </div>

        </div>
        )}

      </div>

    </div>
  )
}
