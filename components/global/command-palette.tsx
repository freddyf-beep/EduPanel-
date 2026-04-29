"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { BookOpen, CalendarDays, GraduationCap, Search, UserRound } from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cargarHorarioSemanal } from "@/lib/horario"
import { cargarEstudiantes, type Estudiante } from "@/lib/estudiantes"
import { buildUrl, DEFAULT_ASIGNATURA, SUBJECT_STORAGE_KEY, withAsignatura } from "@/lib/shared"

function getAsignaturaActiva() {
  if (typeof window === "undefined") return DEFAULT_ASIGNATURA
  return window.localStorage.getItem(SUBJECT_STORAGE_KEY) || DEFAULT_ASIGNATURA
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cursos, setCursos] = useState<string[]>([])
  const [alumnos, setAlumnos] = useState<Array<Estudiante & { curso: string }>>([])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(value => !value)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  useEffect(() => {
    if (!open) return
    cargarHorarioSemanal()
      .then(async (horario) => {
        const unique = Array.from(new Set(horario.map(item => item.resumen))).filter(Boolean)
        setCursos(unique)
        const roster = await Promise.all(unique.slice(0, 4).map(async (curso) => {
          const estudiantes = await cargarEstudiantes(curso).catch(() => [])
          return estudiantes.slice(0, 12).map(est => ({ ...est, curso }))
        }))
        setAlumnos(roster.flat())
      })
      .catch(() => {
        setCursos([])
        setAlumnos([])
      })
  }, [open])

  const asignatura = getAsignaturaActiva()
  const primerCurso = cursos[0] || ""

  const commands = useMemo(() => ([
    {
      id: "cronograma",
      label: "Cronograma general",
      icon: CalendarDays,
      href: buildUrl("/cronograma", withAsignatura({}, asignatura)),
    },
    {
      id: "libro-hoy",
      label: primerCurso ? `Libro de hoy - ${primerCurso}` : "Libro de hoy",
      icon: BookOpen,
      href: buildUrl("/libro-clases", withAsignatura({ curso: primerCurso, fecha: todayIso() }, asignatura)),
      disabled: !primerCurso,
    },
  ]), [asignatura, primerCurso])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Buscar en EduPanel" description="Navegacion rapida">
      <CommandInput placeholder="Buscar alumno, curso o modulo..." />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        <CommandGroup heading="Acciones">
          {commands.map((cmd) => {
            const Icon = cmd.icon
            return (
              <CommandItem key={cmd.id} disabled={cmd.disabled} onSelect={() => go(cmd.href)}>
                <Icon className="h-4 w-4" />
                {cmd.label}
              </CommandItem>
            )
          })}
        </CommandGroup>
        <CommandGroup heading="Cursos">
          {cursos.map((curso) => (
            <CommandItem key={curso} onSelect={() => go(buildUrl("/calificaciones", withAsignatura({ curso }, asignatura)))}>
              <GraduationCap className="h-4 w-4" />
              Calificaciones de {curso}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Alumnos">
          {alumnos.map((alumno) => (
            <CommandItem key={`${alumno.curso}-${alumno.id}`} onSelect={() => go(buildUrl("/perfil-360", withAsignatura({ curso: alumno.curso, alumno: alumno.id }, asignatura)))}>
              <UserRound className="h-4 w-4" />
              {alumno.nombre}
              <span className="ml-auto text-[11px] text-muted-foreground">{alumno.curso}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Herramientas">
          <CommandItem onSelect={() => go(buildUrl("/cronograma", withAsignatura({}, asignatura)))}>
            <Search className="h-4 w-4" />
            Exportar cronograma
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
