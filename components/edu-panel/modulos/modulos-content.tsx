"use client"

import Link from "next/link"
import { BookOpen, Calendar, ClipboardList, ClipboardCheck, Users, GanttChart, CalendarDays, LayoutGrid, ExternalLink } from "lucide-react"

const modules = [
  {
    title: "Planificaciones",
    description: "Gestiona todas tus planificaciones anuales por curso y unidad.",
    href: "/planificaciones",
    icon: BookOpen,
    color: "#F03E6E",
    bg: "#FFF0F4",
  },
  {
    title: "Planificación Anual",
    description: "Distribuye la base curricular a lo largo del año",
    href: "/planificaciones",
    icon: Calendar,
    color: "#3B82F6",
    bg: "#EFF6FF",
  },
  {
    title: "Ver Unidad",
    description: "Edita en detalle cada unidad con OA, indicadores y cronograma.",
    href: "/ver-unidad",
    icon: BookOpen,
    color: "#8B5CF6",
    bg: "#F5F3FF",
  },
  {
    title: "Actividades",
    description: "Planifica cada clase con inicio, desarrollo, cierre y materiales.",
    href: "/actividades",
    icon: GanttChart,
    color: "#EC4899",
    bg: "#FDF2F8",
  },
  {
    title: "Cronograma",
    description: "Vista semanal de todas tus clases con filtros por curso y unidad.",
    href: "/cronograma",
    icon: CalendarDays,
    color: "#14B8A6",
    bg: "#F0FDFA",
  },
  {
    title: "Libro de Clases",
    description: "Registra asistencia, objetivo y actividad de cada bloque.",
    href: "/libro-clases",
    icon: ClipboardList,
    color: "#F59E0B",
    bg: "#FFFBEB",
  },
  {
    title: "Calificaciones",
    description: "Administra notas y evaluaciones de todos tus cursos.",
    href: "/calificaciones",
    icon: ClipboardCheck,
    color: "#22C55E",
    bg: "#F0FDF4",
  },
  {
    title: "Perfil 360",
    description: "Vista integrada por estudiante: notas, asistencia y tendencias.",
    href: "/perfil-360",
    icon: Users,
    color: "#6366F1",
    bg: "#EEF2FF",
  },
]

export function ModulosContent() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-[22px] font-extrabold">Módulos</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Acceso rápido a todas las herramientas de EduPanel.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {modules.map(mod => {
          const Icon = mod.icon
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className="group bg-card border border-border rounded-[16px] p-5 hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all"
            >
              <div
                className="w-11 h-11 rounded-[12px] grid place-items-center mb-4"
                style={{ background: mod.bg }}
              >
                <Icon className="w-5 h-5" style={{ color: mod.color }} />
              </div>
              <h3 className="text-[14px] font-bold mb-1.5">{mod.title}</h3>
              <p className="text-[12px] text-muted-foreground leading-snug">{mod.description}</p>
            </Link>
          )
        })}
      </div>

      {/* Recursos externos */}
      <div className="mt-8 bg-card border border-border rounded-[16px] p-6">
        <h2 className="text-[15px] font-extrabold mb-4">Recursos externos</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "MINEDUC — Currículum", url: "https://www.curriculumnacional.cl" },
            { label: "Planes y Programas", url: "https://www.curriculumnacional.cl/portal/Planes-y-Programas/" },
            { label: "Biblioteca CRA", url: "https://www.curriculumnacional.cl/link/https://www.bibliotecas-cra.cl/" },
          ].map(r => (
            <a
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 bg-background border border-border rounded-[10px] px-4 py-3 text-[13px] font-medium hover:border-primary hover:text-primary transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              {r.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
