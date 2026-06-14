"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  HelpCircle, MessageSquare, Clock3, LifeBuoy, BookOpen, ArrowRight, Search,
  Wifi, WifiOff, Sparkles, Keyboard, Shield, Cpu, Calendar, ClipboardList,
  ClipboardCheck, Users, LayoutGrid, Compass, Lightbulb, Map,
  Rocket, Hash, Play, X, Check,
} from "lucide-react"
import { useOnlineStatus } from "@/hooks/use-online-status"
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Badge } from "@/components/ui/badge"

type TabKey = "flujo" | "atajos" | "faqs" | "estado"
const TABS: { key: TabKey; label: string; icon: typeof Compass }[] = [
  { key: "flujo",  label: "Flujo de trabajo", icon: Compass },
  { key: "atajos", label: "Atajos de teclado", icon: Keyboard },
  { key: "faqs",   label: "Preguntas frecuentes", icon: HelpCircle },
  { key: "estado", label: "Estado del sistema", icon: Cpu },
]

const flujo = [
  { n: 1, title: "Mis planificaciones", desc: "Crea tus unidades por curso y asignatura.", href: "/planificaciones", icon: BookOpen, color: "from-pink-500 to-rose-500" },
  { n: 2, title: "Ver Unidad",          desc: "Selecciona OA, habilidades, actitudes y DUA.", href: "/ver-unidad", icon: Map, color: "from-fuchsia-500 to-pink-500" },
  { n: 3, title: "Cronograma de Unidad",desc: "Distribuye OA en clases con fechas reales.", href: "/cronograma", icon: Calendar, color: "from-violet-500 to-fuchsia-500" },
  { n: 4, title: "Actividades",         desc: "Planifica Inicio/Desarrollo/Cierre de cada clase.", href: "/actividades", icon: Lightbulb, color: "from-indigo-500 to-violet-500" },
  { n: 5, title: "Libro de Clases",     desc: "Prototipo visual; no registra asistencia ni firma.", href: "/libro-clases", icon: ClipboardList, color: "from-blue-500 to-indigo-500" },
  { n: 6, title: "Calificaciones",      desc: "Registra notas y revisa la distribución del curso.", href: "/calificaciones", icon: ClipboardCheck, color: "from-emerald-500 to-blue-500" },
  { n: 7, title: "Perfil 360",          desc: "Vista integrada de cada estudiante.", href: "/perfil-360", icon: Users, color: "from-teal-500 to-emerald-500" },
]

const atajos: { contexto: string; entries: { keys: string[]; desc: string }[] }[] = [
  {
    contexto: "Globales (en cualquier página)",
    entries: [
      { keys: ["?"],            desc: "Abrir buscador de ayuda" },
      { keys: ["Ctrl", "K"],    desc: "Abrir paleta de comandos" },
      { keys: ["Esc"],          desc: "Cerrar diálogo o paleta" },
    ],
  },
  {
    contexto: "Inicio (Dashboard v2)",
    entries: [
      { keys: ["H"],            desc: "Saltar a la siguiente clase del día" },
      { keys: ["1"],            desc: "Ver Lunes" },
      { keys: ["2"],            desc: "Ver Martes" },
      { keys: ["3"],            desc: "Ver Miércoles" },
      { keys: ["4"],            desc: "Ver Jueves" },
      { keys: ["5"],            desc: "Ver Viernes" },
      { keys: ["F"],            desc: "Abrir firma demo" },
      { keys: ["A"],            desc: "Abrir vista demo de asistencia" },
    ],
  },
  {
    contexto: "Libro de Clases (prototipo)",
    entries: [
      { keys: ["1"],            desc: "Marcar Presente (P)" },
      { keys: ["2"],            desc: "Marcar Ausente (A)" },
      { keys: ["3"],            desc: "Marcar Tardanza (T)" },
      { keys: ["4"],            desc: "Marcar Retiro (R)" },
      { keys: ["Espacio"],      desc: "Pasar al siguiente alumno" },
      { keys: ["←", "→"],       desc: "Navegar entre alumnos" },
    ],
  },
  {
    contexto: "Calificaciones v2 (tabla)",
    entries: [
      { keys: ["Tab"],          desc: "Saltar a la siguiente celda" },
      { keys: ["Enter"],        desc: "Saltar a la celda inferior" },
      { keys: ["="],            desc: "Iniciar fórmula (=N1+N2/2)" },
    ],
  },
  {
    contexto: "Perfil 360 v2",
    entries: [
      { keys: ["↑"],            desc: "Estudiante anterior" },
      { keys: ["↓"],            desc: "Estudiante siguiente" },
      { keys: ["C"],            desc: "Comparar con otro estudiante" },
    ],
  },
  {
    contexto: "Cronograma v2",
    entries: [
      { keys: ["S"],            desc: "Vista Semana" },
      { keys: ["M"],            desc: "Vista Mes" },
      { keys: ["G"],            desc: "Vista Gantt por unidad" },
      { keys: ["L"],            desc: "Vista Lista" },
    ],
  },
]

const faqs = [
  {
    q: "¿Dónde se guardan mis datos?",
    a: "Todos los datos viven en Firestore bajo tu cuenta personal de Firebase. Apoderados y estudiantes no tienen acceso a tus planificaciones, libros ni calificaciones.",
  },
  {
    q: "¿Cómo paso el contexto del curso entre páginas?",
    a: "El parámetro ?curso= se mantiene automáticamente al navegar dentro de la plataforma. Cada módulo recuerda qué curso estabas usando.",
  },
  {
    q: "¿Cuándo se guardan los cambios?",
    a: "La mayoría de campos se autoguardan ~2.5 segundos después de dejar de escribir. En la barra superior verás un indicador 'Guardando...' / 'Guardado' para confirmar.",
  },
  {
    q: "¿Puedo trabajar sin internet?",
    a: "Algunas vistas funcionan parcialmente offline (lectura), pero los cambios solo se sincronizan cuando vuelve la conexión. Mira el bloque 'Estado del sistema' para confirmar.",
  },
  {
    q: "¿Cómo sincronizo mi planificación con Google Calendar?",
    a: "Desde Mi Perfil → Conexiones puedes vincular Google Calendar. Una vez conectado, las actividades del Cronograma se sincronizan automáticamente.",
  },
  {
    q: "¿Qué hago si una página se ve rara?",
    a: "Recarga la página y revisa el bloque 'Estado del sistema'. Si persiste, usa Contactar soporte con el detalle de lo que estabas haciendo.",
  },
  {
    q: "¿Puedo importar mis estudiantes desde un Excel?",
    a: "Sí. En Mi Perfil → Mis Cursos, cada curso permite importar JSON o copiar/pegar lista. Los nombres se ordenan automáticamente alfabéticamente con índices.",
  },
  {
    q: "¿Las notas usan la escala chilena?",
    a: "Sí. Todas las calificaciones usan la fórmula chilena (mínimo 1.0, máximo 7.0, aprueba con 4.0). El sistema convierte porcentajes a notas automáticamente.",
  },
  {
    q: "¿Cómo funciona el Libro de Clases ahora?",
    a: "Por ahora queda como prototipo visual. Sirve para mostrar la idea, pero no guarda asistencia, firmas ni leccionario real.",
  },
  {
    q: "¿Qué hacen los iconos de colores en el Cronograma?",
    a: "Cada color identifica una unidad distinta (heredado de tu plan de unidad). En la vista Gantt verás barras con esos mismos colores que muestran la duración de cada unidad.",
  },
]

const principios = [
  { texto: "Firestore es la fuente única de verdad para todos tus datos.", icon: Shield },
  { texto: "El parámetro ?curso= se pasa entre páginas para mantener contexto.", icon: Hash },
  { texto: "Los OA seleccionados en Ver Unidad alimentan el Cronograma y las Actividades.", icon: ArrowRight },
  { texto: "El Libro de Clases está visible solo como prototipo no operativo.", icon: Play },
  { texto: "Perfil 360 debe depender de datos académicos reales antes de asistencia.", icon: Users },
]

const tips = [
  "Guarda siempre antes de cambiar de página.",
  "En el Cronograma usa 'Fechas automáticas' para asignar desde el ICS.",
  "El Libro de Clases queda como muestra hasta definir si EduPanel llevará asistencia diaria.",
  "Prioriza planificaciones, actividades, evaluaciones y exportación antes de módulos administrativos.",
  "Marca tus OA cubiertos para que el progreso se actualice.",
]

export function SoporteShell() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = (searchParams.get("tab") as TabKey | null)
  const [activeTab, setActiveTab] = useState<TabKey>(tabParam ?? "flujo")
  const [openCommand, setOpenCommand] = useState(false)
  const [tourStep, setTourStep] = useState<number | null>(null)

  const isOnline = useOnlineStatus()

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) setActiveTab(tabParam ?? "flujo")
    })
    return () => {
      cancelled = true
    }
  }, [tabParam])

  const goToTab = useCallback((key: TabKey) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set("tab", key)
    router.replace(`/soporte?${params.toString()}`, { scroll: false })
    setActiveTab(key)
  }, [router, searchParams])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return
      if (e.key === "?" || (e.key === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        setOpenCommand(prev => !prev)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const searchableItems = useMemo(() => {
    const items: { label: string; hint: string; href?: string; tab?: TabKey }[] = []
    flujo.forEach(p => items.push({ label: p.title, hint: p.desc, href: p.href }))
    faqs.forEach(f => items.push({ label: f.q, hint: f.a, tab: "faqs" }))
    atajos.forEach(g => g.entries.forEach(e => items.push({ label: e.desc, hint: g.contexto, tab: "atajos" })))
    return items
  }, [])

  return (
    <div className="mx-auto max-w-[1100px] px-3 sm:px-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-pink-500 via-fuchsia-500 to-violet-500 px-6 py-7 sm:px-8 sm:py-9 text-white mb-6">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-12 -bottom-16 h-44 w-44 rounded-full bg-black/10 blur-2xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold backdrop-blur">
            <Sparkles className="h-3 w-3" /> CENTRO DE AYUDA · BETA
          </div>
          <h1 className="mt-3 text-[24px] sm:text-[30px] font-extrabold leading-tight">
            ¿En qué te puedo ayudar hoy?
          </h1>
          <p className="mt-1 max-w-xl text-[13px] text-white/85">
            Flujo de trabajo, atajos de teclado, preguntas frecuentes y estado del sistema en un solo lugar.
          </p>

          {/* Search trigger */}
          <button
            type="button"
            onClick={() => setOpenCommand(true)}
            className="group mt-5 flex w-full max-w-md items-center gap-3 rounded-[12px] bg-white/15 px-4 py-2.5 text-left text-white/85 backdrop-blur hover:bg-white/25 transition-colors"
          >
            <Search className="h-4 w-4" />
            <span className="text-[13px] font-medium">Busca cualquier ayuda...</span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-bold">
              <Kbd className="bg-white/25 text-white border-0">?</Kbd>
              <span className="opacity-60">o</span>
              <KbdGroup>
                <Kbd className="bg-white/25 text-white border-0">Ctrl</Kbd>
                <Kbd className="bg-white/25 text-white border-0">K</Kbd>
              </KbdGroup>
            </span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-10 -mx-3 mb-5 bg-background/85 px-3 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => goToTab(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-t-[10px] px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                  isActive
                    ? "bg-pink-light text-primary border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {activeTab === "flujo" && <FlujoView onTour={() => setTourStep(0)} />}
      {activeTab === "atajos" && <AtajosView />}
      {activeTab === "faqs" && <FaqsView />}
      {activeTab === "estado" && <EstadoView isOnline={isOnline} />}

      {/* Command Palette */}
      <CommandDialog open={openCommand} onOpenChange={setOpenCommand}>
        <CommandInput placeholder="Buscar en ayuda... (módulos, FAQs, atajos)" />
        <CommandList>
          <CommandEmpty>Sin coincidencias.</CommandEmpty>
          <CommandGroup heading="Ir a un módulo">
            {flujo.map(p => (
              <CommandItem
                key={p.href}
                value={`${p.title} ${p.desc}`}
                onSelect={() => { setOpenCommand(false); router.push(p.href) }}
              >
                <p.icon className="h-4 w-4" />
                <span>{p.title}</span>
                <span className="ml-auto text-[11px] text-muted-foreground truncate max-w-xs">{p.desc}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Preguntas frecuentes">
            {faqs.slice(0, 6).map((f, i) => (
              <CommandItem
                key={i}
                value={`${f.q} ${f.a}`}
                onSelect={() => { setOpenCommand(false); goToTab("faqs") }}
              >
                <HelpCircle className="h-4 w-4" />
                <span className="truncate">{f.q}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Acciones">
            <CommandItem onSelect={() => { setOpenCommand(false); goToTab("atajos") }}>
              <Keyboard className="h-4 w-4" /> Ver todos los atajos
            </CommandItem>
            <CommandItem onSelect={() => { setOpenCommand(false); goToTab("estado") }}>
              <Cpu className="h-4 w-4" /> Estado del sistema
            </CommandItem>
            <CommandItem onSelect={() => { setOpenCommand(false); setTourStep(0) }}>
              <Rocket className="h-4 w-4" /> Iniciar tour interactivo
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Tour overlay */}
      {tourStep !== null && (
        <TourOverlay step={tourStep} onClose={() => setTourStep(null)} onNext={() => setTourStep(s => (s ?? 0) + 1)} onPrev={() => setTourStep(s => Math.max(0, (s ?? 0) - 1))} />
      )}
    </div>
  )
}

function FlujoView({ onTour }: { onTour: () => void }) {
  return (
    <div className="space-y-6">
      {/* Diagrama horizontal del flujo */}
      <section className="rounded-[16px] border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-[16px] font-extrabold flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" /> Flujo de planificación
            </h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Secuencia recomendada para una clase completa.
            </p>
          </div>
          <button
            onClick={onTour}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90"
          >
            <Rocket className="h-3.5 w-3.5" /> Tomar el tour
          </button>
        </div>

        <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {flujo.map(paso => {
            const Icon = paso.icon
            return (
              <li key={paso.n}>
                <Link
                  href={paso.href}
                  className="group flex h-full items-start gap-3 rounded-[12px] border border-border bg-background p-3.5 transition-all hover:border-primary hover:shadow-sm"
                >
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br ${paso.color} text-white`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{paso.n}</Badge>
                      <span className="text-[13px] font-bold truncate">{paso.title}</span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground leading-snug">{paso.desc}</p>
                  </div>
                  <ArrowRight className="mt-1 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[16px] border border-border bg-card p-5">
          <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-pink-light text-primary">
            <Shield className="h-4 w-4" />
          </div>
          <h3 className="text-[14px] font-extrabold">Principios</h3>
          <ul className="mt-2.5 space-y-1.5">
            {principios.map((p, i) => {
              const Icon = p.icon
              return (
                <li key={i} className="flex items-start gap-2 text-[12.5px] text-muted-foreground leading-relaxed">
                  <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                  <span>{p.texto}</span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="rounded-[16px] border border-border bg-card p-5">
          <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <Lightbulb className="h-4 w-4" />
          </div>
          <h3 className="text-[14px] font-extrabold">Consejos rápidos</h3>
          <ul className="mt-2.5 space-y-1.5">
            {tips.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-muted-foreground leading-relaxed">
                <span className="mt-1 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[16px] border border-border bg-card p-5">
          <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <Clock3 className="h-4 w-4" />
          </div>
          <h3 className="text-[14px] font-extrabold">Horario soporte técnico</h3>
          <div className="mt-2.5 space-y-1.5 text-[12.5px] text-muted-foreground">
            <div className="flex items-center justify-between rounded-[8px] bg-background px-3 py-1.5">
              <span>Lunes a Viernes</span><span className="font-mono font-semibold">08:00 – 23:00</span>
            </div>
            <div className="flex items-center justify-between rounded-[8px] bg-background px-3 py-1.5">
              <span>Sábado</span><span className="font-mono font-semibold">14:00 – 23:00</span>
            </div>
            <div className="flex items-center justify-between rounded-[8px] bg-background px-3 py-1.5">
              <span>Domingo</span><span className="font-mono font-semibold opacity-60">Cerrado</span>
            </div>
          </div>
        </section>

        <section className="rounded-[16px] border border-border bg-card p-5">
          <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            <MessageSquare className="h-4 w-4" />
          </div>
          <h3 className="text-[14px] font-extrabold">Privacidad</h3>
          <p className="mt-2.5 text-[12.5px] text-muted-foreground leading-relaxed">
            Apoderados y estudiantes no acceden a tus planificaciones. Los datos están en Firebase Firestore bajo tu cuenta y proyecto personal.
          </p>
        </section>
      </div>
    </div>
  )
}

function AtajosView() {
  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-pink-200 bg-pink-50 px-4 py-3 dark:border-pink-900/40 dark:bg-pink-950/30">
        <p className="text-[12px] text-pink-900 dark:text-pink-100 leading-relaxed">
          <Keyboard className="inline-block h-3.5 w-3.5 mr-1" />
          Los atajos solo se activan cuando NO estás escribiendo en un campo de texto.
        </p>
      </div>

      {atajos.map(grupo => (
        <section key={grupo.contexto} className="rounded-[16px] border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-background px-4 py-2.5">
            <h3 className="text-[13px] font-extrabold">{grupo.contexto}</h3>
          </div>
          <ul className="divide-y divide-border">
            {grupo.entries.map((e, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-background/50">
                <span className="text-[12.5px] text-foreground">{e.desc}</span>
                <KbdGroup>
                  {e.keys.map((k, idx) => (
                    <Kbd key={idx} className="text-[11px] px-1.5 h-6">{k}</Kbd>
                  ))}
                </KbdGroup>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function FaqsView() {
  return (
    <div className="rounded-[16px] border border-border bg-card p-5">
      <h2 className="text-[16px] font-extrabold mb-1 flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-primary" /> Preguntas frecuentes
      </h2>
      <p className="text-[12px] text-muted-foreground mb-4">
        Respuestas a las dudas más comunes sobre EduPanel.
      </p>
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((f, i) => (
          <AccordionItem key={i} value={`faq-${i}`}>
            <AccordionTrigger className="text-[13px] font-bold text-left">{f.q}</AccordionTrigger>
            <AccordionContent className="text-[12.5px] text-muted-foreground leading-relaxed">
              {f.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

function EstadoView({ isOnline }: { isOnline: boolean }) {
  const estados = [
    {
      label: "Conexión a internet",
      ok: isOnline,
      okText: "Conectado",
      failText: "Sin conexión",
      icon: isOnline ? Wifi : WifiOff,
      hint: isOnline ? "Tus cambios se sincronizan en tiempo real con Firestore." : "Tus cambios se guardarán localmente y se sincronizarán al volver la conexión.",
    },
    {
      label: "Almacenamiento Firestore",
      ok: isOnline,
      okText: "Operativo",
      failText: "No disponible",
      icon: Cpu,
      hint: "Lectura y escritura de planificaciones, libros y notas.",
    },
    {
      label: "Autenticación",
      ok: true,
      okText: "Activa",
      failText: "Caducada",
      icon: Shield,
      hint: "Tu sesión está activa. La sesión se renueva automáticamente.",
    },
  ]

  return (
    <div className="space-y-4">
      <section className={`rounded-[16px] border p-5 ${isOnline ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${isOnline ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {isOnline ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </div>
          <div>
            <h2 className={`text-[15px] font-extrabold ${isOnline ? "text-emerald-900 dark:text-emerald-100" : "text-amber-900 dark:text-amber-100"}`}>
              {isOnline ? "Todo funcionando con normalidad" : "Estás trabajando sin conexión"}
            </h2>
            <p className={`text-[12px] mt-0.5 ${isOnline ? "text-emerald-800/80 dark:text-emerald-200/80" : "text-amber-800/80 dark:text-amber-200/80"}`}>
              {isOnline ? "Última verificación: hace unos segundos" : "Tus cambios se guardarán al volver la conexión"}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        {estados.map(e => {
          const Icon = e.icon
          return (
            <div key={e.label} className="rounded-[12px] border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <Badge variant={e.ok ? "default" : "destructive"} className="text-[10px]">
                  {e.ok ? e.okText : e.failText}
                </Badge>
              </div>
              <h3 className="text-[12.5px] font-bold">{e.label}</h3>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{e.hint}</p>
            </div>
          )
        })}
      </div>

      <section className="rounded-[16px] border border-border bg-card p-5">
        <h3 className="text-[13px] font-extrabold mb-3">Información del sistema</h3>
        <dl className="grid gap-2 sm:grid-cols-2 text-[12px]">
          <div className="flex justify-between rounded-[8px] bg-background px-3 py-1.5">
            <dt className="text-muted-foreground">Plataforma</dt>
            <dd className="font-mono font-semibold">EduPanel · Web</dd>
          </div>
          <div className="flex justify-between rounded-[8px] bg-background px-3 py-1.5">
            <dt className="text-muted-foreground">Modo de datos</dt>
            <dd className="font-mono font-semibold">Firebase Firestore</dd>
          </div>
          <div className="flex justify-between rounded-[8px] bg-background px-3 py-1.5">
            <dt className="text-muted-foreground">Navegador</dt>
            <dd className="font-mono font-semibold">{typeof navigator !== "undefined" ? navigator.userAgent.split(" ").slice(-2).join(" ") : "—"}</dd>
          </div>
          <div className="flex justify-between rounded-[8px] bg-background px-3 py-1.5">
            <dt className="text-muted-foreground">Última verificación</dt>
            <dd className="font-mono font-semibold">{new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

const tourSteps: { title: string; desc: string; icon: typeof Compass }[] = [
  { title: "¡Bienvenido al tour!", desc: "Te mostraré las secciones principales de la nueva ayuda en pasos cortos.", icon: Rocket },
  { title: "Flujo de trabajo", desc: "Las 7 etapas del proceso pedagógico, desde planificar la unidad hasta el Perfil 360.", icon: Compass },
  { title: "Atajos de teclado", desc: "Cada página renovada tiene atajos. Pulsa ? en cualquier momento para abrir el buscador.", icon: Keyboard },
  { title: "FAQs y estado", desc: "Respuestas a dudas comunes y un panel para verificar conexión y servicios.", icon: HelpCircle },
  { title: "Listo para comenzar", desc: "Cuando quieras volver al tour, búscalo en la paleta (Ctrl+K → 'tour').", icon: Check },
]

function TourOverlay({ step, onClose, onNext, onPrev }: { step: number; onClose: () => void; onNext: () => void; onPrev: () => void }) {
  if (step >= tourSteps.length) {
    onClose()
    return null
  }
  const s = tourSteps[step]
  const Icon = s.icon
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md overflow-hidden rounded-[16px] border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-pink-500 via-fuchsia-500 to-violet-500 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold opacity-80">PASO {step + 1} DE {tourSteps.length}</p>
              <h3 className="text-[16px] font-extrabold">{s.title}</h3>
            </div>
          </div>
        </div>
        <div className="p-6">
          <p className="text-[13px] text-foreground leading-relaxed">{s.desc}</p>
          <div className="mt-5 flex items-center justify-between">
            <button
              onClick={onClose}
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              Salir del tour
            </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={onPrev}
                  className="rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold hover:bg-background"
                >
                  Atrás
                </button>
              )}
              <button
                onClick={onNext}
                className="rounded-[8px] bg-primary px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90"
              >
                {step === tourSteps.length - 1 ? "Finalizar" : "Siguiente"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
