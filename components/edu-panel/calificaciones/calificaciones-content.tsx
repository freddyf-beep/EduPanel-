"use client"

import { useState, useEffect, useRef } from "react"
import { Upload, Download, Plus, Bookmark, Info, Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { db } from "@/lib/firebase"
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore"

import { cargarHorarioSemanal } from "@/lib/horario"

const ASIGNATURA = "Música"
import { cargarEstudiantes } from "@/lib/estudiantes"

interface Estudiante {
  id: any
  name: string
  notas: Record<string, string>
  hasPie: boolean
}

interface Evaluacion {
  id: string
  label: string
}

function buildId(curso: string) {
  return ("calif_" + ASIGNATURA + "_" + curso)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

export function CalificacionesContent() {
  const [curso, setCurso]                   = useState("")
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [activeTab, setActiveTab]           = useState<"sumativas"|"formativas">("sumativas")
  const [estudiantes, setEstudiantes]       = useState<Estudiante[]>([])
  const [evaluaciones, setEvaluaciones]     = useState<Evaluacion[]>([{ id: "n1", label: "N1" }])
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [saveStatus, setSaveStatus]         = useState<"idle"|"saving_silent"|"saved"|"error">("idle")
  const [showAddEval, setShowAddEval]       = useState(false)
  const [newEvalLabel, setNewEvalLabel]     = useState("")

  // Cargar cursos disponibles
  useEffect(() => {
    cargarHorarioSemanal().then(hData => {
      const unique = Array.from(new Set(hData.map(h => h.resumen)))
      setCursosDisponibles(unique)
      if (unique.length > 0) setCurso(unique[0])
    })
  }, [])

  // Cargar desde Firestore cuando cambia el curso
  useEffect(() => {
    if (!curso) return
    setLoading(true)
    const id = buildId(curso)
    Promise.all([
      getDoc(doc(db, "calificaciones", id)),
      cargarEstudiantes(curso)
    ]).then(([snap, estDocs]) => {
      if (snap.exists()) {
        const data = snap.data()
        const notasEstudiantes = data.estudiantes || []
        const merged: Estudiante[] = estDocs.map((est, i) => {
          const old = notasEstudiantes.find((o: any) => o.id === est.id || o.name === est.nombre)
          return {
            id: est.id,
            name: est.nombre,
            notas: old ? old.notas : { n1: "" },
            hasPie: old ? old.hasPie : [1, 5, 9].includes(i),
          }
        })
        setEstudiantes(merged)
        setEvaluaciones(data.evaluaciones || [{ id: "n1", label: "N1" }])
      } else {
        const initial: Estudiante[] = estDocs.map((est, i) => ({
          id: est.id,
          name: est.nombre,
          notas: { n1: "" },
          hasPie: [1, 5, 9].includes(i),
        }))
        setEstudiantes(initial)
        setEvaluaciones([{ id: "n1", label: "N1" }])
      }
    }).catch(e => {
        console.error(e)
    }).finally(() => {
      setLoading(false)
      ignoreNextSaveRef.current = true;
    })
  }, [curso])

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
  }, [estudiantes, evaluaciones])

  const handleGuardar = async (isAutoSave = false) => {
    if (!isAutoSave) setSaving(true)
    try {
      const id = buildId(curso)
      await setDoc(doc(db, "calificaciones", id), {
        asignatura: ASIGNATURA, curso, estudiantes, evaluaciones,
        updatedAt: serverTimestamp()
      })
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } finally {
      if (!isAutoSave) setSaving(false)
    }
  }

  const updateNota = (estudianteId: any, evalId: string, value: string) => {
    // Solo permite números del 1.0 al 7.0
    if (value !== "" && (isNaN(parseFloat(value)) || parseFloat(value) < 1 || parseFloat(value) > 7)) return
    setEstudiantes(prev => prev.map(e =>
      e.id === estudianteId ? { ...e, notas: { ...e.notas, [evalId]: value } } : e
    ))
  }

  const agregarEvaluacion = () => {
    if (!newEvalLabel.trim()) return
    const id = "eval_" + Date.now()
    setEvaluaciones(prev => [...prev, { id, label: newEvalLabel.trim() }])
    setEstudiantes(prev => prev.map(e => ({ ...e, notas: { ...e.notas, [id]: "" } })))
    setNewEvalLabel("")
    setShowAddEval(false)
  }

  const calcPromedio = (notas: Record<string, string>) => {
    const vals = Object.values(notas).map(v => parseFloat(v)).filter(v => !isNaN(v))
    if (vals.length === 0) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  const SELECT_STYLE = "min-w-[180px] appearance-none rounded-[10px] border-[1.5px] border-primary bg-card px-3.5 py-2.5 pr-9 text-[13px] font-semibold text-foreground outline-none focus:shadow-[0_0_0_3px_rgba(240,62,110,0.15)] transition-shadow cursor-pointer"
  const SELECT_ARROW = { backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' viewBox='0 0 24 24' stroke='%23F03E6E' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")", backgroundRepeat:"no-repeat", backgroundPosition:"right 10px center" }

  const aprobados   = estudiantes.filter(e => { const p = calcPromedio(e.notas); return p !== null && p >= 4.0 }).length
  const reprobados  = estudiantes.filter(e => { const p = calcPromedio(e.notas); return p !== null && p < 4.0 }).length
  const sinNotas    = estudiantes.filter(e => calcPromedio(e.notas) === null).length

  return (
    <div>
      <div className="flex items-center justify-between mb-7 flex-wrap gap-3 animate-fade-up">
        <h1 className="text-[22px] font-extrabold">Calificaciones</h1>
        <div className="flex items-center gap-2.5">
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
          {saveStatus === "error" && <span className="text-[13px] font-semibold text-red-500">Error al guardar</span>}
          <button
            onClick={() => handleGuardar(false)}
            disabled={saving || saveStatus === "saving_silent"}
            className="flex items-center gap-2 rounded-[10px] bg-primary text-primary-foreground px-5 py-2.5 text-[13px] font-bold hover:bg-[#d6335e] transition-colors disabled:opacity-60"
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : <><Bookmark className="h-4 w-4" /> Guardar</>}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-5 flex flex-wrap items-end gap-4 animate-fade-up">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground">Asignatura</label>
          <select disabled className={cn(SELECT_STYLE, "opacity-70")} style={SELECT_ARROW}>
            <option>Música</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground">Curso</label>
          <select value={curso} onChange={e => setCurso(e.target.value)} className={SELECT_STYLE} style={SELECT_ARROW}>
            {cursosDisponibles.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground">Período</label>
          <select className={SELECT_STYLE} style={SELECT_ARROW}>
            <option>Primer Semestre 2026</option>
            <option>Segundo Semestre 2026</option>
            <option>Anual</option>
          </select>
        </div>
      </div>

      {/* Resumen rápido */}
      {!loading && (
        <div className="mb-5 grid grid-cols-3 gap-3 animate-fade-up">
          <div className="bg-card border border-border rounded-[12px] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 grid place-items-center">
              <span className="text-green-600 font-bold text-sm">{aprobados}</span>
            </div>
            <div><div className="text-[11px] text-muted-foreground">Aprobados</div><div className="text-[13px] font-bold">{estudiantes.length > 0 ? Math.round(aprobados/estudiantes.length*100) : 0}%</div></div>
          </div>
          <div className="bg-card border border-border rounded-[12px] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 grid place-items-center">
              <span className="text-red-500 font-bold text-sm">{reprobados}</span>
            </div>
            <div><div className="text-[11px] text-muted-foreground">Reprobados</div><div className="text-[13px] font-bold">{estudiantes.length > 0 ? Math.round(reprobados/estudiantes.length*100) : 0}%</div></div>
          </div>
          <div className="bg-card border border-border rounded-[12px] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 grid place-items-center">
              <span className="text-amber-600 font-bold text-sm">{sinNotas}</span>
            </div>
            <div><div className="text-[11px] text-muted-foreground">Sin notas</div><div className="text-[13px] font-bold">{estudiantes.length} total</div></div>
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <div className="mb-5 flex flex-wrap gap-2.5 animate-fade-up">
        <button className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-primary bg-card px-4 py-2.5 text-[13px] font-semibold text-primary transition-all hover:bg-primary hover:text-primary-foreground">
          <Download className="h-[15px] w-[15px]" /> Descargar resumen
        </button>
        <button
          onClick={() => setShowAddEval(true)}
          className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-primary bg-card px-4 py-2.5 text-[13px] font-semibold text-primary transition-all hover:bg-primary hover:text-primary-foreground"
        >
          <Plus className="h-[15px] w-[15px]" /> Agregar evaluación
        </button>
      </div>

      {/* Banner info */}
      <div className="mb-6 flex items-start gap-3 rounded-[10px] border-l-4 border-blue-400 bg-blue-50 p-4 text-[13px] leading-snug text-blue-900 animate-fade-up">
        <Info className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-blue-500" />
        <span>Haz clic en cualquier celda de nota para editarla. Notas entre 1.0 y 7.0. Presiona <strong>Tab</strong> para avanzar al siguiente estudiante.</span>
      </div>

      {/* Tabs */}
      <div className="mb-0 flex border-b-2 border-border animate-fade-up">
        {(["sumativas","formativas"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("-mb-[2px] border-b-2 px-5 py-2.5 text-[13px] font-semibold transition-colors capitalize",
              activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            Evaluaciones {tab}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {loading || !curso ? (
        <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center border border-t-0 border-border rounded-b-[14px]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[14px]">Cargando calificaciones {curso ? `de ${curso}` : ""}…</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-b-2xl border border-t-0 border-border bg-card animate-fade-up">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-background">
                <th className="whitespace-nowrap border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground w-8">N°</th>
                <th className="whitespace-nowrap border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground min-w-[200px]">Estudiante</th>
                {evaluaciones.map(ev => (
                  <th key={ev.id} className="whitespace-nowrap border-b border-border px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
                      {ev.label}
                    </span>
                  </th>
                ))}
                <th className="whitespace-nowrap border-b border-border px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-muted-foreground">Promedio</th>
              </tr>
            </thead>
            <tbody>
              {estudiantes.map((estudiante) => {
                const prom = calcPromedio(estudiante.notas)
                return (
                  <tr key={estudiante.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-[#fafbff]">
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">{estudiante.id}</td>
                    <td className="px-4 py-3 text-[13px]">
                      {estudiante.name}
                      {estudiante.hasPie && (
                        <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-amber-800">PIE</span>
                      )}
                    </td>
                    {evaluaciones.map(ev => (
                      <td key={ev.id} className="px-2 py-2 text-center">
                        <input
                          type="number"
                          min="1" max="7" step="0.1"
                          value={estudiante.notas[ev.id] || ""}
                          onChange={e => updateNota(estudiante.id, ev.id, e.target.value)}
                          className={cn(
                            "w-16 rounded-lg border-[1.5px] px-2 py-1.5 text-center text-[13px] font-bold outline-none transition-colors focus:border-primary",
                            estudiante.notas[ev.id]
                              ? parseFloat(estudiante.notas[ev.id]) >= 4.0
                                ? "border-green-200 text-blue-600 bg-blue-50"
                                : "border-red-200 text-red-500 bg-red-50"
                              : "border-border text-muted-foreground bg-background"
                          )}
                          placeholder="—"
                        />
                      </td>
                    ))}
                    <td className={cn(
                      "px-4 py-3 text-right text-sm font-extrabold",
                      prom === null ? "text-muted-foreground" : prom >= 4.0 ? "text-blue-600" : "text-red-500"
                    )}>
                      {prom !== null ? prom.toFixed(1) : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: agregar evaluación */}
      {showAddEval && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40" onClick={() => setShowAddEval(false)}>
          <div className="w-[360px] rounded-[16px] bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="mb-4 text-[15px] font-extrabold">Agregar evaluación</h3>
            <input
              value={newEvalLabel}
              onChange={e => setNewEvalLabel(e.target.value)}
              onKeyDown={e => { if(e.key === "Enter") agregarEvaluacion() }}
              placeholder="Ej: N2, Trabajo Práctico, Prueba..."
              className="mb-4 w-full rounded-[10px] border-[1.5px] border-primary px-3.5 py-2.5 text-[13px] font-semibold outline-none focus:shadow-[0_0_0_3px_rgba(240,62,110,0.1)]"
              autoFocus
            />
            <div className="flex justify-end gap-2.5">
              <button onClick={() => setShowAddEval(false)} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-background transition-colors">Cancelar</button>
              <button onClick={agregarEvaluacion} className="rounded-[10px] bg-primary px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#d6335e] transition-colors">Agregar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
