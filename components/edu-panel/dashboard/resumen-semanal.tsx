"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, TrendingUp } from "lucide-react"
import { listarLibroClasesCurso } from "@/lib/curriculo"
import type { ClaseHorario } from "@/lib/horario"

interface Props {
  asignatura: string
  horario: ClaseHorario[]
  fecha: Date
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}

function ddmmyyyy(d: Date) {
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`
}

function normalizarFechaLibro(fecha: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha
  const match = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return fecha
  return `${match[3]}-${match[2]}-${match[1]}`
}

export function ResumenSemanal({ asignatura, horario, fecha }: Props) {
  const [dictadas, setDictadas] = useState(0)
  const [asistenciaPromedio, setAsistenciaPromedio] = useState<number | null>(null)
  const [oasCubiertos, setOasCubiertos] = useState(0)

  const { lunes, viernes, cursos, planificadas } = useMemo(() => {
    const d = new Date(fecha)
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1
    const start = new Date(d)
    start.setDate(d.getDate() - day)
    const end = new Date(start)
    end.setDate(start.getDate() + 4)
    const cursos = Array.from(new Set(horario.map(item => item.resumen))).filter(Boolean)
    return {
      lunes: start,
      viernes: end,
      cursos,
      planificadas: horario.filter(item => item.tipo === "clase").length,
    }
  }, [fecha, horario])

  useEffect(() => {
    let cancelled = false
    Promise.all(cursos.map(curso => listarLibroClasesCurso(asignatura, curso).catch(() => [])))
      .then((listas) => {
        if (cancelled) return
        const min = iso(lunes)
        const max = iso(viernes)
        const libros = listas.flat().filter((libro) => {
          const fechaLibro = normalizarFechaLibro(libro.fecha)
          return fechaLibro >= min && fechaLibro <= max
        })
        setDictadas(libros.reduce((sum, libro) => sum + libro.bloques.filter(b => b.firmado || b.objetivo || b.actividad).length, 0))

        const oas = new Set<string>()
        let presentes = 0
        let total = 0
        libros.forEach((libro) => libro.bloques.forEach((bloque) => {
          const texto = `${bloque.objetivo || ""} ${bloque.actividad || ""}`
          texto.match(/\bOA\s*\d+\b/gi)?.forEach(oa => oas.add(oa.toUpperCase().replace(/\s+/g, "")))
          bloque.asistencia.forEach((item) => {
            total += 1
            if (item.estado === "presente" || item.estado === "atraso") presentes += 1
          })
        }))
        setOasCubiertos(oas.size)
        setAsistenciaPromedio(total > 0 ? Math.round((presentes / total) * 100) : null)
      })
    return () => { cancelled = true }
  }, [asignatura, cursos, lunes, viernes])

  if (fecha.getDay() !== 0) return null

  return (
    <div className="mb-5 rounded-[14px] border border-primary/30 bg-card p-5 animate-fade-up print:border-border">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-[15px] font-extrabold">Tu semana del {ddmmyyyy(lunes)} al {ddmmyyyy(viernes)}</h2>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[12px] font-bold hover:bg-background print:hidden">
          <Download className="h-3.5 w-3.5" /> Exportar PDF
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-[12px] border border-border bg-background p-4">
          <div className="text-[11px] text-muted-foreground">Clases dictadas</div>
          <div className="mt-1 text-[22px] font-extrabold">{dictadas}/{planificadas}</div>
        </div>
        <div className="rounded-[12px] border border-border bg-background p-4">
          <div className="text-[11px] text-muted-foreground">Asistencia promedio</div>
          <div className="mt-1 text-[22px] font-extrabold">{asistenciaPromedio !== null ? `${asistenciaPromedio}%` : "-"}</div>
        </div>
        <div className="rounded-[12px] border border-border bg-background p-4">
          <div className="text-[11px] text-muted-foreground">Cursos activos</div>
          <div className="mt-1 text-[22px] font-extrabold">{cursos.length}</div>
        </div>
        <div className="rounded-[12px] border border-border bg-background p-4">
          <div className="text-[11px] text-muted-foreground">OAs cubiertos</div>
          <div className="mt-1 text-[22px] font-extrabold">{oasCubiertos}</div>
        </div>
      </div>
    </div>
  )
}
