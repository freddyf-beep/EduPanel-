"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Editor completo de una Guía de aprendizaje (refactor task 7.1)
// ─────────────────────────────────────────────────────────────────────────
// Refactorizado para consumir la suite compartida de `shared/`:
//
//   • StickyEditorToolbar (accent="violet") con slot `numero`, badge de
//     estado, contador "{N} actividades · {M} min", indicador de cambios
//     sin guardar y cluster de acciones (Vista alumno, Pauta, Guardar, IA,
//     Banco, Historial, Duplicar, Eliminar).
//   • LoadingSkeleton.EditorSkeleton mientras se carga la guía.
//   • UnsavedChangesGuard envolviendo todo el editor con `onSaveAndExit`.
//   • useShortcuts: Ctrl+S, Ctrl+P, Ctrl+Shift+P, Ctrl+I, Ctrl+B, Ctrl+H,
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
  ArrowLeft, Save, Loader2, Eye, Printer, Copy, Trash2, Plus,
  Settings, RefreshCw, BookOpen, FileCheck, Lightbulb, Sparkles,
  History, Library, FileQuestion, Music, FileText, Heart,
} from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarInfoColegio, type InfoColegio } from "@/lib/perfil"
import { cargarPlanCurso, type UnidadPlan } from "@/lib/curriculo"
import {
  cargarGuia, eliminarGuia, duplicarGuia,
  nuevaGuia, nuevaSeccionGuia, nuevaActividadGuia, nuevoIdGuia, normalizarGuia,
  resolverMetadatosCurricularesGuia, cargarOAsParaGuia,
  type GuiaTemplate, type SeccionGuia, type ActividadGuia, type TipoActividadGuia,
} from "@/lib/guias"
import { guardarGuiaConSnapshot, guardarPruebaConSnapshot } from "@/lib/snapshots-hook"
import { abrirGuiaImprimible } from "@/lib/export/guia-pdf"
import { ActividadGuiaEditor } from "../editor/actividad-guia-editor"
import { BloquesEditor } from "../editor/bloques-editor"
import { SelectorTipoItem } from "../editor/selector-tipo-item"
import { AIPanel } from "../shared/ai-panel"
import { ItemBank } from "../shared/item-bank"
import { guardarItemAlBanco, type ItemBankEntry } from "@/lib/item-bank"
import { ItemPrueba } from "@/lib/pruebas"
import { itemPruebaAActividadGuia, guiaToPrueba } from "@/lib/cross-mapping"
import { toast } from "@/components/ui/use-toast"
import { useContextoCurricular } from "@/hooks/use-contexto-curricular"
import { cn } from "@/lib/utils"
import {
  StickyEditorToolbar,
  type StickyEditorToolbarBadge,
} from "../shared/sticky-editor-toolbar"
import LoadingSkeleton from "../shared/loading-skeleton"
import { UnsavedChangesGuard } from "../shared/unsaved-changes-guard"
import { ErrorBanner } from "../shared/error-banner"
import { EmptyState } from "../shared/empty-state"
import { SnapshotPanel } from "../shared/snapshot-panel"
import { useShortcuts, COMMON_SHORTCUTS } from "@/lib/keyboard-shortcuts"
import { cargarEstudiantes, type Estudiante } from "@/lib/estudiantes"
import { AdaptarPieModal } from "../shared/adaptar-pie-modal"
import { SimulacionAlumnosModal } from "../shared/simulacion-alumnos-modal"

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
  const [colegio, setColegio] = useState<InfoColegio | null>(null)
  const [profesorNombre] = useState("")
  const [unidadesCurso, setUnidadesCurso] = useState<UnidadPlan[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [panelIA, setPanelIA] = useState(false)
  const [panelBanco, setPanelBanco] = useState(false)
  const [panelHistorial, setPanelHistorial] = useState(false)
  const [modoMusical, setModoMusical] = useState(false)

  // ── Dirty tracking: snapshot estable del último estado guardado.
  // Lo serializamos para comparar de forma simple vs el documento actual.
  const lastSavedRef = useRef<string>("")
  const [dirty, setDirty] = useState(false)
  const [panelPie, setPanelPie] = useState(false)
  const [estudiantesPie, setEstudiantesPie] = useState<Estudiante[]>([])
  const [showSimulacion, setShowSimulacion] = useState(false)

  // Hook de vinculación curricular automática para el panel IA
  const { contexto: contextoCurricular } = useContextoCurricular({
    asignatura,
    curso: guia?.curso || "",
    unidadId: guia?.unidadId,
    unidadNombre: guia?.unidadNombre,
  })

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
    cargarInfoColegio()
      .then(c => { if (!cancel) setColegio(c) })
      .catch(() => {})

    if (guiaId) {
      cargarGuia(guiaId)
        .then(g => {
          if (cancel) return
          if (g) {
            setGuia(g)
            lastSavedRef.current = JSON.stringify(g)
            setDirty(false)
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
      lastSavedRef.current = JSON.stringify(nueva)
      setDirty(false)
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

  // Cargar estudiantes PIE del curso
  useEffect(() => {
    let cancel = false
    if (!guia?.curso) {
      Promise.resolve().then(() => {
        if (!cancel) setEstudiantesPie([])
      })
      return () => { cancel = true }
    }
    cargarEstudiantes(guia.curso)
      .then(est => { if (!cancel) setEstudiantesPie(est.filter(e => e.pie)) })
      .catch(() => { if (!cancel) setEstudiantesPie([]) })
    return () => { cancel = true }
  }, [guia?.curso])

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
        metadatosCurriculares: resol.metadatosCurriculares,
        oas,
      } : g)
      setMensaje({ tipo: "ok", texto: "Currículum sincronizado" })
      setTimeout(() => setMensaje(null), 2500)
    } catch (e: any) {
      setMensaje({ tipo: "err", texto: e?.message || "Error al sincronizar" })
    }
  }

  // ─── Guardar / Eliminar / Duplicar ─────────────────────────────
  // `guardarGuiaConSnapshot` (lib/snapshots-hook.ts, task 12.2) persiste la
  // guía y crea automáticamente un Snapshot_Version inmutable.
  const handleGuardar = useCallback(async () => {
    if (!guia) return
    if (!guia.curso) {
      setMensaje({ tipo: "err", texto: "Selecciona un curso antes de guardar" })
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
      setMensaje({ tipo: "ok", texto: "Guardado" })
      setTimeout(() => setMensaje(null), 2000)
    } catch (e: any) {
      setMensaje({ tipo: "err", texto: e?.message || "Error al guardar" })
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
      setMensaje({ tipo: "err", texto: e?.message || "Error al eliminar" })
    }
  }

  const handleDuplicar = async () => {
    if (!guia) return
    try {
      const copia = await duplicarGuia(guia)
      router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "guias", view: "editor", guiaId: copia.id }, asignatura)))
    } catch (e: any) {
      setMensaje({ tipo: "err", texto: e?.message || "Error al duplicar" })
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
      setMensaje({ tipo: "err", texto: e?.message || "Error al duplicar como prueba" })
    } finally {
      setGuardando(false)
    }
  }

  const handleSugerirPrueba = async () => {
    if (!guia) return
    try {
      setGuardando(true)
      const { nuevaPrueba } = await import("@/lib/pruebas")
      const prueba = nuevaPrueba(guia.asignatura, guia.curso)
      prueba.nombre = `Prueba sugerida: ${guia.nombre || "Guía"}`
      prueba.unidadId = guia.unidadId
      prueba.unidadNombre = guia.unidadNombre
      if (guia.metadatosCurriculares) {
        prueba.metadatosCurriculares = {
          objetivos: [...(guia.metadatosCurriculares.objetivos || [])],
          indicadores: [...(guia.metadatosCurriculares.indicadores || [])],
          objetivosTransversales: [...(guia.metadatosCurriculares.objetivosTransversales || [])],
        }
      }
      if (guia.oas) {
        prueba.oas = JSON.parse(JSON.stringify(guia.oas))
      }
      prueba.docenteNombre = guia.docenteNombre
      prueba.tiempoMinutos = guia.tiempoMinutos
      
      await guardarPruebaConSnapshot(prueba)
      toast({
        title: "Prueba sugerida creada",
        description: "Se ha creado una prueba a partir de los OAs de esta guía. Redirigiendo...",
      })
      
      router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "pruebas", view: "editor", pruebaId: prueba.id }, asignatura)))
    } catch (e: any) {
      setMensaje({ tipo: "err", texto: e?.message || "Error al sugerir prueba" })
    } finally {
      setGuardando(false)
    }
  }

  const handleVolver = useCallback(() => {
    if (onClose) onClose()
    else router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "guias" }, asignatura)))
  }, [asignatura, onClose, router])

  const exportarPara = useCallback((modo: "para_alumno" | "con_pauta") => {
    if (!guia) return
    abrirGuiaImprimible({ guia, colegio, profesorNombre, modo })
  }, [guia, colegio, profesorNombre])

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
      setMensaje({ tipo: "ok", texto: "Actividad guardada en el banco" })
      setTimeout(() => setMensaje(null), 2000)
    } catch (e: any) {
      setMensaje({ tipo: "err", texto: e?.message || "Error al guardar en el banco" })
      setTimeout(() => setMensaje(null), 3000)
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
            setMensaje({ tipo: "err", texto: "El ítem no es compatible con el editor de guías" })
            setTimeout(() => setMensaje(null), 3000)
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
        setMensaje({ tipo: "ok", texto: "Actividad insertada" })
        setTimeout(() => setMensaje(null), 1500)
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
        setMensaje({ tipo: "ok", texto: "Actividad insertada" })
        setTimeout(() => setMensaje(null), 1500)
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
        setMensaje({ tipo: "err", texto: "El ítem no es compatible con el editor de guías" })
        setTimeout(() => setMensaje(null), 3000)
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

    setMensaje({ tipo: "ok", texto: "Actividad insertada" })
    setTimeout(() => setMensaje(null), 1500)
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
    setPanelIA(false)
    setPanelBanco(false)
    setPanelHistorial(false)
    setConfirmarEliminar(false)
  }, [])

  useShortcuts(useMemo(() => ([
    { keys: COMMON_SHORTCUTS.GUARDAR, handler: () => { void handleGuardar() } },
    { keys: COMMON_SHORTCUTS.VISTA_ALUMNO, handler: () => exportarPara("para_alumno") },
    { keys: COMMON_SHORTCUTS.PAUTA, handler: () => exportarPara("con_pauta") },
    { keys: COMMON_SHORTCUTS.PANEL_IA, handler: () => setPanelIA(p => !p) },
    { keys: COMMON_SHORTCUTS.BANCO, handler: () => setPanelBanco(p => !p) },
    { keys: COMMON_SHORTCUTS.HISTORIAL, handler: () => setPanelHistorial(p => !p) },
    { keys: COMMON_SHORTCUTS.NUEVA_SECCION, handler: () => agregarSeccion() },
    { keys: COMMON_SHORTCUTS.CERRAR, handler: () => cerrarPaneles() },
  ]), [handleGuardar, exportarPara, agregarSeccion, cerrarPaneles]))

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
          actionsLeft={
            (guia.asignatura?.toLowerCase() === "música" || asignatura?.toLowerCase() === "música") ? (
              <button
                type="button"
                onClick={() => setModoMusical(v => !v)}
                title="Alternar Modo Musical"
                aria-pressed={modoMusical}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[11.5px] font-bold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
                  modoMusical
                    ? "bg-violet-600 text-white hover:bg-violet-700"
                    : "border border-border bg-card text-foreground hover:bg-muted/60"
                )}
              >
                <Music className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Modo Musical</span>
              </button>
            ) : null
          }
          actionsRight={
            <>
              {mensaje && (
                <span className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10.5px] font-bold",
                  mensaje.tipo === "ok"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                )}>
                  {mensaje.texto}
                </span>
              )}

              <button
                type="button"
                onClick={() => exportarPara("para_alumno")}
                title="Vista alumno (Ctrl+P)"
                aria-label="Vista alumno"
                className={cn(
                  "inline-flex items-center gap-1 rounded-[10px] border border-border bg-card px-2.5 py-1.5",
                  "text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  "focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Vista alumno</span>
              </button>

              <button
                type="button"
                onClick={() => exportarPara("con_pauta")}
                title="Pauta (Ctrl+Shift+P)"
                aria-label="Pauta"
                className={cn(
                  "inline-flex items-center gap-1 rounded-[10px] border border-border bg-card px-2.5 py-1.5",
                  "text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  "focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
                )}
              >
                <FileCheck className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Pauta</span>
              </button>

              <button
                type="button"
                onClick={handleGuardar}
                disabled={guardando}
                title="Guardar (Ctrl+S)"
                aria-label="Guardar"
                className={cn(
                  "inline-flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-[11.5px] font-bold text-white transition-opacity",
                  "bg-[var(--accent-guias)] hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  "focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar
              </button>

              <button
                type="button"
                onClick={() => setPanelIA(p => !p)}
                title="Panel IA (Ctrl+I)"
                aria-label="Panel IA"
                aria-pressed={panelIA}
                className={cn(
                  "inline-flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  "focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
                  panelIA
                    ? "bg-[var(--accent-guias)] text-white hover:opacity-90"
                    : "border border-[var(--accent-guias)]/40 bg-[var(--accent-guias-soft)] text-[var(--accent-guias)] hover:opacity-90",
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden md:inline">IA</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSimulacion(true)}
                title="Simular Alumnos"
                aria-label="Simular Alumnos"
                className={cn(
                  "inline-flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-[11.5px] font-bold transition-colors border border-border bg-card text-foreground hover:bg-muted/60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  "focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                <span className="hidden md:inline">Simular Alumnos</span>
              </button>

              <button
                type="button"
                onClick={() => setPanelBanco(p => !p)}
                title="Banco de ítems (Ctrl+B)"
                aria-label="Banco"
                aria-pressed={panelBanco}
                className={cn(
                  "inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
                  panelBanco
                    ? "bg-[var(--accent-guias)] text-white hover:opacity-90"
                    : "border border-border bg-card text-foreground hover:bg-muted/60"
                )}
              >
                <Library className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Banco</span>
              </button>

              <button
                type="button"
                onClick={() => setPanelHistorial(p => !p)}
                title="Historial (Ctrl+H)"
                aria-label="Historial"
                aria-pressed={panelHistorial}
                className={cn(
                  "inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
                  panelHistorial
                    ? "bg-[var(--accent-guias)] text-white hover:opacity-90"
                    : "border border-border bg-card text-foreground hover:bg-muted/60"
                )}
              >
                <History className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Historial</span>
              </button>

              {guiaId && (
                <>
                  <button
                    type="button"
                    onClick={handleDuplicar}
                    title="Duplicar"
                    aria-label="Duplicar"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-[10px] border border-border bg-card px-2.5 py-1.5",
                      "text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/60",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                      "focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
                    )}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Duplicar</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDuplicarComoPrueba}
                    title="Duplicar como prueba"
                    aria-label="Duplicar como prueba"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-[10px] border border-border bg-card px-2.5 py-1.5",
                      "text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/60",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                      "focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
                    )}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Duplicar como prueba</span>
                  </button>
                  {guia && guia.tipoGuia === "evaluacion_formativa" && (
                    <button
                      type="button"
                      onClick={handleSugerirPrueba}
                      title="Sugerir prueba"
                      aria-label="Sugerir prueba"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-[10px] border border-border bg-card px-2.5 py-1.5",
                        "text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/60",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                        "focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">Sugerir prueba</span>
                    </button>
                  )}
                </>
              )}

              {/* Botón Adaptar PIE */}
              <button
                type="button"
                onClick={() => setPanelPie(true)}
                title="Adaptar para PIE"
                aria-label="Adaptar para PIE"
                className={cn(
                  "inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5",
                  "text-[11.5px] font-semibold transition-colors",
                  "bg-gradient-to-r from-teal-500/10 to-emerald-500/10 border border-teal-500/20 text-teal-600",
                  "hover:from-teal-500/20 hover:to-emerald-500/20",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  "focus-visible:ring-offset-background focus-visible:ring-teal-500",
                )}
              >
                <Heart className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Adaptar PIE</span>
              </button>

              {guiaId && (
                <button
                  type="button"
                  onClick={handleEliminar}
                  title="Eliminar"
                  aria-label={confirmarEliminar ? "Confirmar eliminar" : "Eliminar"}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-[10px] border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                    "focus-visible:ring-offset-background focus-visible:ring-red-500",
                    confirmarEliminar
                      ? "border-red-500 bg-red-500 text-white hover:bg-red-600"
                      : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-900/40",
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {confirmarEliminar && <span>¿Confirmar?</span>}
                </button>
              )}
            </>
          }
        />

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
                  setGuia({ ...guia, unidadId: e.target.value || undefined, unidadNombre: u?.name })
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

          <div className="mt-4">
            <Field label="OAs vinculados (uno por línea)">
              <textarea
                value={(guia.metadatosCurriculares?.objetivos || []).join("\n")}
                onChange={e => setGuia({
                  ...guia,
                  metadatosCurriculares: {
                    ...(guia.metadatosCurriculares || { objetivos: [], indicadores: [], objetivosTransversales: [] }),
                    objetivos: e.target.value.split("\n").map(s => s.trim()).filter(Boolean),
                  },
                })}
                rows={3}
                placeholder="OA 1: ..."
                className={cn(textareaBaseClass, "text-[11.5px]")}
              />
            </Field>
          </div>
        </Section>

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
            <button
              type="button"
              onClick={() => exportarPara("para_alumno")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                "border border-[var(--accent-guias)]/40 bg-card text-[var(--accent-guias)] hover:bg-[var(--accent-guias-soft)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                "focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
              )}
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir guía
            </button>
          </div>
        </div>

      </div>

        {/* Panel de IA */}
        <AIPanel
          tipoDoc="guia"
          open={panelIA}
          onClose={() => setPanelIA(false)}
          contexto={contextoCurricular}
          documentoActual={guia as unknown as Record<string, unknown>}
          onAplicar={(data) => {
            if (data.seccionesGuia && Array.isArray(data.seccionesGuia)) {
              const nuevasSecciones = (data.seccionesGuia as any[]).map((sec, i) => {
                const base = nuevaSeccionGuia(guia.secciones.length + i + 1)
                return {
                  ...base,
                  titulo: sec.titulo || base.titulo,
                  descripcion: sec.descripcion || "",
                  contenido: sec.contenidoHtml
                    ? [{ id: `bl_${base.id}_${i}`, tipo: "texto" as const, data: { html: sec.contenidoHtml, estilo: "normal" as const } }]
                    : [],
                  actividades: (sec.actividades || []).filter((act: any) => act && act.enunciado).map((act: any) => {
                    const baseAct = nuevaActividadGuia(act.tipo || "abierta")
                    return {
                      ...baseAct,
                      enunciado: act.enunciado || "",
                      puntaje: act.puntaje,
                      oaVinculado: act.oaVinculado,
                      datos: act.datos || baseAct.datos,
                    }
                  }),
                }
              })
              setGuia(g => g ? { ...g, secciones: [...g.secciones, ...nuevasSecciones] } : g)
            }
            if (data.seccionGuia && typeof data.seccionGuia === "object") {
              const sec = data.seccionGuia as any
              const base = nuevaSeccionGuia(guia.secciones.length + 1)
              const nueva = {
                ...base,
                titulo: sec.titulo || base.titulo,
                descripcion: sec.descripcion || "",
                contenido: sec.contenidoHtml
                  ? [{ id: `bl_${base.id}`, tipo: "texto" as const, data: { html: sec.contenidoHtml, estilo: "normal" as const } }]
                  : [],
                actividades: (sec.actividades || []).filter((act: any) => act && act.enunciado).map((act: any) => {
                  const baseAct = nuevaActividadGuia(act.tipo || "abierta")
                  return {
                    ...baseAct,
                    enunciado: act.enunciado || "",
                    puntaje: act.puntaje,
                    oaVinculado: act.oaVinculado,
                    datos: act.datos || baseAct.datos,
                  }
                }),
              }
              setGuia(g => g ? { ...g, secciones: [...g.secciones, nueva] } : g)
            }
            setPanelIA(false)
          }}
        />

        {/* Banco de ítems */}
        <ItemBank
          open={panelBanco}
          onClose={() => setPanelBanco(false)}
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
              setMensaje({ tipo: "ok", texto: "Versión restaurada en el editor" })
              setTimeout(() => setMensaje(null), 2500)
            }
          }}
        />

        {/* Adaptación PIE/DUA */}
        <AdaptarPieModal
          open={panelPie}
          onOpenChange={setPanelPie}
          tipo="guia"
          documento={guia}
          estudiantesPie={estudiantesPie}
          onAdaptado={async (resultado) => {
            const nuevaId = nuevoIdGuia("guia_pie")
            const copiaGuia: GuiaTemplate = {
              ...guia,
              id: nuevaId,
              nombre: resultado.nombre || `${guia.nombre} (Adecuación PIE)`,
              instrucciones: resultado.instruccionesGenerales || guia.instrucciones || [],
              secciones: (resultado.secciones || []).map((sec: any, sIdx: number) => ({
                ...sec,
                id: sec.id || nuevoIdGuia(`sec_pie_${sIdx + 1}`),
                orden: sIdx + 1,
                actividades: (sec.items || sec.actividades || []).map((act: any) => ({
                  ...act,
                  id: nuevoIdGuia("act_pie"),
                })),
              })),
              estado: "borrador" as const,
              createdAt: undefined,
              updatedAt: undefined,
            }
            try {
              await guardarGuiaConSnapshot(copiaGuia)
              toast({
                title: "Guía PIE creada",
                description: resultado.notasAdecuacion || "La adecuación curricular se guardó correctamente.",
              })
              router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "guias", view: "editor", guiaId: nuevaId }, asignatura)))
            } catch (e: any) {
              setMensaje({ tipo: "err", texto: e?.message || "Error al guardar la guía adaptada" })
            }
          }}
        />

        {/* Simulador de Alumnos */}
        <SimulacionAlumnosModal
          isOpen={showSimulacion}
          onClose={() => setShowSimulacion(false)}
          documento={guia}
          tipo="guia"
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

// ─── Sub-componentes locales ──────────────────────────────────────────────

function Section({
  title,
  children,
  icon: Icon,
}: {
  title: string
  children: React.ReactNode
  icon?: any
}) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide text-foreground">
        {Icon && <Icon className="h-4 w-4 text-[var(--accent-guias)]" />}
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

/**
 * Placeholder visual hasta que la tarea 8.6 monte el `ItemBank` real.
 * Mantiene la UX consistente al abrir/cerrar con Ctrl+B aunque el drawer
 * todavía no exponga ítems guardados.
 */
function BancoPlaceholder({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-[12px] border-2 border-dashed border-[var(--accent-guias)]/40 bg-[var(--accent-guias-soft)]/30 p-4 text-center">
      <Library className="mx-auto h-6 w-6 text-[var(--accent-guias)]/70" aria-hidden="true" />
      <p className="mt-2 text-[12.5px] font-semibold text-foreground">
        Banco de ítems
      </p>
      <p className="mt-1 text-[11.5px] text-muted-foreground">
        Próximamente — podrás reutilizar actividades guardadas desde aquí.
      </p>
      <button
        type="button"
        onClick={onClose}
        className={cn(
          "mt-3 inline-flex items-center justify-center rounded-[8px] border border-border bg-card px-3 py-1.5 text-[11.5px] font-medium text-foreground transition-colors hover:bg-muted/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
        )}
      >
        Cerrar
      </button>
    </div>
  )
}
