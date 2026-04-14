"use client"

import { useEffect, useMemo, useCallback, useState, useRef } from "react"
import { BookOpen, Bookmark, Check, ClipboardList, Loader2, ShieldCheck, UserRound, Wand2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { cargarHorarioSemanal, ClaseHorario } from "@/lib/horario"
import { Estudiante, cargarEstudiantes } from "@/lib/estudiantes"
import { cargarLibroClases, guardarLibroClases, cargarCronograma, cargarVerUnidadesCurso } from "@/lib/curriculo"
import type { BloqueLibroClase, EstadoAsistencia, ActividadDocente } from "@/lib/curriculo"
import { useActiveSubject } from "@/hooks/use-active-subject"

const ESTADOS: { key: EstadoAsistencia; label: string; cls: string }[] = [
  { key: "presente", label: "P", cls: "bg-status-green-bg text-status-green-text" },
  { key: "ausente", label: "A", cls: "bg-status-red-bg text-status-red-text" },
  { key: "atraso", label: "T", cls: "bg-status-amber-bg text-status-amber-text" },
  { key: "retirado", label: "R", cls: "bg-status-slate-bg text-status-slate-text" },
]

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}


function weekNumber(d: Date): number {
  const onejan = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
}

function minutesFromHHMM(value: string) {
  const [h, m] = value.split(":").map(Number)
  return h * 60 + m
}

function diaNombre(fecha: string) {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CL", { weekday: "long" })
    .replace(/^./, (m) => m.toUpperCase())
}

function buildBloques(curso: string, fecha: string, horarioBase: ClaseHorario[], estudiantes: Estudiante[]): BloqueLibroClase[] {
  const dia = diaNombre(fecha)
  const bloquesHorario = horarioBase.filter((b) => b.resumen === curso && b.dia === dia)

  return (bloquesHorario.length ? bloquesHorario : [{ uid: `${curso}-${fecha}-1`, horaInicio: "08:30", horaFin: "09:15", resumen: curso, dia, color: "var(--primary)", tipo: "clase" as const }]).map((bloque, index) => ({
    id: bloque.uid || `${curso}-${fecha}-${index+1}`,
    bloque: `Bloque ${index + 1}`,
    horaInicio: bloque.horaInicio,
    horaFin: bloque.horaFin,
    objetivo: "",
    actividad: "",
    firmado: false,
    asistencia: estudiantes.map((est) => ({
      id: est.id,
      nombre: est.nombre,
      estado: "presente" as EstadoAsistencia,
    })),
  }))
}

export function LibroClasesContent() {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const [curso, setCurso] = useState("")
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [fecha, setFecha] = useState(toDateInput(new Date()))
  const [bloques, setBloques] = useState<BloqueLibroClase[]>([])
  const [estudiantesCurso, setEstudiantesCurso] = useState<Estudiante[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle"|"saving_silent"|"saved"|"error">("idle")

  useEffect(() => {
    cargarHorarioSemanal().then(hData => {
      const unique = Array.from(new Set(hData.map(h => h.resumen)))
      setCursosDisponibles(unique)
      if (unique.length > 0) setCurso(unique[0])
    })
  }, [])

  useEffect(() => {
    if (!curso) return
    setLoading(true)
    Promise.all([
      cargarLibroClases(ASIGNATURA, curso, fecha),
      cargarHorarioSemanal(),
      cargarEstudiantes(curso)
    ])
      .then(([data, hData, est]) => {
        setEstudiantesCurso(est)
        setBloques(data?.bloques || buildBloques(curso, fecha, hData || [], est))
      })
      .finally(() => {
        setLoading(false)
        ignoreNextSaveRef.current = true;
      })
  }, [curso, fecha, ASIGNATURA])

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
  }, [bloques])

  const pieMap = useMemo(() => {
    const m = new Map<string, Estudiante>()
    estudiantesCurso.forEach(e => m.set(e.id, e))
    return m
  }, [estudiantesCurso])

  const resumen = useMemo(() => {
    let presentes = 0, ausentes = 0, atrasos = 0, retirados = 0
    for (const bloque of bloques) {
      for (const a of bloque.asistencia) {
        if (a.estado === "presente") presentes++
        if (a.estado === "ausente") ausentes++
        if (a.estado === "atraso") atrasos++
        if (a.estado === "retirado") retirados++
      }
    }
    return { presentes, ausentes, atrasos, retirados }
  }, [bloques])

  const handleGuardar = async (isAutoSave = false) => {
    if (!isAutoSave) setSaving(true)
    try {
      await guardarLibroClases(ASIGNATURA, curso, fecha, bloques)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2500)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 2500)
    } finally {
      if (!isAutoSave) setSaving(false)
    }
  }

  // Atajo de teclado Ctrl+S / Cmd+S para guardar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        handleGuardar(false)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [curso, fecha, bloques])

  const setBulkAttendance = (bloqueId: string, estado: EstadoAsistencia) => {
    setBloques((prev) => prev.map((bloque) => bloque.id !== bloqueId ? bloque : {
      ...bloque,
      asistencia: bloque.asistencia.map((est) => ({ ...est, estado }))
    }))
  }

  const toggleAsistencia = (bloqueId: string, estudianteId: string) => {
    setBloques((prev) => prev.map((bloque) => bloque.id !== bloqueId ? bloque : {
      ...bloque,
      asistencia: bloque.asistencia.map((est) => {
        if (est.id !== estudianteId) return est
        const idx = ESTADOS.findIndex((e) => e.key === est.estado)
        const next = ESTADOS[(idx + 1) % ESTADOS.length]
        return { ...est, estado: next.key }
      })
    }))
  }

  const copiarBloqueAnterior = (bloqueIndex: number) => {
    if (bloqueIndex === 0) return
    setBloques((prev) => prev.map((bloque, i) => {
      if (i !== bloqueIndex) return bloque
      return { ...bloque, asistencia: prev[bloqueIndex - 1].asistencia.map((a) => ({ ...a })) }
    }))
  }

  const autocompletar = async (bloqueId: string) => {
    const [crono, verUnidades] = await Promise.all([
      cargarCronograma(ASIGNATURA, curso),
      cargarVerUnidadesCurso(ASIGNATURA, curso),
    ])
    const fechaDate = new Date(`${fecha}T12:00:00`)
    const semana = weekNumber(fechaDate)
    const dia = diaNombre(fecha)

    setBloques((prev) => prev.map((bloque) => {
      if (bloque.id !== bloqueId) return bloque
      const planned = (crono?.actividades || [])
        .filter((item) => item.semana === semana && item.dia === dia)
        .sort((a, b) => Math.abs(minutesFromHHMM(a.hora) - minutesFromHHMM(bloque.horaInicio)) - Math.abs(minutesFromHHMM(b.hora) - minutesFromHHMM(bloque.horaInicio)))[0]

      const unidadKey = planned?.unidad?.toLowerCase().replace(/\s+/g, "_")
      const unidad = unidadKey ? verUnidades[unidadKey] : undefined
      const oaSeleccionado = unidad?.oas?.find((oa) => oa.seleccionado)
      const actividadPlanificada = unidad?.actividades?.find((act) => act.fecha === fecha) || unidad?.actividades?.[0]

      return {
        ...bloque,
        objetivo: bloque.objetivo || oaSeleccionado?.descripcion || planned?.nombre || "Desarrollar y ejercitar los objetivos planificados para el bloque.",
        actividad: bloque.actividad || actividadPlanificada?.nombre || planned?.nombre || "Inicio, desarrollo y cierre registrados desde EduPanel para su trazabilidad pedagógica.",
      }
    }))
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold">Libro de clases digital</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Asistencia, leccionario y firma por bloque en un solo flujo.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:justify-end">
          {saveStatus === "saving_silent" && (
            <span className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground animate-pulse">
              Guardando...
            </span>
          )}
          {saveStatus === "saved" && <span className="flex items-center gap-1.5 text-[13px] font-semibold text-status-green-text"><Check className="w-4 h-4" /> Guardado</span>}
          {saveStatus === "error" && <span className="text-[13px] font-semibold text-status-red-text">Error al guardar</span>}
          <button onClick={() => handleGuardar(false)} disabled={saving || saveStatus === "saving_silent"} className="flex items-center gap-2 rounded-[10px] bg-primary text-white px-5 py-2.5 text-[13px] font-bold hover:bg-pink-dark disabled:opacity-60">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : <><Bookmark className="w-4 h-4" /> Guardar libro</>}
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[{label:"Presentes", value:resumen.presentes, cls:"bg-status-green-bg text-status-green-text"},{label:"Ausentes", value:resumen.ausentes, cls:"bg-status-red-bg text-status-red-text"},{label:"Atrasos", value:resumen.atrasos, cls:"bg-status-amber-bg text-status-amber-text"},{label:"Retirados", value:resumen.retirados, cls:"bg-status-slate-bg text-status-slate-text"}].map((item) => (
          <div key={item.label} className="bg-card border border-border rounded-[14px] p-4 flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl grid place-items-center font-extrabold", item.cls)}>{item.value}</div>
            <div><div className="text-[11px] text-muted-foreground">{item.label}</div><div className="text-[14px] font-bold">{curso}</div></div>
          </div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-4 rounded-[14px] border border-border bg-card p-5">
        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          <label className="text-[11px] font-semibold text-muted-foreground">Curso</label>
          <select value={curso} onChange={(e) => setCurso(e.target.value)} className="w-full rounded-[10px] border border-border bg-background px-3.5 py-2.5 text-[13px] font-semibold sm:min-w-[180px]">
            {cursosDisponibles.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          <label className="text-[11px] font-semibold text-muted-foreground">Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-[10px] border border-border px-3.5 py-2.5 text-[13px] font-semibold bg-background" />
        </div>
        <div className="text-[13px] text-muted-foreground font-medium">{diaNombre(fecha)} · {ASIGNATURA}</div>
      </div>

      {loading || !curso ? (
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Cargando libro…</div>
      ) : (
        <div className="flex flex-col gap-5">
          {bloques.map((bloque, index) => (
            <div key={bloque.id} className="bg-card border border-border rounded-[16px] overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-background flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <h2 className="text-[15px] font-extrabold">{bloque.bloque} · {bloque.horaInicio} – {bloque.horaFin}</h2>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Registro oficial de asistencia y leccionario del bloque.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => copiarBloqueAnterior(index)} className="rounded-[10px] border border-border px-3 py-2 text-[12px] font-semibold hover:bg-background">Copiar asistencia anterior</button>
                  <button onClick={() => autocompletar(bloque.id)} className="rounded-[10px] border border-primary text-primary px-3 py-2 text-[12px] font-semibold hover:bg-pink-light flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" /> Autocompletar</button>
                </div>
              </div>

              <div className="grid lg:grid-cols-[1.1fr_1fr] gap-0">
                <div className="p-5 border-b lg:border-b-0 lg:border-r border-border">
                  <div className="flex items-center gap-2 mb-3"><ClipboardList className="w-4 h-4 text-primary" /><h3 className="text-[13px] font-bold">Leccionario</h3></div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Objetivo</label>
                  <textarea value={bloque.objetivo} onChange={(e) => setBloques((prev) => prev.map((b) => b.id === bloque.id ? { ...b, objetivo: e.target.value } : b))} rows={2} className="w-full rounded-[10px] border border-border px-3 py-2.5 text-[13px] mb-3 outline-none focus:border-primary" />
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Actividad</label>
                  <textarea value={bloque.actividad} onChange={(e) => setBloques((prev) => prev.map((b) => b.id === bloque.id ? { ...b, actividad: e.target.value } : b))} rows={4} className="w-full rounded-[10px] border border-border px-3 py-2.5 text-[13px] outline-none focus:border-primary" />
                  <button onClick={() => setBloques((prev) => prev.map((b) => b.id === bloque.id ? { ...b, firmado: !b.firmado } : b))} className={cn("mt-4 flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-bold", bloque.firmado ? "bg-status-green-bg text-status-green-text border border-status-green-border" : "bg-card border border-primary text-primary")}>
                    <ShieldCheck className="w-4 h-4" /> {bloque.firmado ? "Firmado internamente" : "Marcar como firmado"}
                  </button>
                </div>

                <div className="p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2"><UserRound className="w-4 h-4 text-primary" /><h3 className="text-[13px] font-bold">Asistencia</h3></div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setBulkAttendance(bloque.id, "presente")}
                        className="rounded-[8px] border border-green-300 bg-status-green-bg px-2.5 py-1 text-[11px] font-bold text-status-green-text transition-colors hover:brightness-95"
                        title="Marcar todos presentes"
                      >Todos P</button>
                      <button
                        onClick={() => setBulkAttendance(bloque.id, "ausente")}
                        className="rounded-[8px] border border-red-300 bg-status-red-bg px-2.5 py-1 text-[11px] font-bold text-status-red-text transition-colors hover:brightness-95"
                        title="Marcar todos ausentes"
                      >Todos A</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {bloque.asistencia.map((est) => {
                      const state = ESTADOS.find((item) => item.key === est.estado)!
                      const isPie = pieMap.get(est.id)?.pie
                      return (
                        <button key={est.id} onClick={() => toggleAsistencia(bloque.id, est.id)} className="w-full rounded-[12px] border border-border px-3 py-2.5 flex items-center justify-between hover:bg-background transition-colors text-left">
                          <span className="text-[13px] font-medium flex items-center gap-1.5">
                            {est.nombre}
                            {isPie && (
                              <span className="rounded bg-status-pie-bg px-1.5 py-0.5 text-[9px] font-bold text-status-pie-text border border-status-pie-border">PIE</span>
                            )}
                          </span>
                          <span className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold flex-shrink-0", state.cls)}>{state.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 rounded-[14px] border border-border bg-card p-4 text-[12px] text-muted-foreground flex items-start gap-3">
        <BookOpen className="w-4 h-4 text-primary mt-0.5" />
        <span>Este módulo deja trazabilidad por bloque. La firma aquí es interna de la plataforma y sirve para flujo pedagógico; no reemplaza validación legal externa.</span>
      </div>
    </div>
  )
}
