"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ChevronLeft, Sparkles, FileText, ArrowRight, Target, Clock,
  Calendar, Check, CheckCircle2, Circle, AlertCircle, Bookmark,
  Layers, Heart, Plus, Trash2, FolderOpen, Loader2, RefreshCw, Pencil, Info, X,
  UploadCloud, HardDrive, Eye, ExternalLink, Paperclip
} from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import { cn } from "@/lib/utils"
import {
  applyPlanSelection,
  buildMatrixCellKey,
  cargarCronogramaUnidad,
  cargarPlanCurso,
  cargarPlanificacion,
  cargarVerUnidad,
  emptyMatrizSeleccion,
  getUnidades,
  getUnidadCompleta,
  guardarPlanificacion,
  guardarVerUnidad,
  initElems,
  initOAs,
  mergeElementos,
  mergeOAs,
} from "@/lib/curriculo"
import type {
  ElementoCurricular,
  EstrategiaEvaluacionUnidad,
  OAEditado,
  Unidad,
  UnidadPlan,
  ArchivoAdjunto,
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
import { useIsMobile } from "@/components/ui/use-mobile"
import { TermometroV3 } from "./termometro-v3"
import { toast } from "@/hooks/use-toast"
import { DriveSheet } from "@/components/edu-panel/drive/drive-sheet"
import {
  buildDrivePreviewUrl,
  crearAccesoDirectoDrive,
  ensureEduPanelWorkspaceForContext,
  getGoogleDriveErrorMessage,
  getGoogleDriveToken,
  isGoogleDriveConnected,
  subirArchivoADrive,
  type DriveItem,
} from "@/lib/google-drive"

// Helper utilities replicated from V2
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

function formatFechaDDMMYYYY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}/${date.getFullYear()}`
}

function formatHorasUnidad(minutos: number): string {
  if (minutos <= 0) return "Pendiente"
  const horas = minutos / 60
  return Number.isInteger(horas) ? `${horas} h` : `${horas.toFixed(1)} h`
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "Sin peso"
  const units = ["B", "KB", "MB", "GB"]
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
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

export function VerUnidadV3Dashboard() {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const { signInWithGoogleDrive } = useAuth()
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving_silent" | "saved" | "error">("idle")

  // Form Fields
  const [descripcion, setDescripcion] = useState("")
  const [contextoDocente, setContextoDocente] = useState("")
  const [objetivoDocente, setObjetivoDocente] = useState("")
  const [clases, setClases] = useState(8)
  const [horas, setHoras] = useState(16)
  const [conocimientosPrevios, setConocimientosPrevios] = useState("")
  const [recursosMaterialesUnidad, setRecursosMaterialesUnidad] = useState<string[]>([])
  const [recursosMaterialesUnidadArchivos, setRecursosMaterialesUnidadArchivos] = useState<ArchivoAdjunto[]>([])
  const [estrategiasEvaluacion, setEstrategiasEvaluacion] = useState<EstrategiaEvaluacionUnidad[]>([])

  // Selection Arrays
  const [oas, setOas] = useState<OAEditado[]>([])
  const [habilidades, setHabilidades] = useState<ElementoCurricular[]>([])
  const [conocimientos, setConocimientos] = useState<ElementoCurricular[]>([])
  const [actitudes, setActitudes] = useState<ElementoCurricular[]>([])
  const [actividades, setActividades] = useState<any[]>([])

  // Layout States
  const [tipoCurricular, setTipoCurricular] = useState<TipoCurricular>("oficial")
  const [nivelAsignado, setNivelAsignado] = useState("")
  const [cronogramaDates, setCronogramaDates] = useState<{ start: string; end: string; datedCount: number; totalCount: number } | null>(null)
  const [cronogramaClases, setCronogramaClases] = useState<any[]>([])
  const [horarioBase, setHorarioBase] = useState<ClaseHorario[]>([])
  const [editDesc, setEditDesc] = useState(false)
  const [subiendoRecursoDrive, setSubiendoRecursoDrive] = useState(false)
  const [dragRecursoActivo, setDragRecursoActivo] = useState(false)
  const [resourceUploadProgress, setResourceUploadProgress] = useState<Record<string, number>>({})
  const [previewRecurso, setPreviewRecurso] = useState<ArchivoAdjunto | null>(null)

  // Drafts
  const [evalDraft, setEvalDraft] = useState({ nombre: "", instrumento: "", ponderacion: "" })

  const ignoreNextSaveRef = useRef(true)
  const handleGuardarRef = useRef<((isAutoSave?: boolean) => Promise<boolean>) | null>(null)
  const recursoFileInputRef = useRef<HTMLInputElement | null>(null)
  const isMobile = useIsMobile()

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
            // Firestore doc ID may differ from the URL param; search by position
            const todasUnidades = await getUnidades(ASIGNATURA, nivel)
            const byIndex = todasUnidades.find(tu => tu.numero_unidad === unitIndex + 1)
            if (byIndex?.id) {
              u = await getUnidadCompleta(ASIGNATURA, nivel, byIndex.id)
            }
          }
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
        setRecursosMaterialesUnidadArchivos(guardada?.recursosMaterialesUnidadArchivos || [])
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

  const cargaCalculada = useMemo(
    () => calcularMinutosUnidad(cronogramaClases, horarioBase, cursoParam),
    [cronogramaClases, horarioBase, cursoParam]
  )
  const horasParaGuardar = cargaCalculada.minutos > 0
    ? Math.max(1, Math.round((cargaCalculada.minutos / 60) * 10) / 10)
    : horas

  // Save to Firestore
  const handleGuardar = async (isAutoSave = false): Promise<boolean> => {
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
        recursosMaterialesUnidad: recursosMaterialesUnidadArchivos.length
          ? Array.from(new Set(recursosMaterialesUnidadArchivos.map(archivo => archivo.nombre)))
          : recursosMaterialesUnidad,
        recursosMaterialesUnidadArchivos,
        estrategiasEvaluacion,
      })

      const planificacion = await cargarPlanificacion(ASIGNATURA, cursoParam)
      const matriz = planificacion?.matriz || emptyMatrizSeleccion()
      oas.forEach(oa => { matriz.oa[buildMatrixCellKey(oa.id, unitIndex)] = !!oa.seleccionado })
      habilidades.forEach(item => { matriz.habilidades[buildMatrixCellKey(item.id, unitIndex)] = !!item.seleccionado })
      conocimientos.forEach(item => { matriz.conocimientos[buildMatrixCellKey(item.id, unitIndex)] = !!item.seleccionado })
      actitudes.forEach(item => { matriz.actitudes[buildMatrixCellKey(item.id, unitIndex)] = !!item.seleccionado })
      await guardarPlanificacion(ASIGNATURA, cursoParam, planificacion?.fechas || {}, matriz)

      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2500)
      return true
    } catch (err) {
      console.error("[V3SaveError]", err)
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
    recursosMaterialesUnidadArchivos,
    estrategiasEvaluacion,
    loading,
  ])

  // Computed Values
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

  const fechasFormato = cronogramaDates || (
    planUnit?.start || planUnit?.end ? { start: planUnit.start || "", end: planUnit.end || "", datedCount: 0, totalCount: 0 } : null
  )
  const driveContext = useMemo(() => ({
    tipo: "materiales" as const,
    asignatura: ASIGNATURA,
    curso: cursoParam,
    unidadId: unidadLocalParam,
    unidadNombre: unidad?.nombre_unidad || planUnit?.name || unidadParam,
  }), [ASIGNATURA, cursoParam, unidadLocalParam, unidad?.nombre_unidad, planUnit?.name, unidadParam])

  const checklist = [
    { label: "Fechas", done: !!(fechasFormato?.start && fechasFormato?.end) },
    { label: "Propósito", done: !!descripcion.trim() },
    { label: "Conocimientos previos", done: !!conocimientosPrevios.trim() },
    { label: "Conocimientos a desarrollar", done: consSel.length > 0 },
    { label: "Habilidades", done: habsSel.length > 0 },
    { label: "Actitudes / OAT", done: actsSel.length > 0 || oatSeleccionados.length > 0 },
    { label: "OA e indicadores", done: oasBasales.length > 0 && indicadoresSeleccionados > 0 },
    { label: "Estrategia evaluativa", done: estrategiasEvaluacion.some(item => item.nombre.trim() && item.instrumento.trim() && item.ponderacion !== null) },
    { label: "Recursos / materiales", done: recursosMaterialesUnidadArchivos.length > 0 || recursosMaterialesUnidad.length > 0 },
  ]
  const completed = checklist.filter(item => item.done).length
  const progressPct = Math.round((completed / checklist.length) * 100)

  // Input interactions
  const ajustarTotalClases = (next: number) => {
    const safe = Math.min(60, Math.max(1, Math.round(next || 1)))
    setClases(safe)
  }

  const ensureDriveToken = async () => {
    let token = getGoogleDriveToken()
    if (!token || !isGoogleDriveConnected()) {
      await signInWithGoogleDrive()
      token = getGoogleDriveToken()
    }
    if (!token) throw new Error("Google Drive no autorizado.")
    return token
  }

  const archivoAdjuntoDesdeDrive = (item: DriveItem, folderId?: string): ArchivoAdjunto => ({
    id: `drive_${item.id}_${Date.now()}`,
    nombre: item.name,
    url: item.webViewLink || buildDrivePreviewUrl(item) || "",
    storagePath: "",
    tipo: item.mimeType,
    ["tama\u00f1o"]: Number(item.size || 0),
    subidoEn: Date.now(),
    provider: "drive",
    driveFileId: item.id,
    driveFolderId: folderId || item.parents?.[0],
    webViewLink: item.webViewLink,
    previewUrl: buildDrivePreviewUrl(item) || undefined,
    syncedAt: Date.now(),
  })

  const addRecursoDrive = (archivo: ArchivoAdjunto) => {
    setRecursosMaterialesUnidadArchivos(prev => (
      prev.some(item => item.driveFileId === archivo.driveFileId)
        ? prev
        : [...prev, archivo]
    ))
    setRecursosMaterialesUnidad(prev => (
      prev.includes(archivo.nombre) ? prev : [...prev, archivo.nombre]
    ))
  }

  const handleAdjuntarRecursoDrive = async (item: DriveItem) => {
    if (recursosMaterialesUnidadArchivos.some(f => f.driveFileId === item.id)) {
      toast({ title: "Ya adjuntado" })
      return
    }
    try {
      const token = await ensureDriveToken()
      const { folders } = await ensureEduPanelWorkspaceForContext(token, driveContext)
      const folderId = folders.materiales?.id || folders.unidad?.id || folders.planificacion?.id
      if (folderId) {
        await crearAccesoDirectoDrive(token, { targetId: item.id, parentId: folderId, name: item.name }).catch(() => null)
      }
      addRecursoDrive(archivoAdjuntoDesdeDrive(item, folderId))
      toast({ title: "Material adjuntado desde Drive" })
    } catch (error) {
      toast({ title: "No se pudo adjuntar", description: getGoogleDriveErrorMessage(error), variant: "destructive" })
    }
  }

  const handleSubirRecursosDrive = async (files: FileList | File[]) => {
    const selectedFiles = Array.from(files)
    if (!selectedFiles.length || subiendoRecursoDrive) return
    setSubiendoRecursoDrive(true)
    try {
      const token = await ensureDriveToken()
      const { folders } = await ensureEduPanelWorkspaceForContext(token, driveContext)
      const folderId = folders.materiales?.id || folders.unidad?.id || folders.planificacion?.id
      if (!folderId) throw new Error("No se encontro la carpeta de Materiales en Drive.")
      for (const file of selectedFiles) {
        const progressKey = `unidad_${file.name}_${file.lastModified}`
        setResourceUploadProgress(prev => ({ ...prev, [progressKey]: 0 }))
        const driveFile = await subirArchivoADrive(token, {
          file,
          folderId,
          onProgress: progress => setResourceUploadProgress(prev => ({ ...prev, [progressKey]: progress })),
        })
        addRecursoDrive(archivoAdjuntoDesdeDrive(driveFile, folderId))
        setResourceUploadProgress(prev => {
          const next = { ...prev }
          delete next[progressKey]
          return next
        })
      }
      toast({ title: "Material subido a Drive" })
    } catch (error) {
      toast({ title: "Error al subir material", description: getGoogleDriveErrorMessage(error), variant: "destructive" })
    } finally {
      setSubiendoRecursoDrive(false)
      if (recursoFileInputRef.current) recursoFileInputRef.current.value = ""
    }
  }

  const handleEliminarRecursoDrive = (archivo: ArchivoAdjunto) => {
    setRecursosMaterialesUnidadArchivos(prev => prev.filter(item => item.id !== archivo.id))
    setRecursosMaterialesUnidad(prev => prev.filter(item => item !== archivo.nombre))
    toast({ title: "Material quitado de la unidad" })
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

  const renderRecursosUnidad = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[12px] font-bold text-muted-foreground">Recursos y materiales</label>
        <DriveSheet
          context={driveContext}
          title="Materiales de la unidad"
          description="Selecciona archivos desde tu Drive y adjuntalos a esta unidad."
          label="Elegir de Drive"
          selectLabel="Adjuntar"
          onSelectFile={handleAdjuntarRecursoDrive}
          buttonClassName="h-8 px-2.5 py-1 text-[11px]"
        />
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragRecursoActivo(true) }}
        onDragLeave={() => setDragRecursoActivo(false)}
        onDrop={e => { e.preventDefault(); setDragRecursoActivo(false); void handleSubirRecursosDrive(e.dataTransfer.files) }}
        onClick={() => recursoFileInputRef.current?.click()}
        className={cn(
          "rounded-[12px] border border-dashed p-4 text-center transition-all cursor-pointer",
          dragRecursoActivo ? "border-primary bg-primary/5" : "border-border bg-muted/10 hover:bg-muted/20"
        )}
      >
        <UploadCloud className={cn("mx-auto mb-1 h-5 w-5", subiendoRecursoDrive ? "animate-pulse text-primary" : "text-muted-foreground")} />
        <span className="block text-[11.5px] font-extrabold text-foreground">
          {subiendoRecursoDrive ? "Subiendo a Google Drive..." : "Subir material a Google Drive"}
        </span>
        <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">
          Arrastra archivos aqui o haz clic para seleccionarlos.
        </span>
        <input
          ref={recursoFileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={e => { if (e.target.files) void handleSubirRecursosDrive(e.target.files) }}
        />
      </div>

      {Object.entries(resourceUploadProgress).length > 0 && (
        <div className="space-y-1.5">
          {Object.entries(resourceUploadProgress).map(([key, progress]) => (
            <div key={key} className="rounded-lg border border-border bg-muted/10 px-2.5 py-2">
              <div className="mb-1 flex items-center justify-between text-[10.5px] font-bold text-muted-foreground">
                <span className="truncate">{key.replace(/^unidad_/, "").replace(/_\d+$/, "")}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {recursosMaterialesUnidadArchivos.map(archivo => (
          <div key={archivo.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/15 px-2.5 py-2 shadow-sm">
            <div className="flex min-w-0 items-center gap-2">
              <Paperclip className="h-4 w-4 flex-shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-extrabold text-foreground">{archivo.nombre}</p>
                <p className="text-[9.5px] font-semibold text-muted-foreground">
                  Google Drive · {formatFileSize(archivo["tama\u00f1o"])}
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setPreviewRecurso(archivo)}
                className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground hover:border-primary hover:text-primary"
                title="Ver material"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleEliminarRecursoDrive(archivo)}
                className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-status-red-bg hover:text-status-red-text"
                title="Quitar material"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {recursosMaterialesUnidadArchivos.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/10 px-3 py-3 text-center">
            <HardDrive className="mx-auto mb-1 h-5 w-5 text-muted-foreground/50" />
            <span className="text-[11px] text-muted-foreground italic">Sin materiales subidos a Drive</span>
          </div>
        )}
      </div>
    </div>
  )

  const renderEstrategiasEvaluacion = () => (
    <div className="space-y-2">
      <label className="text-[12px] font-bold text-muted-foreground">Estrategias de evaluacion</label>
      <div className="space-y-1.5">
        <input
          type="text"
          placeholder="Nombre: Ej. Evaluacion Ritmica"
          value={evalDraft.nombre}
          onChange={e => setEvalDraft(p => ({ ...p, nombre: e.target.value }))}
          className="w-full border border-border rounded-lg px-2 py-1 text-[12px] bg-background text-foreground"
        />
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="Instrumento: Ej. Rubrica"
            value={evalDraft.instrumento}
            onChange={e => setEvalDraft(p => ({ ...p, instrumento: e.target.value }))}
            className="flex-1 border border-border rounded-lg px-2 py-1 text-[12px] bg-background text-foreground"
          />
          <input
            type="text"
            placeholder="%"
            value={evalDraft.ponderacion}
            onChange={e => setEvalDraft(p => ({ ...p, ponderacion: e.target.value }))}
            className="w-14 border border-border rounded-lg px-2 py-1 text-[12px] text-center bg-background text-foreground"
          />
          <button
            onClick={addEstrategia}
            className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted-foreground hover:text-white transition-colors cursor-pointer border-none"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-1.5 mt-3">
        {estrategiasEvaluacion.map(est => (
          <div key={est.id} className="flex items-center justify-between bg-muted/30 p-2 rounded-lg border border-border/60 text-[11px]">
            <div className="min-w-0">
              <div className="font-bold text-foreground truncate">{est.nombre}</div>
              <div className="text-muted-foreground truncate">{est.instrumento}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-primary">{est.ponderacion ? `${est.ponderacion}%` : "S/P"}</span>
              <button
                onClick={() => setEstrategiasEvaluacion(p => p.filter(e => e.id !== est.id))}
                className="p-1 rounded text-muted-foreground hover:text-status-red-text hover:bg-status-red-bg cursor-pointer border-none bg-none"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {estrategiasEvaluacion.length === 0 && (
          <span className="text-[11px] text-muted-foreground italic block">Sin estrategias de evaluacion configuradas</span>
        )}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-[14px] font-medium">Cargando Dashboard de Unidad v3…</span>
      </div>
    )
  }

  if (error || !unidad) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
        <AlertCircle className="w-8 h-8 text-amber-500" />
        <p className="text-[14px] text-muted-foreground max-w-md leading-relaxed">{error || "Unidad no encontrada"}</p>
        <Link href={buildUrl("/planificaciones", withAsignatura({ curso: cursoParam }, ASIGNATURA))}
          className="flex items-center gap-2 text-[13px] font-semibold text-primary hover:underline">
          <ArrowRight className="w-4 h-4" /> Ir a Planificaciones para configurar el nivel
        </Link>
      </div>
    )
  }

  const unitColor = UNIT_COLORS[unitIndex % UNIT_COLORS.length]
  const queryParams = { curso: cursoParam, unidad: unidadParam, unitIdLocal: unidadLocalParam }
  const unidadTitulo = planUnit?.name || unidad.nombre_unidad
  const fechaUnidadLabel = fechasFormato?.start && fechasFormato?.end
    ? `${fechasFormato.start} al ${fechasFormato.end}`
    : "Sin fechas asignadas"

  return (
    <div className={cn("mx-auto px-4 py-6 sm:px-6", simpleMode ? "max-w-[1040px]" : "max-w-[1320px]")}>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href={buildUrl("/planificaciones", withAsignatura({ curso: cursoParam }, ASIGNATURA))}
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 hover:text-foreground"
            title="Volver a mis planificaciones"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <span>{cursoParam}</span>
              <span className="text-border">/</span>
              <span>{ASIGNATURA}</span>
              <span className="text-border">/</span>
              <span>{nivelAsignado || "Nivel sin asignar"}</span>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2.5">
              <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: unitColor }} />
              <h1 className="truncate text-[24px] font-extrabold leading-tight text-foreground sm:text-[28px]">
                {unidadTitulo}
              </h1>
              {simpleMode && (
                <span className="hidden rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold uppercase text-primary sm:inline-flex">
                  Simple
                </span>
              )}
            </div>
            <p className="mt-1 text-[12px] font-medium text-muted-foreground">
              Formato de unidad para revisar curriculum, fechas, recursos y evaluacion.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
          {saveStatus === "saving_silent" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-bold text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Guardando
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-status-green-border bg-status-green-bg px-3 py-1.5 text-[12px] font-bold text-status-green-text">
              <Check className="h-3.5 w-3.5" /> Guardado
            </span>
          )}
          {saveStatus === "error" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-status-red-border bg-status-red-bg px-3 py-1.5 text-[12px] font-bold text-status-red-text">
              <AlertCircle className="h-3.5 w-3.5" /> Error
            </span>
          )}
          <button
            type="button"
            onClick={() => handleGuardar(false)}
            disabled={saving || saveStatus === "saving_silent"}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary bg-primary px-4 text-[13px] font-extrabold text-primary-foreground shadow-sm transition-colors hover:bg-pink-dark disabled:opacity-60"
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Guardando</>
            ) : (
              <><Bookmark className="h-4 w-4" /> Guardar cambios</>
            )}
          </button>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-1 border-b border-border">
        <Link
          href={buildUrl("/ver-unidad", withAsignatura(queryParams, ASIGNATURA))}
          className="border-b-2 border-primary px-4 py-3 text-[13px] font-extrabold text-primary"
        >
          Unidad
        </Link>
        <Link
          href={buildUrl("/ver-unidad/cronograma", withAsignatura(queryParams, ASIGNATURA))}
          className="border-b-2 border-transparent px-4 py-3 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          Cronograma
        </Link>
        <Link
          href={buildUrl("/ver-unidad/clases", withAsignatura(queryParams, ASIGNATURA))}
          className="border-b-2 border-transparent px-4 py-3 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          Clases
        </Link>
      </div>

      {simpleMode ? (
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-extrabold text-foreground">Formato de unidad</h2>
                <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
                  Edicion simple con lo esencial para disenar y revisar la unidad.
                </p>
              </div>
              <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[12px] font-extrabold text-primary">
                {progressPct}% completo
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[12px] font-extrabold text-muted-foreground">
                  Proposito curricular
                </label>
                <textarea
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  rows={4}
                  placeholder="Describe el sentido curricular de la unidad."
                  className="w-full resize-none rounded-lg border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground outline-none transition-colors focus:border-primary"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-[12px] font-extrabold text-muted-foreground">
                    Conocimientos previos
                  </label>
                  <textarea
                    value={conocimientosPrevios}
                    onChange={e => setConocimientosPrevios(e.target.value)}
                    rows={4}
                    placeholder="Lo que el curso ya trae."
                    className="w-full resize-none rounded-lg border border-border bg-background p-3 text-[12.5px] leading-relaxed text-foreground outline-none transition-colors focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-extrabold text-muted-foreground">
                    Contexto del profesor
                  </label>
                  <textarea
                    value={contextoDocente}
                    onChange={e => setContextoDocente(e.target.value)}
                    rows={4}
                    placeholder="Ritmos, focos o necesidades del curso."
                    className="w-full resize-none rounded-lg border border-border bg-background p-3 text-[12.5px] leading-relaxed text-foreground outline-none transition-colors focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-extrabold text-muted-foreground">
                    Meta pedagogica
                  </label>
                  <textarea
                    value={objetivoDocente}
                    onChange={e => setObjetivoDocente(e.target.value)}
                    rows={4}
                    placeholder="Lo que quieres empujar en esta unidad."
                    className="w-full resize-none rounded-lg border border-border bg-background p-3 text-[12.5px] leading-relaxed text-foreground outline-none transition-colors focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-muted/15 px-3 py-2.5">
                  <span className="block text-[10.5px] font-bold uppercase text-muted-foreground">Fechas</span>
                  <span className="mt-0.5 block text-[13px] font-extrabold text-foreground">{fechaUnidadLabel}</span>
                </div>
                <div className="rounded-lg border border-border bg-muted/15 px-3 py-2.5">
                  <span className="block text-[10.5px] font-bold uppercase text-muted-foreground">Carga</span>
                  <span className="mt-0.5 block text-[13px] font-extrabold text-foreground">{formatHorasUnidad(cargaCalculada.minutos)}</span>
                </div>
                <div className="rounded-lg border border-border bg-muted/15 px-3 py-2.5">
                  <span className="block text-[10.5px] font-bold uppercase text-muted-foreground">Clases</span>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => ajustarTotalClases(clases - 1)}
                      className="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-[14px] font-extrabold hover:bg-muted"
                    >
                      -
                    </button>
                    <span className="min-w-8 text-center text-[14px] font-extrabold text-foreground">{clases}</span>
                    <button
                      type="button"
                      onClick={() => ajustarTotalClases(clases + 1)}
                      className="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-[14px] font-extrabold hover:bg-muted"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Link
                  href={buildUrl("/ver-unidad/cronograma", withAsignatura(queryParams, ASIGNATURA))}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[12px] font-extrabold text-foreground transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Calendar className="h-4 w-4" /> Ver cronograma
                </Link>
                <Link
                  href={buildUrl("/ver-unidad/clases", withAsignatura(queryParams, ASIGNATURA))}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[12px] font-extrabold text-foreground transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                >
                  <Sparkles className="h-4 w-4" /> Ver clases
                </Link>
              </div>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              {renderRecursosUnidad()}
            </section>
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              {renderEstrategiasEvaluacion()}
            </section>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <main className="space-y-5">
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[18px] font-extrabold text-foreground">Plan de unidad</h2>
                  <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
                    Base editable para que cronograma y clases trabajen con el mismo contexto.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditDesc(!editDesc)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[11px] font-extrabold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" /> {editDesc ? "Cerrar" : "Editar texto"}
                </button>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/10 p-4">
                  <label className="mb-2 block text-[11px] font-extrabold uppercase text-muted-foreground">
                    Proposito curricular
                  </label>
                  {editDesc ? (
                    <textarea
                      value={descripcion}
                      onChange={e => setDescripcion(e.target.value)}
                      rows={5}
                      className="w-full resize-none rounded-lg border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground outline-none transition-colors focus:border-primary"
                    />
                  ) : (
                    <p className="text-[13px] leading-relaxed text-foreground">
                      {descripcion || "No se ha definido un proposito para esta planificacion."}
                    </p>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[12px] font-extrabold text-muted-foreground">
                      Contexto del profesor
                    </label>
                    <textarea
                      value={contextoDocente}
                      onChange={e => setContextoDocente(e.target.value)}
                      rows={4}
                      placeholder="Caracteristicas del curso, ritmos o foco de trabajo."
                      className="w-full resize-none rounded-lg border border-border bg-background p-3 text-[12.5px] leading-relaxed text-foreground outline-none transition-colors focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[12px] font-extrabold text-muted-foreground">
                      Meta pedagogica del docente
                    </label>
                    <textarea
                      value={objetivoDocente}
                      onChange={e => setObjetivoDocente(e.target.value)}
                      rows={4}
                      placeholder="Objetivo propio para orientar la unidad."
                      className="w-full resize-none rounded-lg border border-border bg-background p-3 text-[12.5px] leading-relaxed text-foreground outline-none transition-colors focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-extrabold text-foreground">Curriculo seleccionado</h2>
                  <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
                    OAs, indicadores y elementos que alimentan la planificacion.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-extrabold">
                  <span className="rounded-full border border-status-green-border bg-status-green-bg px-2.5 py-1 text-status-green-text">{oasBasales.length} OA</span>
                  <span className="rounded-full border border-border bg-muted/20 px-2.5 py-1 text-muted-foreground">{indicadoresSeleccionados} indicadores</span>
                  <span className="rounded-full border border-border bg-muted/20 px-2.5 py-1 text-muted-foreground">{actsSel.length + oatSeleccionados.length} actitudes</span>
                </div>
              </div>

              <div className="space-y-3">
                {oasBasales.length > 0 ? (
                  oasBasales.map(oa => {
                    const indicadores = (oa.indicadores || []).filter(ind => ind.seleccionado)
                    return (
                      <div key={oa.id} className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-status-green-text" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-bold leading-snug text-foreground">
                              <span className="font-extrabold">OA {oa.numero ?? ""}:</span> {oa.descripcion}
                            </p>
                            {indicadores.length > 0 && (
                              <ul className="mt-2 space-y-1 pl-3 text-[12px] leading-snug text-muted-foreground">
                                {indicadores.slice(0, 4).map(ind => (
                                  <li key={ind.id} className="list-disc">{ind.texto}</li>
                                ))}
                                {indicadores.length > 4 && (
                                  <li className="list-none font-extrabold text-primary">+{indicadores.length - 4} indicadores</li>
                                )}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/10 p-4 text-center text-[12px] font-medium text-muted-foreground">
                    Sin OA seleccionados para esta unidad.
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-border bg-muted/10 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase text-muted-foreground">
                      <Layers className="h-3.5 w-3.5" /> Conocimientos
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {consSel.length ? consSel.map(item => (
                        <span key={item.id} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-bold text-foreground">
                          {item.texto}
                        </span>
                      )) : <span className="text-[11px] italic text-muted-foreground">Sin seleccion</span>}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/10 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase text-muted-foreground">
                      <Target className="h-3.5 w-3.5" /> Habilidades
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {habsSel.length ? habsSel.map(item => (
                        <span key={item.id} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-bold text-foreground">
                          {item.texto}
                        </span>
                      )) : <span className="text-[11px] italic text-muted-foreground">Sin seleccion</span>}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/10 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase text-muted-foreground">
                      <Heart className="h-3.5 w-3.5" /> Actitudes
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {actsSel.length || oatSeleccionados.length ? (
                        <>
                          {actsSel.map(item => (
                            <span key={item.id} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-bold text-foreground">
                              {item.texto}
                            </span>
                          ))}
                          {oatSeleccionados.map(item => (
                            <span key={item.id} className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                              {item.descripcion}
                            </span>
                          ))}
                        </>
                      ) : <span className="text-[11px] italic text-muted-foreground">Sin seleccion</span>}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-[17px] font-extrabold text-foreground">Ruta de trabajo</h2>
                <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
                  Accesos directos a las vistas que completan la unidad.
                </p>
              </div>
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                <Link
                  href={buildUrl("/ver-unidad/cronograma", withAsignatura(queryParams, ASIGNATURA))}
                  className="group flex items-center justify-between gap-3 bg-background px-4 py-3 transition-colors hover:bg-blue-50/70 dark:hover:bg-blue-950/20"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300">
                      <Calendar className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-extrabold text-foreground">Cronograma</p>
                      <p className="truncate text-[11.5px] font-medium text-muted-foreground">{fechaUnidadLabel}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" />
                </Link>
                <Link
                  href={buildUrl("/ver-unidad/clases", withAsignatura(queryParams, ASIGNATURA))}
                  className="group flex items-center justify-between gap-3 bg-background px-4 py-3 transition-colors hover:bg-violet-50/70 dark:hover:bg-violet-950/20"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300">
                      <Sparkles className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-extrabold text-foreground">Clases</p>
                      <p className="truncate text-[11.5px] font-medium text-muted-foreground">{clases} clases listas para disenar</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-violet-600" />
                </Link>
              </div>
            </section>
          </main>

          <aside className="space-y-4">
            <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-extrabold text-foreground">Estado de unidad</h3>
                  <p className="text-[11px] font-medium text-muted-foreground">Campos necesarios del formato.</p>
                </div>
                <span className="text-[20px] font-extrabold text-primary">{progressPct}%</span>
              </div>
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="space-y-2">
                {checklist.map(item => (
                  <div key={item.label} className="flex items-center gap-2 text-[11.5px] font-semibold text-muted-foreground">
                    {item.done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-status-green-text" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40" />
                    )}
                    <span className={cn(item.done && "text-foreground")}>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-[14px] font-extrabold text-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" /> Fechas y carga
              </h3>
              <div className="space-y-3 text-[12px]">
                <div>
                  <span className="block font-bold text-muted-foreground">Rango</span>
                  <span className="mt-0.5 block font-extrabold text-foreground">{fechaUnidadLabel}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="font-bold text-muted-foreground">Carga horaria</span>
                  <span className="font-extrabold text-foreground">{formatHorasUnidad(cargaCalculada.minutos)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="font-bold text-muted-foreground">Total de clases</span>
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
                    <button
                      type="button"
                      onClick={() => ajustarTotalClases(clases - 1)}
                      className="grid h-7 w-7 place-items-center rounded-md text-[14px] font-extrabold hover:bg-muted"
                    >
                      -
                    </button>
                    <span className="min-w-8 text-center font-extrabold">{clases}</span>
                    <button
                      type="button"
                      onClick={() => ajustarTotalClases(clases + 1)}
                      className="grid h-7 w-7 place-items-center rounded-md text-[14px] font-extrabold hover:bg-muted"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <TermometroV3
              asignatura={ASIGNATURA}
              curso={cursoParam}
              unidadId={unidadLocalParam}
              oas={oas}
            />

            <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
              {renderRecursosUnidad()}
            </section>

            <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
              {renderEstrategiasEvaluacion()}
            </section>
          </aside>
        </div>
      )}

      {previewRecurso && (() => {
        const previewUrl = previewRecurso.previewUrl || previewRecurso.webViewLink || previewRecurso.url
        const isVideo = previewRecurso.tipo?.includes("video") || previewRecurso.nombre?.toLowerCase().endsWith(".mp4")
        const isImage = previewRecurso.tipo?.includes("image/")
        const externalUrl = previewRecurso.webViewLink || previewRecurso.url

        return (
          <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 p-3 sm:p-6">
            <div className="flex h-full max-h-[90vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[18px] border border-border bg-card shadow-2xl">
              <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-extrabold text-foreground">{previewRecurso.nombre}</p>
                    <p className="text-[10px] text-muted-foreground">{previewRecurso.tipo || "archivo"}</p>
                  </div>
                  <span className="flex-shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-primary">
                    Drive
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {externalUrl && (
                    <a
                      href={externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Abrir en nueva pesta\u00f1a"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Abrir</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setPreviewRecurso(null)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-status-red-bg hover:text-status-red-text"
                    title="Cerrar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="relative min-h-0 flex-1 bg-muted/30">
                {isVideo ? (
                  <video src={previewRecurso.url} controls className="h-full w-full object-contain" />
                ) : isImage ? (
                  <div className="flex h-full items-center justify-center p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Preview supports user/Drive/blob URLs that next/image cannot reliably optimize. */}
                    <img
                      src={previewRecurso.url}
                      alt={previewRecurso.nombre}
                      className="max-h-full max-w-full rounded-lg object-contain shadow-md"
                    />
                  </div>
                ) : previewUrl ? (
                  <iframe
                    src={previewUrl}
                    title={previewRecurso.nombre}
                    className="h-full w-full border-0 bg-white"
                    allow="autoplay"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground/40" />
                    <p className="text-[13px] font-bold text-foreground">Sin vista previa disponible</p>
                    {externalUrl && (
                      <a
                        href={externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 rounded-[10px] border border-primary bg-primary/10 px-4 py-2 text-[12px] font-bold text-primary hover:bg-pink-light"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Abrir en Drive
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
