"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { BookOpenCheck, ClipboardList, FileText, LayoutList, Loader2, ListChecks } from "lucide-react"
import { DriveExplorer } from "@/components/edu-panel/drive/drive-explorer"
import { DriveWorkspaceActions } from "@/components/edu-panel/drive/drive-workspace-actions"
import { RubricasShell } from "@/components/edu-panel/rubricas/rubricas-shell"
import { ListasCotejoShell } from "@/components/edu-panel/listas-cotejo/listas-cotejo-shell"
import { cargarHorarioSemanal, esTipoLibre } from "@/lib/horario"
import { cargarPlanCurso, type UnidadPlan } from "@/lib/curriculo"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { cn } from "@/lib/utils"

type EvaluacionesTab = "pruebas" | "guias" | "rubricas" | "listas"

const TABS: Array<{ key: EvaluacionesTab; label: string; icon: typeof FileText }> = [
  { key: "pruebas", label: "Pruebas", icon: FileText },
  { key: "guias", label: "Guias", icon: ClipboardList },
  { key: "rubricas", label: "Rubricas", icon: LayoutList },
  { key: "listas", label: "Listas", icon: ListChecks },
]

interface CursoOption {
  nombre: string
  color: string
}

export function EvaluacionesShell() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura } = useActiveSubject()
  const hasRubricaView = !!searchParams.get("view") || !!searchParams.get("rubricaId")
  const hasListaView = !!searchParams.get("listaId")
  const tabParam = searchParams.get("tab") as EvaluacionesTab | null
  
  const activeTab = hasListaView
    ? "listas"
    : hasRubricaView
      ? "rubricas"
      : TABS.some(tab => tab.key === tabParam)
        ? tabParam!
        : "pruebas"

  const [cursos, setCursos] = useState<CursoOption[]>([])
  const [curso, setCurso] = useState("")
  const [unidades, setUnidades] = useState<UnidadPlan[]>([])
  const [unidadId, setUnidadId] = useState("")
  const [loadingCursos, setLoadingCursos] = useState(true)
  const [loadingUnidades, setLoadingUnidades] = useState(false)

  useEffect(() => {
    setLoadingCursos(true)
    cargarHorarioSemanal()
      .then(horario => {
        const map = new Map<string, string>()
        horario.filter(item => !esTipoLibre(item.tipo)).forEach(item => {
          const nombre = item.resumen?.trim()
          if (nombre && !map.has(nombre)) map.set(nombre, item.color)
        })
        const next = Array.from(map.entries()).map(([nombre, color]) => ({ nombre, color }))
        setCursos(next)
        setCurso(prev => prev || next[0]?.nombre || "")
      })
      .catch(() => {
        setCursos([])
        setCurso("")
      })
      .finally(() => setLoadingCursos(false))
  }, [])

  useEffect(() => {
    if (!curso) {
      setUnidades([])
      setUnidadId("")
      return
    }
    setLoadingUnidades(true)
    cargarPlanCurso(asignatura, curso)
      .then(plan => {
        const next = plan?.units || []
        setUnidades(next)
        setUnidadId(prev => next.some(unit => String(unit.id) === prev) ? prev : String(next[0]?.id || ""))
      })
      .catch(() => {
        setUnidades([])
        setUnidadId("")
      })
      .finally(() => setLoadingUnidades(false))
  }, [asignatura, curso])

  const unidad = useMemo(
    () => unidades.find(unit => String(unit.id) === unidadId) || null,
    [unidadId, unidades],
  )

  const goTab = (tab: EvaluacionesTab) => {
    router.push(buildUrl("/evaluaciones", withAsignatura({ tab }, asignatura)))
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-3 py-5 sm:px-5">
      <header className="flex flex-col gap-3 rounded-[16px] border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <BookOpenCheck className="h-5 w-5" />
            <span className="text-[11px] font-extrabold uppercase tracking-wide">Evaluaciones</span>
          </div>
          <h1 className="mt-1 text-[22px] font-extrabold text-foreground">Pruebas, guias, rubricas y listas</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Ten tu Drive personal a mano para revisar documentos de evaluacion sin salir de EduPanel.
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

      {activeTab === "rubricas" && <RubricasShell />}
      {activeTab === "listas" && <ListasCotejoShell />}
      {activeTab !== "rubricas" && activeTab !== "listas" && (
        <DocumentosEvaluacionView
          tipo={activeTab as "pruebas" | "guias"}
          asignatura={asignatura}
          cursos={cursos}
          curso={curso}
          setCurso={setCurso}
          unidades={unidades}
          unidad={unidad}
          unidadId={unidadId}
          setUnidadId={setUnidadId}
          loadingCursos={loadingCursos}
          loadingUnidades={loadingUnidades}
        />
      )}
    </div>
  )
}

function DocumentosEvaluacionView({
  tipo,
  asignatura,
  cursos,
  curso,
  setCurso,
  unidades,
  unidad,
  unidadId,
  setUnidadId,
  loadingCursos,
  loadingUnidades,
}: {
  tipo: "pruebas" | "guias"
  asignatura: string
  cursos: CursoOption[]
  curso: string
  setCurso: (curso: string) => void
  unidades: UnidadPlan[]
  unidad: UnidadPlan | null
  unidadId: string
  setUnidadId: (id: string) => void
  loadingCursos: boolean
  loadingUnidades: boolean
}) {
  const title = tipo === "pruebas" ? "Pruebas" : "Guias"
  const help = tipo === "pruebas"
    ? "Busca, previsualiza y fija la carpeta donde guardas pruebas del curso o unidad."
    : "Busca, previsualiza y fija la carpeta donde guardas guias, actividades y material de apoyo."

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-[16px] border border-border bg-card p-4 shadow-sm">
        <div>
          <h2 className="text-[15px] font-extrabold text-foreground">{title}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{help}</p>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Curso</label>
          {loadingCursos ? (
            <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando cursos...
            </div>
          ) : cursos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-[12px] text-muted-foreground">
              Configura cursos en <Link href="/perfil?tab=cursos" className="font-bold text-primary underline">Mi Perfil</Link>.
            </div>
          ) : (
            <select
              value={curso}
              onChange={event => setCurso(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-semibold outline-none focus:border-primary"
            >
              {cursos.map(item => (
                <option key={item.nombre} value={item.nombre}>{item.nombre}</option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Unidad</label>
          {loadingUnidades ? (
            <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando unidades...
            </div>
          ) : unidades.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-[12px] text-muted-foreground">
              Este curso aun no tiene unidades en planificaciones.
            </div>
          ) : (
            <select
              value={unidadId}
              onChange={event => setUnidadId(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-semibold outline-none focus:border-primary"
            >
              {unidades.map(unit => (
                <option key={unit.id} value={String(unit.id)}>{unit.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="rounded-[12px] border border-border bg-background p-3 text-[11.5px] leading-relaxed text-muted-foreground">
          Drive es personal: EduPanel crea carpetas solo en tu cuenta y guarda metadata minima para volver rapido.
        </div>
        <DriveWorkspaceActions
          context={{
            tipo,
            asignatura,
            curso,
            unidadId: unidadId || undefined,
            unidadNombre: unidad?.name,
          }}
          setupLabel={`Crear carpeta de ${title.toLowerCase()}`}
          openLabel="Abrir carpeta"
          backupLabel={`Respaldar ${title.toLowerCase()}`}
          buildBackupData={() => ({
            tipo,
            asignatura,
            curso,
            unidadId,
            unidadNombre: unidad?.name,
            unidades,
          })}
        />
      </aside>

      <DriveExplorer
        context={{
          tipo,
          asignatura,
          curso,
          unidadId: unidadId || undefined,
          unidadNombre: unidad?.name,
        }}
        title={`Drive personal - ${title}`}
        description={unidad ? `${curso} / ${unidad.name}` : `${curso || "Curso"} / selecciona una unidad`}
      />
    </div>
  )
}
