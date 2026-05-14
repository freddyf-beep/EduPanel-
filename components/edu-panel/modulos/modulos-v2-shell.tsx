"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import {
  BookOpen, ClipboardList, ClipboardCheck, Users, GanttChart, CalendarDays,
  ExternalLink, Star, StarOff, Clock, LayoutGrid, Compass, ArrowRight,
  Sparkles, Sunrise, Sun, Moon, Lightbulb, Pin, History, Workflow, ChevronRight,
} from "lucide-react"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"

type VistaKey = "grid" | "favoritos" | "recientes" | "workflow"
const VISTAS: { key: VistaKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "grid",       label: "Grilla",     icon: LayoutGrid },
  { key: "favoritos",  label: "Favoritos",  icon: Star },
  { key: "recientes",  label: "Recientes",  icon: Clock },
  { key: "workflow",   label: "Flujo",      icon: Workflow },
]

const FAVORITOS_KEY = "edupanel_modulos_favoritos"
const RECIENTES_KEY = "edupanel_rutas_recientes"

interface Modulo {
  id: string
  title: string
  description: string
  href: string
  icon: typeof BookOpen
  color: string
  bg: string
  hint?: string
}

const modules: Modulo[] = [
  {
    id: "planificaciones",
    title: "Mis planificaciones",
    description: "Gestiona unidades anuales por curso y asignatura.",
    href: "/planificaciones",
    icon: BookOpen,
    color: "var(--primary)",
    bg: "bg-pink-50 dark:bg-pink-950/30",
    hint: "Punto de partida del flujo pedagógico.",
  },
  {
    id: "ver-unidad",
    title: "Ver Unidad",
    description: "Edita en detalle cada unidad: OA, indicadores, DUA y cronograma.",
    href: "/ver-unidad",
    icon: BookOpen,
    color: "#8B5CF6",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    hint: "Marca tus OA activos del periodo.",
  },
  {
    id: "actividades",
    title: "Actividades",
    description: "Planifica clase a clase con copiloto IA.",
    href: "/actividades",
    icon: GanttChart,
    color: "#EC4899",
    bg: "bg-fuchsia-50 dark:bg-fuchsia-950/30",
    hint: "Inicio · Desarrollo · Cierre.",
  },
  {
    id: "cronograma",
    title: "Cronograma",
    description: "Vista semanal con filtros por curso y unidad.",
    href: "/cronograma",
    icon: CalendarDays,
    color: "#14B8A6",
    bg: "bg-teal-50 dark:bg-teal-950/30",
    hint: "Sincroniza con Google Calendar.",
  },
  {
    id: "libro-clases",
    title: "Libro de Clases",
    description: "Prototipo visual. No registra asistencia ni firma.",
    href: "/libro-clases",
    icon: ClipboardList,
    color: "#F59E0B",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    hint: "Muestra no operativa para futuro.",
  },
  {
    id: "calificaciones",
    title: "Calificaciones",
    description: "Notas y evaluaciones por curso, con distribución.",
    href: "/calificaciones",
    icon: ClipboardCheck,
    color: "#22C55E",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    hint: "Histograma + heatmap de OA.",
  },
  {
    id: "perfil-360",
    title: "Perfil 360",
    description: "Vista integrada por estudiante: notas, asistencia, observaciones.",
    href: "/perfil-360",
    icon: Users,
    color: "#6366F1",
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    hint: "Compara dos alumnos lado a lado.",
  },
]

const externalResources = [
  { label: "MINEDUC — Currículum",     url: "https://www.curriculumnacional.cl",                                      hint: "Bases curriculares y planes" },
  { label: "Planes y Programas",       url: "https://www.curriculumnacional.cl/portal/Planes-y-Programas/",          hint: "Por nivel y asignatura" },
  { label: "Biblioteca CRA",           url: "https://www.bibliotecas-cra.cl/",                                       hint: "Recursos para tus clases" },
]

const flujoOrder: string[] = ["planificaciones", "ver-unidad", "actividades", "cronograma", "libro-clases", "calificaciones", "perfil-360"]

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* noop */
  }
}

function getGreeting(): { greet: string; icon: typeof Sun; tone: string } {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return { greet: "Buenos días", icon: Sunrise, tone: "from-amber-200 via-rose-300 to-fuchsia-400" }
  if (h >= 12 && h < 19) return { greet: "Buenas tardes", icon: Sun, tone: "from-fuchsia-300 via-pink-400 to-violet-400" }
  return { greet: "Buenas noches", icon: Moon, tone: "from-violet-500 via-indigo-500 to-blue-600" }
}

function getContextualSuggestions(): { id: string; label: string; href: string; icon: typeof Lightbulb }[] {
  const day = new Date().getDay() // 0=dom, 1=lun ... 6=sáb
  const hour = new Date().getHours()
  const all = [
    { id: "pasar-lista",       label: "Ver prototipo de libro",   href: "/libro-clases",   icon: ClipboardList, when: () => day >= 1 && day <= 5 && hour >= 7 && hour <= 18 },
    { id: "actividad",         label: "Planificar tu próxima clase",  href: "/actividades", icon: Lightbulb,    when: () => true },
    { id: "calificar",         label: "Registrar evaluaciones",   href: "/calificaciones", icon: ClipboardCheck, when: () => day >= 1 && day <= 5 && hour >= 14 },
    { id: "ver-cronograma",    label: "Revisar tu semana",        href: "/cronograma",     icon: CalendarDays,  when: () => day === 1 || day === 0 },
    { id: "perfil-360",        label: "Mirar el progreso de un alumno", href: "/perfil-360", icon: Users,         when: () => true },
  ]
  return all.filter(s => s.when()).slice(0, 3)
}

export function ModulosV2Shell() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const vistaParam = (searchParams.get("vista") as VistaKey | null)
  const [vista, setVista] = useState<VistaKey>(vistaParam ?? "grid")
  const [favoritos, setFavoritos] = useState<string[]>([])
  const [recientes, setRecientes] = useState<{ href: string; ts: number }[]>([])
  const [hydrated, setHydrated] = useState(false)
  const { asignatura } = useActiveSubject()

  useEffect(() => {
    setFavoritos(loadJSON<string[]>(FAVORITOS_KEY, []))
    setRecientes(loadJSON<{ href: string; ts: number }[]>(RECIENTES_KEY, []))
    setHydrated(true)
  }, [])

  // Tracker de rutas recientes (basado en pathname distinto de /modulos)
  useEffect(() => {
    if (!pathname || pathname.startsWith("/modulos")) return
    const known = modules.find(m => pathname === m.href || pathname.startsWith(m.href + "/"))
    if (!known) return
    setRecientes(prev => {
      const next = [{ href: known.href, ts: Date.now() }, ...prev.filter(r => r.href !== known.href)].slice(0, 5)
      saveJSON(RECIENTES_KEY, next)
      return next
    })
  }, [pathname])

  const goToVista = (key: VistaKey) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set("vista", key)
    router.replace(`/modulos?${params.toString()}`, { scroll: false })
    setVista(key)
  }

  const togglePin = (id: string) => {
    setFavoritos(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      saveJSON(FAVORITOS_KEY, next)
      return next
    })
  }

  const moduleHref = (m: Modulo) => buildUrl(m.href, withAsignatura({}, asignatura))

  const greeting = getGreeting()
  const contextSuggestions = useMemo(() => getContextualSuggestions(), [])

  const sortedForGrid = useMemo(() => {
    if (favoritos.length === 0) return modules
    const fav = modules.filter(m => favoritos.includes(m.id))
    const rest = modules.filter(m => !favoritos.includes(m.id))
    return [...fav, ...rest]
  }, [favoritos])

  const recientesData = useMemo(() => {
    return recientes
      .map(r => ({ ...r, mod: modules.find(m => m.href === r.href) }))
      .filter((r): r is { href: string; ts: number; mod: Modulo } => Boolean(r.mod))
  }, [recientes])

  const favoritosData = useMemo(() => modules.filter(m => favoritos.includes(m.id)), [favoritos])

  return (
    <div className="mx-auto max-w-[1320px] px-3 sm:px-5">
      {/* Hero */}
      <div className={`relative overflow-hidden rounded-[20px] bg-gradient-to-br ${greeting.tone} px-6 py-7 sm:px-8 sm:py-8 mb-6 text-white`}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-12 -bottom-12 h-44 w-44 rounded-full bg-black/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[12px] font-bold opacity-90">
            <greeting.icon className="h-3.5 w-3.5" />
            {greeting.greet}, profe.
          </div>
          <h1 className="mt-1 text-[24px] sm:text-[28px] font-extrabold leading-tight">
            ¿Qué quieres hacer hoy?
          </h1>
          <p className="mt-1 text-[12.5px] text-white/85">
            {modules.length} módulos disponibles · Asignatura activa: <span className="font-bold">{asignatura}</span>
          </p>

          {/* CTAs contextuales */}
          {contextSuggestions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {contextSuggestions.map(s => {
                const SIcon = s.icon
                return (
                  <Link
                    key={s.id}
                    href={buildUrl(s.href, withAsignatura({}, asignatura))}
                    className="group inline-flex items-center gap-2 rounded-[12px] bg-white/15 px-3.5 py-2 text-[12px] font-semibold backdrop-blur hover:bg-white/25 transition-colors"
                  >
                    <SIcon className="h-3.5 w-3.5" />
                    {s.label}
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tabs de vista */}
      <div className="sticky top-0 z-10 -mx-3 mb-5 bg-background/85 px-3 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1">
          {VISTAS.map(v => {
            const Icon = v.icon
            const isActive = vista === v.key
            return (
              <button
                key={v.key}
                onClick={() => goToVista(v.key)}
                className={`inline-flex items-center gap-1.5 rounded-t-[10px] px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                  isActive
                    ? "bg-pink-light text-primary border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {v.label}
                {v.key === "favoritos" && favoritos.length > 0 && (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{favoritos.length}</Badge>
                )}
                {v.key === "recientes" && recientes.length > 0 && (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{recientes.length}</Badge>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Vistas */}
      {vista === "grid" && (
        <GridView
          items={sortedForGrid}
          favoritos={favoritos}
          onPin={togglePin}
          buildHref={moduleHref}
          hydrated={hydrated}
        />
      )}

      {vista === "favoritos" && (
        <FavoritosView
          items={favoritosData}
          onPin={togglePin}
          buildHref={moduleHref}
        />
      )}

      {vista === "recientes" && (
        <RecientesView
          items={recientesData}
          buildHref={moduleHref}
        />
      )}

      {vista === "workflow" && (
        <WorkflowView
          buildHref={moduleHref}
        />
      )}

      {/* Recursos externos */}
      <section className="mt-7 rounded-[16px] border border-border bg-card p-5 sm:p-6">
        <h2 className="text-[14px] font-extrabold mb-3 flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-primary" /> Recursos externos
        </h2>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {externalResources.map(r => (
            <a
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2.5 rounded-[10px] border border-border bg-background px-4 py-3 text-[12.5px] font-medium hover:border-primary hover:text-primary transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold truncate">{r.label}</div>
                <div className="text-[11px] text-muted-foreground truncate">{r.hint}</div>
              </div>
              <ChevronRight className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          ))}
        </div>
      </section>

      <div className="mt-10 mb-4 text-center">
        <Link href="/modulos" className="text-xs text-muted-foreground underline hover:text-foreground">
          Volver al diseño anterior
        </Link>
      </div>
    </div>
  )
}

function ModuloCard({ mod, isFav, onPin, href }: { mod: Modulo; isFav: boolean; onPin: (id: string) => void; href: string }) {
  const Icon = mod.icon
  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <div className="group relative">
          <Link
            href={href}
            className="block bg-card border border-border rounded-[16px] p-5 hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all"
          >
            <div className={`w-11 h-11 rounded-[12px] grid place-items-center mb-4 ${mod.bg}`}>
              <Icon className="w-5 h-5" style={{ color: mod.color }} />
            </div>
            <h3 className="text-[14px] font-bold mb-1.5 pr-7">{mod.title}</h3>
            <p className="text-[12px] text-muted-foreground leading-snug">{mod.description}</p>
          </Link>
          <button
            type="button"
            aria-label={isFav ? "Quitar de favoritos" : "Pinear"}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onPin(mod.id) }}
            className={`absolute top-3 right-3 grid h-7 w-7 place-items-center rounded-full transition-colors ${
              isFav
                ? "bg-pink-light text-primary"
                : "bg-background text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100"
            }`}
          >
            {isFav ? <Pin className="h-3.5 w-3.5 fill-current" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
        </div>
      </HoverCardTrigger>
      {mod.hint && (
        <HoverCardContent className="w-72" side="top">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-[10px] grid place-items-center flex-shrink-0 ${mod.bg}`}>
              <Icon className="w-4 h-4" style={{ color: mod.color }} />
            </div>
            <div>
              <h4 className="text-[12.5px] font-bold">{mod.title}</h4>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{mod.hint}</p>
            </div>
          </div>
        </HoverCardContent>
      )}
    </HoverCard>
  )
}

function GridView({ items, favoritos, onPin, buildHref, hydrated }: {
  items: Modulo[]
  favoritos: string[]
  onPin: (id: string) => void
  buildHref: (m: Modulo) => string
  hydrated: boolean
}) {
  return (
    <>
      {hydrated && favoritos.length > 0 && (
        <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Pin className="h-3 w-3 text-primary" />
          <span>Tus módulos pineados aparecen primero.</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map(m => (
          <ModuloCard
            key={m.id}
            mod={m}
            isFav={favoritos.includes(m.id)}
            onPin={onPin}
            href={buildHref(m)}
          />
        ))}
      </div>
    </>
  )
}

function FavoritosView({ items, onPin, buildHref }: {
  items: Modulo[]
  onPin: (id: string) => void
  buildHref: (m: Modulo) => string
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="Aún no tienes módulos favoritos"
        desc="Pineá tus módulos más usados desde la grilla. Aparecerán aquí para acceso rápido."
      />
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map(m => (
        <ModuloCard
          key={m.id}
          mod={m}
          isFav={true}
          onPin={onPin}
          href={buildHref(m)}
        />
      ))}
    </div>
  )
}

function RecientesView({ items, buildHref }: {
  items: { href: string; ts: number; mod: Modulo }[]
  buildHref: (m: Modulo) => string
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Sin actividad reciente"
        desc="A medida que uses los módulos, tus últimas 5 visitas aparecerán aquí."
      />
    )
  }
  return (
    <div className="space-y-2">
      {items.map((r, i) => {
        const Icon = r.mod.icon
        const ago = formatRelativeTime(r.ts)
        return (
          <Link
            key={`${r.href}-${i}`}
            href={buildHref(r.mod)}
            className="group flex items-center gap-4 rounded-[12px] border border-border bg-card px-4 py-3 hover:border-primary transition-colors"
          >
            <div className={`w-10 h-10 rounded-[10px] grid place-items-center flex-shrink-0 ${r.mod.bg}`}>
              <Icon className="w-4 h-4" style={{ color: r.mod.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold">{r.mod.title}</div>
              <div className="text-[11px] text-muted-foreground">Última visita · {ago}</div>
            </div>
            <Badge variant="outline" className="text-[10px]">#{i + 1}</Badge>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        )
      })}
    </div>
  )
}

function WorkflowView({ buildHref }: { buildHref: (m: Modulo) => string }) {
  const ordered = flujoOrder
    .map(id => modules.find(m => m.id === id))
    .filter((m): m is Modulo => Boolean(m))

  return (
    <div className="rounded-[16px] border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-2">
        <Workflow className="h-4 w-4 text-primary" />
        <h2 className="text-[15px] font-extrabold">Flujo pedagógico encadenado</h2>
      </div>
      <p className="text-[12px] text-muted-foreground mb-5">
        Los 7 módulos en el orden recomendado para una clase completa.
      </p>

      <ol className="relative space-y-3 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
        {ordered.map((m, i) => {
          const Icon = m.icon
          const isLast = i === ordered.length - 1
          return (
            <li key={m.id} className="relative">
              <Link
                href={buildHref(m)}
                className="group flex items-start gap-4 rounded-[12px] border border-border bg-background p-3.5 hover:border-primary transition-colors"
              >
                <div className={`relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-card border-2 border-primary text-primary text-[13px] font-extrabold`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" style={{ color: m.color }} />
                    <span className="text-[13px] font-bold">{m.title}</span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground leading-snug">{m.description}</p>
                  {m.hint && (
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-pink-light px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <Sparkles className="h-2.5 w-2.5" /> {m.hint}
                    </div>
                  )}
                </div>
                <ArrowRight className="mt-2 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
              </Link>
              {!isLast && <div className="absolute left-[19px] -bottom-1 h-3 w-0.5" />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function EmptyState({ icon: Icon, title, desc }: { icon: typeof Compass; title: string; desc: string }) {
  return (
    <div className="rounded-[16px] border border-dashed border-border bg-card p-10 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-pink-light text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-[13.5px] font-extrabold">{title}</h3>
      <p className="mt-1 text-[12px] text-muted-foreground max-w-sm mx-auto leading-relaxed">{desc}</p>
    </div>
  )
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return "hace unos segundos"
  const min = Math.floor(sec / 60)
  if (min < 60) return `hace ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `hace ${hr} h`
  const d = Math.floor(hr / 24)
  return `hace ${d} d`
}
