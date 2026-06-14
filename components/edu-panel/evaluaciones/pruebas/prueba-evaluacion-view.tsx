"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Heart,
  Loader2,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react"

import { useActiveSubject } from "@/hooks/use-active-subject"
import { useAiAccess } from "@/hooks/use-ai-access"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarEstudiantes, type Estudiante } from "@/lib/estudiantes"
import {
  cargarPrueba,
  normalizarPrueba,
  type AdecuacionPiePrueba,
  type PruebaTemplate,
} from "@/lib/pruebas"
import { guardarPruebaConSnapshot } from "@/lib/snapshots-hook"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/use-toast"
import { AdaptarPieModal } from "../shared/adaptar-pie-modal"
import { CalibradorBloomModal } from "../shared/calibrador-bloom-modal"
import { SimulacionAlumnosModal } from "../shared/simulacion-alumnos-modal"
import LoadingSkeleton from "../shared/loading-skeleton"
import { ErrorBanner } from "../shared/error-banner"
import { EmptyState } from "../shared/empty-state"

interface Props {
  pruebaId: string
}

function nuevoIdAdaptacion() {
  return `pie_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function fechaCorta(value: unknown): string {
  if (!value) return "Sin fecha"
  const date =
    value instanceof Date ? value :
    typeof value === "string" || typeof value === "number" ? new Date(value) :
    typeof (value as { toDate?: () => Date })?.toDate === "function" ? (value as { toDate: () => Date }).toDate() :
    null
  if (!date || Number.isNaN(date.getTime())) return "Sin fecha"
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date)
}

export function PruebaEvaluacionView({ pruebaId }: Props) {
  const router = useRouter()
  const { asignatura } = useActiveSubject()
  const { hasAiAccess, loading: aiAccessLoading } = useAiAccess()
  const [prueba, setPrueba] = useState<PruebaTemplate | null>(null)
  const [estudiantesPie, setEstudiantesPie] = useState<Estudiante[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adaptarOpen, setAdaptarOpen] = useState(false)
  const [simulacionOpen, setSimulacionOpen] = useState(false)
  const [bloomOpen, setBloomOpen] = useState(false)
  const [adaptacionActivaId, setAdaptacionActivaId] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError(null)

    cargarPrueba(pruebaId)
      .then(async (p) => {
        if (cancel) return
        if (!p) {
          setError("Prueba no encontrada")
          return
        }
        setPrueba(p)
        setAdaptacionActivaId(p.adaptacionesPie?.[0]?.id ?? null)
        const estudiantes = await cargarEstudiantes(p.curso).catch(() => [])
        if (!cancel) setEstudiantesPie(estudiantes.filter((est) => est.pie))
      })
      .catch((err) => {
        if (!cancel) setError(err?.message || "Error al cargar la prueba")
      })
      .finally(() => {
        if (!cancel) setLoading(false)
      })

    return () => {
      cancel = true
    }
  }, [pruebaId])

  const resumen = useMemo(() => {
    if (!prueba) return { secciones: 0, items: 0, puntaje: 0 }
    const items = prueba.secciones.reduce((acc, sec) => acc + sec.items.length, 0)
    return {
      secciones: prueba.secciones.length,
      items,
      puntaje: prueba.puntajeMaximo,
    }
  }, [prueba])

  const adaptacionActiva = prueba?.adaptacionesPie?.find((a) => a.id === adaptacionActivaId) ?? null

  const handleVolver = () => {
    router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "pruebas" }, asignatura)))
  }

  const guardarPruebaActualizada = async (next: PruebaTemplate, mensaje: string) => {
    setSaving(true)
    try {
      const normalizada = normalizarPrueba(next)
      await guardarPruebaConSnapshot(normalizada)
      setPrueba(normalizada)
      toast({ title: mensaje })
    } catch (err: any) {
      const message = err?.message || "No se pudo guardar la prueba"
      toast({
        title: "Error al guardar",
        description: message,
      })
      throw new Error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleAdaptado = async (
    resultado: {
      nombre: string
      instruccionesGenerales: string[]
      secciones: any[]
      notasAdecuacion: string
    },
    contexto: {
      estudianteId?: string
      estudianteNombre?: string
      diagnostico: string
    },
  ) => {
    if (!prueba) return
    const now = new Date().toISOString()
    const adaptacion: AdecuacionPiePrueba = {
      id: nuevoIdAdaptacion(),
      nombre: resultado.nombre || `Adecuación PIE - ${contexto.estudianteNombre || contexto.diagnostico || "sin estudiante"}`,
      estudianteId: contexto.estudianteId,
      estudianteNombre: contexto.estudianteNombre,
      diagnostico: contexto.diagnostico,
      notasAdecuacion: resultado.notasAdecuacion || "",
      instruccionesGenerales: Array.isArray(resultado.instruccionesGenerales) ? resultado.instruccionesGenerales : prueba.instruccionesGenerales,
      secciones: Array.isArray(resultado.secciones) ? resultado.secciones : prueba.secciones,
      createdAt: now,
      updatedAt: now,
    }
    const next = {
      ...prueba,
      adaptacionesPie: [...(prueba.adaptacionesPie || []), adaptacion],
      updatedAt: now,
    }
    await guardarPruebaActualizada(next, "Adecuación PIE guardada dentro de la prueba")
    setAdaptacionActivaId(adaptacion.id)
  }

  const eliminarAdaptacion = async (adaptacion: AdecuacionPiePrueba) => {
    if (!prueba) return
    const restantes = (prueba.adaptacionesPie || []).filter((item) => item.id !== adaptacion.id)
    const next = {
      ...prueba,
      adaptacionesPie: restantes.length ? restantes : undefined,
      updatedAt: new Date().toISOString(),
    }
    await guardarPruebaActualizada(next, "Adecuación PIE eliminada")
    setAdaptacionActivaId(restantes[0]?.id ?? null)
  }

  if (aiAccessLoading || loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <LoadingSkeleton.EditorSkeleton />
      </div>
    )
  }

  if (!hasAiAccess) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <EmptyState
          icon={ShieldCheck}
          title="IA bloqueada"
          text="Las herramientas Adaptar PIE, Simular estudiantes y Calibrar Bloom requieren permiso de administrador."
          action={{ label: "Volver", icon: ArrowLeft, onClick: handleVolver }}
        />
      </div>
    )
  }

  if (error || !prueba) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <EmptyState
          icon={AlertTriangle}
          title="No pudimos abrir la evaluación"
          text="Vuelve al listado e intenta abrir otra prueba."
          action={{ label: "Volver", icon: ArrowLeft, onClick: handleVolver }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={handleVolver}
              className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver a pruebas
            </button>
            <h1 className="truncate text-[20px] font-extrabold text-foreground">{prueba.nombre || "Prueba sin nombre"}</h1>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {prueba.asignatura} · {prueba.curso}{prueba.unidadNombre ? ` · ${prueba.unidadNombre}` : ""}
            </p>
          </div>
          <span className="rounded-full bg-rose-100 px-3 py-1 text-[11px] font-extrabold uppercase text-rose-700">
            {prueba.estado || "borrador"}
          </span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <Metric label="Secciones" value={resumen.secciones} />
          <Metric label="Ítems" value={resumen.items} />
          <Metric label="Puntaje" value={`${resumen.puntaje} pts`} />
          <Metric label="Adaptaciones PIE" value={prueba.adaptacionesPie?.length || 0} />
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <ActionCard
          icon={Heart}
          title="Adaptar PIE"
          text={`${estudiantesPie.length} estudiante${estudiantesPie.length === 1 ? "" : "s"} PIE detectado${estudiantesPie.length === 1 ? "" : "s"}.`}
          onClick={() => setAdaptarOpen(true)}
          disabled={saving}
        />
        <ActionCard
          icon={Users}
          title="Simular estudiantes"
          text="Estima claridad, tiempos y dificultades probables de la prueba."
          onClick={() => setSimulacionOpen(true)}
          disabled={saving}
        />
        <ActionCard
          icon={Award}
          title="Calibrar Bloom"
          text="Analiza niveles cognitivos y distribución de exigencia."
          onClick={() => setBloomOpen(true)}
          disabled={saving}
        />
      </section>

      <section className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-extrabold text-foreground">Adecuaciones PIE guardadas</h2>
            <p className="text-[12px] text-muted-foreground">Variantes internas de esta misma prueba. No crean documentos nuevos.</p>
          </div>
          {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {(prueba.adaptacionesPie || []).length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-border bg-muted/30 p-5 text-center text-[12px] text-muted-foreground">
            Aún no hay adaptaciones PIE guardadas para esta prueba.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
            <div className="space-y-2">
              {(prueba.adaptacionesPie || []).map((adaptacion) => {
                const active = adaptacion.id === adaptacionActivaId
                return (
                  <button
                    key={adaptacion.id}
                    type="button"
                    onClick={() => setAdaptacionActivaId(adaptacion.id)}
                    className={cn(
                      "w-full rounded-[10px] border px-3 py-2 text-left transition-colors",
                      active ? "border-rose-300 bg-rose-50 text-rose-950" : "border-border bg-background hover:bg-muted/50",
                    )}
                  >
                    <span className="block truncate text-[12.5px] font-extrabold">{adaptacion.nombre}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {adaptacion.estudianteNombre || adaptacion.diagnostico || "Sin estudiante"} · {fechaCorta(adaptacion.createdAt)}
                    </span>
                  </button>
                )
              })}
            </div>

            {adaptacionActiva && (
              <div className="rounded-[12px] border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[14px] font-extrabold text-foreground">{adaptacionActiva.nombre}</h3>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      {adaptacionActiva.estudianteNombre || "Sin estudiante asignado"}
                      {adaptacionActiva.diagnostico ? ` · ${adaptacionActiva.diagnostico}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void eliminarAdaptacion(adaptacionActiva)}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </button>
                </div>

                {adaptacionActiva.notasAdecuacion && (
                  <div className="mt-3 rounded-[10px] border border-emerald-200 bg-emerald-50 p-3 text-[12px] leading-relaxed text-emerald-900">
                    {adaptacionActiva.notasAdecuacion}
                  </div>
                )}

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <Metric label="Instrucciones" value={adaptacionActiva.instruccionesGenerales.length} />
                  <Metric label="Secciones" value={adaptacionActiva.secciones.length} />
                  <Metric
                    label="Ítems adaptados"
                    value={adaptacionActiva.secciones.reduce((acc, sec) => acc + sec.items.length, 0)}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <AdaptarPieModal
        open={adaptarOpen}
        onOpenChange={setAdaptarOpen}
        tipo="prueba"
        documento={prueba}
        estudiantesPie={estudiantesPie}
        onAdaptado={handleAdaptado}
      />
      <SimulacionAlumnosModal
        isOpen={simulacionOpen}
        onClose={() => setSimulacionOpen(false)}
        documento={prueba}
        tipo="prueba"
      />
      <CalibradorBloomModal
        isOpen={bloomOpen}
        onClose={() => setBloomOpen(false)}
        documento={prueba}
      />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[10px] border border-border bg-background px-3 py-2">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[14px] font-extrabold text-foreground">{value}</div>
    </div>
  )
}

function ActionCard({
  icon: Icon,
  title,
  text,
  onClick,
  disabled,
}: {
  icon: typeof ShieldCheck
  title: string
  text: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[14px] border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50/40 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-[10px] bg-rose-100 text-rose-700">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[13px] font-extrabold text-foreground">{title}</div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{text}</p>
    </button>
  )
}

export default PruebaEvaluacionView
