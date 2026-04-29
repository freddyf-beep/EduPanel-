"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Target } from "lucide-react"
import { getDoc } from "firebase/firestore"
import { cargarCronogramaUnidad, userDoc, type OAEditado } from "@/lib/curriculo"
import { cn } from "@/lib/utils"

interface Props {
  asignatura: string
  curso: string
  unidadId: string
  oas: OAEditado[]
}

function buildCalifId(asignatura: string, curso: string) {
  return (`calif_${asignatura}_${curso}`)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

export function TermometroUnidad({ asignatura, curso, unidadId, oas }: Props) {
  const [ensenados, setEnsenados] = useState<Set<string>>(new Set())
  const [evaluados, setEvaluados] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    Promise.all([
      cargarCronogramaUnidad(asignatura, curso, unidadId),
      getDoc(userDoc("calificaciones", buildCalifId(asignatura, curso))),
    ]).then(([cronograma, califSnap]) => {
      if (cancelled) return
      const taught = new Set<string>()
      ;(cronograma?.clases || []).forEach((clase) => {
        ;(clase.oaIds || []).forEach((oaId) => taught.add(oaId))
      })

      const evaluated = new Set<string>()
      const data = califSnap.exists() ? califSnap.data() : null
      ;(data?.evaluaciones || []).forEach((ev: any) => {
        if (ev.unidadId && ev.unidadId !== unidadId) return
        ;(Array.isArray(ev.oaIds) ? ev.oaIds : []).forEach((oaId: string) => evaluated.add(oaId))
      })

      setEnsenados(taught)
      setEvaluados(evaluated)
    }).catch(() => {
      setEnsenados(new Set())
      setEvaluados(new Set())
    })
    return () => { cancelled = true }
  }, [asignatura, curso, unidadId])

  const seleccionados = useMemo(() => oas.filter((oa) => oa.seleccionado), [oas])
  const total = Math.max(1, seleccionados.length)
  const ensenadosCount = seleccionados.filter((oa) => ensenados.has(oa.id)).length
  const evaluadosCount = seleccionados.filter((oa) => evaluados.has(oa.id)).length
  const pctEnsenados = Math.round((ensenadosCount / total) * 100)
  const pctEvaluados = Math.round((evaluadosCount / total) * 100)
  const brecha = pctEnsenados - pctEvaluados

  return (
    <div className="mb-7 rounded-[14px] border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Termometro de unidad</h3>
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground">{seleccionados.length} OAs activos</span>
      </div>
      <div className="space-y-3">
        {[
          { label: "OAs con clase asignada", pct: pctEnsenados, count: ensenadosCount, color: "bg-status-blue-text" },
          { label: "OAs evaluados", pct: pctEvaluados, count: evaluadosCount, color: "bg-status-green-text" },
        ].map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between text-[12px]">
              <span className="font-semibold">{item.label}</span>
              <span className="text-muted-foreground">{item.count}/{seleccionados.length} · {item.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", item.color)} style={{ width: `${item.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
      {brecha > 30 && (
        <div className="mt-4 flex items-start gap-2 rounded-[10px] border border-status-amber-border bg-status-amber-bg p-3 text-status-amber-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="text-[12px] font-semibold">Has ensenado mas OAs de los que has evaluado. Brecha actual: {brecha}%.</p>
        </div>
      )}
    </div>
  )
}
