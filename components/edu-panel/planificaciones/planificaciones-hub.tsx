"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Layers, Loader2 } from "lucide-react"
import { cargarPlanCurso } from "@/lib/curriculo"
import { UNIT_COLORS, buildUrl, withAsignatura } from "@/lib/shared"
import { cargarHorarioSemanal } from "@/lib/horario"
import { useActiveSubject } from "@/hooks/use-active-subject"

export function PlanificacionesHub() {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const [cursosData, setCursosData] = useState<Record<string, { total: number; completas: number }>>({})
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadCursos() {
      try {
        const hData = await cargarHorarioSemanal()
        const uniqueCursos = Array.from(new Set(hData.map(h => h.resumen)))
        setCursosDisponibles(uniqueCursos)

        const data: Record<string, { total: number; completas: number }> = {}
        for (const curso of uniqueCursos) {
          try {
            const planData = await cargarPlanCurso(ASIGNATURA, curso)
            const units = planData?.units ?? []
            const completas = units.filter((u: any) => u.start && u.end).length
            data[curso] = { total: units.length, completas }
          } catch (e) {
            data[curso] = { total: 0, completas: 0 }
          }
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

  return (
    <div className="mx-auto max-w-[1320px] px-0 pt-2 sm:pt-4 lg:pt-8">
      <div className="flex items-center justify-between mb-7 flex-wrap gap-3.5">
        <h1 className="text-[22px] font-extrabold">Mis planificaciones</h1>
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
            return (
              <Link 
                key={curso}
                href={buildUrl("/planificaciones", withAsignatura({ curso }, ASIGNATURA))} 
                className="bg-card border border-border rounded-[14px] p-5 hover:border-primary hover:shadow-md transition-all group block cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-sm" style={{ background: UNIT_COLORS[i % UNIT_COLORS.length] }}>
                    {curso.split(" ")[0]}
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold group-hover:text-primary transition-colors">{curso}</h3>
                    <p className="text-[12px] text-muted-foreground">{ASIGNATURA}</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground font-medium">Unidades creadas</span>
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
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
