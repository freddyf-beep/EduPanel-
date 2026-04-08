"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, BookOpen, ClipboardCheck, Loader2, UserRound, Users } from "lucide-react"
import { ASIGNATURA } from "@/lib/shared"
import { cargarHorarioSemanal } from "@/lib/horario"
import { listarLibroClasesCurso } from "@/lib/curriculo"
import type { LibroClasesGuardado } from "@/lib/curriculo"
import { db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"

interface EstudianteVista {
  id: string
  nombre: string
  promedio: number | null
  asistencia: { presente: number; ausente: number; atraso: number; retirado: number }
}

interface CalificacionDoc {
  estudiantes: { id: number; name: string; notas: Record<string, string> }[]
}

function buildCalifId(curso: string) {
  return (`calif_${ASIGNATURA}_${curso}`)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function calcPromedio(notas: Record<string, string>) {
  const vals = Object.values(notas).map((v) => parseFloat(v)).filter((v) => !Number.isNaN(v))
  if (!vals.length) return null
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
}

export function Perfil360Content() {
  const [curso, setCurso] = useState("")
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [estudiantes, setEstudiantes] = useState<EstudianteVista[]>([])
  const [selectedId, setSelectedId] = useState<string>("")

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
      listarLibroClasesCurso(ASIGNATURA, curso),
      getDoc(doc(db, "calificaciones", buildCalifId(curso))),
    ]).then(([libros, califSnap]) => {
      const calif = califSnap.exists() ? (califSnap.data() as CalificacionDoc) : null
      const mapa = new Map<string, EstudianteVista>()

      if (calif?.estudiantes?.length) {
        for (const est of calif.estudiantes) {
          mapa.set(est.name, {
            id: String(est.id),
            nombre: est.name,
            promedio: calcPromedio(est.notas),
            asistencia: { presente: 0, ausente: 0, atraso: 0, retirado: 0 },
          })
        }
      }

      for (const libro of libros) {
        for (const bloque of libro.bloques) {
          for (const a of bloque.asistencia) {
            if (!mapa.has(a.nombre)) {
              mapa.set(a.nombre, { id: a.id, nombre: a.nombre, promedio: null, asistencia: { presente: 0, ausente: 0, atraso: 0, retirado: 0 } })
            }
            mapa.get(a.nombre)!.asistencia[a.estado] += 1
          }
        }
      }

      const lista = Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
      setEstudiantes(lista)
      setSelectedId((prev) => prev || lista[0]?.id || "")
    }).finally(() => setLoading(false))
  }, [curso])

  const seleccionado = useMemo(() => estudiantes.find((e) => e.id === selectedId) || null, [estudiantes, selectedId])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-extrabold">Perfil 360 del estudiante</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Vista consolidada de asistencia y rendimiento para acompañamiento oportuno.</p>
      </div>

      <div className="bg-card border border-border rounded-[14px] p-5 mb-5 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground">Curso</label>
          <select value={curso} onChange={(e) => setCurso(e.target.value)} className="min-w-[180px] rounded-[10px] border border-border px-3.5 py-2.5 text-[13px] font-semibold bg-background">
            {cursosDisponibles.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground">Estudiante</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="min-w-[260px] rounded-[10px] border border-border px-3.5 py-2.5 text-[13px] font-semibold bg-background">
            {estudiantes.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
      </div>

      {loading || !curso ? (
        <div className="flex items-center gap-3 text-muted-foreground py-12"><Loader2 className="w-5 h-5 animate-spin" /> Cargando {curso ? "perfil" : "cursos"}…</div>
      ) : !seleccionado ? (
        <div className="bg-card border border-border rounded-[14px] p-8 text-[13px] text-muted-foreground">Aún no hay datos para este curso.</div>
      ) : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-5">
          <div className="bg-card border border-border rounded-[16px] p-5">
            <div className="w-14 h-14 rounded-full bg-pink-light text-primary grid place-items-center font-extrabold text-xl mb-4">{seleccionado.nombre.slice(0,1)}</div>
            <h2 className="text-[18px] font-extrabold">{seleccionado.nombre}</h2>
            <p className="text-[13px] text-muted-foreground mt-1">{curso} · {ASIGNATURA}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-[12px] bg-background p-3 border border-border"><div className="text-[11px] text-muted-foreground">Promedio</div><div className="text-[18px] font-extrabold mt-1">{seleccionado.promedio ?? "—"}</div></div>
              <div className="rounded-[12px] bg-background p-3 border border-border"><div className="text-[11px] text-muted-foreground">Registros</div><div className="text-[18px] font-extrabold mt-1">{Object.values(seleccionado.asistencia).reduce((a,b)=>a+b,0)}</div></div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="grid md:grid-cols-4 gap-3">
              {[
                { icon: Users, label: "Presentes", value: seleccionado.asistencia.presente, cls: "text-green-700 bg-green-50" },
                { icon: Activity, label: "Ausentes", value: seleccionado.asistencia.ausente, cls: "text-red-600 bg-red-50" },
                { icon: ClipboardCheck, label: "Atrasos", value: seleccionado.asistencia.atraso, cls: "text-amber-700 bg-amber-50" },
                { icon: BookOpen, label: "Retirados", value: seleccionado.asistencia.retirado, cls: "text-slate-700 bg-slate-100" },
              ].map((item) => {
                const Icon = item.icon
                return <div key={item.label} className="bg-card border border-border rounded-[14px] p-4 flex items-center gap-3"><div className={`w-10 h-10 rounded-xl grid place-items-center ${item.cls}`}><Icon className="w-4 h-4" /></div><div><div className="text-[11px] text-muted-foreground">{item.label}</div><div className="text-[18px] font-extrabold">{item.value}</div></div></div>
              })}
            </div>

            <div className="bg-card border border-border rounded-[16px] p-5">
              <h3 className="text-[15px] font-extrabold mb-3">Lectura rápida</h3>
              <ul className="space-y-2 text-[13px] text-muted-foreground leading-relaxed">
                <li>• Promedio actual: <span className="font-semibold text-foreground">{seleccionado.promedio ?? "Sin calificaciones"}</span></li>
                <li>• Asistencia registrada: <span className="font-semibold text-foreground">{seleccionado.asistencia.presente}</span> presentes y <span className="font-semibold text-foreground">{seleccionado.asistencia.ausente}</span> ausencias.</li>
                <li>• Este panel consolida los datos disponibles en calificaciones y libro de clases dentro de EduPanel.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
