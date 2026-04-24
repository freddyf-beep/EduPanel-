"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Download, Users, CheckCircle2, AlertCircle, Loader2, Plus, X
} from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
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

interface Props {
  rubricaId: string
}

const NIVEL_OPCIONES = [
  { valor: 4, label: "L",   titulo: "Logrado",               color: "bg-green-500 text-white border-green-500" },
  { valor: 3, label: "CL",  titulo: "Casi logrado",          color: "bg-blue-500 text-white border-blue-500" },
  { valor: 2, label: "PL",  titulo: "Parcialmente logrado",  color: "bg-amber-500 text-white border-amber-500" },
  { valor: 1, label: "PL*", titulo: "Por lograr",            color: "bg-red-500 text-white border-red-500" },
] as const

export function EvaluacionView({ rubricaId }: Props) {
  const router = useRouter()
  const { asignatura } = useActiveSubject()

  const [rubrica, setRubrica] = useState<RubricaTemplate | null>(null)
  const [evaluacion, setEvaluacion] = useState<EvaluacionRubrica | null>(null)
  const [todosEstudiantes, setTodosEstudiantes] = useState<Estudiante[]>([])
  const [grupoActivo, setGrupoActivo] = useState(0)
  const [alumnoActivo, setAlumnoActivo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [guardandoExport, setGuardandoExport] = useState(false)
  const [exportandoAlumno, setExportandoAlumno] = useState<string | null>(null)
  const [panelAlumno, setPanelAlumno] = useState(false)
  const [infoColegio, setInfoColegio] = useState<InfoColegio | null>(null)
  const [error, setError] = useState("")
  const [parteActivaIdx, setParteActivaIdx] = useState(0)
  const ignoreFirstSave = useRef(true)

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
    const t = setTimeout(async () => {
      try { await guardarEvaluacion(evaluacion) } catch (e) { console.error(e) }
    }, 2500)
    return () => clearTimeout(t)
  }, [evaluacion])

  // Sincronizar alumnos que se agregaron al curso después de crear la evaluación
  function sincronizarAlumnos(ev: EvaluacionRubrica, alumnos: Estudiante[]): EvaluacionRubrica {
    const todosEnGrupos = new Set(ev.grupos.flatMap(g => g.estudiantes.map(e => e.estudianteId)))
    const sinAsignar = alumnos.filter(a => !todosEnGrupos.has(a.id))
    if (sinAsignar.length === 0) return ev
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
      grupos: ev.grupos.map((g, i) =>
        i === 0 ? { ...g, estudiantes: [...g.estudiantes, ...nuevosEst] } : g
      ),
    }
  }

  const updateEvaluacion = (fn: (ev: EvaluacionRubrica) => EvaluacionRubrica) => {
    setEvaluacion(prev => prev ? fn(prev) : prev)
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
      const nota = calcularNota(puntaje, rubr.puntajeMaximo)
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

  const handleExportarGrupo = async () => {
    if (!rubrica || !evaluacion) return
    setGuardandoExport(true)
    const profesorNombre = auth?.currentUser?.displayName ?? ""
    const colegio = infoColegio?.nombre ?? ""
    const logoBase64 = infoColegio?.logoBase64
    try {
      await guardarEvaluacion(evaluacion)
      const res = await fetch("/api/export-rubrica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubrica, evaluacion, modo: "grupo", profesorNombre, colegio, logoBase64 }),
      })
      if (!res.ok) throw new Error("Error al generar el Word")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `rubrica_${rubrica.nombre}_${rubrica.curso}_grupos.docx`.replace(/\s+/g, "_")
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al exportar")
    } finally {
      setGuardandoExport(false)
    }
  }

  const handleExportarAlumno = async (estudianteId: string, nombreAlumno: string) => {
    if (!rubrica || !evaluacion) return
    setExportandoAlumno(estudianteId)
    const profesorNombre = auth?.currentUser?.displayName ?? ""
    const colegio = infoColegio?.nombre ?? ""
    const logoBase64 = infoColegio?.logoBase64
    try {
      const res = await fetch("/api/export-rubrica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubrica, evaluacion, modo: "alumno", estudianteId, profesorNombre, colegio, logoBase64 }),
      })
      if (!res.ok) throw new Error("Error al generar el Word")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `rubrica_${nombreAlumno.replace(/\s+/g, "_")}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al exportar")
    } finally {
      setExportandoAlumno(null)
    }
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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-0">
      {/* Header fijo */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <button
          onClick={() => router.push(buildUrl("/rubricas", withAsignatura({}, asignatura)))}
          className="p-2 rounded-[10px] hover:bg-muted/60 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-extrabold text-foreground truncate">{rubrica.nombre}</h1>
          <p className="text-[12px] text-muted-foreground">{rubrica.curso} · {rubrica.puntajeMaximo} pts máx</p>
        </div>
        <button
          onClick={handleExportarGrupo}
          disabled={guardandoExport}
          title="Descargar un Word con todos los grupos"
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors disabled:opacity-50"
        >
          {guardandoExport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Por grupo
        </button>
        <button
          onClick={() => setPanelAlumno(p => !p)}
          className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-[10px] transition-colors ${
            panelAlumno
              ? "bg-amber-100 text-amber-800 border border-amber-300"
              : "border border-border hover:bg-muted/60"
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          Por alumno
        </button>
        <button
          onClick={() => router.push(buildUrl("/rubricas", withAsignatura({ view: "resultados", rubricaId }, asignatura)))}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium bg-primary text-primary-foreground rounded-[10px] hover:opacity-90"
        >
          Ver resultados
        </button>
      </div>

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
                  title={grupo.estudiantes.length > 0 ? `Eliminar "${grupo.nombre}" y mover sus alumnos al Grupo 1` : `Eliminar "${grupo.nombre}"`}
                  className={`absolute right-1 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full opacity-0 group-hover/tab:opacity-100 transition-opacity ${
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
          onClick={agregarGrupo}
          title="Agregar nuevo grupo"
          className="flex items-center gap-1 px-2.5 py-2 text-[12px] font-medium rounded-[10px] border border-dashed border-border hover:border-primary/50 hover:text-primary text-muted-foreground whitespace-nowrap transition-colors flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Grupo
        </button>
      </div>

      {/* Panel "Exportar por alumno" */}
      {panelAlumno && (
        <div className="flex-shrink-0 overflow-y-auto border border-amber-200 rounded-[14px] bg-amber-50/60 mb-3 max-h-72">
          <div className="sticky top-0 bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-bold text-amber-900">Exportar por alumno</p>
              <p className="text-[11px] text-amber-700">Descarga una rúbrica individual para cada alumno.</p>
            </div>
            <button onClick={() => setPanelAlumno(false)} className="p-1 rounded hover:bg-amber-100 text-amber-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-3 space-y-1">
            {evaluacion.grupos.flatMap(grupo =>
              grupo.estudiantes.map(est => {
                const puntaje = calcularPuntajeEstudiante(est.puntajes, rubrica.partes)
                const nota = calcularNota(puntaje, rubrica.puntajeMaximo)
                const descargando = exportandoAlumno === est.estudianteId
                return (
                  <div
                    key={est.estudianteId}
                    className="flex items-center gap-3 px-3 py-2 bg-white rounded-[10px] border border-amber-100"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground truncate">
                        {est.nombre}
                        {est.hasPie && <span className="ml-1.5 text-[9px] bg-blue-100 text-blue-700 rounded px-1 font-medium">PIE</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{grupo.nombre} · {puntaje}/{rubrica.puntajeMaximo} pts</p>
                    </div>
                    <span className={`text-[13px] font-bold tabular-nums w-8 text-right ${nota >= 4.0 ? "text-green-600" : "text-red-500"}`}>
                      {nota.toFixed(1)}
                    </span>
                    <button
                      onClick={() => handleExportarAlumno(est.estudianteId, est.nombre)}
                      disabled={descargando}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-[8px] transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {descargando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                      Descargar
                    </button>
                  </div>
                )
              })
            )}
            {evaluacion.grupos.every(g => g.estudiantes.length === 0) && (
              <p className="text-[12px] text-muted-foreground text-center py-4">No hay alumnos en ningún grupo.</p>
            )}
          </div>
        </div>
      )}

      {/* Layout principal: alumnos | criterios | scoreboard */}
      <div className="flex gap-3 flex-1 min-h-0 overflow-hidden">

        {/* Panel izquierdo: lista de alumnos del grupo */}
        <div className="w-44 flex-shrink-0 overflow-y-auto border border-border rounded-[14px] bg-card">
          <div className="sticky top-0 bg-card border-b border-border px-3 py-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              {grupoActualObj?.nombre} ({grupoActualObj?.estudiantes.length})
            </p>
          </div>
          <div className="p-1.5 space-y-0.5">
            {grupoActualObj?.estudiantes.length === 0 && (
            <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
              Grupo vacío. Mueve alumnos desde otros grupos o agrega estudiantes en Mi Perfil.
            </div>
          )}
          {grupoActualObj?.estudiantes.map(est => {
              const puntaje = calcularPuntajeEstudiante(est.puntajes, rubrica.partes)
              const nota = calcularNota(puntaje, rubrica.puntajeMaximo)
              return (
                <button
                  key={est.estudianteId}
                  onClick={() => setAlumnoActivo(est.estudianteId)}
                  className={`w-full text-left px-2.5 py-2 rounded-[8px] transition-colors ${
                    alumnoActivo === est.estudianteId
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted/50"
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
              <div className="pt-2 px-1">
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
                        className="text-[10px] px-2 py-1 border border-border rounded-[6px] hover:bg-muted/60 transition-colors"
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
        <div className="flex-1 overflow-y-auto border border-border rounded-[14px] bg-card">
          {!alumnoObj ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-[13px]">
              Selecciona un alumno
            </div>
          ) : (
            <div>
              {/* Header del alumno */}
              <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-bold text-foreground">{alumnoObj.nombre}</p>
                  {alumnoObj.hasPie && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-medium">PIE</span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[20px] font-extrabold text-foreground">
                    {calcularNota(calcularPuntajeEstudiante(alumnoObj.puntajes, rubrica.partes), rubrica.puntajeMaximo).toFixed(1)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {calcularPuntajeEstudiante(alumnoObj.puntajes, rubrica.partes)}/{rubrica.puntajeMaximo} pts
                  </p>
                </div>
              </div>

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
                            <div className="grid grid-cols-4 gap-1.5">
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
                                    className={`flex flex-col items-center gap-1 p-2 rounded-[8px] border-2 transition-all text-center ${
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
                    placeholder="Observaciones del alumno (opcional)"
                    rows={2}
                    className="mt-1 w-full text-[12px] border border-border rounded-[10px] px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
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
            </div>
          )}
        </div>

        {/* Panel derecho: scoreboard del grupo */}
        <div className="w-40 flex-shrink-0 overflow-y-auto border border-border rounded-[14px] bg-card">
          <div className="sticky top-0 bg-card border-b border-border px-3 py-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Notas</p>
          </div>
          <div className="p-1.5 space-y-0.5">
            {todosLosAlumnosEnGrupos.map(est => {
              const puntaje = calcularPuntajeEstudiante(est.puntajes, rubrica.partes)
              const nota = calcularNota(puntaje, rubrica.puntajeMaximo)
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
