"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Editor completo de una Prueba
// ─────────────────────────────────────────────────────────────────────────
// Refactor (Task 6.2):
//   • Toolbar inline reemplazada por <StickyEditorToolbar accent="rose" />.
//     Counter "{N} ítems · {P} pts", badge de estado y action cluster:
//     Vista alumno · Pauta · Guardar · IA · Banco · Historial · Duplicar ·
//     Eliminar.
//   • Loading state usa LoadingSkeleton.EditorSkeleton mientras hidrata.
//   • <UnsavedChangesGuard dirty onSaveAndExit /> intercepta navegaciones.
//   • useShortcuts mapea Ctrl+S/P/Shift+P/I/B/H/Shift+N + Esc.
//   • Save persiste con `guardarPruebaConSnapshot` (versionado automático).
//   • Acento rose en toda la superficie (var(--accent-pruebas)).
//   • Conserva estructura existente de configuración, secciones e ítems
//     (refactoriza sólo la superficie toolbar/skeleton/keyboard/guard).
//
// NO-MODIFY guard: no se cambian firmas en `lib/pruebas.ts`.
// Refs: Req 5.1, Req 5.2, Req 5.3, Req 5.4, Req 5.5, Req 5.6, Req 5.13,
//       Req 5.17, Req 5.18, Req 5.19, Req 13.1.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Save, Loader2, Eye, Printer, Copy, Trash2, Plus,
  ChevronDown, ChevronUp, Settings, FileCheck, RefreshCw,
  Sparkles, Library, History, FileX, AlertTriangle, ClipboardList, Heart, Award
} from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarInfoColegio, cargarPerfil, type InfoColegio } from "@/lib/perfil"
import { cargarPlanCurso, type UnidadPlan } from "@/lib/curriculo"
import {
  cargarPrueba, eliminarPrueba, duplicarPrueba,
  nuevaPrueba, nuevaSeccion, nuevoItem,
  resolverMetadatosCurricularesPrueba, cargarOAsParaPrueba,
  romano, calcularPuntajeMaximoPrueba,
  type PruebaTemplate, type SeccionPrueba, type ItemPrueba, type TipoItem,
} from "@/lib/pruebas"
import { abrirPruebaImprimible } from "@/lib/export/prueba-pdf"
import { guardarPruebaConSnapshot } from "@/lib/snapshots-hook"
import { ItemEditor } from "../editor/item-editor"
import { BloquesEditor } from "../editor/bloques-editor"
import { SelectorTipoItem } from "../editor/selector-tipo-item"
import { AIPanel } from "../shared/ai-panel"
import { ItemBank } from "../shared/item-bank"
import { guardarItemAlBanco, type ItemBankEntry } from "@/lib/item-bank"
import { ActividadGuia } from "@/lib/guias"
import { actividadGuiaAItemPrueba, pruebaToGuia } from "@/lib/cross-mapping"
import { guardarGuiaConSnapshot } from "@/lib/snapshots-hook"
import { toast } from "@/components/ui/use-toast"
import { useContextoCurricular } from "@/hooks/use-contexto-curricular"
import { cn } from "@/lib/utils"
import { StickyEditorToolbar, type StickyEditorToolbarBadge } from "../shared/sticky-editor-toolbar"
import { EditorSkeleton } from "../shared/loading-skeleton"
import { UnsavedChangesGuard } from "../shared/unsaved-changes-guard"
import { ErrorBanner } from "../shared/error-banner"
import { EmptyState } from "../shared/empty-state"
import { SnapshotPanel } from "../shared/snapshot-panel"
import { useShortcuts, COMMON_SHORTCUTS, formatShortcut } from "@/lib/keyboard-shortcuts"
import { cargarEstudiantes, type Estudiante } from "@/lib/estudiantes"
import { AdaptarPieModal } from "../shared/adaptar-pie-modal"
import { SimulacionAlumnosModal } from "../shared/simulacion-alumnos-modal"
import { CalibradorBloomModal } from "../shared/calibrador-bloom-modal"
import { getFeatureFlags } from "@/lib/feature-flags"

interface Props {
  /** Si se pasa, se carga existente; si no, se crea nueva */
  pruebaId?: string
  /** Curso por defecto al crear nueva */
  cursoInicial?: string
  unidadIdInicial?: string
  unidadNombreInicial?: string
  onClose?: () => void
}

export function PruebaEditor({ pruebaId, cursoInicial, unidadIdInicial, unidadNombreInicial, onClose }: Props) {
  const router = useRouter()
  const { asignatura } = useActiveSubject()

  const [prueba, setPrueba] = useState<PruebaTemplate | null>(null)
  const [colegio, setColegio] = useState<InfoColegio | null>(null)
  const [profesorNombre, setProfesorNombre] = useState("")
  const [unidadesCurso, setUnidadesCurso] = useState<UnidadPlan[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [mensajeGuardado, setMensajeGuardado] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null)
  const [mostrarConfig, setMostrarConfig] = useState(true)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [panelIA, setPanelIA] = useState(false)
  const [bancoAbierto, setBancoAbierto] = useState(false)
  const [panelHistorial, setPanelHistorial] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [panelPie, setPanelPie] = useState(false)
  const [estudiantesPie, setEstudiantesPie] = useState<Estudiante[]>([])
  const [showSimulacion, setShowSimulacion] = useState(false)
  const [showBloom, setShowBloom] = useState(false)
  const [featureFlags, setFeatureFlags] = useState<Record<string, any>>({})

  useEffect(() => {
    getFeatureFlags().then(setFeatureFlags).catch(console.error)
  }, [])

  const estado = prueba?.estado || "borrador"
  const isAplicada = estado === "aplicada"

  // Hook de vinculación curricular automática
  const { contexto: contextoCurricular } = useContextoCurricular({
    asignatura,
    curso: prueba?.curso || "",
    unidadId: prueba?.unidadId,
    unidadNombre: prueba?.unidadNombre,
  })

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
    setDirty(true)
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
          id: `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
          id: `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
      id: `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
    setCargando(true)
    setErrorCarga(null)
    Promise.all([
      cargarInfoColegio(),
      cargarPerfil(),
    ]).then(([col, perf]) => {
      if (cancelled) return
      setColegio(col)
      setProfesorNombre(perf?.especialidad ? "" : "")  // sin nombre forzado
    }).catch(() => {})

    if (pruebaId) {
      cargarPrueba(pruebaId).then(p => {
        if (cancelled) return
        if (p) {
          setPrueba(p)
          setDirty(false)
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
      setDirty(false)
      if (cursoInicial) {
        cargarPlanCurso(asignatura, cursoInicial).then(plan => {
          if (!cancelled) setUnidadesCurso(plan?.units || [])
        }).catch(() => {})
      }
      setCargando(false)
    }

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

  // Cargar estudiantes PIE del curso
  useEffect(() => {
    if (!prueba?.curso) { setEstudiantesPie([]); return }
    cargarEstudiantes(prueba.curso)
      .then(est => setEstudiantesPie(est.filter(e => e.pie)))
      .catch(() => setEstudiantesPie([]))
  }, [prueba?.curso])

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
        unidadId: resol.unidadId || p.unidadId,
        unidadNombre: resol.unidadNombre || p.unidadNombre,
        metadatosCurriculares: resol.metadatosCurriculares,
        oas,
      }))
      setMensajeGuardado({ tipo: "ok", texto: "Currículum sincronizado" })
      setTimeout(() => setMensajeGuardado(null), 2500)
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al sincronizar" })
    }
  }

  // ─── Guardar ──────────────────────────────────────────────────────
  const handleGuardar = async () => {
    if (!prueba) return
    if (!prueba.curso) {
      setMensajeGuardado({ tipo: "err", texto: "Selecciona un curso antes de guardar" })
      return
    }
    setGuardando(true)
    try {
      // Persistir + crear snapshot inmutable (best-effort).
      await guardarPruebaConSnapshot(prueba)
      setDirty(false)
      setMensajeGuardado({ tipo: "ok", texto: "Guardado" })
      setTimeout(() => setMensajeGuardado(null), 2000)
    } catch (e: any) {
      setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al guardar" })
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async () => {
    if (!prueba) return
    if (!confirmarEliminar) { setConfirmarEliminar(true); return }
    try {
      await eliminarPrueba(prueba.id)
      setDirty(false)
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

  const exportarPara = (modo: "para_alumno" | "con_pauta") => {
    if (!prueba) return
    abrirPruebaImprimible({ prueba, colegio, profesorNombre, modo })
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
  // estado (panelIA, prueba, etc.) la lista se reconstruye y `useShortcuts`
  // re-registra el listener. La closure captura los valores actuales.
  useShortcuts([
    {
      keys: COMMON_SHORTCUTS.GUARDAR,
      handler: () => { if (!isAplicada) handleGuardar() },
      allowInInputs: true,
      description: "Guardar",
    },
    {
      keys: COMMON_SHORTCUTS.VISTA_ALUMNO,
      handler: () => { exportarPara("para_alumno") },
      allowInInputs: true,
      description: "Vista alumno",
    },
    {
      keys: COMMON_SHORTCUTS.PAUTA,
      handler: () => { exportarPara("con_pauta") },
      allowInInputs: true,
      description: "Pauta",
    },
    {
      keys: COMMON_SHORTCUTS.PANEL_IA,
      handler: () => { if (!isAplicada) setPanelIA(v => !v) },
      allowInInputs: true,
      description: "Panel IA",
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
        if (panelIA) setPanelIA(false)
        if (bancoAbierto) setBancoAbierto(false)
        if (panelHistorial) setPanelHistorial(false)
      },
      description: "Cerrar panel",
    },
  ])

  // ─── Render: loading + error ─────────────────────────────────────
  if (cargando) {
    return <EditorSkeleton />
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
            <ToolbarButton
              icon={Eye}
              label="Vista alumno"
              shortcut={COMMON_SHORTCUTS.VISTA_ALUMNO}
              onClick={() => exportarPara("para_alumno")}
            />
            <ToolbarButton
              icon={FileCheck}
              label="Pauta"
              shortcut={COMMON_SHORTCUTS.PAUTA}
              onClick={() => exportarPara("con_pauta")}
            />
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
            {!isAplicada && (
              <ToolbarButton
                icon={Sparkles}
                label="IA"
                shortcut={COMMON_SHORTCUTS.PANEL_IA}
                onClick={() => setPanelIA(v => !v)}
                active={panelIA}
              />
            )}
            {!isAplicada && (
              <ToolbarButton
                icon={Library}
                label="Banco"
                shortcut={COMMON_SHORTCUTS.BANCO}
                onClick={() => {
                  setBancoAbierto(v => !v)
                }}
                active={bancoAbierto}
              />
            )}
            <ToolbarButton
              icon={History}
              label="Historial"
              shortcut={COMMON_SHORTCUTS.HISTORIAL}
              onClick={() => {
                setPanelHistorial(v => !v)
              }}
              active={panelHistorial}
            />
            {!isAplicada && (
              <ToolbarButton
                icon={Heart}
                label="Adaptar PIE"
                onClick={() => setPanelPie(true)}
              />
            )}
            {!isAplicada && featureFlags["simulacion-alumnos"]?.active && (
              <ToolbarButton
                icon={Sparkles}
                label="Simular Alumnos"
                onClick={() => setShowSimulacion(true)}
              />
            )}
            {!isAplicada && featureFlags["calibrador-bloom"]?.active && (
              <ToolbarButton
                icon={Award}
                label="Calibrar Bloom"
                onClick={() => setShowBloom(true)}
              />
            )}
            {pruebaId && (
              <>
                <ToolbarButton
                  icon={Copy}
                  label="Duplicar"
                  onClick={handleDuplicar}
                />
                <ToolbarButton
                  icon={ClipboardList}
                  label="Duplicar como guía"
                  onClick={handleDuplicarComoGuia}
                />
              </>
            )}
            {pruebaId && (
              <ToolbarButton
                icon={Trash2}
                label={confirmarEliminar ? "¿Confirmar?" : "Eliminar"}
                onClick={handleEliminar}
                danger={confirmarEliminar}
                tone="danger"
              />
            )}
          </>
        }
      />

      {/* ─── Configuración general ─── */}
      <div className={cn(isAplicada && "pointer-events-none opacity-85 select-none")}>
        <Section
          title="Configuración"
          expanded={mostrarConfig}
          onToggle={() => setMostrarConfig(v => !v)}
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
              value={prueba.unidadId || ""}
              onChange={e => {
                const u = unidadesCurso.find(x => String(x.id) === e.target.value)
                updatePrueba(p => ({
                  ...p,
                  unidadId: e.target.value || undefined,
                  unidadNombre: u?.name,
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
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              Objetivos de aprendizaje
            </label>
            <textarea
              value={(prueba.metadatosCurriculares?.objetivos || []).join("\n")}
              onChange={e => updatePrueba(p => ({
                ...p,
                metadatosCurriculares: {
                  ...p.metadatosCurriculares!,
                  objetivos: e.target.value.split("\n").map(s => s.trim()).filter(Boolean),
                },
              }))}
              rows={4}
              placeholder="OA 1: ...&#10;OA 2: ..."
              className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[11.5px]"
            />
          </div>
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              Indicadores de evaluación
            </label>
            <textarea
              value={(prueba.metadatosCurriculares?.indicadores || []).join("\n")}
              onChange={e => updatePrueba(p => ({
                ...p,
                metadatosCurriculares: {
                  ...p.metadatosCurriculares!,
                  indicadores: e.target.value.split("\n").map(s => s.trim()).filter(Boolean),
                },
              }))}
              rows={4}
              placeholder="Indicador 1...&#10;Indicador 2..."
              className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[11.5px]"
            />
          </div>
        </div>
      </Section>
      </div>

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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => exportarPara("para_alumno")}
              className="flex items-center gap-1.5 rounded-[8px] border border-emerald-300 bg-white px-3 py-1.5 text-[11.5px] font-bold text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-900/40 dark:text-emerald-200"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir prueba
            </button>
          </div>
        </div>
      </div>

      </div>

      {/* Panel de IA */}
      <AIPanel
        tipoDoc="prueba"
        open={panelIA}
        onClose={() => setPanelIA(false)}
        contexto={contextoCurricular}
        documentoActual={prueba as unknown as Record<string, unknown>}
        onAplicar={(data) => {
          // Aplicar secciones generadas por IA
          if (data.secciones && Array.isArray(data.secciones)) {
            const nuevasSecciones = (data.secciones as any[]).map((sec, i) => {
              const tipoPred = normalizarTipoItem(sec.tipoPredominante)
              const seccion = nuevaSeccion(prueba.secciones.length + i + 1, tipoPred)
              seccion.titulo = sec.titulo || seccion.titulo
              seccion.instrucciones = sec.instrucciones || seccion.instrucciones
              seccion.items = (sec.items || [])
                .filter((it: any) => it && (it.enunciado || it.tipo))
                .map((it: any) => convertirItemIA(it))
              return seccion
            })
            updatePrueba(p => ({ ...p, secciones: [...p.secciones, ...nuevasSecciones] }))
          }
          if (data.seccion && typeof data.seccion === "object") {
            const sec = data.seccion as any
            const tipoPred = normalizarTipoItem(sec.tipoPredominante)
            const seccion = nuevaSeccion(prueba.secciones.length + 1, tipoPred)
            seccion.titulo = sec.titulo || seccion.titulo
            seccion.instrucciones = sec.instrucciones || seccion.instrucciones
            seccion.items = (sec.items || [])
              .filter((it: any) => it && (it.enunciado || it.tipo))
              .map((it: any) => convertirItemIA(it))
            updatePrueba(p => ({ ...p, secciones: [...p.secciones, seccion] }))
          }
          setPanelIA(false)
        }}
      />

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

      {/* Adaptación PIE/DUA */}
      <AdaptarPieModal
        open={panelPie}
        onOpenChange={setPanelPie}
        tipo="prueba"
        documento={prueba}
        estudiantesPie={estudiantesPie}
        onAdaptado={async (resultado) => {
          // Crear una copia adaptada de la prueba
          const ts = Date.now()
          const nuevaId = `prueba_pie_${ts}`
          const copiaPie: PruebaTemplate = {
            ...prueba,
            id: nuevaId,
            nombre: resultado.nombre || `${prueba.nombre} (Adecuación PIE)`,
            instruccionesGenerales: resultado.instruccionesGenerales || prueba.instruccionesGenerales,
            secciones: (resultado.secciones || []).map((sec: any, sIdx: number) => ({
              ...sec,
              id: sec.id || `sec_pie_${ts}_${sIdx}`,
              orden: sIdx + 1,
              items: (sec.items || []).map((it: any) => convertirItemIA(it)),
            })),
            estado: "borrador" as const,
            bloqueada: false,
            createdAt: undefined,
            updatedAt: undefined,
            puntajeMaximo: 0,
          }
          copiaPie.puntajeMaximo = calcularPuntajeMaximoPrueba(copiaPie.secciones)
          try {
            await guardarPruebaConSnapshot(copiaPie)
            toast({
              title: "Prueba PIE creada",
              description: resultado.notasAdecuacion || "La adecuación curricular se guardó correctamente.",
            })
            router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "pruebas", view: "editor", pruebaId: nuevaId }, asignatura)))
          } catch (e: any) {
            setMensajeGuardado({ tipo: "err", texto: e?.message || "Error al guardar la prueba adaptada" })
          }
        }}
      />

      {/* Simulador de Alumnos */}
      <SimulacionAlumnosModal
        isOpen={showSimulacion}
        onClose={() => setShowSimulacion(false)}
        documento={prueba}
        tipo="prueba"
      />

      {/* Calibrador de Rigor Cognitivo (Bloom IA) */}
      <CalibradorBloomModal
        isOpen={showBloom}
        onClose={() => setShowBloom(false)}
        documento={prueba}
      />
    </div>
  )
}

// ─── Componentes auxiliares ──────────────────────────────────────

interface ToolbarButtonProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  shortcut?: string
  disabled?: boolean
  primary?: boolean
  active?: boolean
  danger?: boolean
  tone?: "danger"
  spinning?: boolean
}

/**
 * Botón compacto del cluster derecho de la toolbar. Muestra el icono siempre
 * y la etiqueta a partir de `md:`. Usa el acento rose para `primary`/`active`
 * y el set rojo cuando `tone="danger"` (eliminar). El atajo se concatena al
 * `title` para descubrirse desde el hover.
 */
function ToolbarButton({
  icon: Icon, label, onClick, shortcut, disabled, primary, active, danger, tone, spinning,
}: ToolbarButtonProps) {
  const titleText = shortcut ? `${label} (${formatShortcut(shortcut)})` : label
  const isDanger = tone === "danger"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titleText}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        primary && "bg-[var(--accent-pruebas)] text-white hover:opacity-90 focus-visible:ring-[var(--accent-pruebas)]",
        !primary && active && "bg-[var(--accent-pruebas)] text-white focus-visible:ring-[var(--accent-pruebas)]",
        !primary && !active && !isDanger && "border border-border bg-card text-foreground hover:bg-muted/60 focus-visible:ring-[var(--accent-pruebas)]",
        isDanger && !danger && "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 focus-visible:ring-red-500",
        isDanger && danger && "border border-red-500 bg-red-500 text-white focus-visible:ring-red-500",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", spinning && "animate-spin")} />
      <span className="hidden md:inline">{label}</span>
    </button>
  )
}

function Section({
  title, children, icon: Icon, expanded, onToggle,
}: {
  title: string
  children: React.ReactNode
  icon?: any
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "mb-3 flex w-full items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide text-foreground",
          "hover:text-[var(--accent-pruebas)]",
        )}
      >
        {Icon && <Icon className="h-4 w-4 text-[var(--accent-pruebas)]" />}
        {title}
        <span className="ml-auto">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {expanded && children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

// ─── Helpers para convertir JSON de IA a ItemPrueba ─────────────────────────

function normalizarTipoItem(raw: string | undefined): TipoItem {
  if (!raw) return "seleccion_multiple"
  const map: Record<string, TipoItem> = {
    seleccion_multiple: "seleccion_multiple",
    seleccion: "seleccion_multiple",
    multiple: "seleccion_multiple",
    alternativas: "seleccion_multiple",
    verdadero_falso: "verdadero_falso",
    verdadero: "verdadero_falso",
    vf: "verdadero_falso",
    pareados: "pareados",
    pareado: "pareados",
    terminos_pareados: "pareados",
    ordenar: "ordenar",
    orden: "ordenar",
    secuencia: "ordenar",
    completar: "completar",
    rellenar: "completar",
    respuesta_corta: "respuesta_corta",
    respuesta: "respuesta_corta",
    desarrollo: "desarrollo",
    desarrollo_visual: "desarrollo",
    abierta: "desarrollo",
  }
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_")
  return map[normalized] || "desarrollo"
}

function convertirItemIA(it: any): ItemPrueba {
  const tipo = normalizarTipoItem(it.tipo)
  const puntaje = Math.max(1, Number(it.puntaje) || 1)
  const id = `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const enunciado = it.enunciado || ""
  const oaVinculado = it.oaVinculado || undefined

  switch (tipo) {
    case "seleccion_multiple": {
      const alts = Array.isArray(it.alternativas) ? it.alternativas : []
      return {
        id, tipo, enunciado, puntaje, oaVinculado,
        alternativas: alts.map((a: any, idx: number) => ({
          id: a.id || `alt_${Date.now()}_${idx}`,
          texto: a.texto || String(a) || "",
          esCorrecta: a.esCorrecta === true || a.correcta === true,
        })),
      }
    }
    case "verdadero_falso":
      return {
        id, tipo, enunciado, puntaje, oaVinculado,
        respuestaCorrecta: it.respuestaCorrecta === true || it.correcta === true,
        pideJustificacion: it.pideJustificacion || false,
      }
    case "pareados": {
      const colA = Array.isArray(it.columnaA) ? it.columnaA : []
      const colB = Array.isArray(it.columnaB) ? it.columnaB : []
      // Si tiene paresCorrectos, usarlos para mapear correctaParaAId
      const pares = Array.isArray(it.paresCorrectos) ? it.paresCorrectos : []
      return {
        id, tipo, enunciado, puntaje, oaVinculado,
        columnaA: colA.map((a: any, idx: number) => ({
          id: a.id || `a_${Date.now()}_${idx}`,
          texto: a.texto || "",
        })),
        columnaB: colB.map((b: any, idx: number) => {
          let correctaParaAId = b.correctaParaAId || ""
          if (!correctaParaAId && pares.length > 0) {
            const par = pares.find((p: any) => p.columnaB === (b.id || `B${idx + 1}`))
            if (par) correctaParaAId = par.columnaA || ""
          }
          return {
            id: b.id || `b_${Date.now()}_${idx}`,
            texto: b.texto || "",
            correctaParaAId,
          }
        }),
      }
    }
    case "ordenar": {
      // Soportar tanto "pasos" como "opciones" con "ordenCorrecto"
      let pasos: Array<{ id: string; texto: string }> = []
      if (Array.isArray(it.pasos)) {
        pasos = it.pasos.map((p: any, idx: number) => ({
          id: p.id || `p_${Date.now()}_${idx}`,
          texto: p.texto || "",
        }))
      } else if (Array.isArray(it.opciones) && Array.isArray(it.ordenCorrecto)) {
        // Reordenar según ordenCorrecto
        const opcionesMap = new Map((it.opciones as any[]).map((o: any) => [o.id, o.texto || ""]))
        pasos = (it.ordenCorrecto as string[]).map((opId: string, idx: number) => ({
          id: `p_${Date.now()}_${idx}`,
          texto: opcionesMap.get(opId) || opId,
        }))
      }
      return { id, tipo, enunciado, puntaje, oaVinculado, pasos }
    }
    case "completar": {
      // Soportar "respuestaCorrecta" (string) o "respuestas" (array)
      let textoConBlancos = it.textoConBlancos || it.enunciado || ""
      let respuestas: string[] = []
      if (Array.isArray(it.respuestas)) {
        respuestas = it.respuestas
      } else if (typeof it.respuestaCorrecta === "string") {
        respuestas = [it.respuestaCorrecta]
        // Si el enunciado tiene __, usarlo como textoConBlancos
        if (textoConBlancos.includes("__")) {
          // ya está bien
        } else {
          textoConBlancos = enunciado
        }
      }
      return {
        id, tipo, enunciado, puntaje, oaVinculado,
        textoConBlancos,
        respuestas,
        bancoPalabras: Array.isArray(it.bancoPalabras) ? it.bancoPalabras : undefined,
      }
    }
    case "respuesta_corta":
      return {
        id, tipo, enunciado, puntaje, oaVinculado,
        lineasRespuesta: it.lineasRespuesta || 3,
        respuestaEsperada: it.respuestaEsperada || it.respuestaCorrecta || undefined,
      }
    case "desarrollo": {
      const criterios = Array.isArray(it.criterios)
        ? it.criterios.map((c: any, idx: number) => ({
            id: c.id || `crit_${Date.now()}_${idx}`,
            texto: c.texto || c.descripcion || "",
            puntaje: c.puntaje || 1,
          }))
        : undefined
      return {
        id, tipo, enunciado, puntaje, oaVinculado,
        lineasRespuesta: it.lineasRespuesta || 5,
        pautaCorreccion: it.pautaCorreccion || undefined,
        criterios,
      }
    }
  }
}

