"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Editor completo de una Guía de aprendizaje (refactor task 7.1)
// ─────────────────────────────────────────────────────────────────────────
// Refactorizado para consumir la suite compartida de `shared/`:
//
//   • StickyEditorToolbar (accent="violet") con slot `numero`, badge de
//     estado, contador "{N} actividades · {M} min", indicador de cambios
//     sin guardar y cluster mínimo de acciones (Guardar)
//     más un menú secundario para Banco, Historial, Duplicar y Eliminar.
//   • LoadingSkeleton.EditorSkeleton mientras se carga la guía.
//   • UnsavedChangesGuard envolviendo todo el editor con `onSaveAndExit`.
//   • useShortcuts: Ctrl+S, Ctrl+P, Ctrl+Shift+P, Ctrl+B, Ctrl+H,
//     Ctrl+Shift+N y Esc.
//   • SnapshotPanel para historial de versiones (Ctrl+H).
//   • guardarGuiaConSnapshot para versionar al guardar manualmente.
//   • EmptyState / ErrorBanner para estados de error.
//   • Acento violet en bordes, focus rings y botones primarios.
//
// NO-MODIFY guard: esta refactorización solo consume APIs públicas de
// `lib/guias.ts` (`cargarGuia`, `nuevaGuia`, `nuevaSeccionGuia`,
// `nuevaActividadGuia`, `guardarGuia`, `normalizarGuia`,
// `resolverMetadatosCurricularesGuia`, `cargarOAsParaGuia`,
// `eliminarGuia`, `duplicarGuia`); no se cambian firmas ni interfaces.
//
// Refs: Req 6.1, Req 6.2, Req 6.3
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Save, Loader2, Copy, Trash2, Plus,
  Settings, RefreshCw, BookOpen, Lightbulb,
  History, Library, FileQuestion, Music, FileText,
} from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarPerfil } from "@/lib/perfil"
import { cargarPlanCurso, type OAEditado, type UnidadPlan } from "@/lib/curriculo"
import {
  cargarGuia, eliminarGuia, duplicarGuia,
  nuevaGuia, nuevaSeccionGuia, nuevaActividadGuia, nuevoIdGuia, normalizarGuia,
  resolverMetadatosCurricularesGuia, cargarOAsParaGuia,
  type GuiaTemplate, type SeccionGuia, type ActividadGuia, type TipoActividadGuia,
} from "@/lib/guias"
import { guardarGuiaConSnapshot, guardarPruebaConSnapshot } from "@/lib/snapshots-hook"
import { ActividadGuiaEditor } from "../editor/actividad-guia-editor"
import { BloquesEditor } from "../editor/bloques-editor"
import { SelectorTipoItem } from "../editor/selector-tipo-item"
import { ItemBank } from "../shared/item-bank"
import { guardarItemAlBanco, type ItemBankEntry } from "@/lib/item-bank"
import { ItemPrueba } from "@/lib/pruebas"
import { itemPruebaAActividadGuia, guiaToPrueba } from "@/lib/cross-mapping"
import { toast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { metadatosDesdeOAsEval } from "@/lib/evaluaciones-tipos"
import { RubricaOAEditor } from "@/components/edu-panel/shared/oa-editor"
import {
  StickyEditorToolbar,
  type StickyEditorToolbarBadge,
} from "../shared/sticky-editor-toolbar"
import { ToolbarButton, Section, Field } from "../shared/editor-primitives"
import LoadingSkeleton from "../shared/loading-skeleton"
import { UnsavedChangesGuard } from "../shared/unsaved-changes-guard"
import { ErrorBanner } from "../shared/error-banner"
import { EmptyState } from "../shared/empty-state"
import { SnapshotPanel } from "../shared/snapshot-panel"
import { useShortcuts, COMMON_SHORTCUTS } from "@/lib/keyboard-shortcuts"
import { EditorActionsMenu, type EditorActionMenuItem } from "../shared/editor-actions-menu"
import { DocumentCreationSteps, type DocumentCreationStep } from "../shared/document-creation-steps"

interface Props {
  guiaId?: string
  cursoInicial?: string
  unidadIdInicial?: string
  unidadNombreInicial?: string
  onClose?: () => void
}

export function GuiaEditor({
  guiaId,
  cursoInicial,
  unidadIdInicial,
  unidadNombreInicial,
  onClose,
}: Props) {
  const router = useRouter()
  const { asignatura } = useActiveSubject()

  const [guia, setGuia] = useState<GuiaTemplate | null>(null)
  const [profesorNombre, setProfesorNombre] = useState("")
  const [unidadesCurso, setUnidadesCurso] = useState<UnidadPlan[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [mensajeGuardado, setMensajeGuardado] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [bancoAbierto, setBancoAbierto] = useState(false)
  const [panelHistorial, setPanelHistorial] = useState(false)
  const [modoMusical, setModoMusical] = useState(false)

  // ── Dirty tracking: snapshot estable del último estado guardado.
  // Lo serializamos para comparar de forma simple vs el documento actual.
  const lastSavedRef = useRef<string>("")
  const [dirty, setDirty] = useState(false)
  const [creationStep, setCreationStep] = useState<DocumentCreationStep>("config")
  const [oasCargando, setOasCargando] = useState(false)
  const oasRequestRef = useRef(0)

  // Marcar como guardado el snapshot actual.
  const marcarGuardado = useCallback((g: GuiaTemplate) => {
    lastSavedRef.current = JSON.stringify(g)
    setDirty(false)
  }, [])

  // Recalcular dirty cada vez que cambia la guía.
  useEffect(() => {
    if (!guia) return
    if (!lastSavedRef.current) {
      // primer render → considerar guardado
      lastSavedRef.current = JSON.stringify(guia)
      setDirty(false)
      return
    }
    setDirty(JSON.stringify(guia) !== lastSavedRef.current)
  }, [guia])

  // ─── Carga ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancel = false
    Promise.resolve().then(() => {
      if (cancel) return
    setCargando(true)
    setErrorCarga(null)
    cargarPerfil()
      .then(perfil => {
        if (cancel) return
        const nombre = [
          (perfil as any)?.nombre,
          (perfil as any)?.nombreCompleto,
          (perfil as any)?.displayName,
          (perfil as any)?.profesorNombre,
        ].find((v) => typeof v === "string" && v.trim()) as string | undefined
        setProfesorNombre(nombre || "")
      })
      .catch(() => {})

    if (guiaId) {
      cargarGuia(guiaId)
        .then(g => {
          if (cancel) return
          if (g) {
            setGuia(g)
            marcarGuardado(g)
            setModoMusical(g.asignatura?.toLowerCase() === "música")
            if (g.curso) {
              cargarPlanCurso(g.asignatura, g.curso)
                .then(plan => { if (!cancel) setUnidadesCurso(plan?.units || []) })
                .catch(() => {})
            }
          } else {
            setErrorCarga("Guía no encontrada")
          }
          setCargando(false)
        })
        .catch(e => {
          if (cancel) return
          setErrorCarga(e?.message || "Error al cargar la guía")
          setCargando(false)
        })
    } else {
      const nueva = nuevaGuia(asignatura, cursoInicial || "")
      if (unidadIdInicial) nueva.unidadId = unidadIdInicial
      if (unidadNombreInicial) nueva.unidadNombre = unidadNombreInicial
      nueva.secciones = [nuevaSeccionGuia(1)]
      setGuia(nueva)
      marcarGuardado(nueva)
      setModoMusical(asignatura?.toLowerCase() === "música")
      if (cursoInicial) {
        cargarPlanCurso(asignatura, cursoInicial)
          .then(plan => { if (!cancel) setUnidadesCurso(plan?.units || []) })
          .catch(() => {})
      }
      setCargando(false)
    }

    })

    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guiaId])

  useEffect(() => {
    if (!guia?.curso) return
    cargarPlanCurso(guia.asignatura, guia.curso)
      .then(plan => setUnidadesCurso(plan?.units || []))
      .catch(() => setUnidadesCurso([]))
  }, [guia?.curso, guia?.asignatura])

  useEffect(() => {
    if (!guia?.unidadId || !guia.curso || !guia.asignatura) return
    const uid = guia.unidadId
    const reqId = ++oasRequestRef.current
    setOasCargando(true)
    cargarOAsParaGuia(guia.asignatura, guia.curso, uid, guia.oas)
      .then((oas) => {
        if (oasRequestRef.current !== reqId) return
        setGuia((prev) => {
          if (!prev || prev.unidadId !== uid) return prev
          return {
            ...prev,
            oas,
            metadatosCurriculares: metadatosDesdeOAsEval(oas),
          }
        })
      })
      .catch(console.error)
      .finally(() => {
        if (oasRequestRef.current === reqId) setOasCargando(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guia?.unidadId, guia?.curso, guia?.asignatura])

  // ─── Sincronizar con currículum ────────────────────────────────
  const sincronizarCurriculo = async () => {
    if (!guia) return
    try {
      const resol = await resolverMetadatosCurricularesGuia(guia)
      let oas = guia.oas
      if (resol.unidadId) {
        oas = await cargarOAsParaGuia(guia.asignatura, guia.curso, resol.unidadId, guia.oas)
      }
      setGuia(g => g ? {
        ...g,
        unidadId: resol.unidadId || g.unidadId,
        unidadNombre: resol.unidadNombre || g.unidadNombre,
        metadatosCurriculares: oas ? metadatosDesdeOAsEval(oas) : resol.metadatosCurriculares,
        oas,
      } : g)
      setMensajeGuardado({ tipo: "ok", texto: "Currículum sincronizado" })
      setTimeout(() => setMensajeGuardado(null), 2500)
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al sincronizar" })
    }
  }

  // ─── Guardar / Eliminar / Duplicar ─────────────────────────────
  // `guardarGuiaConSnapshot` (lib/snapshots-hook.ts, task 12.2) persiste la
  // guía y crea automáticamente un Snapshot_Version inmutable.
  const handleGuardar = useCallback(async () => {
    if (!guia) return
    if (!guia.curso) {
      setMensajeGuardado({ tipo: "err", texto: "Selecciona un curso antes de guardar" })
      return
    }
    setGuardando(true)
    try {
      // Normalizamos antes de persistir para que orden y puntaje coincidan
      // con el modelo (esto NO modifica `lib/guias.ts`, solo invoca su API).
      const normalizada = normalizarGuia(guia)
      await guardarGuiaConSnapshot(normalizada)
      setGuia(normalizada)
      marcarGuardado(normalizada)
      setMensajeGuardado({ tipo: "ok", texto: "Guardado" })
      setTimeout(() => setMensajeGuardado(null), 2000)
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al guardar" })
    } finally {
      setGuardando(false)
    }
  }, [guia, marcarGuardado])

  const handleEliminar = async () => {
    if (!guia) return
    if (!confirmarEliminar) { setConfirmarEliminar(true); return }
    try {
      await eliminarGuia(guia.id)
      // Marcamos como guardado para que UnsavedChangesGuard no bloquee.
      marcarGuardado(guia)
      if (onClose) onClose()
      else router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "guias" }, asignatura)))
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al eliminar" })
    }
  }

  const handleDuplicar = async () => {
    if (!guia) return
    try {
      const copia = await duplicarGuia(guia)
      router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "guias", view: "editor", guiaId: copia.id }, asignatura)))
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al duplicar" })
    }
  }

  const handleDuplicarComoPrueba = async () => {
    if (!guia) return
    try {
      setGuardando(true)
      const res = guiaToPrueba(guia)
      await guardarPruebaConSnapshot(res.documento)
      
      if (res.omitidos.length > 0) {
        toast({
          title: "Duplicado como prueba (con omisiones)",
          description: `Se omitieron ${res.omitidos.length} actividades incompatibles. Redirigiendo...`,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Duplicado como prueba con éxito",
          description: "Redirigiendo a la nueva prueba...",
        })
      }
      
      router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "pruebas", view: "editor", pruebaId: res.documento.id }, asignatura)))
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al duplicar como prueba" })
    } finally {
      setGuardando(false)
    }
  }

  const handleVolver = useCallback(() => {
    if (onClose) onClose()
    else router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "guias" }, asignatura)))
  }, [asignatura, onClose, router])

  // ─── Operaciones secciones ─────────────────────────────────────
  const agregarSeccion = useCallback(() => {
    setGuia(g => g ? { ...g, secciones: [...g.secciones, nuevaSeccionGuia(g.secciones.length + 1)] } : g)
  }, [])

  const updateSeccion = (id: string, parcial: Partial<SeccionGuia>) => {
    setGuia(g => g ? {
      ...g,
      secciones: g.secciones.map(s => s.id === id ? { ...s, ...parcial } : s),
    } : g)
  }

  const moverSeccion = (id: string, dir: -1 | 1) => {
    setGuia(g => {
      if (!g) return g
      const idx = g.secciones.findIndex(s => s.id === id)
      const newIdx = idx + dir
      if (idx === -1 || newIdx < 0 || newIdx >= g.secciones.length) return g
      const next = [...g.secciones]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return { ...g, secciones: next.map((s, i) => ({ ...s, orden: i + 1 })) }
    })
  }

  const eliminarSeccion = (id: string) => {
    setGuia(g => g ? { ...g, secciones: g.secciones.filter(s => s.id !== id) } : g)
  }

  // ─── Operaciones actividades ───────────────────────────────────
  const agregarActividad = (seccionId: string, tipo: TipoActividadGuia) => {
    setGuia(g => g ? {
      ...g,
      secciones: g.secciones.map(s => s.id !== seccionId ? s : {
        ...s, actividades: [...s.actividades, nuevaActividadGuia(tipo)],
      }),
    } : g)
  }

  const updateActividad = (seccionId: string, act: ActividadGuia) => {
    setGuia(g => g ? {
      ...g,
      secciones: g.secciones.map(s => s.id !== seccionId ? s : {
        ...s,
        actividades: s.actividades.map(a => a.id === act.id ? act : a),
      }),
    } : g)
  }

  // ─── Guardar al banco ──────────────────────────────────────────────
  const handleGuardarAlBanco = async (act: ActividadGuia) => {
    if (!guia) return
    try {
      await guardarItemAlBanco(act, {
        asignatura: guia.asignatura,
        curso: guia.curso || "",
        oas: act.oaVinculado ? [act.oaVinculado] : [],
        origen: "guia",
        autor: profesorNombre || "",
      })
      setMensajeGuardado({ tipo: "ok", texto: "Actividad guardada en el banco" })
      setTimeout(() => setMensajeGuardado(null), 2000)
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al guardar en el banco" })
      setTimeout(() => setMensajeGuardado(null), 3000)
    }
  }

  // ─── Drag & Drop Handlers (Req 8.4, Req 7.4) ──────────────────────────
  const handleSectionDrop = (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault()

    // 1. Drop desde el banco de ítems
    const bankData = e.dataTransfer.getData("item-bank-entry")
    if (bankData) {
      try {
        const entry = JSON.parse(bankData) as ItemBankEntry
        let payload = entry.payload
        if (entry.metadata.origen === "prueba") {
          const converted = itemPruebaAActividadGuia(payload as ItemPrueba)
          if (!converted) {
            setMensajeGuardado({ tipo: "err", texto: "El ítem no es compatible con el editor de guías" })
            setTimeout(() => setMensajeGuardado(null), 3000)
            return
          }
          payload = converted
        }
        const actividadClonada = {
          ...payload,
          id: nuevoIdGuia("act"),
          puntaje: (payload as any).puntaje || 1,
        } as ActividadGuia

        setGuia(g => {
          if (!g) return g
          return {
            ...g,
            secciones: g.secciones.map(s => {
              if (s.id !== targetSectionId) return s
              return {
                ...s,
                actividades: [...s.actividades, actividadClonada],
              }
            })
          }
        })
        setDirty(true)
        setMensajeGuardado({ tipo: "ok", texto: "Actividad insertada" })
        setTimeout(() => setMensajeGuardado(null), 1500)
      } catch (err) {}
      return
    }

    // 2. Drop de una actividad existente (mover sección/reordenar)
    const draggedActId = e.dataTransfer.getData("application/x-item-id")
    const sourceSectionId = e.dataTransfer.getData("application/x-source-section-id")
    if (draggedActId && sourceSectionId) {
      if (sourceSectionId === targetSectionId) return
      setGuia(g => {
        if (!g) return g
        const sourceSec = g.secciones.find(s => s.id === sourceSectionId)
        if (!sourceSec) return g
        const act = sourceSec.actividades.find(a => a.id === draggedActId)
        if (!act) return g

        return {
          ...g,
          secciones: g.secciones.map(s => {
            if (s.id === sourceSectionId) {
              return { ...s, actividades: s.actividades.filter(a => a.id !== draggedActId) }
            }
            if (s.id === targetSectionId) {
              return { ...s, actividades: [...s.actividades, act] }
            }
            return s
          })
        }
      })
      setDirty(true)
      return
    }

    // 3. Drop de una sección (reordenar secciones)
    const draggedSectionId = e.dataTransfer.getData("application/x-section-id")
    if (draggedSectionId && draggedSectionId !== targetSectionId) {
      setGuia(g => {
        if (!g) return g
        const idxDrag = g.secciones.findIndex(s => s.id === draggedSectionId)
        const idxTarget = g.secciones.findIndex(s => s.id === targetSectionId)
        if (idxDrag === -1 || idxTarget === -1) return g
        const next = [...g.secciones]
        const [dragged] = next.splice(idxDrag, 1)
        next.splice(idxTarget, 0, dragged)
        return {
          ...g,
          secciones: next.map((s, i) => ({ ...s, orden: i + 1 })),
        }
      })
      setDirty(true)
    }
  }

  const handleActDropOnAct = (e: React.DragEvent, targetActId: string, targetSectionId: string) => {
    e.preventDefault()
    e.stopPropagation()

    // 1. Drop desde el banco
    const bankData = e.dataTransfer.getData("item-bank-entry")
    if (bankData) {
      try {
        const entry = JSON.parse(bankData) as ItemBankEntry
        const actividadClonada = {
          ...entry.payload,
          id: nuevoIdGuia("act"),
          puntaje: (entry.payload as any).puntaje || 1,
        } as ActividadGuia

        setGuia(g => {
          if (!g) return g
          return {
            ...g,
            secciones: g.secciones.map(s => {
              if (s.id !== targetSectionId) return s
              const idx = s.actividades.findIndex(a => a.id === targetActId)
              const actividades = [...s.actividades]
              if (idx === -1) actividades.push(actividadClonada)
              else actividades.splice(idx, 0, actividadClonada)
              return { ...s, actividades }
            })
          }
        })
        setDirty(true)
        setMensajeGuardado({ tipo: "ok", texto: "Actividad insertada" })
        setTimeout(() => setMensajeGuardado(null), 1500)
      } catch (err) {}
      return
    }

    // 2. Drop de una actividad existente
    const draggedActId = e.dataTransfer.getData("application/x-item-id")
    const sourceSectionId = e.dataTransfer.getData("application/x-source-section-id")
    if (draggedActId && sourceSectionId) {
      setGuia(g => {
        if (!g) return g
        const sourceSec = g.secciones.find(s => s.id === sourceSectionId)
        const targetSec = g.secciones.find(s => s.id === targetSectionId)
        if (!sourceSec || !targetSec) return g
        const act = sourceSec.actividades.find(a => a.id === draggedActId)
        if (!act) return g

        if (sourceSectionId === targetSectionId) {
          const idxDrag = sourceSec.actividades.findIndex(a => a.id === draggedActId)
          const idxTarget = sourceSec.actividades.findIndex(a => a.id === targetActId)
          if (idxDrag === -1 || idxTarget === -1) return g
          const actividades = [...sourceSec.actividades]
          const [dragged] = actividades.splice(idxDrag, 1)
          actividades.splice(idxTarget, 0, dragged)
          return {
            ...g,
            secciones: g.secciones.map(s => s.id === sourceSectionId ? { ...s, actividades } : s)
          }
        } else {
          const idxTarget = targetSec.actividades.findIndex(a => a.id === targetActId)
          return {
            ...g,
            secciones: g.secciones.map(s => {
              if (s.id === sourceSectionId) {
                return { ...s, actividades: s.actividades.filter(a => a.id !== draggedActId) }
              }
              if (s.id === targetSectionId) {
                const actividades = [...s.actividades]
                if (idxTarget === -1) actividades.push(act)
                else actividades.splice(idxTarget, 0, act)
                return { ...s, actividades }
              }
              return s
            })
          }
        }
      })
      setDirty(true)
    }
  }

  const handleInsertarItemDelBanco = (entry: ItemBankEntry) => {
    if (!guia) return
    let payload = entry.payload
    if (entry.metadata.origen === "prueba") {
      const converted = itemPruebaAActividadGuia(payload as ItemPrueba)
      if (!converted) {
        setMensajeGuardado({ tipo: "err", texto: "El ítem no es compatible con el editor de guías" })
        setTimeout(() => setMensajeGuardado(null), 3000)
        return
      }
      payload = converted
    }
    const actividadClonada = {
      ...payload,
      id: nuevoIdGuia("act"),
      puntaje: (payload as any).puntaje || 1,
    } as ActividadGuia

    setGuia(g => {
      if (!g) return g
      const secciones = [...g.secciones]
      if (secciones.length === 0) {
        secciones.push(nuevaSeccionGuia(1))
      }
      secciones[0] = {
        ...secciones[0],
        actividades: [...secciones[0].actividades, actividadClonada],
      }
      return { ...g, secciones }
    })
    setDirty(true)

    setMensajeGuardado({ tipo: "ok", texto: "Actividad insertada" })
    setTimeout(() => setMensajeGuardado(null), 1500)
  }

  const moverActividad = (seccionId: string, actId: string, dir: -1 | 1) => {
    setGuia(g => {
      if (!g) return g
      return {
        ...g,
        secciones: g.secciones.map(s => {
          if (s.id !== seccionId) return s
          const idx = s.actividades.findIndex(a => a.id === actId)
          const newIdx = idx + dir
          if (idx === -1 || newIdx < 0 || newIdx >= s.actividades.length) return s
          const next = [...s.actividades]
          ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
          return { ...s, actividades: next }
        }),
      }
    })
  }

  const eliminarActividad = (seccionId: string, actId: string) => {
    setGuia(g => g ? {
      ...g,
      secciones: g.secciones.map(s => s.id !== seccionId ? s : {
        ...s, actividades: s.actividades.filter(a => a.id !== actId),
      }),
    } : g)
  }

  // ─── Atajos de teclado ─────────────────────────────────────────
  // Refs: Req 6.13 — mismos shortcuts que Editor_Prueba (Req 5.17).
  const cerrarPaneles = useCallback(() => {
    setBancoAbierto(false)
    setPanelHistorial(false)
    setConfirmarEliminar(false)
  }, [])

  useShortcuts(useMemo(() => ([
    { keys: COMMON_SHORTCUTS.GUARDAR, handler: () => { void handleGuardar() } },
    { keys: COMMON_SHORTCUTS.BANCO, handler: () => setBancoAbierto(p => !p) },
    { keys: COMMON_SHORTCUTS.HISTORIAL, handler: () => setPanelHistorial(p => !p) },
    { keys: COMMON_SHORTCUTS.NUEVA_SECCION, handler: () => agregarSeccion() },
    { keys: COMMON_SHORTCUTS.CERRAR, handler: () => cerrarPaneles() },
  ]), [handleGuardar, agregarSeccion, cerrarPaneles]))

  // ─── Render ──────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="mx-auto max-w-5xl">
        <LoadingSkeleton.EditorSkeleton />
      </div>
    )
  }

  if (errorCarga || !guia) {
    return (
      <div className="mx-auto max-w-5xl space-y-3">
        {errorCarga && (
          <ErrorBanner
            message={errorCarga}
            onDismiss={() => setErrorCarga(null)}
          />
        )}
        <EmptyState
          icon={FileQuestion}
          title="Guía no encontrada"
          text="No pudimos cargar esta guía. Vuelve al listado e intenta abrir otra."
          accent="violet"
          action={{ label: "Volver al listado", onClick: handleVolver }}
        />
      </div>
    )
  }

  const totalActividades = guia.secciones.reduce((a, s) => a + s.actividades.length, 0)
  const puntajeTotal = guia.secciones.reduce((a, s) =>
    a + s.actividades.reduce((b, act) => b + (act.puntaje || 0), 0)
  , 0)

  const counterTexto = `${totalActividades} ${totalActividades === 1 ? "actividad" : "actividades"} · ${guia.tiempoMinutos || 0} min`

  const badge: StickyEditorToolbarBadge = (() => {
    const estado = guia.estado || "borrador"
    if (estado === "lista") return { label: "Lista", tone: "success" }
    if (estado === "archivada") return { label: "Archivada", tone: "neutral" }
    return { label: "Borrador", tone: "warning" }
  })()

  const isMusica = guia.asignatura?.toLowerCase() === "música" || asignatura?.toLowerCase() === "música"
  const secondaryActions: EditorActionMenuItem[] = [
    ...(isMusica
      ? [{
          label: modoMusical ? "Desactivar modo musical" : "Modo musical",
          icon: Music,
          onClick: () => setModoMusical((value) => !value),
        }]
      : []),
    {
      label: bancoAbierto ? "Cerrar banco de ítems" : "Banco de ítems",
      icon: Library,
      onClick: () => setBancoAbierto((value) => !value),
    },
    {
      label: panelHistorial ? "Cerrar historial" : "Historial",
      icon: History,
      onClick: () => setPanelHistorial((value) => !value),
    },
    ...(guiaId
      ? [
          {
            label: "Duplicar",
            icon: Copy,
            onClick: handleDuplicar,
          },
          {
            label: "Duplicar como prueba",
            icon: FileText,
            onClick: handleDuplicarComoPrueba,
          },
          {
            label: confirmarEliminar ? "Confirmar eliminación" : "Eliminar",
            icon: Trash2,
            onClick: handleEliminar,
            danger: true,
          },
        ]
      : []),
  ]
  const isCreating = !guiaId
  const showConfigStep = !isCreating || creationStep === "config"
  const showContentStep = !isCreating || creationStep === "contenido"
  const showReviewStep = !isCreating || creationStep === "revisar"
  const configReady = Boolean(guia.nombre.trim() && guia.curso.trim())

  return (
    <>
      <UnsavedChangesGuard dirty={dirty} onSaveAndExit={handleGuardar} />

      <div className="mx-auto max-w-7xl flex flex-col lg:flex-row items-start gap-4">
        {/* Editor principal */}
        <div className="flex-1 space-y-4 min-w-0 w-full">
        {/* Toolbar pegada */}
        <StickyEditorToolbar
          accent="violet"
          onBack={handleVolver}
          title={guia.nombre}
          onTitleChange={(s) => setGuia({ ...guia, nombre: s })}
          numero={{
            value: guia.numeroGuia || "",
            onChange: (s) => setGuia({ ...guia, numeroGuia: s }),
          }}
          counter={counterTexto}
          badge={badge}
          dirty={dirty}
          actionsRight={
            <>
              {mensajeGuardado && (
                <span className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10.5px] font-bold",
                  mensajeGuardado.tipo === "ok"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                )}>
                  {mensajeGuardado.texto}
                </span>
              )}

              <ToolbarButton
                icon={guardando ? Loader2 : Save}
                label={guardando ? "Guardando…" : "Guardar"}
                shortcut={COMMON_SHORTCUTS.GUARDAR}
                onClick={handleGuardar}
                disabled={guardando}
                primary
                spinning={guardando}
                accent="violet"
              />
              <EditorActionsMenu accent="violet" actions={secondaryActions} />
            </>
          }
        />

        {isCreating && (
          <DocumentCreationSteps
            current={creationStep}
            onChange={setCreationStep}
            accent="violet"
            contentCount={totalActividades}
            contentLabel={totalActividades === 1 ? "actividad" : "actividades"}
            ready={configReady}
          />
        )}

        {showConfigStep && (
        <>
        {/* Configuración */}
        <Section title="Configuración" icon={Settings}>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Curso">
              <input
                value={guia.curso}
                onChange={e => setGuia({ ...guia, curso: e.target.value })}
                placeholder="2°A"
                className={inputBaseClass}
              />
            </Field>
            <Field label="Unidad">
              <select
                value={guia.unidadId || ""}
                onChange={e => {
                  const u = unidadesCurso.find(x => String(x.id) === e.target.value)
                  setGuia({
                    ...guia,
                    unidadId: e.target.value || undefined,
                    unidadNombre: u?.name,
                    oas: undefined,
                    metadatosCurriculares: metadatosDesdeOAsEval(undefined),
                  })
                }}
                className={inputBaseClass}
              >
                <option value="">— Sin unidad —</option>
                {unidadesCurso.map(u => (
                  <option key={u.id} value={String(u.id)}>{u.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de guía">
              <select
                value={guia.tipoGuia || "aprendizaje"}
                onChange={e => setGuia({ ...guia, tipoGuia: e.target.value as any })}
                className={inputBaseClass}
              >
                <option value="aprendizaje">Aprendizaje (didáctica)</option>
                <option value="refuerzo">Refuerzo</option>
                <option value="ejercitacion">Ejercitación</option>
                <option value="evaluacion_formativa">Evaluación formativa</option>
              </select>
            </Field>
            <Field label="Tiempo (min)">
              <input
                type="number"
                min={5}
                value={guia.tiempoMinutos || 45}
                onChange={e => setGuia({ ...guia, tiempoMinutos: Number(e.target.value) || 45 })}
                className={inputBaseClass}
              />
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={sincronizarCurriculo}
              disabled={!guia.curso || !guia.unidadNombre}
              className={cn(
                "flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-bold transition-colors",
                "border border-[var(--accent-guias)]/40 bg-[var(--accent-guias-soft)] text-[var(--accent-guias)]",
                "hover:opacity-90 disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                "focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
              )}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sincronizar con currículum
            </button>
          </div>

          <div className="mt-4">
            <Field label="Objetivo de la guía (qué debe lograr el alumno)">
              <textarea
                value={guia.objetivo}
                onChange={e => setGuia({ ...guia, objetivo: e.target.value })}
                rows={2}
                placeholder="Identificar y reconocer los hábitos de vida saludable, en relación a alimentación e higiene."
                className={cn(textareaBaseClass, "text-[13px]")}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Instrucciones para el alumno (una por línea)">
              <textarea
                value={guia.instrucciones.join("\n")}
                onChange={e => setGuia({ ...guia, instrucciones: e.target.value.split("\n") })}
                rows={4}
                className={cn(textareaBaseClass, "text-[12.5px]")}
              />
            </Field>
          </div>

          <div className="mt-4 rounded-[12px] border border-border bg-card/50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-extrabold text-foreground">Objetivos e indicadores</h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {oasCargando
                    ? "Cargando OA desde la base curricular..."
                    : guia.unidadId
                      ? "Haz clic en los puntos para seleccionar/deseleccionar OA e indicadores."
                      : "Selecciona una unidad para cargar los OA automáticamente, o agrega uno propio."}
                </p>
              </div>
              {oasCargando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <RubricaOAEditor
              oas={guia.oas ?? []}
              onChange={(oas: OAEditado[]) => setGuia({
                ...guia,
                oas,
                metadatosCurriculares: metadatosDesdeOAsEval(oas),
              })}
              asignatura={guia.asignatura || asignatura}
              cargando={oasCargando}
            />
          </div>

        </Section>
        </>
        )}

        {showContentStep && (
        <>
        {/* Secciones */}
        {guia.secciones.map((sec, idx) => {
          const puntosSec = sec.actividades.reduce((a, x) => a + (x.puntaje || 0), 0)
          return (
            <div
              key={sec.id}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleSectionDrop(e, sec.id)}
              className="rounded-[14px] border border-[var(--accent-guias)]/20 bg-[var(--accent-guias-soft)]/40 p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  draggable={true}
                  onDragStart={e => {
                    e.dataTransfer.setData("application/x-section-id", sec.id)
                    e.dataTransfer.effectAllowed = "move"
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent-guias)] text-[14px] font-extrabold text-white cursor-grab active:cursor-grabbing"
                >
                  {sec.orden}
                </span>
                <input
                  value={sec.titulo}
                  onChange={e => updateSeccion(sec.id, { titulo: e.target.value })}
                  placeholder={`Sección ${sec.orden}`}
                  className={cn(
                    "flex-1 min-w-0 rounded border border-border bg-background px-2 py-1.5",
                    "text-[13px] font-bold text-foreground outline-none",
                    "focus-visible:ring-2 focus-visible:ring-[var(--accent-guias)]",
                  )}
                />
                <span className="rounded-full bg-[var(--accent-guias-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--accent-guias)]">
                  {sec.actividades.length} act · {puntosSec || "—"} pts
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moverSeccion(sec.id, -1)}
                    disabled={idx === 0}
                    aria-label="Mover sección arriba"
                    className="h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moverSeccion(sec.id, 1)}
                    disabled={idx === guia.secciones.length - 1}
                    aria-label="Mover sección abajo"
                    className="h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => eliminarSeccion(sec.id)}
                    aria-label="Eliminar sección"
                    className="h-7 w-7 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-900/40"
                  >
                    <Trash2 className="mx-auto h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <textarea
                value={sec.descripcion || ""}
                onChange={e => updateSeccion(sec.id, { descripcion: e.target.value })}
                rows={1}
                placeholder="Descripción / objetivo de la sección (opcional)"
                className={cn(
                  "mb-3 w-full resize-y rounded border border-border bg-background px-3 py-1.5",
                  "text-[12px] italic text-foreground outline-none",
                  "focus-visible:ring-2 focus-visible:ring-[var(--accent-guias)]",
                )}
              />

              {/* Contenido didáctico */}
              <div className="mb-3 rounded border border-border bg-card/60 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5 text-[var(--accent-guias)]" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--accent-guias)]">
                    Contenido didáctico (texto, imágenes, tablas)
                  </span>
                </div>
                <BloquesEditor
                  bloques={sec.contenido || []}
                  onChange={contenido => updateSeccion(sec.id, { contenido })}
                  tipoDoc="guias"
                  docId={guia.id}
                  empty="Esta sección aún no tiene contenido. Agrega texto explicativo, imágenes o tablas."
                  modoMusical={modoMusical}
                />
              </div>

              {/* Actividades */}
              <div className="rounded border border-border bg-card/60 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Actividades
                  </span>
                </div>
                <div className="space-y-3">
                  {sec.actividades.map((act, i) => (
                    <ActividadGuiaEditor
                      key={act.id}
                      actividad={act}
                      numero={i + 1}
                      oasDisponibles={guia.oas || []}
                      tipoDoc="guias"
                      docId={guia.id}
                      onChange={a => updateActividad(sec.id, a)}
                      onDelete={() => eliminarActividad(sec.id, act.id)}
                      onMoveUp={() => moverActividad(sec.id, act.id, -1)}
                      onMoveDown={() => moverActividad(sec.id, act.id, 1)}
                      isFirst={i === 0}
                      isLast={i === sec.actividades.length - 1}
                      onDragStart={e => {
                        e.dataTransfer.setData("application/x-item-id", act.id)
                        e.dataTransfer.setData("application/x-source-section-id", sec.id)
                        e.dataTransfer.effectAllowed = "move"
                      }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => handleActDropOnAct(e, act.id, sec.id)}
                      onSaveToBank={() => handleGuardarAlBanco(act)}
                    />
                  ))}

                  <SelectorTipoItem
                    modo="guia"
                    onSelect={tipo => agregarActividad(sec.id, tipo)}
                  />
                </div>
              </div>
            </div>
          )
        })}

        {/* Agregar sección */}
        <button
          type="button"
          onClick={agregarSeccion}
          title="Agregar sección (Ctrl+Shift+N)"
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-[12px] px-4 py-4 text-[13px] font-bold transition-colors",
            "border-2 border-dashed border-[var(--accent-guias)]/40 bg-[var(--accent-guias-soft)]/40 text-[var(--accent-guias)]",
            "hover:border-[var(--accent-guias)] hover:bg-[var(--accent-guias-soft)]/80",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            "focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
          )}
        >
          <Plus className="h-4 w-4" />
          Agregar sección
        </button>

        {/* Cierre / Reflexión */}
        <Section title="Cierre y reflexión final (opcional)" icon={Lightbulb}>
          <p className="mb-3 text-[11.5px] text-muted-foreground">
            Espacio para autoevaluación, metacognición o ejercicio de cierre.
          </p>
          <BloquesEditor
            bloques={guia.cierre || []}
            onChange={cierre => setGuia(g => g ? { ...g, cierre } : g)}
            tipoDoc="guias"
            docId={guia.id}
            empty="Sin contenido de cierre. Útil para preguntas tipo '¿Qué aprendí?'."
            modoMusical={modoMusical}
          />
        </Section>
        </>
        )}

        {showReviewStep && (
        <>
        {/* Resumen final */}
        <div className="rounded-[12px] border border-[var(--accent-guias)]/30 bg-[var(--accent-guias-soft)]/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[12px] font-bold text-[var(--accent-guias)]">
                Resumen de la guía
              </div>
              <div className="text-[11px] text-[var(--accent-guias)]/90">
                {guia.secciones.length} {guia.secciones.length === 1 ? "sección" : "secciones"} ·{" "}
                {totalActividades} {totalActividades === 1 ? "actividad" : "actividades"}
                {puntajeTotal > 0 ? ` · ${puntajeTotal} pts` : ""}
                {guia.tiempoMinutos ? ` · ${guia.tiempoMinutos} min` : ""}
              </div>
            </div>
          </div>
        </div>
        </>
        )}

      </div>
        {/* Banco de ítems */}
        <ItemBank
          open={bancoAbierto}
          onClose={() => setBancoAbierto(false)}
          editorTipo="guia"
          asignatura={guia.asignatura}
          onInsertarItem={handleInsertarItemDelBanco}
        />

        {/* Historial de versiones */}
        <SnapshotPanel<GuiaTemplate>
          open={panelHistorial}
          onClose={() => setPanelHistorial(false)}
          tipo="guias"
          docId={guia.id}
          accent="violet"
          onRestaurar={(snap) => {
            if (snap.payload) {
              setGuia(snap.payload)
              setDirty(true)
              setMensajeGuardado({ tipo: "ok", texto: "Versión restaurada en el editor" })
              setTimeout(() => setMensajeGuardado(null), 2500)
            }
          }}
        />

      </div>
    </>
  )
}

// ─── Estilos compartidos para inputs ──────────────────────────────────────
const inputBaseClass = cn(
  "h-9 w-full rounded border border-border bg-background px-3",
  "text-[13px] text-foreground outline-none",
  "focus-visible:ring-2 focus-visible:ring-[var(--accent-guias)]",
)

const textareaBaseClass = cn(
  "w-full resize-y rounded border border-border bg-background px-3 py-2",
  "text-foreground outline-none",
  "focus-visible:ring-2 focus-visible:ring-[var(--accent-guias)]",
)
