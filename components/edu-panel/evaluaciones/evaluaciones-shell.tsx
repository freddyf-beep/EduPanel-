"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutList,
  ListChecks,
} from "lucide-react"
import { RubricasShell } from "@/components/edu-panel/rubricas/rubricas-shell"
import { ListasCotejoShell } from "@/components/edu-panel/listas-cotejo/listas-cotejo-shell"
import { PruebasShell } from "@/components/edu-panel/evaluaciones/pruebas/pruebas-shell"
import { GuiasShell } from "@/components/edu-panel/evaluaciones/guias/guias-shell"
import { EmptyState } from "@/components/edu-panel/evaluaciones/shared/empty-state"
import { cargarHorarioSemanal, esTipoLibre } from "@/lib/horario"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { cn } from "@/lib/utils"

type EvaluacionesTab = "pruebas" | "guias" | "rubricas" | "listas"

const TABS: Array<{ key: EvaluacionesTab; label: string; icon: typeof FileText }> = [
  { key: "pruebas", label: "Pruebas", icon: FileText },
  { key: "guias", label: "Guías", icon: ClipboardList },
  { key: "rubricas", label: "Rúbricas", icon: LayoutList },
  { key: "listas", label: "Listas", icon: ListChecks },
]

const VALID_TABS: ReadonlySet<EvaluacionesTab> = new Set(["pruebas", "guias", "rubricas", "listas"])

function isValidTab(value: string | null): value is EvaluacionesTab {
  return value !== null && VALID_TABS.has(value as EvaluacionesTab)
}

export function EvaluacionesShell() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura } = useActiveSubject()

  const tabParamRaw = searchParams.get("tab")
  const view = searchParams.get("view")
  const hasListaView =
    !!searchParams.get("listaId") && !searchParams.get("rubricaId") && !searchParams.get("pruebaId") && !searchParams.get("guiaId")
  const hasRubricaView =
    (!!searchParams.get("rubricaId") && !hasListaView && !searchParams.get("pruebaId") && !searchParams.get("guiaId")) ||
    (!hasListaView && (view === "crear" || view === "import" || view === "evaluacion"))

  // Tab activo con default "pruebas" y normalización de valores desconocidos (Req 1.1, 1.5).
  // Cuando la URL trae un `tab` no reconocido, se renderiza Pruebas como activo.
  const activeTab: EvaluacionesTab = isValidTab(tabParamRaw)
    ? tabParamRaw
    : hasListaView
      ? "listas"
    : hasRubricaView
      ? "rubricas"
      : "pruebas"

  // Si la URL trae un `tab` desconocido (no nulo), normalizamos la URL a `?tab=pruebas`
  // preservando el resto de query params (Req 1.5, Req 1.10).
  useEffect(() => {
    if (tabParamRaw !== null && !isValidTab(tabParamRaw)) {
      const curso = searchParams.get("curso")
      const unidadId = searchParams.get("unidadId")
      router.replace(
        buildUrl(
          "/evaluaciones",
          withAsignatura({ tab: "pruebas", curso, unidadId }, asignatura)
        )
      )
    }
  }, [tabParamRaw, searchParams, router, asignatura])

  // ─── Detectar usuario sin cursos configurados (Req 1.11) ──────────────────
  // Cargamos el horario semanal una vez al montar el shell para saber si el
  // docente tiene al menos un bloque lectivo (curso) configurado. Si no, el
  // shell renderiza un EmptyState prominente sobre el área de contenido con
  // CTA hacia /perfil. Filtramos `esTipoLibre` para descartar bloques no
  // lectivos (almuerzo, planificación, etc.).
  const [sinCursos, setSinCursos] = useState(false)

  useEffect(() => {
    let cancelled = false
    cargarHorarioSemanal()
      .then(horario => {
        if (cancelled) return
        const tieneCursos = horario.some(
          h => !esTipoLibre(h.tipo) && (h.resumen?.trim().length ?? 0) > 0,
        )
        setSinCursos(!tieneCursos)
      })
      .catch(() => {
        // Si la carga falla, no bloqueamos al docente con un empty state
        // engañoso: dejamos que cada hub muestre su propio error banner.
        if (!cancelled) setSinCursos(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Cambio de tab preservando `asignatura`, `curso` y `unidadId` (Req 1.5, 1.10).
  const goTab = (tab: EvaluacionesTab) => {
    const curso = searchParams.get("curso")
    const unidadId = searchParams.get("unidadId")
    router.push(
      buildUrl("/evaluaciones", withAsignatura({ tab, curso, unidadId }, asignatura))
    )
  }

  // Cuando estamos dentro de un editor o vista de resultados ocultamos el header
  // grande y mostramos solo un tab strip compacto sobre el contenido (Req 1.9).
  // Mantenemos los modos `evaluacion|import|crear` para no interferir con flujos
  // internos del shell de Rúbricas que también ocultan el header.
  const enEditor =
    view === "editor" ||
    view === "resultados" ||
    view === "evaluacion" ||
    view === "import" ||
    view === "crear"

  return (
    <div id="main-content" className={cn("mx-auto px-3 py-5 sm:px-5", enEditor ? "max-w-none" : "max-w-[1500px] space-y-5")}>
      {!enEditor && (
        <header className="flex flex-col gap-3 rounded-[16px] border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <BookOpenCheck className="h-5 w-5" />
              <span className="text-[11px] font-extrabold uppercase tracking-wide">Evaluaciones</span>
            </div>
            <h1 className="mt-1 text-[22px] font-extrabold text-foreground">Pruebas, guías, rúbricas y listas</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
              Crea evaluaciones y guías de aprendizaje desde cero, vinculadas al currículum oficial. Imprime para tu clase, aplica en pantalla o sincroniza notas con calificaciones.
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-[12px] border border-border bg-background p-1">
            {TABS.map(tab => {
              const Icon = tab.icon
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => goTab(tab.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12px] font-bold transition-colors",
                    active ? "bg-pink-light text-primary" : "text-muted-foreground hover:bg-card hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </header>
      )}

      {enEditor && (
        <div className="mb-3 mx-auto max-w-5xl flex items-center gap-1 rounded-[10px] border border-border bg-card p-1">
          {TABS.map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => goTab(tab.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[11.5px] font-bold transition-colors",
                  active ? "bg-pink-light text-primary" : "text-muted-foreground hover:bg-background hover:text-foreground"
                )}
              >
                <Icon className="h-3 w-3" />
                {tab.label}
              </button>
            )
          })}
        </div>
      )}

      {activeTab === "rubricas" && <RubricasShell />}
      {activeTab === "listas" && <ListasCotejoShell />}
      {activeTab === "pruebas" && (
        sinCursos && !enEditor ? (
          <SinCursosEmptyState onGoToPerfil={() => router.push("/perfil")} />
        ) : (
          <PruebasShell />
        )
      )}
      {activeTab === "guias" && (
        sinCursos && !enEditor ? (
          <SinCursosEmptyState onGoToPerfil={() => router.push("/perfil")} />
        ) : (
          <GuiasShell />
        )
      )}
    </div>
  )
}

/**
 * EmptyState prominente del shell cuando el docente abre `/evaluaciones` sin
 * tener cursos configurados en su horario.
 *
 * Solo se monta sobre los tabs Pruebas y Guías: la pestaña Rúbricas tiene su
 * propio manejo interno y NO debe modificarse (Req 16.1). Los hubs internos
 * mantienen su selector sticky con el aviso inline "Configura cursos en Mi
 * Perfil"; este empty state agrega un CTA más visible centrado en el área
 * principal (Req 1.11).
 */
function SinCursosEmptyState({ onGoToPerfil }: { onGoToPerfil: () => void }) {
  return (
    <div className="mx-auto mt-6 max-w-2xl">
      <EmptyState
        icon={GraduationCap}
        title="Configura tus cursos en Mi Perfil"
        text="Para crear pruebas y guías necesitas tener al menos un curso configurado en tu horario semanal."
        action={{
          label: "Ir a Mi Perfil",
          icon: ArrowRight,
          onClick: onGoToPerfil,
        }}
      />
    </div>
  )
}
