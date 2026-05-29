"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { serverTimestamp } from "firebase/firestore"
import {
  ArrowLeft, Users, CheckCircle2, AlertCircle, Loader2, Plus, X, Printer, Save, Lock, Unlock, Sparkles, Upload, FileText, Check, Image as ImageIcon
} from "lucide-react"
import { abrirHojaEvaluacionImprimible } from "@/lib/export/hoja-evaluacion-pdf"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { apiFetch } from "@/lib/api-client"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarEstudiantes, type Estudiante } from "@/lib/estudiantes"
import { cargarHorarioSemanal } from "@/lib/horario"
import { auth } from "@/lib/firebase"
import { cargarInfoColegio, type InfoColegio } from "@/lib/perfil"
import {
  cargarRubrica, cargarEvaluacion, guardarEvaluacion, nuevaEvaluacion,
  calcularPuntajeEstudiante, calcularNota,
  type RubricaTemplate, type EvaluacionRubrica,
  type GrupoEvaluacion, type EstudianteEvaluacion
} from "@/lib/rubricas"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Props {
  rubricaId: string
}

const NIVEL_OPCIONES = [
  { valor: 4, label: "L",   titulo: "Logrado",               color: "bg-green-500 text-white border-green-500" },
  { valor: 3, label: "CL",  titulo: "Casi logrado",          color: "bg-blue-500 text-white border-blue-500" },
  { valor: 2, label: "PL",  titulo: "Parcialmente logrado",  color: "bg-amber-500 text-white border-amber-500" },
  { valor: 1, label: "PL*", titulo: "Por lograr",            color: "bg-red-500 text-white border-red-500" },
] as const

const exigenciaEstudiante = (estudiante?: Pick<EstudianteEvaluacion, "hasPie"> | null) =>
  estudiante?.hasPie ? 0.5 : 0.6

const normalizeName = (value: string) => value.trim().toLocaleLowerCase("es")

function formatearFechaBloqueo(value: unknown): string {
  if (!value) return "ahora"
  const rawDate =
    value instanceof Date ? value :
    typeof value === "number" ? new Date(value) :
    typeof (value as { toDate?: () => Date })?.toDate === "function" ? (value as { toDate: () => Date }).toDate() :
    null
  if (!rawDate || Number.isNaN(rawDate.getTime())) return "ahora"
  return new Intl.DateTimeFormat("es-CL").format(rawDate)
}

export function EvaluacionView({ rubricaId }: Props) {
  const router = useRouter()
  const { asignatura } = useActiveSubject()

  const [rubrica, setRubrica] = useState<RubricaTemplate | null>(null)
  const [evaluacion, setEvaluacion] = useState<EvaluacionRubrica | null>(null)
  const [todosEstudiantes, setTodosEstudiantes] = useState<Estudiante[]>([])
  const [grupoActivo, setGrupoActivo] = useState(0)
  const [alumnoActivo, setAlumnoActivo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [guardandoManual, setGuardandoManual] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [infoColegio, setInfoColegio] = useState<InfoColegio | null>(null)
  const [error, setError] = useState("")
  const [parteActivaIdx, setParteActivaIdx] = useState(0)
  const [confirmBloqueo, setConfirmBloqueo] = useState<"bloquear" | "desbloquear" | null>(null)
  const [mostrarAsistenteIA, setMostrarAsistenteIA] = useState(false)
  const [analizandoIA, setAnalizandoIA] = useState(false)
  const [progresoIA, setProgresoIA] = useState("")
  const [errorIA, setErrorIA] = useState("")
  const [fileBase64, setFileBase64] = useState<string | null>(null)
  const [fileMime, setFileMime] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [resultadoIA, setResultadoIA] = useState<{
    transcripcion?: string
    evaluaciones?: Record<string, { nivel: string; puntos: number; justificacion: string }>
    observaciones?: string
  } | null>(null)
  const ignoreFirstSave = useRef(true)
  const skipNextSave = useRef(false)

  // Cargar todo
  useEffect(() => {
    const cargar = async () => {
      try {
        const [r, ev, horario, colegio] = await Promise.all([
          cargarRubrica(rubricaId),
          cargarEvaluacion(rubricaId),
          cargarHorarioSemanal(),
          cargarInfoColegio(),
        ])
        if (colegio) setInfoColegio(colegio)

        if (!r) { setError("Rúbrica no encontrada"); return }
        setRubrica(r)

        // Inferir curso de la rúbrica y cargar alumnos
        const alumnos = await cargarEstudiantes(r.curso)
        setTodosEstudiantes(alumnos)

        if (ev) {
          // Sincronizar alumnos nuevos en grupos
          const evaluacionActualizada = sincronizarAlumnos(ev, alumnos)
          setEvaluacion(evaluacionActualizada)
          // Seleccionar primer alumno del grupo activo
          const primerAlumno = evaluacionActualizada.grupos[0]?.estudiantes[0]?.estudianteId ?? null
          setAlumnoActivo(prev => prev ?? primerAlumno)
        } else {
          // Nueva evaluación: crear grupos y agregar todos los alumnos al grupo 1
          const nueva = nuevaEvaluacion(r)
          const conAlumnos = sincronizarAlumnos(nueva, alumnos)
          setEvaluacion(conAlumnos)
          const primerAlumno = conAlumnos.grupos[0]?.estudiantes[0]?.estudianteId ?? null
          setAlumnoActivo(primerAlumno)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar")
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [rubricaId])

  // Auto-save
  useEffect(() => {
    if (!evaluacion) return
    if (ignoreFirstSave.current) { ignoreFirstSave.current = false; return }
    if (skipNextSave.current) { skipNextSave.current = false; return }
    const t = setTimeout(async () => {
      try {
        await guardarEvaluacion(evaluacion)
        setGuardadoOk(true)
        setTimeout(() => setGuardadoOk(false), 1800)
      } catch (e) { console.error(e) }
    }, 2500)
    return () => clearTimeout(t)
  }, [evaluacion])

  // Sincronizar alumnos que se agregaron al curso después de crear la evaluación
  function sincronizarAlumnos(ev: EvaluacionRubrica, alumnos: Estudiante[]): EvaluacionRubrica {
    const alumnosPorId = new Map(alumnos.map(alumno => [alumno.id, alumno]))
    const alumnosPorNombre = new Map(alumnos.map(alumno => [normalizeName(alumno.nombre), alumno]))
    const gruposActualizados = ev.grupos.map(grupo => ({
      ...grupo,
      estudiantes: grupo.estudiantes.map(est => {
        const alumnoPerfil = alumnosPorId.get(est.estudianteId) ?? alumnosPorNombre.get(normalizeName(est.nombre))
        if (!alumnoPerfil) return est
        const puntaje = calcularPuntajeEstudiante(est.puntajes, rubrica?.partes ?? [])
        const hasPie = alumnoPerfil.pie ?? false
        return {
          ...est,
          nombre: alumnoPerfil.nombre || est.nombre,
          hasPie,
          nota: rubrica ? calcularNota(puntaje, rubrica.puntajeMaximo, hasPie ? 0.5 : 0.6) : est.nota,
        }
      }),
    }))
    const todosEnGrupos = new Set(gruposActualizados.flatMap(g => g.estudiantes.map(e => e.estudianteId)))
    const sinAsignar = alumnos.filter(a => !todosEnGrupos.has(a.id))
    if (sinAsignar.length === 0) return { ...ev, grupos: gruposActualizados }
    // Agregar sin asignar al primer grupo
    const nuevosEst: EstudianteEvaluacion[] = sinAsignar.map(a => ({
      estudianteId: a.id,
      nombre: a.nombre,
      hasPie: a.pie ?? false,
      puntajes: {},
      observaciones: "",
      completado: false,
    }))
    return {
      ...ev,
      grupos: gruposActualizados.map((g, i) =>
        i === 0 ? { ...g, estudiantes: [...g.estudiantes, ...nuevosEst] } : g
      ),
    }
  }

  const updateEvaluacion = (fn: (ev: EvaluacionRubrica) => EvaluacionRubrica) => {
    setEvaluacion(prev => {
      if (!prev || prev.bloqueada) return prev
      return fn(prev)
    })
  }

  const findGrupoIndexByNombre = (nombre: string) => {
    if (!evaluacion) return -1
    const nombreNormalizado = nombre.trim().toLowerCase()
    return evaluacion.grupos.findIndex(
      grupo => grupo.nombre.trim().toLowerCase() === nombreNormalizado
    )
  }

  const updateEstudiante = (
    grupoIdx: number,
    estudianteId: string,
    fn: (e: EstudianteEvaluacion) => EstudianteEvaluacion
  ) => {
    updateEvaluacion(ev => ({
      ...ev,
      grupos: ev.grupos.map((g, gi) =>
        gi !== grupoIdx ? g : {
          ...g,
          estudiantes: g.estudiantes.map(e =>
            e.estudianteId !== estudianteId ? e : fn(e)
          ),
        }
      ),
    }))
  }

  const setPuntaje = (grupoIdx: number, estudianteId: string, criterioId: string, valor: number) => {
    updateEstudiante(grupoIdx, estudianteId, e => {
      const puntajes = { ...e.puntajes }
      // Deseleccionar si ya estaba seleccionado
      if (puntajes[criterioId] === valor) {
        delete puntajes[criterioId]
      } else {
        puntajes[criterioId] = valor
      }
      const rubr = rubrica!
      const puntaje = calcularPuntajeEstudiante(puntajes, rubr.partes)
      const nota = calcularNota(puntaje, rubr.puntajeMaximo, exigenciaEstudiante(e))
      const criteriosTotal = rubr.partes.reduce((a, p) => a + p.criterios.length, 0)
      const completado = Object.keys(puntajes).length === criteriosTotal
      return { ...e, puntajes, nota, completado }
    })
  }

  const moverAlumno = (estudianteId: string, desdeGrupo: number, hastaGrupo: number) => {
    if (desdeGrupo === hastaGrupo || !evaluacion) return
    const est = evaluacion.grupos[desdeGrupo]?.estudiantes.find(e => e.estudianteId === estudianteId)
    if (!est) return
    updateEvaluacion(ev => ({
      ...ev,
      grupos: ev.grupos.map((g, gi) => {
        if (gi === desdeGrupo) return { ...g, estudiantes: g.estudiantes.filter(e => e.estudianteId !== estudianteId) }
        if (gi === hastaGrupo) return { ...g, estudiantes: [...g.estudiantes, est] }
        return g
      }),
    }))
  }

  const agregarGrupo = () => {
    updateEvaluacion(ev => {
      const nextNum = ev.grupos.length + 1
      const nuevoGrupo: GrupoEvaluacion = {
        id: `grupo_${nextNum}_${Date.now()}`,
        nombre: `Grupo ${nextNum}`,
        estudiantes: [],
      }
      return { ...ev, grupos: [...ev.grupos, nuevoGrupo] }
    })
  }

  const asegurarGrupoAusentes = () => {
    const grupoExistenteIdx = findGrupoIndexByNombre("Ausentes")
    if (grupoExistenteIdx >= 0) {
      setGrupoActivo(grupoExistenteIdx)
      setAlumnoActivo(evaluacion?.grupos[grupoExistenteIdx]?.estudiantes[0]?.estudianteId ?? null)
      return
    }

    updateEvaluacion(ev => {
      const nuevoGrupo: GrupoEvaluacion = {
        id: `grupo_ausentes_${Date.now()}`,
        nombre: "Ausentes",
        estudiantes: [],
      }
      const grupos = [...ev.grupos, nuevoGrupo]
      setGrupoActivo(grupos.length - 1)
      setAlumnoActivo(null)
      return { ...ev, grupos }
    })
  }

  const eliminarGrupo = (grupoIdx: number) => {
    if (!evaluacion) return
    const grupo = evaluacion.grupos[grupoIdx]
    if (!grupo) return
    // Mover estudiantes del grupo eliminado al Grupo 1 (índice 0), si los hay
    updateEvaluacion(ev => {
      const estudiantesMover = ev.grupos[grupoIdx]?.estudiantes ?? []
      const gruposNuevos = ev.grupos
        .filter((_, i) => i !== grupoIdx)
        .map((g, i) => (i === 0 ? { ...g, estudiantes: [...g.estudiantes, ...estudiantesMover] } : g))
      return { ...ev, grupos: gruposNuevos }
    })
    // Ajustar el grupo activo si quedó fuera de rango
    setGrupoActivo(prev => Math.min(prev, evaluacion.grupos.length - 2))
    setAlumnoActivo(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setErrorIA("")
    setFileName(file.name)
    setFileMime(file.type)

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(",")[1]
      setFileBase64(base64String)
      if (file.type.startsWith("image/")) {
        setPreviewUrl(reader.result as string)
      } else {
        setPreviewUrl(null)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleAnalizarConIA = async () => {
    if (!fileBase64 || !fileMime || !rubrica || !alumnoObj) return
    setAnalizandoIA(true)
    setProgresoIA("Procesando documento...")
    setErrorIA("")
    try {
      setProgresoIA("Transcribiendo y evaluando con Gemini 2.0...")
      const response = await apiFetch("/api/corregir-con-foto", {
        method: "POST",
        body: JSON.stringify({
          imageBase64: fileBase64,
          mimeType: fileMime,
          rubrica,
          studentName: alumnoObj.nombre,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Error del servidor (${response.status})`)
      }

      const data = await response.json()
      setResultadoIA(data)
      setProgresoIA("")
    } catch (err: any) {
      setErrorIA(err.message || "Error al analizar el trabajo.")
    } finally {
      setAnalizandoIA(false)
    }
  }

  const aplicarEvaluacionIA = () => {
    if (!resultadoIA || !alumnoObj) return
    
    const levelMap: Record<string, number> = {
      logrado: 4,
      casiLogrado: 3,
      parcialmenteLogrado: 2,
      porLograr: 1,
    }

    const nuevosPuntajes = { ...alumnoObj.puntajes }
    if (resultadoIA.evaluaciones) {
      Object.entries(resultadoIA.evaluaciones).forEach(([criterioId, evalData]) => {
        const val = levelMap[evalData.nivel] || evalData.puntos
        if (val >= 1 && val <= 4) {
          nuevosPuntajes[criterioId] = val
        }
      })
    }

    const rubr = rubrica!
    const puntaje = calcularPuntajeEstudiante(nuevosPuntajes, rubr.partes)
    const nota = calcularNota(puntaje, rubr.puntajeMaximo, exigenciaEstudiante(alumnoObj))
    const criteriosTotal = rubr.partes.reduce((a, p) => a + p.criterios.length, 0)
    const completado = Object.keys(nuevosPuntajes).length === criteriosTotal

    updateEstudiante(grupoActivo, alumnoObj.estudianteId, est => ({
      ...est,
      puntajes: nuevosPuntajes,
      nota,
      completado,
      observaciones: resultadoIA.observaciones 
        ? `${est.observaciones ? est.observaciones + "\n" : ""}${resultadoIA.observaciones}`
        : est.observaciones,
    }))

    // Reset state
    setMostrarAsistenteIA(false)
    setResultadoIA(null)
    setFileBase64(null)
    setFileMime(null)
    setFileName(null)
    setPreviewUrl(null)
  }

  const handleGuardarAhora = async () => {
    if (!evaluacion) return
    setGuardandoManual(true)
    setError("")
    try {
      await guardarEvaluacion(evaluacion)
      setGuardadoOk(true)
      setTimeout(() => setGuardadoOk(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setGuardandoManual(false)
    }
  }

  const aplicarBloqueo = async (bloquear: boolean) => {
    if (!evaluacion) return
    const siguiente: EvaluacionRubrica = {
      ...evaluacion,
      bloqueada: bloquear,
      bloqueadaEn: bloquear ? serverTimestamp() : undefined,
    }
    skipNextSave.current = true
    setEvaluacion(siguiente)
    setConfirmBloqueo(null)
    setGuardandoManual(true)
    setError("")
    try {
      await guardarEvaluacion(siguiente)
      setGuardadoOk(true)
      setTimeout(() => setGuardadoOk(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setGuardandoManual(false)
    }
  }

  const handleHojaImprimible = () => {
    if (!rubrica || !evaluacion) return
    abrirHojaEvaluacionImprimible({
      rubrica,
      evaluacion,
      colegio: infoColegio,
      profesorNombre: auth?.currentUser?.displayName ?? "",
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground text-[13px]">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando evaluación...
      </div>
    )
  }

  if (error || !rubrica || !evaluacion) {
    return (
      <div className="flex items-center gap-2 text-red-600 text-[13px] p-4">
        <AlertCircle className="w-4 h-4" />
        {error || "No se pudo cargar la rúbrica"}
      </div>
    )
  }

  const grupoActualObj = evaluacion.grupos[grupoActivo]
  const alumnoObj = grupoActualObj?.estudiantes.find(e => e.estudianteId === alumnoActivo)
  const todosLosAlumnosEnGrupos = evaluacion.grupos.flatMap(g => g.estudiantes)
  const bloqueada = !!evaluacion.bloqueada
  const fechaBloqueo = formatearFechaBloqueo(evaluacion.bloqueadaEn)

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] lg:h-[calc(100vh-8rem)] gap-0">
      <AlertDialog open={confirmBloqueo !== null} onOpenChange={(open) => !open && setConfirmBloqueo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBloqueo === "bloquear" ? "Finalizar y bloquear evaluacion" : "Desbloquear evaluacion"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBloqueo === "bloquear"
                ? "Una vez bloqueada, no podras modificar puntajes ni observaciones hasta desbloquearla."
                : "La evaluacion volvera a ser editable. Podras ajustar puntajes, observaciones y grupos nuevamente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => aplicarBloqueo(confirmBloqueo === "bloquear")}>
              {confirmBloqueo === "bloquear" ? "Finalizar y bloquear" : "Desbloquear"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header fijo */}
      <div className="flex flex-wrap items-center gap-2 mb-3 sm:mb-4 sm:gap-3 flex-shrink-0">
        <button
          onClick={() => router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "rubricas" }, asignatura)))}
          className="p-2 rounded-[10px] hover:bg-muted/60 transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0 order-first sm:order-none w-full sm:w-auto">
          <h1 className="text-[16px] sm:text-[18px] font-extrabold text-foreground truncate">{rubrica.nombre}</h1>
          <p className="text-[11px] sm:text-[12px] text-muted-foreground truncate">{rubrica.curso} · {rubrica.puntajeMaximo} pts máx</p>
        </div>
        <button
          onClick={() => setConfirmBloqueo(bloqueada ? "desbloquear" : "bloquear")}
          disabled={guardandoManual}
          title={bloqueada ? "Desbloquear evaluacion" : "Finalizar y bloquear la evaluacion"}
          className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-[10px] transition-colors disabled:opacity-50 ${
            bloqueada
              ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              : "border border-border hover:bg-muted/60"
          }`}
        >
          {bloqueada ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{bloqueada ? "Desbloquear" : "Finalizar"}</span>
          <span className="sm:hidden">{bloqueada ? "Abrir" : "Finalizar"}</span>
        </button>
        <button
          onClick={handleGuardarAhora}
          disabled={guardandoManual}
          title="Guardar la evaluacion ahora"
          className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-[10px] transition-colors disabled:opacity-50 ${
            guardadoOk
              ? "border border-green-300 bg-green-50 text-green-700"
              : "border border-border hover:bg-muted/60"
          }`}
        >
          {guardandoManual ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : guardadoOk ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{guardadoOk ? "Guardado" : "Guardar"}</span>
          <span className="sm:hidden">{guardadoOk ? "OK" : "Guardar"}</span>
        </button>
        <button
          onClick={handleHojaImprimible}
          title="Abrir hoja imprimible en blanco para marcar a mano durante la clase"
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Hoja en blanco</span>
          <span className="sm:hidden">Hoja</span>
        </button>
        <button
          onClick={() => router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "rubricas", view: "resultados", rubricaId }, asignatura)))}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium bg-primary text-primary-foreground rounded-[10px] hover:opacity-90 ml-auto sm:ml-0"
        >
          <span className="hidden sm:inline">Ver resultados</span>
          <span className="sm:hidden">Resultados</span>
        </button>
      </div>

      {bloqueada && (
        <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-900">
          <Lock className="h-3.5 w-3.5" />
          Evaluacion finalizada el {fechaBloqueo}. Desbloqueala para modificar puntajes, observaciones o grupos.
        </div>
      )}

      {/* Tabs de grupos */}
      <div className="flex gap-1 mb-3 overflow-x-auto flex-shrink-0 pb-1 items-center">
        {evaluacion.grupos.map((grupo, gi) => {
          const completados = grupo.estudiantes.filter(e => e.completado).length
          const esActivo = grupoActivo === gi
          return (
            <div key={grupo.id} className="relative flex-shrink-0 group/tab">
              <button
                onClick={() => { setGrupoActivo(gi); setAlumnoActivo(grupo.estudiantes[0]?.estudianteId ?? null) }}
                className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-[10px] whitespace-nowrap transition-colors pr-6 ${
                  esActivo
                    ? "bg-primary text-primary-foreground"
                    : "border border-border hover:bg-muted/60"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                {grupo.nombre}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  esActivo ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {completados}/{grupo.estudiantes.length}
                </span>
              </button>
              {/* Botón eliminar grupo (visible al hacer hover, solo si hay >1 grupos) */}
              {evaluacion.grupos.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); eliminarGrupo(gi) }}
                  disabled={bloqueada}
                  title={grupo.estudiantes.length > 0 ? `Eliminar "${grupo.nombre}" y mover sus alumnos al Grupo 1` : `Eliminar "${grupo.nombre}"`}
                  className={`absolute right-1 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full opacity-0 group-hover/tab:opacity-100 transition-opacity disabled:cursor-not-allowed disabled:opacity-30 ${
                    esActivo ? "bg-white/20 hover:bg-white/40 text-white" : "bg-muted hover:bg-red-100 hover:text-red-500 text-muted-foreground"
                  }`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          )
        })}

        {/* Botón agregar grupo */}
        <button
          onClick={asegurarGrupoAusentes}
          disabled={bloqueada}
          title="Crear o abrir el grupo de ausentes"
          className="flex items-center gap-1 px-2.5 py-2 text-[12px] font-medium rounded-[10px] border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 whitespace-nowrap transition-colors flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AlertCircle className="w-3.5 h-3.5" />
          Ausentes
        </button>
        <button
          onClick={agregarGrupo}
          disabled={bloqueada}
          title="Agregar nuevo grupo"
          className="flex items-center gap-1 px-2.5 py-2 text-[12px] font-medium rounded-[10px] border border-dashed border-border hover:border-primary/50 hover:text-primary text-muted-foreground whitespace-nowrap transition-colors flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Grupo
        </button>
      </div>

      {/* Layout principal: alumnos | criterios | scoreboard */}
      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0 lg:overflow-hidden">

        {/* Panel izquierdo: lista de alumnos del grupo */}
        <div className="w-full lg:w-44 lg:flex-shrink-0 lg:overflow-y-auto border border-border rounded-[14px] bg-card">
          <div className="lg:sticky lg:top-0 bg-card border-b border-border px-3 py-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              {grupoActualObj?.nombre} ({grupoActualObj?.estudiantes.length})
            </p>
          </div>
          <div className="flex lg:block overflow-x-auto lg:overflow-x-visible p-1.5 gap-1.5 lg:gap-0 lg:space-y-0.5">
            {grupoActualObj?.estudiantes.length === 0 && (
            <div className="w-full px-3 py-4 text-[11px] text-muted-foreground text-center">
              Grupo vacío. Mueve alumnos desde otros grupos o agrega estudiantes en Mi Perfil.
            </div>
          )}
          {grupoActualObj?.estudiantes.map(est => {
              const puntaje = calcularPuntajeEstudiante(est.puntajes, rubrica.partes)
              const nota = calcularNota(puntaje, rubrica.puntajeMaximo, exigenciaEstudiante(est))
              return (
                <button
                  key={est.estudianteId}
                  onClick={() => setAlumnoActivo(est.estudianteId)}
                  className={`flex-shrink-0 lg:flex-shrink lg:w-full min-w-[140px] lg:min-w-0 text-left px-2.5 py-2 rounded-[8px] transition-colors ${
                    alumnoActivo === est.estudianteId
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted/50 border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[12px] font-medium text-foreground truncate flex-1">
                      {est.nombre}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {est.hasPie && (
                        <span className="text-[9px] bg-blue-100 text-blue-700 rounded px-1 font-medium">PIE</span>
                      )}
                      {est.completado && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {puntaje}/{rubrica.puntajeMaximo} pts · {nota.toFixed(1)}
                  </div>
                </button>
              )
            })}

            {/* Mover alumno entre grupos */}
            {alumnoObj && evaluacion.grupos.length > 1 && (
              <div className="hidden lg:block pt-2 px-1">
                <p className="text-[10px] text-muted-foreground mb-1">Mover a:</p>
                <div className="flex flex-wrap gap-1">
                  {evaluacion.grupos.map((g, gi) =>
                    gi !== grupoActivo ? (
                      <button
                        key={g.id}
                        onClick={() => {
                          moverAlumno(alumnoActivo!, grupoActivo, gi)
                          setAlumnoActivo(grupoActualObj?.estudiantes.find(e => e.estudianteId !== alumnoActivo)?.estudianteId ?? null)
                        }}
                        disabled={bloqueada}
                        className="text-[10px] px-2 py-1 border border-border rounded-[6px] hover:bg-muted/60 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {g.nombre}
                      </button>
                    ) : null
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Panel central: criterios del alumno activo */}
        <div className="flex-1 min-h-[400px] lg:min-h-0 lg:overflow-y-auto border border-border rounded-[14px] bg-card">
          {!alumnoObj ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-[13px]">
              Selecciona un alumno
            </div>
          ) : (
            <div>
              {/* Header del alumno */}
              <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-[14px] font-bold text-foreground">{alumnoObj.nombre}</p>
                    {alumnoObj.hasPie && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-medium">PIE</span>
                    )}
                  </div>
                  {!bloqueada && (
                    <button
                      onClick={() => {
                        setMostrarAsistenteIA(true)
                        setResultadoIA(null)
                        setFileBase64(null)
                        setFileMime(null)
                        setFileName(null)
                        setPreviewUrl(null)
                        setErrorIA("")
                      }}
                      title="Evaluar trabajo con Asistente de IA (Multimodal)"
                      className="ml-2 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border border-purple-200 bg-purple-50 text-purple-700 rounded-[8px] hover:bg-purple-100 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      Asistente IA
                    </button>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[20px] font-extrabold text-foreground">
                    {calcularNota(
                      calcularPuntajeEstudiante(alumnoObj.puntajes, rubrica.partes),
                      rubrica.puntajeMaximo,
                      exigenciaEstudiante(alumnoObj)
                    ).toFixed(1)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {calcularPuntajeEstudiante(alumnoObj.puntajes, rubrica.partes)}/{rubrica.puntajeMaximo} pts
                    {alumnoObj.hasPie ? " · escala 50%" : " · escala 60%"}
                  </p>
                </div>
              </div>

              {mostrarAsistenteIA ? (
                <div className="p-4 space-y-4 bg-purple-50/10 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-600 animate-pulse" />
                      <h3 className="text-[13px] font-bold text-purple-950">Asistente de Corrección Multimodal (IA)</h3>
                    </div>
                    <button
                      onClick={() => setMostrarAsistenteIA(false)}
                      className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {!resultadoIA && !analizandoIA && (
                    <div className="space-y-3">
                      <p className="text-[11px] text-muted-foreground">
                        Sube una fotografía, documento escaneado o archivo PDF del trabajo realizado por el alumno para evaluarlo con inteligencia artificial.
                      </p>

                      <div className="border-2 border-dashed border-purple-200 rounded-[12px] p-6 text-center hover:border-purple-300 transition-colors bg-white/50">
                        <input
                          type="file"
                          id="ai-file-upload"
                          accept="image/*,application/pdf"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <label htmlFor="ai-file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                          <div className="p-3 bg-purple-50 rounded-full text-purple-600">
                            <Upload className="w-5 h-5" />
                          </div>
                          <span className="text-[12px] font-semibold text-purple-900">
                            {fileName ? fileName : "Haga clic para seleccionar archivo"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Formatos soportados: PNG, JPG, PDF (Máx. 10MB)
                          </span>
                        </label>
                      </div>

                      {previewUrl && (
                        <div className="flex justify-center border border-border rounded-[10px] p-2 bg-white max-h-40 overflow-hidden">
                          <img src={previewUrl} alt="Vista previa" className="object-contain max-h-36 rounded" />
                        </div>
                      )}

                      {fileName && (
                        <button
                          onClick={handleAnalizarConIA}
                          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-[10px] text-[12px] font-bold transition-all shadow-sm"
                        >
                          <Sparkles className="w-4 h-4" />
                          Analizar con Inteligencia Artificial
                        </button>
                      )}
                    </div>
                  )}

                  {analizandoIA && (
                    <div className="py-8 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                      <p className="text-[12px] font-bold text-purple-950">{progresoIA}</p>
                      <p className="text-[10px] text-muted-foreground text-center max-w-xs">
                        Gemini está leyendo las respuestas del alumno y contrastándolas con cada criterio de logro de tu rúbrica.
                      </p>
                    </div>
                  )}

                  {errorIA && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-[10px] text-[11px] flex items-start gap-2 animate-shake">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Error al evaluar</p>
                        <p>{errorIA}</p>
                      </div>
                    </div>
                  )}

                  {resultadoIA && (
                    <div className="space-y-4">
                      {resultadoIA.transcripcion && (
                        <div className="bg-white border border-border rounded-[10px] p-3">
                          <p className="text-[11px] font-bold text-purple-950 mb-1 flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-purple-600" />
                            Texto Transcrito
                          </p>
                          <p className="text-[11.5px] text-foreground bg-muted/30 p-2 rounded whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed border border-border/50">
                            {resultadoIA.transcripcion}
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-purple-950">Resultados por Criterio Sugeridos</p>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {rubrica.partes.flatMap(p => p.criterios).map(crit => {
                            const evalSugerida = resultadoIA.evaluaciones?.[crit.id]
                            if (!evalSugerida) return null
                            
                            const labelMap: Record<string, string> = {
                              logrado: "L",
                              casiLogrado: "CL",
                              parcialmenteLogrado: "PL",
                              porLograr: "PL*",
                            }
                            const textMap: Record<string, string> = {
                              logrado: "Logrado",
                              casiLogrado: "Casi logrado",
                              parcialmenteLogrado: "Parcialmente logrado",
                              porLograr: "Por lograr",
                            }
                            const colorMap: Record<string, string> = {
                              logrado: "bg-green-100 text-green-800 border-green-200",
                              casiLogrado: "bg-blue-100 text-blue-800 border-blue-200",
                              parcialmenteLogrado: "bg-amber-100 text-amber-800 border-amber-200",
                              porLograr: "bg-red-100 text-red-800 border-red-200",
                            }

                            const badgeColor = colorMap[evalSugerida.nivel] || "bg-muted text-muted-foreground"
                            const badgeLabel = labelMap[evalSugerida.nivel] || "?"
                            const badgeText = textMap[evalSugerida.nivel] || evalSugerida.nivel

                            return (
                              <div key={crit.id} className="border border-border rounded-[8px] p-2.5 bg-white">
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <p className="text-[11.5px] font-semibold text-foreground leading-tight">
                                    {crit.nombre}
                                  </p>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${badgeColor}`}>
                                    {badgeLabel} · {badgeText}
                                  </span>
                                </div>
                                <p className="text-[10.5px] text-muted-foreground italic leading-normal">
                                  "{evalSugerida.justificacion}"
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {resultadoIA.observaciones && (
                        <div className="bg-white border border-border rounded-[10px] p-3">
                          <p className="text-[11px] font-bold text-purple-950 mb-1 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 text-green-600" />
                            Retroalimentación Sugerida
                          </p>
                          <p className="text-[11.5px] text-foreground leading-relaxed">
                            {resultadoIA.observaciones}
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={aplicarEvaluacionIA}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-green-600 hover:bg-green-700 text-white rounded-[10px] text-[12px] font-bold transition-all shadow-sm"
                        >
                          <Check className="w-4 h-4" />
                          Aplicar a la rúbrica
                        </button>
                        <button
                          onClick={() => {
                            setResultadoIA(null)
                            setFileBase64(null)
                            setFileMime(null)
                            setFileName(null)
                            setPreviewUrl(null)
                          }}
                          className="py-2 px-3 border border-border hover:bg-muted text-muted-foreground rounded-[10px] text-[12px] font-medium transition-colors"
                        >
                          Descartar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Tabs por parte/etapa */}
                  {rubrica.partes.length > 1 && (
                    <div className="flex gap-1 px-3 pt-3 overflow-x-auto pb-1">
                      {rubrica.partes.map((parte, pi) => {
                        const criteriosEvaluados = parte.criterios.filter(c => alumnoObj.puntajes[c.id] !== undefined).length
                        return (
                          <button
                            key={parte.id}
                            onClick={() => setParteActivaIdx(pi)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-[8px] whitespace-nowrap transition-colors border ${
                              parteActivaIdx === pi
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border hover:bg-muted/60 text-muted-foreground"
                            }`}
                          >
                            {parte.nombre}
                            <span className={`text-[9px] px-1 py-0.5 rounded-full ${
                              parteActivaIdx === pi ? "bg-white/20" : "bg-muted"
                            }`}>
                              {criteriosEvaluados}/{parte.criterios.length}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Criterios de la parte activa */}
                  <div className="p-3 space-y-4">
                    {(rubrica.partes.length === 1 ? rubrica.partes : [rubrica.partes[parteActivaIdx]]).filter(Boolean).map(parte => (
                      <div key={parte.id}>
                        {rubrica.partes.length === 1 && (
                          <p className="text-[12px] font-bold text-muted-foreground mb-2 uppercase tracking-wide">
                            {parte.nombre}
                            {parte.oasVinculados.length > 0 && (
                              <span className="text-primary ml-1.5 normal-case font-medium">
                                {parte.oasVinculados.join(", ")}
                              </span>
                            )}
                          </p>
                        )}
                        <div className="space-y-2">
                          {parte.criterios.map(criterio => {
                            const nivelActual = alumnoObj.puntajes[criterio.id]
                            return (
                              <div key={criterio.id} className="border border-border rounded-[10px] p-3">
                                <p className="text-[13px] font-medium text-foreground mb-2">
                                  {criterio.nombre || "Criterio sin nombre"}
                                  {(criterio.ponderacion ?? 1) > 1 && (
                                    <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700">
                                      ×{criterio.ponderacion}
                                    </span>
                                  )}
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                  {NIVEL_OPCIONES.map(nivel => {
                                    const desc = criterio.niveles[
                                      nivel.valor === 4 ? "logrado" :
                                      nivel.valor === 3 ? "casiLogrado" :
                                      nivel.valor === 2 ? "parcialmenteLogrado" : "porLograr"
                                    ].descripcion
                                    const seleccionado = nivelActual === nivel.valor
                                    return (
                                      <button
                                        key={nivel.valor}
                                        title={`${nivel.titulo}: ${desc || "Sin descripción"}`}
                                        onClick={() => setPuntaje(grupoActivo, alumnoObj.estudianteId, criterio.id, nivel.valor)}
                                        disabled={bloqueada}
                                        className={`flex flex-col items-center gap-1 p-2 rounded-[8px] border-2 transition-all text-center disabled:cursor-not-allowed disabled:opacity-60 ${
                                          seleccionado
                                            ? nivel.color
                                            : "border-border hover:border-primary/30 hover:bg-muted/30"
                                        }`}
                                      >
                                        <span className="text-[11px] font-bold">{nivel.label}</span>
                                        <span className={`text-[10px] ${seleccionado ? "text-white/80" : "text-muted-foreground"}`}>
                                          {nivel.valor} pts
                                        </span>
                                        {desc && (
                                          <span className={`text-[9px] line-clamp-2 ${seleccionado ? "text-white/70" : "text-muted-foreground"}`}>
                                            {desc}
                                          </span>
                                        )}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Observaciones */}
                    <div>
                      <label className="text-[12px] font-semibold text-muted-foreground">Observaciones</label>
                      <textarea
                        value={alumnoObj.observaciones}
                        onChange={e => updateEstudiante(grupoActivo, alumnoObj.estudianteId, est => ({
                          ...est, observaciones: e.target.value
                        }))}
                        disabled={bloqueada}
                        placeholder="Observaciones del alumno (opcional)"
                        rows={2}
                        className="mt-1 w-full text-[12px] border border-border rounded-[10px] px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-muted/40"
                      />
                    </div>

                    {/* Navegación anterior / siguiente parte */}
                    {rubrica.partes.length > 1 && (
                      <div className="flex justify-between pt-1">
                        <button
                          onClick={() => setParteActivaIdx(i => Math.max(0, i - 1))}
                          disabled={parteActivaIdx === 0}
                          className="text-[11px] px-3 py-1.5 rounded-[8px] border border-border hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          ← Parte anterior
                        </button>
                        <button
                          onClick={() => setParteActivaIdx(i => Math.min(rubrica.partes.length - 1, i + 1))}
                          disabled={parteActivaIdx === rubrica.partes.length - 1}
                          className="text-[11px] px-3 py-1.5 rounded-[8px] border border-border hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          Siguiente parte →
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Panel derecho: scoreboard del grupo (oculto en móvil) */}
        <div className="hidden lg:block w-40 flex-shrink-0 overflow-y-auto border border-border rounded-[14px] bg-card">
          <div className="sticky top-0 bg-card border-b border-border px-3 py-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Notas</p>
          </div>
          <div className="p-1.5 space-y-0.5">
            {todosLosAlumnosEnGrupos.map(est => {
              const puntaje = calcularPuntajeEstudiante(est.puntajes, rubrica.partes)
              const nota = calcularNota(puntaje, rubrica.puntajeMaximo, exigenciaEstudiante(est))
              const aprobado = nota >= 4.0
              return (
                <div
                  key={est.estudianteId}
                  className="flex items-center justify-between px-2 py-1.5 rounded-[8px] text-[12px]"
                >
                  <span className="text-muted-foreground truncate flex-1 mr-1">{est.nombre.split(" ")[0]}</span>
                  <span className={`font-bold tabular-nums ${aprobado ? "text-green-600" : "text-red-500"}`}>
                    {nota.toFixed(1)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
