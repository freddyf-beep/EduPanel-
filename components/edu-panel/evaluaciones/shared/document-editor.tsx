"use client"

// ═══════════════════════════════════════════════════════════════════════════
// DocumentEditor — Shell "headless" para editores de Pruebas y Guías
// ─────────────────────────────────────────────────────────────────────────
// Encapsula el ciclo de vida común de un editor de documento educativo:
//
//   • Estado del documento + dirty tracking + mensaje de guardado.
//   • Carga inicial (existente o nuevo) + watch de curso/unidad.
//   • Guardar con snapshot, eliminar, duplicar, duplicar como otro tipo.
//   • Toolbar sticky con todas las acciones comunes (Back, Save, Export,
//     IA, Banco, Historial, PIE, Simulación, Bloom, Duplicar, Eliminar).
//   • Modales: IA, Banco, Historial, PIE, Simulación, Bloom (con
//     callbacks de aplicación que la variante provee).
//   • UnsavedChangesGuard + shortcuts configurables.
//   • Loading + error state.
//
// La variante aporta un objeto `config` con su tipo, sus loaders/savers y
// las callbacks para "aplicar" los datos de cada modal. El cuerpo (body)
// se renderiza vía la prop `children` que recibe un `ctx` con todo el
// estado y las operaciones expuestas.
// ═══════════════════════════════════════════════════════════════════════════

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Award,
  ClipboardList,
  Copy,
  Eye,
  FileCheck,
  FileX,
  Heart,
  History,
  Library,
  Loader2,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react"

import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarPlanCurso, type UnidadPlan } from "@/lib/curriculo"
import { cargarInfoColegio, cargarPerfil, type InfoColegio } from "@/lib/perfil"
import { cargarEstudiantes, type Estudiante } from "@/lib/estudiantes"
import { getFeatureFlags } from "@/lib/feature-flags"
import { useContextoCurricular } from "@/hooks/use-contexto-curricular"
import { COMMON_SHORTCUTS, useShortcuts } from "@/lib/keyboard-shortcuts"
import { useToast } from "@/components/ui/use-toast"

import { cn } from "@/lib/utils"
import { StickyEditorToolbar, type StickyEditorToolbarBadge } from "./sticky-editor-toolbar"
import { UnsavedChangesGuard } from "./unsaved-changes-guard"
import { ErrorBanner } from "./error-banner"
import { EmptyState } from "./empty-state"
import { EditorSkeleton } from "./loading-skeleton"
import { AIPanel } from "./ai-panel"
import { ItemBank } from "./item-bank"
import type { ItemBankEntry } from "@/lib/item-bank"
import { SnapshotPanel } from "./snapshot-panel"
import { AdaptarPieModal } from "./adaptar-pie-modal"
import { SimulacionAlumnosModal } from "./simulacion-alumnos-modal"
import { CalibradorBloomModal } from "./calibrador-bloom-modal"
import { ToolbarButton } from "./editor-primitives"
import { useEditorMensaje } from "@/hooks/use-editor-mensaje"

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type DocumentEditorVariant = "prueba" | "guia"
export type DocumentEditorAccent = "rose" | "violet"

export type Mensaje = { tipo: "ok" | "err"; texto: string }

/** Snapshot genérico que el panel de historial pasa al callback. */
export interface SnapshotPayload<T> {
  payload: T
  id: string
  createdAt?: unknown
}

/** Resultado del modal Adaptar PIE. */
export interface AdaptarPIEResultado {
  nombre?: string
  instruccionesGenerales?: string[]
  secciones?: any[]
  notasAdecuacion?: string
}

/** Configuración de la variante para el shell. */
export interface DocumentEditorConfig<T> {
  variant: DocumentEditorVariant
  accent: DocumentEditorAccent

  /** Tipo de documento en el snapshot (ej. "pruebas" | "guias"). */
  snapshotTipo: "pruebas" | "guias"

  /** Carga un documento existente por id. */
  loadDocument: (id: string) => Promise<T | null>
  /** Persiste el documento creando snapshot inmutable. */
  saveWithSnapshot: (doc: T) => Promise<void>
  /** Elimina el documento por id. */
  deleteDocument: (id: string) => Promise<void>
  /** Duplica el documento. */
  duplicateDocument: (doc: T) => Promise<T>
  /** Crea un documento nuevo en blanco. */
  createNew: (asignatura: string, curso: string) => T
  /** Crea un documento nuevo adaptado a PIE (post-procesado). */
  createPIECopy?: (
    base: T,
    resultado: AdaptarPIEResultado,
    helpers: { id: string; timestamp: number },
  ) => T

  /** Mensaje si la carga falla. */
  notFoundMessage: string

  /** Devuelve el texto del counter "{N} ítems · {P} pts". */
  counterText: (doc: T) => string
  /** Devuelve el badge (estado) del documento. */
  badge: (doc: T) => StickyEditorToolbarBadge
  /** `true` si el documento está bloqueado (ej. prueba aplicada). */
  isLocked: (doc: T) => boolean
  /** Texto del banner de bloqueo. */
  lockedMessage: (doc: T) => string
  /** URL de retorno al cerrar el editor. */
  getBackUrl: (asignatura: string) => string
  /** URL al editor tras duplicar. */
  getEditorUrl: (asignatura: string, id: string) => string

  /** Exporta el documento a PDF. */
  exportDocument: (
    doc: T,
    modo: "para_alumno" | "con_pauta",
    extras: { colegio: InfoColegio | null; profesorNombre: string },
  ) => void

  /** Resuelve metadatos curriculares desde la unidad del documento. */
  resolverCurriculo: (doc: T) => Promise<{
    unidadId?: string
    unidadNombre?: string
    metadatosCurriculares: any
  }>
  /** Carga OAs para el documento. */
  cargarOAs: (
    asignatura: string,
    curso: string,
    unidadId: string,
    oasExistentes?: any[],
  ) => Promise<any[]>

  /** Crea un documento del otro tipo a partir de éste (prueba → guía). */
  convertToOther?: (doc: T) => Promise<{ documento: any; omitidos: any[] }>
  /** URL al editor del otro tipo tras conversión. */
  getOtherEditorUrl?: (asignatura: string, id: string) => string
  /** Etiqueta del botón "Duplicar como otro tipo". */
  convertOtherLabel?: string

  /** Habilita el modal de Bloom (sólo pruebas). */
  showBloom?: boolean
}

/** Contexto que el shell expone a la prop `children`. */
export interface DocumentEditorContext<T> {
  doc: T
  setDoc: React.Dispatch<React.SetStateAction<T | null>>
  updateDoc: (next: T | ((p: T) => T)) => void
  dirty: boolean
  setDirty: (v: boolean) => void
  guardando: boolean
  setGuardando: (v: boolean) => void
  mensaje: Mensaje | null
  setMensaje: (m: Mensaje | null) => void
  flashMensaje: (tipo: "ok" | "err", texto: string, ms?: number) => void

  asignatura: string
  colegio: InfoColegio | null
  profesorNombre: string
  unidadesCurso: UnidadPlan[]
  estudiantesPie: Estudiante[]
  isLocked: boolean
  esNuevo: boolean

  guardar: () => Promise<void>
  eliminar: () => Promise<void>
  duplicar: () => Promise<void>
  duplicarComoOtro: () => Promise<void>
  exportar: (modo: "para_alumno" | "con_pauta") => void
  irAtras: () => void
  sincronizarConCurriculo: () => Promise<void>

  panelIA: boolean
  setPanelIA: (v: boolean | ((p: boolean) => boolean)) => void
  bancoAbierto: boolean
  setBancoAbierto: (v: boolean | ((p: boolean) => boolean)) => void
  panelHistorial: boolean
  setPanelHistorial: (v: boolean | ((p: boolean) => boolean)) => void
  panelPie: boolean
  setPanelPie: (v: boolean | ((p: boolean) => boolean)) => void
  showSimulacion: boolean
  setShowSimulacion: (v: boolean | ((p: boolean) => boolean)) => void
  showBloom: boolean
  setShowBloom: (v: boolean | ((p: boolean) => boolean)) => void

  /** Callbacks que la variante implementa para aplicar resultados de los
   *  modales al documento. Se inyectan vía `handlers` y se exponen aquí. */
  handlers: DocumentEditorHandlers<T>
}

/** Callbacks que la variante provee para aplicar datos externos al doc. */
export interface DocumentEditorHandlers<T> {
  /** Aplicar resultado del modal IA al documento. */
  aplicarIA: (data: any, ctx: DocumentEditorContext<T>) => void
  /** Insertar un ítem del banco (ya clonado, listo para el doc). */
  insertarItemDelBanco: (
    entry: ItemBankEntry,
    ctx: DocumentEditorContext<T>,
  ) => void
  /** Guardar un ítem en el banco de ítems. */
  guardarItemEnBanco: (item: any, ctx: DocumentEditorContext<T>) => Promise<void>
  /** Drag&drop sobre una sección (mover/reordenar/banco). */
  handleSectionDrop?: (e: React.DragEvent, sectionId: string, ctx: DocumentEditorContext<T>) => void
  /** Drag&drop sobre un ítem. */
  handleItemDropOnItem?: (e: React.DragEvent, itemId: string, sectionId: string, ctx: DocumentEditorContext<T>) => void
}

// ─── Componente ─────────────────────────────────────────────────────────────

export interface DocumentEditorProps<T> {
  config: DocumentEditorConfig<T>
  /** id del documento a editar. Si no se pasa, se crea uno nuevo. */
  id?: string
  cursoInicial?: string
  unidadIdInicial?: string
  unidadNombreInicial?: string
  onClose?: () => void
  /** Handlers específicos de la variante para aplicar resultados de modales. */
  handlers: DocumentEditorHandlers<T>
  /** Cuerpo del editor (recibe el contexto con todo el estado). */
  children: (ctx: DocumentEditorContext<T>) => ReactNode
}

export function DocumentEditor<T>({
  config,
  id,
  cursoInicial,
  unidadIdInicial,
  unidadNombreInicial,
  onClose,
  handlers,
  children,
}: DocumentEditorProps<T>) {
  const router = useRouter()
  const { asignatura } = useActiveSubject()
  const { toast } = useToast()
  const { mensaje, setMensaje, flash } = useEditorMensaje()

  // ── Estado del documento ─────────────────────────────────────────────
  const [doc, setDoc] = useState<T | null>(null)
  const [dirty, setDirty] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // ── Carga + PIE / colegio / profesor ─────────────────────────────────
  const [colegio, setColegio] = useState<InfoColegio | null>(null)
  const [profesorNombre, setProfesorNombre] = useState("")
  const [unidadesCurso, setUnidadesCurso] = useState<UnidadPlan[]>([])
  const [estudiantesPie, setEstudiantesPie] = useState<Estudiante[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  // ── Modales ──────────────────────────────────────────────────────────
  const [panelIA, setPanelIA] = useState(false)
  const [bancoAbierto, setBancoAbierto] = useState(false)
  const [panelHistorial, setPanelHistorial] = useState(false)
  const [panelPie, setPanelPie] = useState(false)
  const [showSimulacion, setShowSimulacion] = useState(false)
  const [showBloom, setShowBloom] = useState(false)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [featureFlags, setFeatureFlags] = useState<Record<string, any>>({})

  useEffect(() => {
    getFeatureFlags().then(setFeatureFlags).catch(console.error)
  }, [])

  // ── Wrapper de setDoc que marca dirty ────────────────────────────────
  const updateDoc = useCallback(
    (next: T | ((p: T) => T)) => {
      setDoc(prev => {
        if (!prev) return prev
        return typeof next === "function"
          ? (next as (p: T) => T)(prev)
          : next
      })
      setDirty(true)
    },
    [],
  )

  // ── Carga inicial (existente o nuevo) ────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setCargando(true)
    setErrorCarga(null)

    Promise.all([cargarInfoColegio(), cargarPerfil()])
      .then(([col, perf]) => {
        if (cancelled) return
        setColegio(col)
        setProfesorNombre(perf?.tipoProfesor || "")
      })
      .catch(() => {})

    if (id) {
      config
        .loadDocument(id)
        .then(d => {
          if (cancelled) return
          if (!d) {
            setErrorCarga(config.notFoundMessage)
          } else {
            setDoc(d)
            setDirty(false)
            if ((d as any).curso) {
              cargarPlanCurso((d as any).asignatura, (d as any).curso)
                .then(plan => {
                  if (!cancelled) setUnidadesCurso(plan?.units || [])
                })
                .catch(() => {})
            }
          }
          setCargando(false)
        })
        .catch((e: Error) => {
          if (cancelled) return
          setErrorCarga(e.message || "No fue posible cargar el documento")
          setCargando(false)
        })
    } else {
      const nuevo = config.createNew(asignatura, cursoInicial || "")
      if (unidadIdInicial) (nuevo as any).unidadId = unidadIdInicial
      if (unidadNombreInicial)
        (nuevo as any).unidadNombre = unidadNombreInicial
      setDoc(nuevo)
      setDirty(false)
      if (cursoInicial) {
        cargarPlanCurso(asignatura, cursoInicial)
          .then(plan => {
            if (!cancelled) setUnidadesCurso(plan?.units || [])
          })
          .catch(() => {})
      }
      setCargando(false)
    }

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ── Watch curso: actualiza unidades y PIE ───────────────────────────
  useEffect(() => {
    if (!doc) return
    const curso = (doc as any).curso
    if (!curso) return
    cargarPlanCurso((doc as any).asignatura, curso)
      .then(plan => setUnidadesCurso(plan?.units || []))
      .catch(() => setUnidadesCurso([]))
    cargarEstudiantes(curso)
      .then(est => setEstudiantesPie(est.filter(e => e.pie)))
      .catch(() => setEstudiantesPie([]))
  }, [doc && (doc as any).curso, doc && (doc as any).asignatura])

  // ── Contexto curricular (para el panel IA) ─────────────────────────
  const { contexto: contextoCurricular } = useContextoCurricular({
    asignatura,
    curso: (doc as any)?.curso || "",
    unidadId: (doc as any)?.unidadId,
    unidadNombre: (doc as any)?.unidadNombre,
  })

  // ── Operaciones de alto nivel ───────────────────────────────────────
  const guardar = useCallback(async () => {
    if (!doc) return
    if (!(doc as any).curso) {
      flash("err", "Selecciona un curso antes de guardar")
      return
    }
    setGuardando(true)
    try {
      await config.saveWithSnapshot(doc)
      setDirty(false)
      flash("ok", "Guardado")
    } catch (e: any) {
      flash("err", e?.message || "Error al guardar")
    } finally {
      setGuardando(false)
    }
  }, [config, doc, flash])

  const eliminar = useCallback(async () => {
    if (!doc) return
    if (!confirmarEliminar) {
      setConfirmarEliminar(true)
      return
    }
    try {
      await config.deleteDocument((doc as any).id)
      setDirty(false)
      if (onClose) onClose()
      else router.push(buildUrl("/evaluaciones", withAsignatura({ tab: config.variant === "prueba" ? "pruebas" : "guias" }, asignatura)))
    } catch (e: any) {
      flash("err", e?.message || "Error al eliminar")
    }
  }, [asignatura, config, confirmarEliminar, doc, flash, onClose, router])

  const duplicar = useCallback(async () => {
    if (!doc) return
    try {
      const copia = await config.duplicateDocument(doc)
      setDirty(false)
      router.push(
        buildUrl(
          "/evaluaciones",
          withAsignatura(
            { tab: config.variant === "prueba" ? "pruebas" : "guias", view: "editor", [`${config.variant}Id`]: (copia as any).id },
            asignatura,
          ),
        ),
      )
    } catch (e: any) {
      flash("err", e?.message || "Error al duplicar")
    }
  }, [asignatura, config, doc, flash, router])

  const duplicarComoOtro = useCallback(async () => {
    if (!doc || !config.convertToOther) return
    try {
      setGuardando(true)
      const res = await config.convertToOther(doc)
      if (res.omitidos.length > 0) {
        toast({
          title: `Duplicado como ${config.variant === "prueba" ? "guía" : "prueba"} (con omisiones)`,
          description: `Se omitieron ${res.omitidos.length} ítems incompatibles. Redirigiendo...`,
          variant: "destructive",
        })
      } else {
        toast({
          title: `Duplicado como ${config.variant === "prueba" ? "guía" : "prueba"} con éxito`,
          description: "Redirigiendo...",
        })
      }
      setDirty(false)
      const otherId = (res.documento as any).id
      const url = config.getOtherEditorUrl
        ? config.getOtherEditorUrl(asignatura, otherId)
        : `/evaluaciones?tab=${config.variant === "prueba" ? "guias" : "pruebas"}&view=editor`
      router.push(url)
    } catch (e: any) {
      flash("err", e?.message || "Error al duplicar como otro tipo")
    } finally {
      setGuardando(false)
    }
  }, [asignatura, config, doc, flash, router, toast])

  const exportar = useCallback(
    (modo: "para_alumno" | "con_pauta") => {
      if (!doc) return
      config.exportDocument(doc, modo, { colegio, profesorNombre })
    },
    [colegio, config, doc, profesorNombre],
  )

  const irAtras = useCallback(() => {
    if (onClose) {
      onClose()
      return
    }
    router.push(
      buildUrl(
        "/evaluaciones",
        withAsignatura({ tab: config.variant === "prueba" ? "pruebas" : "guias" }, asignatura),
      ),
    )
  }, [asignatura, config, onClose, router])

  const sincronizarConCurriculo = useCallback(async () => {
    if (!doc) return
    try {
      const resol = await config.resolverCurriculo(doc)
      let oas = (doc as any).oas
      if (resol.unidadId) {
        oas = await config.cargarOAs((doc as any).asignatura, (doc as any).curso, resol.unidadId, oas)
      }
      updateDoc(p => ({
        ...(p as any),
        unidadId: resol.unidadId || (p as any).unidadId,
        unidadNombre: resol.unidadNombre || (p as any).unidadNombre,
        metadatosCurriculares: resol.metadatosCurriculares,
        oas,
      }))
      flash("ok", "Currículum sincronizado", 2500)
    } catch (e: any) {
      flash("err", e?.message || "Error al sincronizar", 2500)
    }
  }, [config, doc, flash, updateDoc])

  // ── Atajos de teclado ───────────────────────────────────────────────
  useShortcuts([
    {
      keys: COMMON_SHORTCUTS.GUARDAR,
      handler: () => {
        if (!doc || config.isLocked(doc)) return
        guardar()
      },
      allowInInputs: true,
      description: "Guardar",
    },
    {
      keys: COMMON_SHORTCUTS.VISTA_ALUMNO,
      handler: () => exportar("para_alumno"),
      allowInInputs: true,
      description: "Vista alumno",
    },
    {
      keys: COMMON_SHORTCUTS.PAUTA,
      handler: () => exportar("con_pauta"),
      allowInInputs: true,
      description: "Pauta",
    },
    {
      keys: COMMON_SHORTCUTS.PANEL_IA,
      handler: () => {
        if (!doc || config.isLocked(doc)) return
        setPanelIA(v => !v)
      },
      allowInInputs: true,
      description: "Panel IA",
    },
    {
      keys: COMMON_SHORTCUTS.BANCO,
      handler: () => {
        if (!doc || config.isLocked(doc)) return
        setBancoAbierto(v => !v)
      },
      allowInInputs: true,
      description: "Banco de ítems",
    },
    {
      keys: COMMON_SHORTCUTS.HISTORIAL,
      handler: () => setPanelHistorial(v => !v),
      allowInInputs: true,
      description: "Historial",
    },
    {
      keys: COMMON_SHORTCUTS.CERRAR,
      handler: () => {
        if (panelIA) setPanelIA(false)
        if (bancoAbierto) setBancoAbierto(false)
        if (panelHistorial) setPanelHistorial(false)
      },
      description: "Cerrar panel",
    },
  ])

  // ── Render: loading + error ─────────────────────────────────────────
  if (cargando) {
    return <EditorSkeleton />
  }
  if (errorCarga || !doc) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-8">
        <ErrorBanner message={errorCarga || config.notFoundMessage} onDismiss={irAtras} />
        <EmptyState
          icon={FileX}
          title="No se pudo abrir el documento"
          text="Vuelve al hub correspondiente y vuelve a intentarlo."
          accent={config.accent}
          action={{ label: "Volver al hub", onClick: irAtras }}
        />
      </div>
    )
  }

  const ctx: DocumentEditorContext<T> = {
    doc,
    setDoc,
    updateDoc,
    dirty,
    setDirty,
    guardando,
    setGuardando,
    mensaje,
    setMensaje,
    flashMensaje: flash,
    asignatura,
    colegio,
    profesorNombre,
    unidadesCurso,
    estudiantesPie,
    isLocked: config.isLocked(doc),
    esNuevo: !id,
    guardar,
    eliminar,
    duplicar,
    duplicarComoOtro,
    exportar,
    irAtras,
    sincronizarConCurriculo,
    panelIA,
    setPanelIA,
    bancoAbierto,
    setBancoAbierto,
    panelHistorial,
    setPanelHistorial,
    panelPie,
    setPanelPie,
    showSimulacion,
    setShowSimulacion,
    showBloom,
    setShowBloom,
    handlers,
  }

  const counter = config.counterText(doc)
  const badge = config.badge(doc)
  const accentVar = `var(--accent-${config.accent === "rose" ? "pruebas" : "guias"})`
  const locked = config.isLocked(doc)

  return (
    <div className="mx-auto max-w-7xl flex flex-col lg:flex-row items-start gap-4">
      <UnsavedChangesGuard
        dirty={dirty && !locked}
        onSaveAndExit={async () => {
          if (!locked) await guardar()
        }}
      />

      <div className="flex-1 space-y-4 min-w-0 w-full">
        {locked && (
          <div
            className="rounded-[12px] border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300 flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span>{config.lockedMessage(doc)}</span>
          </div>
        )}

        <StickyEditorToolbar
          accent={config.accent}
          title={(doc as any).nombre || ""}
          onTitleChange={
            locked
              ? () => {}
              : v => updateDoc(p => ({ ...(p as any), nombre: v }))
          }
          counter={counter}
          badge={badge}
          dirty={dirty && !locked}
          onBack={irAtras}
          actionsRight={
            <>
              {mensaje && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10.5px] font-bold",
                    mensaje.tipo === "ok"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
                  )}
                >
                  {mensaje.texto}
                </span>
              )}
              <ToolbarButton
                icon={Eye}
                label="Vista alumno"
                shortcut={COMMON_SHORTCUTS.VISTA_ALUMNO}
                onClick={() => exportar("para_alumno")}
                accent={config.accent}
              />
              <ToolbarButton
                icon={FileCheck}
                label="Pauta"
                shortcut={COMMON_SHORTCUTS.PAUTA}
                onClick={() => exportar("con_pauta")}
                accent={config.accent}
              />
              {!locked && (
                <ToolbarButton
                  icon={guardando ? Loader2 : Save}
                  label={guardando ? "Guardando…" : "Guardar"}
                  shortcut={COMMON_SHORTCUTS.GUARDAR}
                  onClick={guardar}
                  disabled={guardando}
                  primary
                  accent={config.accent}
                  spinning={guardando}
                />
              )}
              {!locked && (
                <ToolbarButton
                  icon={Sparkles}
                  label="IA"
                  shortcut={COMMON_SHORTCUTS.PANEL_IA}
                  onClick={() => setPanelIA(v => !v)}
                  active={panelIA}
                  accent={config.accent}
                />
              )}
              {!locked && (
                <ToolbarButton
                  icon={Library}
                  label="Banco"
                  shortcut={COMMON_SHORTCUTS.BANCO}
                  onClick={() => setBancoAbierto(v => !v)}
                  active={bancoAbierto}
                  accent={config.accent}
                />
              )}
              <ToolbarButton
                icon={History}
                label="Historial"
                shortcut={COMMON_SHORTCUTS.HISTORIAL}
                onClick={() => setPanelHistorial(v => !v)}
                active={panelHistorial}
                accent={config.accent}
              />
              {!locked && (
                <ToolbarButton
                  icon={Heart}
                  label="Adaptar PIE"
                  onClick={() => setPanelPie(true)}
                  accent={config.accent}
                />
              )}
              {!locked && featureFlags["simulacion-alumnos"]?.active && (
                <ToolbarButton
                  icon={Sparkles}
                  label="Simular Alumnos"
                  onClick={() => setShowSimulacion(true)}
                  accent={config.accent}
                />
              )}
              {!locked && config.showBloom && featureFlags["calibrador-bloom"]?.active && (
                <ToolbarButton
                  icon={Award}
                  label="Calibrar Bloom"
                  onClick={() => setShowBloom(true)}
                  accent={config.accent}
                />
              )}
              {id && (
                <ToolbarButton
                  icon={Copy}
                  label="Duplicar"
                  onClick={duplicar}
                  accent={config.accent}
                />
              )}
              {id && config.convertToOther && (
                <ToolbarButton
                  icon={ClipboardList}
                  label={config.convertOtherLabel || "Duplicar como otro"}
                  onClick={duplicarComoOtro}
                  accent={config.accent}
                />
              )}
              {id && (
                <ToolbarButton
                  icon={Trash2}
                  label={confirmarEliminar ? "¿Confirmar?" : "Eliminar"}
                  onClick={eliminar}
                  danger={confirmarEliminar}
                  tone="danger"
                />
              )}
            </>
          }
        />

        <div className={cn(locked && "pointer-events-none opacity-85 select-none")}>
          {children(ctx)}
        </div>
      </div>

      {/* ── Modales ──────────────────────────────────────────────────── */}
      <AIPanel
        tipoDoc={config.variant === "prueba" ? "prueba" : "guia"}
        open={panelIA}
        onClose={() => setPanelIA(false)}
        contexto={contextoCurricular}
        documentoActual={doc as unknown as Record<string, unknown>}
        onAplicar={data => handlers.aplicarIA(data, ctx)}
      />
      <ItemBank
        open={bancoAbierto}
        onClose={() => setBancoAbierto(false)}
        editorTipo={config.variant === "prueba" ? "prueba" : "guia"}
        asignatura={(doc as any).asignatura}
        onInsertarItem={entry => handlers.insertarItemDelBanco(entry, ctx)}
      />
      <SnapshotPanel
        open={panelHistorial}
        onClose={() => setPanelHistorial(false)}
        tipo={config.snapshotTipo}
        docId={(doc as any).id}
        accent={config.accent}
        onRestaurar={snap => {
          if (snap && (snap as any).payload) {
            setDoc((snap as any).payload)
            setDirty(true)
            flash("ok", "Versión restaurada en el editor", 2500)
          }
        }}
      />
      <AdaptarPieModal
        open={panelPie}
        onOpenChange={setPanelPie}
        tipo={config.variant === "prueba" ? "prueba" : "guia"}
        documento={doc}
        estudiantesPie={estudiantesPie}
        onAdaptado={async resultado => {
          if (!doc) return
          const ts = Date.now()
          const newId = `${config.variant}_pie_${ts}`
          const baseCopy = config.createPIECopy
            ? config.createPIECopy(doc, resultado, { id: newId, timestamp: ts })
            : ({ ...(doc as any), id: newId, nombre: resultado.nombre || `${(doc as any).nombre} (PIE)` } as T)
          try {
            await config.saveWithSnapshot(baseCopy)
            toast({
              title: "Documento PIE creado",
              description: resultado.notasAdecuacion || "La adecuación se guardó correctamente.",
            })
            router.push(
              buildUrl(
                "/evaluaciones",
                withAsignatura(
                  {
                    tab: config.variant === "prueba" ? "pruebas" : "guias",
                    view: "editor",
                    [`${config.variant}Id`]: newId,
                  },
                  asignatura,
                ),
              ),
            )
          } catch (e: any) {
            flash("err", e?.message || "Error al guardar la versión PIE")
          }
        }}
      />
      <SimulacionAlumnosModal
        isOpen={showSimulacion}
        onClose={() => setShowSimulacion(false)}
        documento={doc}
        tipo={config.variant === "prueba" ? "prueba" : "guia"}
      />
      <CalibradorBloomModal
        isOpen={showBloom}
        onClose={() => setShowBloom(false)}
        documento={doc}
      />
    </div>
  )
}
