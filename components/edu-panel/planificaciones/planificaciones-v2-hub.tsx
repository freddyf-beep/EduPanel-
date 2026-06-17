"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { BookOpen, Layers, Loader2 } from "lucide-react"
import { cargarPlanCurso } from "@/lib/curriculo"
import { UNIT_COLORS, buildUrl, withAsignatura } from "@/lib/shared"
import { agruparHorarioPorCurso, cargarHorarioSemanal } from "@/lib/horario"
import { cargarCursoTipos, type CursoTipoMap, type TipoCurricular } from "@/lib/nivel-mapping"
import { useActiveSubject } from "@/hooks/use-active-subject"

export function PlanificacionesV2Hub() {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const router = useRouter()
  const [cursosData, setCursosData] = useState<Record<string, { total: number; completas: number }>>({})
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [cursoTipos, setCursoTipos] = useState<CursoTipoMap>({})
  const [loading, setLoading] = useState(true)
  const [asignaturasPorCurso, setAsignaturasPorCurso] = useState<Map<string, string[]>>(new Map())
  const [subjectPicker, setSubjectPicker] = useState<{ curso: string; asignaturas: string[] } | null>(null)

  useEffect(() => {
    async function loadCursos() {
      try {
        const [hData, tipos] = await Promise.all([
          cargarHorarioSemanal(),
          cargarCursoTipos().catch(() => ({} as CursoTipoMap)),
        ])
        const uniqueCursos = Array.from(agruparHorarioPorCurso(hData).keys())
        setCursosDisponibles(uniqueCursos)
        setCursoTipos(tipos)

        const asignatsPorCurso = new Map<string, string[]>()
        hData.forEach(h => {
          const c = h.resumen.trim()
          const a = (h.asignatura || "").trim()
          if (!a) return
          if (!asignatsPorCurso.has(c)) asignatsPorCurso.set(c, [])
          if (!asignatsPorCurso.get(c)!.includes(a)) asignatsPorCurso.get(c)!.push(a)
        })
        setAsignaturasPorCurso(asignatsPorCurso)

        const data: Record<string, { total: number; completas: number }> = {}
        for (const curso of uniqueCursos) {
          const asigsCurso = asignatsPorCurso.get(curso) || [ASIGNATURA]
          let bestPlan: any = null
          for (const asig of asigsCurso) {
            try {
              const planData = await cargarPlanCurso(asig, curso)
              if (planData?.units?.length) { bestPlan = planData; break }
            } catch (e) { /* seguir probando */ }
          }
          if (!bestPlan) {
            try { bestPlan = await cargarPlanCurso(ASIGNATURA, curso) } catch (e) { bestPlan = null }
          }
          const units = bestPlan?.units ?? []
          const completas = units.filter((u: any) => u.start && u.end).length
          data[curso] = { total: units.length, completas }
        }
        setCursosData(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadCursos()
  }, [ASIGNATURA])

  const navigateToCurso = (cursoName: string, asig: string) => {
    router.push(buildUrl("/planificaciones", withAsignatura({ curso: cursoName }, asig)))
  }

  const handleSelectCurso = (cursoName: string) => {
    const asigs = asignaturasPorCurso.get(cursoName) || []
    if (asigs.length === 1) {
      navigateToCurso(cursoName, asigs[0])
      return
    }
    const allSubjects = new Set<string>()
    asignaturasPorCurso.forEach(a => a.forEach(s => allSubjects.add(s)))
    if (allSubjects.size === 0) allSubjects.add(ASIGNATURA)
    setSubjectPicker({ curso: cursoName, asignaturas: asigs.length > 0 ? asigs : Array.from(allSubjects).sort() })
  }

  return (
    <div className="mx-auto max-w-[1320px] px-0 pt-2 sm:pt-4 lg:pt-8">
      <div className="flex items-center justify-between mb-5 sm:mb-7 flex-wrap gap-3.5">
        <h1 className="text-[18px] sm:text-[22px] font-extrabold">Mis planificaciones</h1>
      </div>

      <div className="mb-8 flex flex-col items-center rounded-[14px] border border-border bg-card p-5 text-center sm:p-8">
        <div className="w-16 h-16 bg-pink-light rounded-full flex items-center justify-center mb-4">
          <Layers className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-lg font-bold mb-2">Conector de Unidades y Matriz Curricular</h2>
        <p className="mx-auto max-w-xl text-[14px] text-muted-foreground">
          Selecciona un curso para crear sus unidades, asociarlas al currículo oficial y luego distribuirlas en la matriz anual.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center flex-col items-center py-12 gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <span className="text-[14px] font-medium">Cargando progreso de los cursos…</span>
        </div>
      ) : cursosDisponibles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-[14px]">
          Configura tu horario en Mi Perfil para ver tus cursos aquí.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 pb-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cursosDisponibles.map((curso, i) => {
            const info = cursosData[curso] || { total: 0, completas: 0 }
            const coverPct = info.total > 0 ? Math.round((info.completas / info.total) * 100) : 0
            const tipo = (cursoTipos[curso] ?? "oficial") as TipoCurricular
            const tipoLabel = tipo === "oficial" ? "Curriculo oficial" : tipo === "taller" ? "Taller" : "Libre"
            return (
              <button
                key={curso}
                onClick={() => handleSelectCurso(curso)}
                className="bg-card border border-border rounded-[14px] p-5 hover:border-primary hover:shadow-md transition-all group cursor-pointer text-left w-full"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-sm" style={{ background: UNIT_COLORS[i % UNIT_COLORS.length] }}>
                    {curso.split(" ")[0]}
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold group-hover:text-primary transition-colors">{curso}</h3>
                    <p className="text-[12px] text-muted-foreground">
                      {(() => {
                        const asigs = asignaturasPorCurso.get(curso) || []
                        return asigs.length > 1
                          ? `${asigs.length} asignaturas`
                          : asigs[0] || ASIGNATURA
                      })()} · {tipoLabel}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground font-medium">
                      {tipo === "oficial" ? "Unidades creadas" : "Unidades personalizadas"}
                    </span>
                    <span className="font-bold">{info.total}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground font-medium">Cobertura de fechas</span>
                    <span className="font-bold text-primary">{coverPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-background overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${coverPct}%` }} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Modal: elegir asignatura */}
      {subjectPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSubjectPicker(null)}>
          <div
            className="bg-card border border-border rounded-[16px] shadow-xl p-6 w-full max-w-sm mx-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-extrabold mb-1">Elegir asignatura</h3>
            <p className="text-[12px] text-muted-foreground mb-4">
              ¿Cuál asignatura querés ver en <strong>{subjectPicker.curso}</strong>?
            </p>
            <div className="space-y-2">
              {subjectPicker.asignaturas.map(asig => (
                <button
                  key={asig}
                  onClick={() => {
                    setSubjectPicker(null)
                    navigateToCurso(subjectPicker.curso, asig)
                  }}
                  className="w-full rounded-[10px] border border-border bg-background px-4 py-2.5 text-[13px] font-semibold text-left hover:border-primary hover:bg-pink-light transition-colors flex items-center gap-2"
                >
                  <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
                  {asig}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSubjectPicker(null)}
              className="mt-3 w-full rounded-[10px] border border-border px-4 py-2 text-[12px] font-semibold text-muted-foreground hover:bg-muted/50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
