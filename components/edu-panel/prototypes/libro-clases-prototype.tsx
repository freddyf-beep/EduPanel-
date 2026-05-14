"use client"

import Link from "next/link"
import {
  ArrowRight, BookOpen, CalendarDays, Check, ClipboardList, Lock,
  PenLine, Users,
} from "lucide-react"
import { PrototypeBanner } from "@/components/edu-panel/shared/prototype-banner"

const demoStudents = [
  { nombre: "Martina Rojas", estado: "P", cls: "bg-emerald-100 text-emerald-700" },
  { nombre: "Benjamín Soto", estado: "P", cls: "bg-emerald-100 text-emerald-700" },
  { nombre: "Catalina Pérez", estado: "A", cls: "bg-rose-100 text-rose-700" },
  { nombre: "Diego Muñoz", estado: "T", cls: "bg-amber-100 text-amber-700" },
]

export function LibroClasesPrototype() {
  return (
    <div className="mx-auto max-w-[1180px] pb-10">
      <PrototypeBanner>
        Esta vista queda como maqueta visual. No carga estudiantes reales, no guarda asistencia, no firma clases y no escribe en Firestore. El foco actual de EduPanel es planificar, generar actividades y exportar material docente.
      </PrototypeBanner>

      <header className="mt-5 rounded-[14px] border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-bold text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Modo muestra
            </div>
            <h1 className="mt-3 text-[24px] font-extrabold leading-tight">Libro de clases</h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              Boceto de cómo podría verse un registro diario más adelante. Por ahora no forma parte del producto operativo.
            </p>
          </div>
          <Link
            href="/planificaciones"
            className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground hover:opacity-90"
          >
            Ir a planificaciones <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="space-y-4">
          <div className="rounded-[14px] border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[14px] font-extrabold">Bloque 1 · Música · 1° A</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">08:30-09:15 · Miércoles 13 de mayo</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-800">
                  Datos ficticios
                </span>
              </div>
            </div>

            <div className="grid gap-4 p-4 xl:grid-cols-[1fr_280px]">
              <div className="space-y-3">
                <PreviewBlock icon={BookOpen} title="Objetivo de la clase">
                  Reconocer patrones rítmicos simples y representarlos mediante percusión corporal.
                </PreviewBlock>
                <PreviewBlock icon={PenLine} title="Leccionario">
                  Inicio con activación rítmica, práctica guiada por grupos y cierre con autoevaluación breve.
                </PreviewBlock>
              </div>

              <div className="rounded-[12px] border border-border bg-background p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="inline-flex items-center gap-2 text-[12px] font-extrabold">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    Asistencia demo
                  </h3>
                  <span className="text-[10px] font-bold text-muted-foreground">Solo lectura</span>
                </div>
                <ul className="space-y-2">
                  {demoStudents.map((student) => (
                    <li key={student.nombre} className="flex items-center gap-2 rounded-[8px] border border-border bg-card px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{student.nombre}</span>
                      <span className={`grid h-6 w-6 place-items-center rounded text-[10px] font-extrabold ${student.cls}`}>
                        {student.estado}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <DemoMetric icon={ClipboardList} label="Registros reales" value="0" />
            <DemoMetric icon={Check} label="Guardados" value="Desactivado" />
            <DemoMetric icon={CalendarDays} label="Estado" value="Prototipo" />
          </div>
        </main>

        <aside className="space-y-4">
          <section className="rounded-[14px] border border-border bg-card p-4">
            <h3 className="text-[13px] font-extrabold">Qué queda pendiente</h3>
            <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted-foreground">
              <li>Definir si EduPanel realmente llevará asistencia diaria.</li>
              <li>Diseñar permisos, historial y correcciones.</li>
              <li>Evitar que este módulo consuma rendimiento antes del MVP.</li>
            </ul>
          </section>
          <section className="rounded-[14px] border border-primary/30 bg-primary/5 p-4">
            <h3 className="text-[13px] font-extrabold text-primary">Foco actual</h3>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              Planificaciones, unidades, cronograma pedagógico, generación de clases, evaluaciones y exportación.
            </p>
          </section>
        </aside>
      </section>
    </div>
  )
}

function PreviewBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof BookOpen
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[12px] border border-border bg-background p-4">
      <h3 className="inline-flex items-center gap-2 text-[12px] font-extrabold">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
      </h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-foreground">{children}</p>
    </div>
  )
}

function DemoMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClipboardList
  label: string
  value: string
}) {
  return (
    <div className="rounded-[12px] border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3 text-[18px] font-extrabold">{value}</div>
    </div>
  )
}
