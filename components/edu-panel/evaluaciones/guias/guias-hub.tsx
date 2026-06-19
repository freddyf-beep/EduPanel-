"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ClipboardList, Plus,
  Pencil, Copy, Trash2,
} from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarGuiasCurso, duplicarGuia, eliminarGuia, type GuiaTemplate } from "@/lib/guias"
import { cargarPruebasCurso, type PruebaTemplate } from "@/lib/pruebas"
import { cargarPlanCurso, type UnidadPlan } from "@/lib/curriculo"

import { HubHeader } from "@/components/edu-panel/evaluaciones/shared/hub-header"
import { MetricsGrid } from "@/components/edu-panel/evaluaciones/shared/metrics-grid"
import { FilterBar } from "@/components/edu-panel/evaluaciones/shared/filter-bar"
import { DocumentCard } from "@/components/edu-panel/evaluaciones/shared/document-card"
import { EmptyState } from "@/components/edu-panel/evaluaciones/shared/empty-state"
import { ErrorBanner } from "@/components/edu-panel/evaluaciones/shared/error-banner"
import LoadingSkeleton from "@/components/edu-panel/evaluaciones/shared/loading-skeleton"
import { CursoUnidadSelector } from "@/components/edu-panel/evaluaciones/shared/curso-unidad-selector"
import { VerCoberturaButton } from "@/components/edu-panel/evaluaciones/shared/ver-cobertura-button"

// ─── Tipos locales ────────────────────────────────────────────────────────

type FiltroTipo = "todas" | "aprendizaje" | "refuerzo" | "ejercitacion" | "evaluacion_formativa"
type FiltroEstado = "todas" | "borrador" | "lista" | "archivada"

// ─── Normalización ────────────────────────────────────────────────────────

function normalizar(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function unidadIdsDePlan(unidad: UnidadPlan): string[] {
  const ids = [String(unidad.id)]
  if (unidad.unidadCurricularId) ids.push(unidad.unidadCurricularId)
  else if (Number.isFinite(unidad.id)) ids.push(`unidad_${unidad.id}`)
  return Array.from(new Set(ids.filter(Boolean)))
}

function unidadIdsEquivalentes(unidadId: string, unidad?: UnidadPlan | null): string[] {
  const ids = [unidadId]
  if (unidad) ids.push(...unidadIdsDePlan(unidad))
  else if (/^\d+$/.test(unidadId)) ids.push(`unidad_${unidadId}`)
  return Array.from(new Set(ids.filter(Boolean)))
}

function agruparPorAsignatura<T extends { asignatura?: string }>(items: T[]) {
  const grupos = new Map<string, T[]>()
  items.forEach(item => {
    const key = item.asignatura?.trim() || "Sin asignatura"
    grupos.set(key, [...(grupos.get(key) || []), item])
  })
  return Array.from(grupos, ([asignatura, documentos]) => ({ asignatura, documentos }))
}

// ─── Componente principal ─────────────────────────────────────────────────

export function GuiasHub() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura } = useActiveSubject()

  // Estado lifteado desde URL params para el selector sticky.
  const cursoFromUrl = searchParams.get("curso") || ""
  const unidadIdFromUrl = searchParams.get("unidadId") || ""

  const [curso, setCurso] = useState<string>(cursoFromUrl)
  const [unidadId, setUnidadId] = useState<string>(unidadIdFromUrl)

  useEffect(() => {
    setCurso(cursoFromUrl)
  }, [cursoFromUrl])
  useEffect(() => {
    setUnidadId(unidadIdFromUrl)
  }, [unidadIdFromUrl])

  // ── Estado de guías y otros para cobertura ─────────────────────────────
  const [guias, setGuias] = useState<GuiaTemplate[]>([])
  const [pruebas, setPruebas] = useState<PruebaTemplate[]>([])
  const [unidades, setUnidades] = useState<UnidadPlan[]>([])
  const [cargandoGuias, setCargandoGuias] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Filtros y búsqueda ────────────────────────────────────────────────
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todas")
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todas")
  const [filtroOA, setFiltroOA] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState("")

  // ── Cargar guías, pruebas y unidades ──────────────────────────────────
  const refrescar = useCallback(() => {
    let cancelled = false
    if (!curso) {
      setGuias([])
      setPruebas([])
      setUnidades([])
      return
    }
    setCargandoGuias(true)
    setError(null)
    cargarGuiasCurso(curso)
      .then(guias => { if (!cancelled) setGuias(guias) })
      .catch(e => { if (!cancelled) setError(e?.message || "Error cargando guías") })
      .finally(() => { if (!cancelled) setCargandoGuias(false) })

    cargarPruebasCurso(curso)
      .then(pruebas => { if (!cancelled) setPruebas(pruebas) })
      .catch(() => {})

    cargarPlanCurso(asignatura, curso)
      .then(plan => { if (!cancelled) setUnidades(plan?.units || []) })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [asignatura, curso])
  useEffect(() => refrescar(), [refrescar])

  const unidadActiva = useMemo(() => {
    return unidades.find(u => unidadIdsDePlan(u).includes(String(unidadId))) || null
  }, [unidades, unidadId])

  const unidadIdsFiltro = useMemo(
    () => unidadIdsEquivalentes(unidadId, unidadActiva),
    [unidadId, unidadActiva],
  )

  // ── Métricas (tarea 4.2) ──────────────────────────────────────────────
  const { total, conContenido, conActividades, listas } = useMemo(() => ({
    total: guias.length,
    conContenido: guias.filter(g => g.secciones.some(s => s.contenido.length > 0)).length,
    conActividades: guias.filter(g => g.secciones.some(s => s.actividades.length > 0)).length,
    listas: guias.filter(g => g.estado === "lista").length,
  }), [guias])

  // ── OAs disponibles para filtro ────────────────────────────────────────
  const oasDisponibles = useMemo(() => {
    const set = new Set<string>()
    guias.forEach(g => {
      g.secciones.forEach(s => {
        s.actividades.forEach(a => {
          if (a.oaVinculado) set.add(a.oaVinculado)
        })
      })
    })
    return Array.from(set).sort()
  }, [guias])

  // ── Guías filtradas (tarea 4.3) ───────────────────────────────────────
  const guiasFiltradas = useMemo(() => {
    let r = guias

    // 1. Filtrar por búsqueda normalizada (query)
    if (busqueda.trim()) {
      const q = normalizar(busqueda.trim())
      r = r.filter(g =>
        normalizar(g.nombre || "").includes(q) ||
        normalizar(g.objetivo || "").includes(q) ||
        normalizar(g.unidadNombre || "").includes(q)
      )
    }

    // 2. Filtrar por tipo
    if (filtroTipo !== "todas") {
      r = r.filter(g => (g.tipoGuia || "aprendizaje") === filtroTipo)
    }

    // 3. Filtrar por estado
    if (filtroEstado !== "todas") {
      r = r.filter(g => (g.estado || "borrador") === filtroEstado)
    }

    // 4. Filtrar por OA vinculado (selección única)
    if (filtroOA) {
      r = r.filter(g => {
        return g.secciones.some(s =>
          s.actividades.some(a =>
            a.oaVinculado === filtroOA
          )
        )
      })
    }

    // 5. Filtrar por unidadId del query param
    if (unidadId) {
      r = r.filter(g => unidadIdsFiltro.includes(String(g.unidadId || "")))
    }

    return r
  }, [guias, busqueda, filtroTipo, filtroEstado, filtroOA, unidadId, unidadIdsFiltro])

  const guiasPorAsignatura = useMemo(
    () => agruparPorAsignatura(guiasFiltradas),
    [guiasFiltradas],
  )

  // ── Navegación ────────────────────────────────────────────────────────
  const irACrear = () => {
    if (!curso) return
    router.push(buildUrl("/evaluaciones", withAsignatura({
      tab: "guias", view: "editor", curso, unidadId: unidadId || undefined
    }, asignatura)))
  }

  // ── Acciones de card (tarea 4.4) ──────────────────────────────────────
  const handleEditar = (g: GuiaTemplate) => {
    router.push(buildUrl("/evaluaciones", withAsignatura({
      tab: "guias", view: "editor", guiaId: g.id,
    }, g.asignatura || asignatura)))
  }

  const handleDuplicar = (g: GuiaTemplate) => {
    duplicarGuia(g).then(copia => setGuias(prev => [copia, ...prev]))
  }

  const handleEliminar = (g: GuiaTemplate) => {
    if (!confirm(`¿Eliminar la guía "${g.nombre || "sin nombre"}"? Esta acción no se puede deshacer.`)) return
    eliminarGuia(g.id).then(() => setGuias(prev => prev.filter(x => x.id !== g.id)))
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Selector sticky de curso + unidad (encima del HubHeader) */}
      <CursoUnidadSelector
        curso={curso}
        setCurso={setCurso}
        unidadId={unidadId}
        setUnidadId={setUnidadId}
        accent="violet"
        extra={
          <VerCoberturaButton
            unidad={unidadActiva}
            pruebas={pruebas}
            guias={guias}
            onOpenPrueba={(p) => {
              router.push(
                buildUrl(
                  "/evaluaciones",
                  withAsignatura(
                    { tab: "pruebas", view: "editor", pruebaId: p.id },
                    p.asignatura || asignatura,
                  ),
                ),
              )
            }}
            onOpenGuia={handleEditar}
            accent="violet"
          />
        }
      />

      {/* Header (tarea 4.5) */}
      <HubHeader
        icon={ClipboardList}
        title="Guías"
        subtitle="Material didáctico imprimible: contenido, actividades, cierre y vínculo curricular."
        accent="violet"
        primary={{
          label: "Crear manual",
          icon: Plus,
          onClick: irACrear,
          disabled: !curso,
        }}
        secondary={[]}
      />

      {/* Métricas (tarea 4.2) */}
      <MetricsGrid
        accent="violet"
        items={[
          { label: "Total", value: total },
          { label: "Con contenido", value: conContenido },
          { label: "Con actividades", value: conActividades },
          { label: "Listas", value: listas },
        ]}
      />

      {/* Filtros y búsqueda (tarea 4.3) */}
      <div className="space-y-3">
          <FilterBar
            q={busqueda}
            setQ={setBusqueda}
            filters={[
              ["todas", "Todas"],
              ["aprendizaje", "Aprendizaje"],
              ["refuerzo", "Refuerzo"],
              ["ejercitacion", "Ejercitación"],
              ["evaluacion_formativa", "Eval. formativa"],
            ]}
            active={filtroTipo}
            setActive={v => setFiltroTipo(v as FiltroTipo)}
            placeholder="Buscar guía, objetivo o unidad..."
            accent="violet"
          />

          {/* Filtro de estado (múltiple) */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFiltroEstado("todas")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filtroEstado === "todas"
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Todos los estados
            </button>
            <button
              onClick={() => setFiltroEstado("borrador")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filtroEstado === "borrador"
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Borradores
            </button>
            <button
              onClick={() => setFiltroEstado("lista")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filtroEstado === "lista"
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Listas
            </button>
            <button
              onClick={() => setFiltroEstado("archivada")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filtroEstado === "archivada"
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Archivadas
            </button>
          </div>

          {/* Filtro de OA vinculado (selección única) */}
          {oasDisponibles.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-2">
                OA vinculado
              </label>
              <select
                value={filtroOA || ""}
                onChange={e => setFiltroOA(e.target.value || null)}
                className="w-full h-9 rounded border border-border bg-background px-3 text-xs"
              >
                <option value="">Todos los OAs</option>
                {oasDisponibles.map(oa => (
                  <option key={oa} value={oa}>
                    {oa}
                  </option>
                ))}
              </select>
            </div>
          )}
      </div>

      {/* Error de carga (tarea 4.5) */}
      {error && (
        <ErrorBanner
          message={error}
          onRetry={refrescar}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Contenido principal */}
      {cargandoGuias ? (
        <LoadingSkeleton.HubSkeleton accent="violet" />
      ) : guias.length === 0 ? (
        /* Empty state: sin guías (tarea 4.5) */
        <EmptyState
          icon={ClipboardList}
          title={`Aún no hay guías para ${curso || "este curso"}`}
          text="Crea material didáctico manualmente, con contenido, actividades y pauta imprimible."
          action={curso ? { label: "Crear manual", onClick: irACrear, icon: Plus } : undefined}
          accent="violet"
        />
      ) : guiasFiltradas.length === 0 ? (
        /* Empty state: sin coincidencias (tarea 4.5) */
        <EmptyState
          icon={ClipboardList}
          title="No hay guías que coincidan"
          action={{
            label: "Limpiar filtros",
            onClick: () => {
              setBusqueda("")
              setFiltroTipo("todas")
              setFiltroEstado("todas")
              setFiltroOA(null)
            },
          }}
          accent="violet"
        />
      ) : (
        /* Grid de cards (tarea 4.4) */
        <div className="space-y-5">
          {guiasPorAsignatura.map(({ asignatura: grupoAsignatura, documentos }) => (
            <section key={grupoAsignatura} className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-[13px] font-black uppercase tracking-wide text-foreground">
                  {grupoAsignatura}
                </h3>
                <span className="text-[12px] font-semibold text-muted-foreground">
                  {documentos.length} {documentos.length === 1 ? "guía" : "guías"}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {documentos.map(g => (
                  <DocumentCard
                    key={g.id}
                    variant="guia"
                    accent="violet"
                    icon={ClipboardList}
                    badges={[
                      { label: g.tipoGuia || "aprendizaje", tone: "primary" },
                      {
                        label: g.estado || "borrador",
                        tone: g.estado === "lista" ? "success" : "neutral",
                      },
                    ]}
                    title={(g.numeroGuia ? g.numeroGuia + " - " : "") + (g.nombre || "Guía sin nombre")}
                    subtitle={[g.asignatura, g.curso, g.unidadNombre].filter(Boolean).join(" - ")}
                    miniStats={[
                      { label: "Sec.", value: g.secciones.length },
                      { label: "Act.", value: g.secciones.reduce((acc, s) => acc + s.actividades.length, 0) },
                      { label: "Pts", value: g.puntajeMaximo || 0 },
                      { label: "Min", value: g.tiempoMinutos || 0 },
                    ]}
                    topActions={[
                      {
                        label: "Duplicar",
                        icon: Copy,
                        tone: "neutral",
                        onClick: () => handleDuplicar(g),
                      },
                    ]}
                    actions={[
                      {
                        label: "Editar",
                        icon: Pencil,
                        tone: "primary",
                        onClick: () => handleEditar(g),
                      },
                      {
                        label: "Eliminar",
                        icon: Trash2,
                        tone: "danger",
                        onClick: () => handleEliminar(g),
                      },
                    ]}
                    onClick={() => handleEditar(g)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
