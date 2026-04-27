"use client"

import { HelpCircle, MessageSquare, Clock3, LifeBuoy, BookOpen, ArrowRight } from "lucide-react"
import Link from "next/link"

const flujo = [
  { n: "1", title: "Planificaciones", desc: "Crea tus unidades por curso.", href: "/planificaciones" },
  { n: "2", title: "Ver Unidad", desc: "Selecciona OA, habilidades y actitudes.", href: "/ver-unidad" },
  { n: "3", title: "Cronograma", desc: "Distribuye OA en clases con fechas reales.", href: "/ver-unidad" },
  { n: "4", title: "Actividades", desc: "Planifica inicio, desarrollo y cierre de cada clase.", href: "/actividades" },
  { n: "5", title: "Libro de Clases", desc: "Registra asistencia y sincroniza el leccionario.", href: "/libro-clases" },
]

export function SoporteContent() {
  return (
    <div>
      <div className="mb-5 sm:mb-7">
        <h1 className="text-[18px] sm:text-[22px] font-extrabold">Centro de ayuda</h1>
        <p className="text-[12px] sm:text-[13px] text-muted-foreground mt-1">Guía de uso y flujo de trabajo de EduPanel.</p>
      </div>

      {/* Flujo de trabajo */}
      <div className="bg-card border border-border rounded-[16px] p-4 sm:p-6 mb-5">
        <h2 className="text-[15px] font-extrabold mb-4">Flujo de planificación</h2>
        <div className="flex flex-col gap-3">
          {flujo.map((paso, i) => (
            <Link key={paso.n} href={paso.href}
              className="flex items-center gap-4 bg-background rounded-[12px] px-4 py-3.5 hover:border-primary border border-border transition-colors group">
              <div className="w-8 h-8 rounded-full bg-primary text-white text-[13px] font-extrabold grid place-items-center flex-shrink-0">
                {paso.n}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold">{paso.title}</div>
                <div className="text-[12px] text-muted-foreground">{paso.desc}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-[16px] p-4 sm:p-6">
          <div className="w-11 h-11 rounded-xl bg-pink-light text-primary grid place-items-center mb-4">
            <BookOpen className="w-5 h-5" />
          </div>
          <h2 className="text-[15px] font-extrabold mb-2">Principios de arquitectura</h2>
          <ul className="text-[13px] text-muted-foreground space-y-2 leading-relaxed">
            <li>• Firestore es la fuente única de verdad para todos los datos.</li>
            <li>• El parámetro <code className="bg-background px-1 rounded text-[11px]">?curso=</code> se pasa entre páginas para mantener contexto.</li>
            <li>• Los OA seleccionados en Ver Unidad alimentan el Cronograma y las Actividades.</li>
            <li>• El Desarrollo de una Actividad se sincroniza directamente al Libro de Clases.</li>
          </ul>
        </div>

        <div className="bg-card border border-border rounded-[16px] p-4 sm:p-6">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 grid place-items-center mb-4">
            <Clock3 className="w-5 h-5" />
          </div>
          <h2 className="text-[15px] font-extrabold mb-2">Horario de atención (soporte técnico)</h2>
          <ul className="text-[13px] text-muted-foreground space-y-2">
            <li>• Lunes a Viernes: 08:00 – 23:00 hrs.</li>
            <li>• Sábado: 14:00 – 23:00 hrs.</li>
            <li>• Documenta los problemas para revisarlos en la siguiente sesión.</li>
          </ul>
        </div>

        <div className="bg-card border border-border rounded-[16px] p-4 sm:p-6">
          <div className="w-11 h-11 rounded-xl bg-green-50 text-green-700 grid place-items-center mb-4">
            <LifeBuoy className="w-5 h-5" />
          </div>
          <h2 className="text-[15px] font-extrabold mb-2">Consejos rápidos</h2>
          <ul className="text-[13px] text-muted-foreground space-y-2">
            <li>• Guarda siempre antes de cambiar de página.</li>
            <li>• En el Cronograma de Unidad usa "Fechas automáticas" para asignar fechas desde el ICS.</li>
            <li>• El botón "Sincronizar" en Actividades llena el Libro de Clases con un clic.</li>
            <li>• El Perfil 360 se alimenta solo del Libro de Clases y Calificaciones.</li>
          </ul>
        </div>

        <div className="bg-card border border-border rounded-[16px] p-4 sm:p-6">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 grid place-items-center mb-4">
            <MessageSquare className="w-5 h-5" />
          </div>
          <h2 className="text-[15px] font-extrabold mb-2">Privacidad</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Los apoderados y estudiantes no tienen acceso a las planificaciones. Los datos están almacenados en Firebase Firestore bajo tu cuenta y proyecto personal.
          </p>
        </div>
      </div>
    </div>
  )
}
