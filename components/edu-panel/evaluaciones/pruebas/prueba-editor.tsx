"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Editor completo de una Prueba
// ─────────────────────────────────────────────────────────────────────────
// Refactor (Task 6.2):
//   • Toolbar inline reemplazada por <StickyEditorToolbar accent="rose" />.
//     Counter "{N} ítems · {P} pts", badge de estado y action cluster:
  //     Guardar · menú secundario.
//   • Loading state usa LoadingSkeleton.EditorSkeleton mientras hidrata.
//   • <UnsavedChangesGuard dirty onSaveAndExit /> intercepta navegaciones.
  //   • useShortcuts mapea Ctrl+S/P/Shift+P/B/H/Shift+N + Esc.
//   • Save persiste con `guardarPruebaConSnapshot` (versionado automático).
//   • Acento rose en toda la superficie (var(--accent-pruebas)).
//   • Conserva estructura existente de configuración, secciones e ítems
//     (refactoriza sólo la superficie toolbar/skeleton/keyboard/guard).
//
// NO-MODIFY guard: no se cambian firmas en `lib/pruebas.ts`.
// Refs: Req 5.1, Req 5.2, Req 5.3, Req 5.4, Req 5.5, Req 5.6, Req 5.13,
//       Req 5.17, Req 5.18, Req 5.19, Req 13.1.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Save, Loader2, Copy, Trash2, Plus,
  Settings, RefreshCw,
  Library, History, FileX, AlertTriangle, ClipboardList, ShieldCheck
} from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarPerfil } from "@/lib/perfil"
import { cargarPlanCurso, type OAEditado, type UnidadPlan } from "@/lib/curriculo"
import {
  cargarPrueba, eliminarPrueba, duplicarPrueba,
  nuevaPrueba, nuevaSeccion, nuevoItem, nuevoItemId,
  normalizarPrueba, resolverMetadatosCurricularesPrueba, cargarOAsParaPrueba,
  romano,
  type PruebaTemplate, type SeccionPrueba, type ItemPrueba, type TipoItem,
} from "@/lib/pruebas"
import { guardarPruebaConSnapshot } from "@/lib/snapshots-hook"
import { ItemEditor } from "../editor/item-editor"
import { BloquesEditor } from "../editor/bloques-editor"
import { SelectorTipoItem } from "../editor/selector-tipo-item"
import { ItemBank } from "../shared/item-bank"
import { guardarItemAlBanco, type ItemBankEntry } from "@/lib/item-bank"
import { ActividadGuia } from "@/lib/guias"
import { actividadGuiaAItemPrueba, pruebaToGuia } from "@/lib/cross-mapping"
import { guardarGuiaConSnapshot } from "@/lib/snapshots-hook"
import { toast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { metadatosDesdeOAsEval } from "@/lib/evaluaciones-tipos"
import { RubricaOAEditor } from "@/components/edu-panel/shared/oa-editor"
import { StickyEditorToolbar, type StickyEditorToolbarBadge } from "../shared/sticky-editor-toolbar"
import { ToolbarButton, Section, Field } from "../shared/editor-primitives"
import { EditorActionsMenu, type EditorActionMenuItem } from "../shared/editor-actions-menu"
import LoadingSkeleton from "../shared/loading-skeleton"
import { UnsavedChangesGuard } from "../shared/unsaved-changes-guard"
import { ErrorBanner } from "../shared/error-banner"
import { EmptyState } from "../shared/empty-state"
import { SnapshotPanel } from "../shared/snapshot-panel"
import { useShortcuts, COMMON_SHORTCUTS, formatShortcut } from "@/lib/keyboard-shortcuts"
import { DocumentCreationSteps, type DocumentCreationStep } from "../shared/document-creation-steps"
import { useAiAccess } from "@/hooks/use-ai-access"

interface Props {
  /** Si se pasa, se carga existente; si no, se crea nueva */
  pruebaId?: string
  /** Curso por defecto al crear nueva */
  cursoInicial?: string
  unidadIdInicial?: string
  unidadNombreInicial?: string
  onClose?: () => void
}

function unidadCursoByAnyId(unidades: UnidadPlan[], unidadId?: string) {
  if (!unidadId) return undefined
  return unidades.find(u =>
    String(u.id) === unidadId ||
    u.unidadCurricularId === unidadId ||
    (!u.unidadCurricularId && `unidad_${u.id}` === unidadId)
  )
}

function unidadIdParaSelect(unidadId: string | undefined, unidades: UnidadPlan[]): string {
  const unidad = unidadCursoByAnyId(unidades, unidadId)
  return unidad ? String(unidad.id) : unidadId || ""
}

export function PruebaEditor({ pruebaId, cursoInicial, unidadIdInicial, unidadNombreInicial, onClose }: Props) {
  const router = useRouter()
  const { asignatura } = useActiveSubject()
  const { hasAiAccess, loading: aiAccessLoading } = useAiAccess()

  const [prueba, setPrueba] = useState<PruebaTemplate | null>(null)
  const [profesorNombre, setProfesorNombre] = useState("")
  const [unidadesCurso, setUnidadesCurso] = useState<UnidadPlan[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [mensajeGuardado, setMensajeGuardado] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null)
  const [mostrarConfig, setMostrarConfig] = useState(true)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [bancoAbierto, setBancoAbierto] = useState(false)
  const [panelHistorial, setPanelHistorial] = useState(false)
  const lastSavedRef = useRef<string>("")
  const [dirty, setDirty] = useState(false)
  const [creationStep, setCreationStep] = useState<DocumentCreationStep>("config")
  const [oasCargando, setOasCargando] = useState(false)
  const oasRequestRef = useRef(0)

  const estado = prueba?.estado || "borrador"
  const isAplicada = estado === "aplicada"

  const marcarGuardado = useCallback((p: PruebaTemplate) => {
    lastSavedRef.current = JSON.stringify(p)
    setDirty(false)
  }, [])

  useEffect(() => {
    if (!prueba) return
    if (!lastSavedRef.current) {
      lastSavedRef.current = JSON.stringify(prueba)
      setDirty(false)
      return
    }
    setDirty(JSON.stringify(prueba) !== lastSavedRef.current)
  }, [prueba])

  /**
   * Wrapper de `setPrueba` que marca el editor como dirty automáticamente.
   * Conservar este patrón para que el UnsavedChangesGuard funcione: cualquier
   * mutación de la prueba pasa por aquí.
   */
  const updatePrueba = (
    next: PruebaTemplate | ((p: PruebaTemplate) => PruebaTemplate),
  ) => {
    setPrueba(prev => {
      if (!prev) return prev
      const value = typeof next === "function" ? (next as (p: PruebaTemplate) => PruebaTemplate)(prev) : next
      return value
    })
  }

  // ─── Guardar al banco ──────────────────────────────────────────────
  const handleGuardarAlBanco = async (item: ItemPrueba) => {
    if (!prueba) return
    try {
      await guardarItemAlBanco(item, {
        asignatura: prueba.asignatura,
        curso: prueba.curso || "",
        oas: item.oaVinculado ? [item.oaVinculado] : [],
        origen: "prueba",
        autor: profesorNombre || "",
      })
      setMensajeGuardado({ tipo: "ok", texto: "Ítem guardado en el banco" })
      setTimeout(() => setMensajeGuardado(null), 2000)
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al guardar en el banco" })
      setTimeout(() => setMensajeGuardado(null), 3000)
    }
  }

  // ─── Drag & Drop Handlers (Req 8.4, Req 6.4) ──────────────────────────
  const handleSectionDrop = (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault()

    // 1. Drop desde el banco de ítems
    const bankData = e.dataTransfer.getData("item-bank-entry")
    if (bankData) {
      try {
        const entry = JSON.parse(bankData) as ItemBankEntry
        let payload = entry.payload
        if (entry.metadata.origen === "guia") {
          const converted = actividadGuiaAItemPrueba(payload as ActividadGuia, [])
          if (!converted) {
            setMensajeGuardado({ tipo: "err", texto: "La actividad no es compatible con el editor de pruebas" })
            setTimeout(() => setMensajeGuardado(null), 3000)
            return
          }
          payload = converted
        }
        const itemClonado = {
          ...payload,
          id: nuevoItemId("it"),
          puntaje: (payload as any).puntaje || 1,
        } as ItemPrueba

        updatePrueba(p => ({
          ...p,
          secciones: p.secciones.map(s => {
            if (s.id !== targetSectionId) return s
            return {
              ...s,
              items: [...s.items, itemClonado],
            }
          })
        }))
        setMensajeGuardado({ tipo: "ok", texto: "Ítem insertado" })
        setTimeout(() => setMensajeGuardado(null), 1500)
      } catch (err) {}
      return
    }

    // 2. Drop de un ítem existente (mover sección/reordenar)
    const draggedItemId = e.dataTransfer.getData("application/x-item-id")
    const sourceSectionId = e.dataTransfer.getData("application/x-source-section-id")
    if (draggedItemId && sourceSectionId) {
      if (sourceSectionId === targetSectionId) return
      updatePrueba(p => {
        const sourceSec = p.secciones.find(s => s.id === sourceSectionId)
        if (!sourceSec) return p
        const item = sourceSec.items.find(it => it.id === draggedItemId)
        if (!item) return p

        return {
          ...p,
          secciones: p.secciones.map(s => {
            if (s.id === sourceSectionId) {
              return { ...s, items: s.items.filter(it => it.id !== draggedItemId) }
            }
            if (s.id === targetSectionId) {
              return { ...s, items: [...s.items, item] }
            }
            return s
          })
        }
      })
      return
    }

    // 3. Drop de una sección (reordenar secciones)
    const draggedSectionId = e.dataTransfer.getData("application/x-section-id")
    if (draggedSectionId && draggedSectionId !== targetSectionId) {
      updatePrueba(p => {
        const idxDrag = p.secciones.findIndex(s => s.id === draggedSectionId)
        const idxTarget = p.secciones.findIndex(s => s.id === targetSectionId)
        if (idxDrag === -1 || idxTarget === -1) return p
        const next = [...p.secciones]
        const [dragged] = next.splice(idxDrag, 1)
        next.splice(idxTarget, 0, dragged)
        return {
          ...p,
          secciones: next.map((s, i) => ({ ...s, orden: i + 1 })),
        }
      })
    }
  }

  const handleItemDropOnItem = (e: React.DragEvent, targetItemId: string, targetSectionId: string) => {
    e.preventDefault()
    e.stopPropagation()

    // 1. Drop desde el banco
    const bankData = e.dataTransfer.getData("item-bank-entry")
    if (bankData) {
      try {
        const entry = JSON.parse(bankData) as ItemBankEntry
        const itemClonado = {
          ...entry.payload,
          id: nuevoItemId("it"),
          puntaje: (entry.payload as any).puntaje || 1,
        } as ItemPrueba

        updatePrueba(p => ({
          ...p,
          secciones: p.secciones.map(s => {
            if (s.id !== targetSectionId) return s
            const idx = s.items.findIndex(it => it.id === targetItemId)
            const items = [...s.items]
            if (idx === -1) items.push(itemClonado)
            else items.splice(idx, 0, itemClonado)
            return { ...s, items }
          })
        }))
        setMensajeGuardado({ tipo: "ok", texto: "Ítem insertado" })
        setTimeout(() => setMensajeGuardado(null), 1500)
      } catch (err) {}
      return
    }

    // 2. Drop de un ítem existente
    const draggedItemId = e.dataTransfer.getData("application/x-item-id")
    const sourceSectionId = e.dataTransfer.getData("application/x-source-section-id")
    if (draggedItemId && sourceSectionId) {
      updatePrueba(p => {
        const sourceSec = p.secciones.find(s => s.id === sourceSectionId)
        const targetSec = p.secciones.find(s => s.id === targetSectionId)
        if (!sourceSec || !targetSec) return p
        const item = sourceSec.items.find(it => it.id === draggedItemId)
        if (!item) return p

        if (sourceSectionId === targetSectionId) {
          const idxDrag = sourceSec.items.findIndex(it => it.id === draggedItemId)
          const idxTarget = sourceSec.items.findIndex(it => it.id === targetItemId)
          if (idxDrag === -1 || idxTarget === -1) return p
          const items = [...sourceSec.items]
          const [dragged] = items.splice(idxDrag, 1)
          items.splice(idxTarget, 0, dragged)
          return {
            ...p,
            secciones: p.secciones.map(s => s.id === sourceSectionId ? { ...s, items } : s)
          }
        } else {
          const idxTarget = targetSec.items.findIndex(it => it.id === targetItemId)
          return {
            ...p,
            secciones: p.secciones.map(s => {
              if (s.id === sourceSectionId) {
                return { ...s, items: s.items.filter(it => it.id !== draggedItemId) }
              }
              if (s.id === targetSectionId) {
                const items = [...s.items]
                if (idxTarget === -1) items.push(item)
                else items.splice(idxTarget, 0, item)
                return { ...s, items }
              }
              return s
            })
          }
        }
      })
    }
  }

  const handleInsertarItemDelBanco = (entry: ItemBankEntry) => {
    if (!prueba) return
    let payload = entry.payload
    if (entry.metadata.origen === "guia") {
      const converted = actividadGuiaAItemPrueba(payload as ActividadGuia, [])
      if (!converted) {
        setMensajeGuardado({ tipo: "err", texto: "La actividad no es compatible con el editor de pruebas" })
        setTimeout(() => setMensajeGuardado(null), 3000)
        return
      }
      payload = converted
    }
    const itemClonado = {
      ...payload,
      id: nuevoItemId("it"),
      puntaje: (payload as any).puntaje || 1,
    } as ItemPrueba

    updatePrueba(p => {
      const secciones = [...p.secciones]
      if (secciones.length === 0) {
        secciones.push(nuevaSeccion(1, "seleccion_multiple"))
      }
      secciones[0] = {
        ...secciones[0],
        items: [...secciones[0].items, itemClonado],
      }
      return { ...p, secciones }
    })

    setMensajeGuardado({ tipo: "ok", texto: "Ítem insertado" })
    setTimeout(() => setMensajeGuardado(null), 1500)
  }

  // ─── Carga inicial ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
    setCargando(true)
    setErrorCarga(null)
    cargarPerfil().then((perf) => {
      if (cancelled) return
      setProfesorNombre(perf?.tipoProfesor || perf?.especialidad || "")
    }).catch(() => {})

    if (pruebaId) {
      cargarPrueba(pruebaId).then(p => {
        if (cancelled) return
        if (p) {
          setPrueba(p)
          marcarGuardado(p)
          if (p.curso) {
            cargarPlanCurso(p.asignatura, p.curso).then(plan => {
              if (!cancelled) setUnidadesCurso(plan?.units || [])
            }).catch(() => {})
          }
        } else {
          setErrorCarga("Prueba no encontrada")
        }
        setCargando(false)
      }).catch((e: any) => {
        if (cancelled) return
        setErrorCarga(e?.message || "No fue posible cargar la prueba")
        setCargando(false)
      })
    } else {
      const nueva = nuevaPrueba(asignatura, cursoInicial || "")
      if (unidadIdInicial) nueva.unidadId = unidadIdInicial
      if (unidadNombreInicial) nueva.unidadNombre = unidadNombreInicial
      // Empezar con una sección
      nueva.secciones = [nuevaSeccion(1, "seleccion_multiple")]
      setPrueba(nueva)
      marcarGuardado(nueva)
      if (cursoInicial) {
        cargarPlanCurso(asignatura, cursoInicial).then(plan => {
          if (!cancelled) setUnidadesCurso(plan?.units || [])
        }).catch(() => {})
      }
      setCargando(false)
    }

    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pruebaId])

  // Cargar unidades cuando cambia el curso
  useEffect(() => {
    if (!prueba?.curso) return
    cargarPlanCurso(prueba.asignatura, prueba.curso)
      .then(plan => setUnidadesCurso(plan?.units || []))
      .catch(() => setUnidadesCurso([]))
  }, [prueba?.curso, prueba?.asignatura])

  useEffect(() => {
    if (!prueba?.unidadId || !prueba.curso || !prueba.asignatura) return
    const uid = prueba.unidadId
    const reqId = ++oasRequestRef.current
    setOasCargando(true)
    cargarOAsParaPrueba(prueba.asignatura, prueba.curso, uid, prueba.oas)
      .then((oas) => {
        if (oasRequestRef.current !== reqId) return
        setPrueba((prev) => {
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
  }, [prueba?.unidadId, prueba?.curso, prueba?.asignatura])

  // ─── Resolver OAs y metadatos cuando cambia la unidad ────────────
  const sincronizarConCurriculo = async () => {
    if (!prueba) return
    try {
      const resol = await resolverMetadatosCurricularesPrueba(prueba)
      let oas = prueba.oas
      if (resol.unidadId) {
        oas = await cargarOAsParaPrueba(prueba.asignatura, prueba.curso, resol.unidadId, prueba.oas)
      }
      updatePrueba(p => ({
        ...p,
        unidadId: p.unidadId || resol.unidadId,
        unidadNombre: resol.unidadNombre || p.unidadNombre,
        metadatosCurriculares: oas ? metadatosDesdeOAsEval(oas) : resol.metadatosCurriculares,
        oas,
      }))
      setMensajeGuardado({ tipo: "ok", texto: "Currículum sincronizado" })
      setTimeout(() => setMensajeGuardado(null), 2500)
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al sincronizar" })
    }
  }

  // ─── Guardar ──────────────────────────────────────────────────────
  const handleGuardar = useCallback(async () => {
    if (!prueba) return
    if (!prueba.curso) {
      setMensajeGuardado({ tipo: "err", texto: "Selecciona un curso antes de guardar" })
      return
    }
    setGuardando(true)
    try {
      // Persistir + crear snapshot inmutable (best-effort).
      const normalizada = normalizarPrueba(prueba)
      await guardarPruebaConSnapshot(normalizada)
      setPrueba(normalizada)
      marcarGuardado(normalizada)
      setMensajeGuardado({ tipo: "ok", texto: "Guardado" })
      setTimeout(() => setMensajeGuardado(null), 2000)
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al guardar" })
    } finally {
      setGuardando(false)
    }
  }, [prueba, marcarGuardado])

  const handleEliminar = async () => {
    if (!prueba) return
    if (!confirmarEliminar) { setConfirmarEliminar(true); return }
    try {
      await eliminarPrueba(prueba.id)
      marcarGuardado(prueba)
      if (onClose) onClose()
      else router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "pruebas" }, asignatura)))
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al eliminar" })
    }
  }

  const handleDuplicar = async () => {
    if (!prueba) return
    try {
      const copia = await duplicarPrueba(prueba)
      setDirty(false)
      router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "pruebas", view: "editor", pruebaId: copia.id }, asignatura)))
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al duplicar" })
    }
  }

  const handleDuplicarComoGuia = async () => {
    if (!prueba) return
    try {
      setGuardando(true)
      const res = pruebaToGuia(prueba)
      await guardarGuiaConSnapshot(res.documento)
      setDirty(false)
      
      if (res.omitidos.length > 0) {
        toast({
          title: "Duplicado como guía (con omisiones)",
          description: `Se omitieron ${res.omitidos.length} ítems incompatibles. Redirigiendo...`,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Duplicado como guía con éxito",
          description: "Redirigiendo a la nueva guía...",
        })
      }
      
      router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "guias", view: "editor", guiaId: res.documento.id }, asignatura)))
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al duplicar como guía" })
    } finally {
      setGuardando(false)
    }
  }

  const handleVolver = () => {
    if (onClose) onClose()
    else router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "pruebas" }, asignatura)))
  }

  const handleAdaptar = () => {
    if (!pruebaId) return
    if (!hasAiAccess) return
    router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "pruebas", view: "evaluacion", pruebaId }, asignatura)))
  }

  // ─── Operaciones sobre secciones ─────────────────────────────────
  const agregarSeccion = () => {
    updatePrueba(p => ({
      ...p,
      secciones: [...p.secciones, nuevaSeccion(p.secciones.length + 1, "seleccion_multiple")],
    }))
  }

  const updateSeccion = (id: string, parcial: Partial<SeccionPrueba>) => {
    updatePrueba(p => ({
      ...p,
      secciones: p.secciones.map(s => s.id === id ? { ...s, ...parcial } : s),
    }))
  }

  const moverSeccion = (id: string, dir: -1 | 1) => {
    updatePrueba(p => {
      const idx = p.secciones.findIndex(s => s.id === id)
      const newIdx = idx + dir
      if (idx === -1 || newIdx < 0 || newIdx >= p.secciones.length) return p
      const next = [...p.secciones]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return { ...p, secciones: next.map((s, i) => ({ ...s, orden: i + 1 })) }
    })
  }

  const eliminarSeccion = (id: string) => {
    updatePrueba(p => ({ ...p, secciones: p.secciones.filter(s => s.id !== id) }))
  }

  // ─── Operaciones sobre items ────────────────────────────────────
  const agregarItem = (seccionId: string, tipo: TipoItem) => {
    updatePrueba(p => ({
      ...p,
      secciones: p.secciones.map(s => s.id !== seccionId ? s : {
        ...s,
        items: [...s.items, nuevoItem(tipo)],
      }),
    }))
  }

  const updateItem = (seccionId: string, item: ItemPrueba) => {
    updatePrueba(p => ({
      ...p,
      secciones: p.secciones.map(s => s.id !== seccionId ? s : {
        ...s,
        items: s.items.map(it => it.id === item.id ? item : it),
      }),
    }))
  }

  const moverItem = (seccionId: string, itemId: string, dir: -1 | 1) => {
    updatePrueba(p => ({
      ...p,
      secciones: p.secciones.map(s => {
        if (s.id !== seccionId) return s
        const idx = s.items.findIndex(it => it.id === itemId)
        const newIdx = idx + dir
        if (idx === -1 || newIdx < 0 || newIdx >= s.items.length) return s
        const next = [...s.items]
        ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
        return { ...s, items: next }
      }),
    }))
  }

  const eliminarItem = (seccionId: string, itemId: string) => {
    updatePrueba(p => ({
      ...p,
      secciones: p.secciones.map(s => s.id !== seccionId ? s : {
        ...s,
        items: s.items.filter(it => it.id !== itemId),
      }),
    }))
  }

  // ─── Atajos de teclado (Req 5.17) ────────────────────────────────
  // El hook recibe la lista de atajos a registrar. Cuando se cambia algún
  // estado del editor, la lista se reconstruye y `useShortcuts`
  // re-registra el listener. La closure captura los valores actuales.
  useShortcuts([
    {
      keys: COMMON_SHORTCUTS.GUARDAR,
      handler: () => { if (!isAplicada) handleGuardar() },
      allowInInputs: true,
      description: "Guardar",
    },
    {
      keys: COMMON_SHORTCUTS.BANCO,
      handler: () => { if (!isAplicada) setBancoAbierto(v => !v) },
      allowInInputs: true,
      description: "Banco de ítems",
    },
    {
      keys: COMMON_SHORTCUTS.HISTORIAL,
      handler: () => { setPanelHistorial(v => !v) },
      allowInInputs: true,
      description: "Historial",
    },
    {
      keys: COMMON_SHORTCUTS.NUEVA_SECCION,
      handler: () => { if (!isAplicada) agregarSeccion() },
      allowInInputs: true,
      description: "Nueva sección",
    },
    {
      keys: COMMON_SHORTCUTS.CERRAR,
      handler: () => {
        if (bancoAbierto) setBancoAbierto(false)
        if (panelHistorial) setPanelHistorial(false)
      },
      description: "Cerrar panel",
    },
  ])

  // ─── Render: loading + error ─────────────────────────────────────
  if (cargando) {
    return <LoadingSkeleton.EditorSkeleton />
  }

  if (errorCarga || !prueba) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-8">
        <ErrorBanner
          message={errorCarga || "Prueba no encontrada"}
          onDismiss={handleVolver}
        />
        <EmptyState
          icon={FileX}
          title="No se pudo abrir la prueba"
          text="Vuelve al hub de Pruebas y vuelve a intentarlo."
          accent="rose"
          action={{
            label: "Volver al hub",
            onClick: handleVolver,
          }}
        />
      </div>
    )
  }

  // ─── Counter, badge y título ──────────────────────────────────────
  const puntajeTotal = prueba.secciones.reduce((acc, s) =>
    acc + s.items.reduce((a, it) => a + (it.puntaje || 0), 0)
  , 0)
  const totalItems = prueba.secciones.reduce((acc, s) => acc + s.items.length, 0)
  const counter = `${totalItems} ítem${totalItems === 1 ? "" : "s"} · ${puntajeTotal} pts`

  const badge: StickyEditorToolbarBadge = {
    label:
      estado === "lista" ? "Lista"
      : estado === "aplicada" ? "Aplicada"
      : estado === "archivada" ? "Archivada"
      : "Borrador",
    tone:
      estado === "lista" ? "success"
      : estado === "aplicada" ? "primary"
      : estado === "archivada" ? "neutral"
      : "warning",
  }

  const secondaryActions: EditorActionMenuItem[] = [
    ...(!isAplicada
      ? [
          {
            label: "Banco de ítems",
            icon: Library,
            onClick: () => setBancoAbierto((value) => !value),
          },
        ]
      : []),
    {
      label: "Historial",
      icon: History,
      onClick: () => setPanelHistorial((value) => !value),
    },
    ...(pruebaId
      ? [
          {
            label: aiAccessLoading ? "Verificando IA" : "Adaptar",
            icon: ShieldCheck,
            onClick: handleAdaptar,
            disabled: aiAccessLoading || !hasAiAccess,
          },
          {
            label: "Duplicar",
            icon: Copy,
            onClick: handleDuplicar,
          },
          {
            label: "Duplicar como guía",
            icon: ClipboardList,
            onClick: handleDuplicarComoGuia,
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
  const isCreating = !pruebaId
  const showConfigStep = !isCreating || creationStep === "config"
  const showContentStep = !isCreating || creationStep === "contenido"
  const showReviewStep = !isCreating || creationStep === "revisar"
  const configReady = Boolean(prueba.nombre.trim() && prueba.curso.trim())

  return (
    <div className="mx-auto max-w-7xl flex flex-col lg:flex-row items-start gap-4">
      {/* Guard de cambios sin guardar (Req 5.19) */}
      <UnsavedChangesGuard
        dirty={dirty && !isAplicada}
        onSaveAndExit={async () => { if (!isAplicada) await handleGuardar() }}
      />

      {/* Editor principal */}
      <div className="flex-1 space-y-4 min-w-0 w-full">
        {isAplicada && (
          <div className="rounded-[12px] border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>Prueba aplicada:</strong> Esta evaluación ya ha sido aplicada a los estudiantes. Su estructura está bloqueada y no se puede modificar.
            </span>
          </div>
        )}

      {/* Sticky toolbar refactorizada (Req 5.3) */}
      <StickyEditorToolbar
        accent="rose"
        title={prueba.nombre}
        onTitleChange={isAplicada ? () => {} : (v) => updatePrueba(p => ({ ...p, nombre: v }))}
        counter={counter}
        badge={badge}
        dirty={dirty && !isAplicada}
        onBack={handleVolver}
        actionsRight={
          <>
            {mensajeGuardado && (
              <span className={cn(
                "rounded-full px-2.5 py-0.5 text-[10.5px] font-bold",
                mensajeGuardado.tipo === "ok"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
              )}>
                {mensajeGuardado.texto}
              </span>
            )}
            {!isAplicada && (
              <ToolbarButton
                icon={guardando ? Loader2 : Save}
                label={guardando ? "Guardando…" : "Guardar"}
                shortcut={COMMON_SHORTCUTS.GUARDAR}
                onClick={handleGuardar}
                disabled={guardando}
                primary
                spinning={guardando}
              />
            )}
            <EditorActionsMenu accent="rose" actions={secondaryActions} />
          </>
        }
      />

      {isCreating && (
        <DocumentCreationSteps
          current={creationStep}
          onChange={setCreationStep}
          accent="rose"
          contentCount={totalItems}
          contentLabel={totalItems === 1 ? "ítem" : "ítems"}
          ready={configReady}
        />
      )}

      {/* ─── Configuración general ─── */}
      {showConfigStep && (
      <div className={cn(isAplicada && "pointer-events-none opacity-85 select-none")}>
        <Section
          title="Configuración"
          expanded={isCreating ? true : mostrarConfig}
          onToggle={isCreating ? undefined : () => setMostrarConfig(v => !v)}
          icon={Settings}
        >
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Curso">
            <input
              value={prueba.curso}
              onChange={e => updatePrueba(p => ({ ...p, curso: e.target.value }))}
              placeholder="4°A"
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            />
          </Field>
          <Field label="Unidad">
            <select
              value={unidadIdParaSelect(prueba.unidadId, unidadesCurso)}
              onChange={e => {
                const u = unidadCursoByAnyId(unidadesCurso, e.target.value)
                updatePrueba(p => ({
                  ...p,
                  unidadId: e.target.value || undefined,
                  unidadNombre: u?.name,
                  oas: undefined,
                  metadatosCurriculares: metadatosDesdeOAsEval(undefined),
                }))
              }}
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            >
              <option value="">— Sin unidad —</option>
              {unidadesCurso.map(u => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de evaluación">
            <select
              value={prueba.tipoEvaluacion || "sumativa"}
              onChange={e => updatePrueba(p => ({ ...p, tipoEvaluacion: e.target.value as any }))}
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            >
              <option value="sumativa">Sumativa</option>
              <option value="formativa">Formativa</option>
              <option value="diagnostica">Diagnóstica</option>
            </select>
          </Field>
          <Field label="Tiempo (min)">
            <input
              type="number"
              min={5}
              value={prueba.tiempoMinutos || 90}
              onChange={e => updatePrueba(p => ({ ...p, tiempoMinutos: Number(e.target.value) || 90 }))}
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            />
          </Field>
          <Field label="Ponderación (%)">
            <input
              type="number"
              min={0} max={100}
              value={prueba.ponderacion || 0}
              onChange={e => updatePrueba(p => ({ ...p, ponderacion: Number(e.target.value) || 0 }))}
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            />
          </Field>
          <Field label="Exigencia">
            <select
              value={String(prueba.exigencia ?? 0.6)}
              onChange={e => updatePrueba(p => ({ ...p, exigencia: Number(e.target.value) }))}
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            >
              <option value="0.5">50% (PIE)</option>
              <option value="0.6">60% (estándar)</option>
              <option value="0.7">70%</option>
            </select>
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={sincronizarConCurriculo}
            disabled={!prueba.curso || !prueba.unidadNombre}
            className={cn(
              "flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-bold transition-colors",
              "border border-[var(--accent-pruebas)]/40 bg-[var(--accent-pruebas-soft)]/50 text-[var(--accent-pruebas)]",
              "hover:bg-[var(--accent-pruebas-soft)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sincronizar con currículum
          </button>
          <span className="text-[10.5px] text-muted-foreground">
            Carga OAs e indicadores oficiales desde la unidad seleccionada
          </span>
        </div>

        {/* Instrucciones generales */}
        <div className="mt-4">
          <Field label="Instrucciones generales (una por línea)">
            <textarea
              value={prueba.instruccionesGenerales.join("\n")}
              onChange={e => updatePrueba(p => ({
                ...p,
                instruccionesGenerales: e.target.value.split("\n"),
              }))}
              rows={5}
              className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12.5px]"
            />
          </Field>
        </div>

        {/* OAs e indicadores */}
        <div className="mt-4 rounded-[12px] border border-border bg-card/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-extrabold text-foreground">Objetivos e indicadores</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {oasCargando
                  ? "Cargando OA desde la base curricular..."
                  : prueba.unidadId
                    ? "Haz clic en los puntos para seleccionar/deseleccionar OA e indicadores."
                    : "Selecciona una unidad para cargar los OA automáticamente, o agrega uno propio."}
              </p>
            </div>
            {oasCargando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <RubricaOAEditor
            oas={prueba.oas ?? []}
            onChange={(oas: OAEditado[]) => updatePrueba(p => ({
              ...p,
              oas,
              metadatosCurriculares: metadatosDesdeOAsEval(oas),
            }))}
            asignatura={prueba.asignatura || asignatura}
            cargando={oasCargando}
          />
        </div>

      </Section>
      </div>
      )}

      {showContentStep && (
      <>
      {/* ─── Secciones de la prueba ─── */}
      <div className={cn(isAplicada && "pointer-events-none opacity-85 select-none")}>
      {prueba.secciones.map((seccion, idx) => {
        const puntosSeccion = seccion.items.reduce((a, it) => a + (it.puntaje || 0), 0)

        return (
          <div
            key={seccion.id}
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleSectionDrop(e, seccion.id)}
            className="rounded-[14px] border border-border bg-background/40 p-4"
          >
            {/* Header de sección */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                draggable={true}
                onDragStart={e => {
                  e.dataTransfer.setData("application/x-section-id", seccion.id)
                  e.dataTransfer.effectAllowed = "move"
                }}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-lg text-[14px] font-extrabold text-white cursor-grab active:cursor-grabbing",
                  "bg-[var(--accent-pruebas)]",
                )}
              >
                {romano(seccion.orden)}
              </span>
              <input
                value={seccion.titulo}
                onChange={e => updateSeccion(seccion.id, { titulo: e.target.value })}
                placeholder={`Ítem ${romano(seccion.orden)}: tipo de pregunta`}
                className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1.5 text-[13px] font-bold outline-none"
              />
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                {seccion.items.length} {seccion.items.length === 1 ? "ítem" : "ítems"} · {puntosSeccion} pts
              </span>
              <div className="flex gap-1">
                <button type="button" onClick={() => moverSeccion(seccion.id, -1)} disabled={idx === 0}
                  className="h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 disabled:opacity-40 font-bold">↑</button>
                <button type="button" onClick={() => moverSeccion(seccion.id, 1)} disabled={idx === prueba.secciones.length - 1}
                  className="h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 disabled:opacity-40 font-bold">↓</button>
                <button
                  type="button"
                  onClick={() => eliminarSeccion(seccion.id)}
                  className="h-7 w-7 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                  title="Eliminar sección"
                  aria-label="Eliminar sección"
                >
                  <Trash2 className="mx-auto h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <textarea
              value={seccion.instrucciones}
              onChange={e => updateSeccion(seccion.id, { instrucciones: e.target.value })}
              rows={2}
              placeholder="Instrucciones de la sección…"
              className={cn(
                "mb-3 w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12.5px] italic outline-none",
                "focus:border-[var(--accent-pruebas)]",
              )}
            />

            {/* Estímulo (texto/imagen previo a las preguntas) */}
            <details className="mb-3 rounded border border-border bg-card/50">
              <summary className="cursor-pointer px-3 py-2 text-[11.5px] font-bold text-muted-foreground hover:bg-muted/30">
                + Estímulo / texto / imagen para esta sección (lectura comprensiva, afiche, etc.)
              </summary>
              <div className="border-t border-border p-3">
                <BloquesEditor
                  bloques={seccion.estimulo || []}
                  onChange={est => updateSeccion(seccion.id, { estimulo: est })}
                  tipoDoc="pruebas"
                  docId={prueba.id}
                  empty="Sin estímulo. Útil para textos de lectura comprensiva o afiches."
                />
              </div>
            </details>

            {/* Items */}
            <div className="space-y-3">
              {seccion.items.map((item, i) => (
                <ItemEditor
                  key={item.id}
                  item={item}
                  numero={i + 1}
                  oasDisponibles={prueba.oas || []}
                  tipoDoc="pruebas"
                  docId={prueba.id}
                  onChange={it => updateItem(seccion.id, it)}
                  onDelete={() => eliminarItem(seccion.id, item.id)}
                  onMoveUp={() => moverItem(seccion.id, item.id, -1)}
                  onMoveDown={() => moverItem(seccion.id, item.id, 1)}
                  isFirst={i === 0}
                  isLast={i === seccion.items.length - 1}
                  onDragStart={e => {
                    e.dataTransfer.setData("application/x-item-id", item.id)
                    e.dataTransfer.setData("application/x-source-section-id", seccion.id)
                    e.dataTransfer.effectAllowed = "move"
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => handleItemDropOnItem(e, item.id, seccion.id)}
                  onSaveToBank={() => handleGuardarAlBanco(item)}
                />
              ))}

              <SelectorTipoItem
                modo="prueba"
                onSelect={tipo => agregarItem(seccion.id, tipo)}
              />
            </div>
          </div>
        )
      })}
      </div>

      {/* Agregar sección */}
      {!isAplicada && (
        <button
          type="button"
          onClick={agregarSeccion}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-border bg-card px-4 py-4 text-[13px] font-bold text-muted-foreground transition-colors",
            "hover:border-[var(--accent-pruebas)] hover:text-[var(--accent-pruebas)]",
          )}
        >
          <Plus className="h-4 w-4" />
          Agregar sección (Ítem {romano(prueba.secciones.length + 1)})
          <span className="ml-1 hidden text-[10px] font-medium text-muted-foreground sm:inline">
            {formatShortcut(COMMON_SHORTCUTS.NUEVA_SECCION)}
          </span>
        </button>
      )}
      </>
      )}

      {showReviewStep && (
      <>
      {/* Resumen final (Req 5.18) */}
      <div className="rounded-[12px] border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-bold text-emerald-800 dark:text-emerald-300">
              Resumen de la prueba
            </div>
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
              {prueba.secciones.length} {prueba.secciones.length === 1 ? "sección" : "secciones"} ·{" "}
              {totalItems} {totalItems === 1 ? "ítem" : "ítems"} ·{" "}
              <b>{puntajeTotal} pts máximo</b>
              {prueba.tiempoMinutos ? ` · ${prueba.tiempoMinutos} min` : ""}
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      </div>

      {/* Banco de ítems drawer */}
      <ItemBank
        open={bancoAbierto}
        onClose={() => setBancoAbierto(false)}
        editorTipo="prueba"
        asignatura={prueba.asignatura}
        onInsertarItem={handleInsertarItemDelBanco}
      />

      {/* Historial de versiones */}
      <SnapshotPanel<PruebaTemplate>
        open={panelHistorial}
        onClose={() => setPanelHistorial(false)}
        tipo="pruebas"
        docId={prueba.id}
        accent="rose"
        onRestaurar={(snap) => {
          if (snap.payload) {
            setPrueba(snap.payload)
            setDirty(true)
            setMensajeGuardado({ tipo: "ok", texto: "Versión restaurada en el editor" })
            setTimeout(() => setMensajeGuardado(null), 2500)
          }
        }}
      />

    </div>
  )
}

