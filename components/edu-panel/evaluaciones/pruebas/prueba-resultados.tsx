"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Vista de aplicación y resultados de una Prueba (layout unificado)
// ─────────────────────────────────────────────────────────────────────────
// Layout split (Req 8.1, 8.2, 8.3):
//   • Sticky StickyEditorToolbar arriba (back, título read-only, counter de
//     resultados, badge de estado, acciones Proyectar / Sincronizar / Guardar)
//   • Desktop ≥1024: 2 columnas (lista de alumnos 30% sticky + detalle 70%)
//   • Mobile <1024: stack — chips horizontales de alumnos + detalle abajo
//
// NO-MODIFY guard: se conserva el uso de `calcularPuntajeItem`,
// `calcularResultadoEstudiante` y `calcularNotaPrueba` desde `lib/pruebas.ts`,
// y NO se modifican `AplicacionPrueba` ni `ResultadoEstudiantePrueba`.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Save, Users, AlertCircle, CheckCircle2, Circle, X,
  RefreshCw, Monitor, AlertTriangle, TrendingUp, Loader2,
  Download,
} from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarEstudiantes, type Estudiante } from "@/lib/estudiantes"
import {
  cargarPrueba, cargarAplicacion, guardarAplicacion,
  calcularResultadoEstudiante, calcularPuntajeItem,
  sincronizarPruebaConCalificaciones,
  buildAplicacionId, calcularNotaPrueba,
  guardarPrueba,
  type PruebaTemplate, type AplicacionPrueba, type ResultadoEstudiantePrueba,
  type RespuestaAlumno, type ItemPrueba,
} from "@/lib/pruebas"
import { toast } from "@/components/ui/use-toast"
import { StickyEditorToolbar } from "../shared/sticky-editor-toolbar"
import { ProjectionMode } from "../shared/projection-mode"
import { EmptyState } from "../shared/empty-state"
import LoadingSkeleton from "../shared/loading-skeleton"
import { cn } from "@/lib/utils"

interface Props {
  pruebaId: string
  onClose?: () => void
}

export function PruebaResultados({ pruebaId, onClose }: Props) {
  const router = useRouter()
  const { asignatura } = useActiveSubject()

  const [prueba, setPrueba] = useState<PruebaTemplate | null>(null)
  const [aplicacion, setAplicacion] = useState<AplicacionPrueba | null>(null)
  const [estudiantesCurso, setEstudiantesCurso] = useState<Estudiante[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardandoAutomatico, setGuardandoAutomatico] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null)
  const [estudianteActivo, setEstudianteActivo] = useState<string | null>(null)
  const [conflictos, setConflictos] = useState<Array<{ estudianteId: string; nombre: string; anterior: string; nueva: string }>>([])
  const [proyectando, setProyectando] = useState(false)
  
  // Refs para debounce automático (1s)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const aplicacionModificadaRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    setCargando(true)

    cargarPrueba(pruebaId).then(async p => {
      if (cancelled) return
      if (!p) {
        toast({ title: "Prueba no encontrada", variant: "destructive" })
        if (onClose) onClose()
        return
      }
      setPrueba(p)

      // Cargar aplicación existente o crear vacía
      const aplExistente = await cargarAplicacion(pruebaId).catch(() => null)
      const estCurso = await cargarEstudiantes(p.curso).catch(() => [])
      if (cancelled) return

      setEstudiantesCurso(estCurso)

      if (aplExistente) {
        // Sincronizar lista con roster actual: agregar nuevos, mantener existentes
        const idsExistentes = new Set(aplExistente.resultados.map(r => r.estudianteId))
        const nuevosResultados: ResultadoEstudiantePrueba[] = [
          ...aplExistente.resultados,
          ...estCurso.filter(e => !idsExistentes.has(e.id)).map(e => crearResultadoVacio(e)),
        ]
        setAplicacion({ ...aplExistente, resultados: nuevosResultados })
      } else {
        setAplicacion({
          id: buildAplicacionId(pruebaId),
          pruebaId,
          pruebaNombre: p.nombre,
          asignatura: p.asignatura,
          curso: p.curso,
          resultados: estCurso.map(crearResultadoVacio),
        })
      }
      setCargando(false)
    })

    return () => { cancelled = true }
  }, [pruebaId])

  // ─── Cálculo de resultados con corrección automática ──────────────
  const resultadosConPuntaje = useMemo(() => {
    if (!prueba || !aplicacion) return []
    return aplicacion.resultados.map(r => calcularResultadoEstudiante(prueba, r))
  }, [prueba, aplicacion])

  // ─── Estadísticas globales ────────────────────────────────────────
  const stats = useMemo(() => {
    if (!prueba || resultadosConPuntaje.length === 0) {
      return { promedio: 0, aprobados: 0, reprobados: 0, completados: 0, sinResolver: 0, mayor: 0, menor: 0 }
    }
    const conNotas = resultadosConPuntaje.filter(r => r.completado && !r.ausente)
    const notas = conNotas.map(r => r.nota || 1)
    const aprobados = notas.filter(n => n >= 4.0).length
    const reprobados = notas.filter(n => n < 4.0).length
    const promedio = notas.length > 0 ? notas.reduce((a, b) => a + b, 0) / notas.length : 0
    return {
      promedio: Math.round(promedio * 10) / 10,
      aprobados,
      reprobados,
      completados: conNotas.length,
      sinResolver: resultadosConPuntaje.filter(r => !r.completado && !r.ausente).length,
      mayor: notas.length ? Math.max(...notas) : 0,
      menor: notas.length ? Math.min(...notas) : 0,
    }
  }, [prueba, resultadosConPuntaje])

  // ─── Operaciones ─────────────────────────────────────────────────
  const updateRespuesta = (estudianteId: string, itemId: string, respuesta: RespuestaAlumno | null) => {
    setAplicacion(a => {
      if (!a) return a
      return {
        ...a,
        resultados: a.resultados.map(r => {
          if (r.estudianteId !== estudianteId) return r
          const respuestas = { ...r.respuestas }
          if (respuesta === null) delete respuestas[itemId]
          else respuestas[itemId] = respuesta
          return { ...r, respuestas }
        }),
      }
    })
    // Marcar como modificado y resetear debounce
    aplicacionModificadaRef.current = true
    resetearDebounce()
  }

  const updateResultado = (estudianteId: string, parcial: Partial<ResultadoEstudiantePrueba>) => {
    setAplicacion(a => {
      if (!a) return a
      return {
        ...a,
        resultados: a.resultados.map(r => r.estudianteId !== estudianteId ? r : { ...r, ...parcial }),
      }
    })
    // Marcar como modificado y resetear debounce
    aplicacionModificadaRef.current = true
    resetearDebounce()
  }

  // Función para resetear el debounce (1s)
  const resetearDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    setGuardandoAutomatico(true)
    debounceTimerRef.current = setTimeout(() => {
      if (aplicacionModificadaRef.current) {
        guardarAutomatico()
      }
    }, 1000)
  }, [])

  // Guardar automático (sin mostrar toast)
  const guardarAutomatico = useCallback(async () => {
    if (!aplicacion || !prueba) return
    try {
      const conCalculo: AplicacionPrueba = {
        ...aplicacion,
        resultados: aplicacion.resultados.map(r => calcularResultadoEstudiante(prueba, r)),
      }
      await guardarAplicacion(conCalculo)
      if (prueba.estado !== "aplicada") {
        const pruebaAplicada = { ...prueba, estado: "aplicada" as const }
        await guardarPrueba(pruebaAplicada)
        setPrueba(pruebaAplicada)
      }
      setAplicacion(conCalculo)
      aplicacionModificadaRef.current = false
      setGuardandoAutomatico(false)
    } catch (e: any) {
      // En caso de error, mantener el estado de guardando para reintentar
      console.error("Error en auto-save:", e)
      setGuardandoAutomatico(false)
    }
  }, [aplicacion, prueba])

  // Limpiar debounce al desmontar
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const guardar = async () => {
    if (!aplicacion || !prueba) return
    setGuardando(true)
    try {
      // Antes de guardar, recalcular puntajes
      const conCalculo: AplicacionPrueba = {
        ...aplicacion,
        resultados: aplicacion.resultados.map(r => calcularResultadoEstudiante(prueba, r)),
      }
      await guardarAplicacion(conCalculo)
      if (prueba.estado !== "aplicada") {
        const pruebaAplicada = { ...prueba, estado: "aplicada" as const }
        await guardarPrueba(pruebaAplicada)
        setPrueba(pruebaAplicada)
      }
      setAplicacion(conCalculo)
      aplicacionModificadaRef.current = false
      setGuardandoAutomatico(false)
      // Limpiar debounce pendiente
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      toast({ title: "Resultados guardados (Prueba marcada como Aplicada)", variant: "default" })
    } catch (e: any) {
      setMensaje({ tipo: "err", texto: e?.message || "Error al guardar" })
    } finally {
      setGuardando(false)
    }
  }

  const sincronizar = async (sobrescribir = false) => {
    if (!aplicacion || !prueba) return
    setGuardando(true)
    try {
      // Guardar primero
      const conCalculo: AplicacionPrueba = {
        ...aplicacion,
        resultados: aplicacion.resultados.map(r => calcularResultadoEstudiante(prueba, r)),
      }
      await guardarAplicacion(conCalculo)
      if (prueba.estado !== "aplicada") {
        const pruebaAplicada = { ...prueba, estado: "aplicada" as const }
        await guardarPrueba(pruebaAplicada)
        setPrueba(pruebaAplicada)
      }
      setAplicacion(conCalculo)

      // Sincronizar
      const result = await sincronizarPruebaConCalificaciones(prueba, conCalculo, { sobrescribir })
      if (result.requiereConfirmacion) {
        setConflictos(result.conflictos)
        return
      }
      setConflictos([])
      setMensaje({
        tipo: "ok",
        texto: `Sincronizado: ${result.notasSincronizadas} notas a calificaciones${result.estudiantesSinNota > 0 ? `, ${result.estudiantesSinNota} sin resolver` : ""}`,
      })
      setTimeout(() => setMensaje(null), 4000)
    } catch (e: any) {
      setMensaje({ tipo: "err", texto: e?.message || "Error al sincronizar" })
    } finally {
      setGuardando(false)
    }
  }

  const handleProyectar = () => {
    setProyectando(true)
  }

  const csvCell = (value: unknown) => {
    const text = String(value ?? "")
    return `"${text.replace(/"/g, '""')}"`
  }

  const exportarResultados = () => {
    if (!prueba) return
    const rows = [
      ["Estudiante", "PIE", "Estado", "Puntaje", "Puntaje maximo", "Nota", "Observaciones"],
      ...resultadosConPuntaje.map(r => [
        r.nombre,
        r.hasPie ? "Si" : "No",
        r.ausente ? "Ausente" : r.completado ? "Completado" : "Sin resolver",
        r.puntajeTotal,
        prueba.puntajeMaximo,
        r.nota ?? "",
        r.observaciones ?? "",
      ]),
    ]
    const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n")
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${(prueba.nombre || "resultados").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-")}-resultados.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // ─── Render ──────────────────────────────────────────────────────
  if (cargando) {
    return <LoadingSkeleton.EditorSkeleton />
  }

  if (!prueba || !aplicacion) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No se pudo cargar la prueba"
        text="Intenta volver al hub y abrirla nuevamente."
      />
    )
  }

  const estado = prueba.estado || "borrador"
  const isAplicada = estado === "aplicada"
  const sinAlumnos = resultadosConPuntaje.length === 0

  const handleVolver = () => {
    if (onClose) onClose()
    else router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "pruebas" }, asignatura)))
  }

  const acciones = (
    <>
      <button
        type="button"
        onClick={exportarResultados}
        aria-label="Exportar resultados"
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Download aria-hidden="true" className="h-3.5 w-3.5" />
        Exportar resultados
      </button>
      <button
        type="button"
        onClick={handleProyectar}
        aria-label="Activar modo proyección"
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Monitor aria-hidden="true" className="h-3.5 w-3.5" />
        Proyectar
      </button>
      <button
        type="button"
        onClick={() => sincronizar(false)}
        disabled={guardando}
        aria-label="Sincronizar calificaciones"
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-emerald-600 px-3 text-[12px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
        Sincronizar calificaciones
      </button>
      <button
        type="button"
        onClick={guardar}
        disabled={guardando || guardandoAutomatico}
        aria-label="Guardar resultados"
        title={guardandoAutomatico ? "Guardando automáticamente..." : "Guardar resultados"}
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--accent-pruebas)] px-3 text-[12px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {guardando || guardandoAutomatico ? (
          <>
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            {guardandoAutomatico ? "Guardando..." : "Guardando"}
          </>
        ) : (
          <>
            <Save aria-hidden="true" className="h-3.5 w-3.5" />
            Guardar
          </>
        )}
      </button>
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      {proyectando && (
        <ProjectionMode
          prueba={prueba}
          onClose={() => setProyectando(false)}
        />
      )}
      <StickyEditorToolbar
        onBack={handleVolver}
        title={prueba.nombre}
        // Título read-only en esta vista — se preserva via no-op handler.
        onTitleChange={() => {}}
        counter={`${resultadosConPuntaje.length} resultados`}
        badge={{
          label: isAplicada ? "Aplicada" : "Borrador",
          tone: isAplicada ? "success" : "neutral",
        }}
        accent="rose"
        actionsRight={acciones}
      />

      {mensaje && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "rounded-[10px] border px-3 py-2 text-[12px] font-semibold",
            mensaje.tipo === "ok"
              ? "border-[var(--status-green-border)] bg-[var(--status-green-bg)] text-[var(--status-green-text)]"
              : "border-[var(--status-red-border)] bg-[var(--status-red-bg)] text-[var(--status-red-text)]"
          )}
        >
          {mensaje.texto}
        </div>
      )}

      {conflictos.length > 0 && (
        <ConflictosBanner
          conflictos={conflictos}
          onCancelar={() => setConflictos([])}
          onConfirmar={() => sincronizar(true)}
        />
      )}

      {/* Estadísticas */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Promedio" value={stats.promedio.toFixed(1)} icon={TrendingUp} tone="blue" />
        <StatCard label="Aprobados" value={stats.aprobados} icon={CheckCircle2} tone="green" />
        <StatCard label="Reprobados" value={stats.reprobados} icon={X} tone="red" />
        <StatCard label="Sin resolver" value={stats.sinResolver} icon={AlertCircle} tone="amber" />
      </div>

      {sinAlumnos ? (
        <EmptyState
          icon={Users}
          title="Aún no hay estudiantes para este curso"
          text="Agrega estudiantes desde Mi Curso para registrar resultados."
          accent="rose"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,30%)_minmax(0,70%)]">
          {/* Columna izquierda: lista de alumnos */}
          <aside
            aria-label="Lista de estudiantes"
            className="lg:sticky lg:top-16 lg:self-start"
          >
            {/* Mobile: chips horizontales */}
            <ChipsAlumnos
              resultados={resultadosConPuntaje}
              activo={estudianteActivo}
              setActivo={setEstudianteActivo}
            />

            {/* Desktop: lista vertical scrollable */}
            <div className="hidden rounded-[12px] border border-border bg-card lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
              <ListaAlumnos
                prueba={prueba}
                resultados={resultadosConPuntaje}
                activo={estudianteActivo}
                setActivo={setEstudianteActivo}
              />
            </div>
          </aside>

          {/* Columna derecha: detalle del estudiante */}
          <section
            aria-label="Detalle del estudiante"
            className="rounded-[12px] border border-border bg-card"
          >
            <DetalleEstudianteContenido
              prueba={prueba}
              resultados={resultadosConPuntaje}
              estudianteActivo={estudianteActivo}
              setEstudianteActivo={setEstudianteActivo}
              updateRespuesta={updateRespuesta}
              updateResultado={updateResultado}
            />
          </section>
        </div>
      )}
    </div>
  )
}

function crearResultadoVacio(estudiante: Estudiante): ResultadoEstudiantePrueba {
  return {
    estudianteId: estudiante.id,
    nombre: estudiante.nombre,
    hasPie: estudiante.pie || false,
    respuestas: {},
    puntajePorItem: {},
    puntajeTotal: 0,
    completado: false,
  }
}

// ─── Stats card ─────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, tone,
}: {
  label: string
  value: string | number
  icon: any
  tone: "blue" | "green" | "red" | "amber"
}) {
  const toneClasses: Record<typeof tone, string> = {
    blue:
      "border-[var(--status-blue-border,theme(colors.blue.200))] bg-[var(--status-blue-bg)] text-[var(--status-blue-text)]",
    green:
      "border-[var(--status-green-border)] bg-[var(--status-green-bg)] text-[var(--status-green-text)]",
    red:
      "border-[var(--status-red-border)] bg-[var(--status-red-bg)] text-[var(--status-red-text)]",
    amber:
      "border-[var(--status-amber-border)] bg-[var(--status-amber-bg)] text-[var(--status-amber-text)]",
  }
  return (
    <div className={cn("rounded-[12px] border-2 px-3 py-2.5", toneClasses[tone])}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide opacity-80">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-0.5 text-[20px] font-extrabold">{value}</div>
    </div>
  )
}

// ─── Conflictos modal-like ──────────────────────────────────────────

function ConflictosBanner({
  conflictos, onCancelar, onConfirmar,
}: {
  conflictos: Array<{ estudianteId: string; nombre: string; anterior: string; nueva: string }>
  onCancelar: () => void
  onConfirmar: () => void
}) {
  return (
    <div
      role="alert"
      className="rounded-[12px] border-2 border-[var(--status-amber-border)] bg-[var(--status-amber-bg)] p-4"
    >
      <div className="mb-3 flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--status-amber-text)]" />
        <div>
          <div className="text-[13px] font-bold text-[var(--status-amber-text)]">
            Conflicto con calificaciones existentes
          </div>
          <div className="mt-1 text-[12px] text-[var(--status-amber-text)]/90">
            Hay notas previamente registradas para esta evaluación que difieren de las calculadas. ¿Sobrescribir?
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded border border-[var(--status-amber-border)] bg-card">
        <table className="w-full text-[11.5px]">
          <thead className="bg-[var(--status-amber-bg)]/60">
            <tr>
              <th className="px-3 py-1.5 text-left">Estudiante</th>
              <th className="px-3 py-1.5">Anterior</th>
              <th className="px-3 py-1.5">Nueva</th>
            </tr>
          </thead>
          <tbody>
            {conflictos.map(c => (
              <tr key={c.estudianteId} className="border-t border-[var(--status-amber-border)]">
                <td className="px-3 py-1.5">{c.nombre}</td>
                <td className="px-3 py-1.5 text-center font-mono">{c.anterior}</td>
                <td className="px-3 py-1.5 text-center font-mono font-bold">{c.nueva}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-[10px] border border-border bg-card px-3 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          className="rounded-[10px] bg-amber-600 px-3 py-1.5 text-[11.5px] font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Sobrescribir y sincronizar
        </button>
      </div>
    </div>
  )
}

// ─── Lista de alumnos (desktop) ─────────────────────────────────────

function ListaAlumnos({
  prueba, resultados, activo, setActivo,
}: {
  prueba: PruebaTemplate
  resultados: ResultadoEstudiantePrueba[]
  activo: string | null
  setActivo: (id: string) => void
}) {
  const idActivo = activo || resultados[0]?.estudianteId || null

  return (
    <ul role="listbox" aria-label="Estudiantes" className="divide-y divide-border">
      {resultados.map((r, i) => {
        const seleccionado = r.estudianteId === idActivo
        const max = prueba.puntajeMaximo || 1
        return (
          <li key={r.estudianteId}>
            <button
              type="button"
              role="option"
              aria-selected={seleccionado}
              onClick={() => setActivo(r.estudianteId)}
              className={cn(
                "block w-full text-left transition-colors",
                "px-3 py-2 text-[12px]",
                seleccionado
                  ? "bg-[var(--accent-pruebas-soft)] text-[var(--accent-pruebas)] font-bold"
                  : "hover:bg-muted/40",
                r.ausente && "opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-pruebas)]"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                  {r.nombre}
                  {r.hasPie && (
                    <span className="ml-1.5 rounded bg-orange-100 px-1 py-0.5 text-[9px] font-bold text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                      PIE
                    </span>
                  )}
                </span>
                {r.completado && (
                  <CheckCircle2
                    aria-label="Corregido"
                    className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600"
                  />
                )}
              </div>
              {!r.ausente && (
                <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                  {r.puntajeTotal} / {max} pts
                  {r.completado && r.nota !== undefined && (
                    <>
                      {" · "}
                      <span
                        className={cn(
                          "font-bold",
                          (r.nota || 1) >= 4 ? "text-emerald-600" : "text-red-600"
                        )}
                      >
                        Nota {r.nota.toFixed(1)}
                      </span>
                    </>
                  )}
                </div>
              )}
              {r.ausente && (
                <div className="mt-0.5 text-[10.5px] text-muted-foreground italic">
                  Ausente
                </div>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Chips horizontales (mobile) ────────────────────────────────────

function ChipsAlumnos({
  resultados, activo, setActivo,
}: {
  resultados: ResultadoEstudiantePrueba[]
  activo: string | null
  setActivo: (id: string) => void
}) {
  const idActivo = activo || resultados[0]?.estudianteId || null
  return (
    <div
      role="tablist"
      aria-label="Estudiantes"
      className="flex gap-1.5 overflow-x-auto rounded-[12px] border border-border bg-card px-2 py-2 lg:hidden"
    >
      {resultados.map((r, i) => {
        const seleccionado = r.estudianteId === idActivo
        return (
          <button
            key={r.estudianteId}
            type="button"
            role="tab"
            aria-selected={seleccionado}
            onClick={() => setActivo(r.estudianteId)}
            className={cn(
              "flex-shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold whitespace-nowrap transition-colors",
              seleccionado
                ? "bg-[var(--accent-pruebas)] text-white"
                : "bg-muted text-foreground hover:bg-muted/80",
              r.ausente && !seleccionado && "opacity-60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
          >
            <span className="mr-1 opacity-70">{i + 1}.</span>
            {r.nombre.split(" ")[0]}
            {r.completado && (
              <CheckCircle2 aria-hidden="true" className="ml-1 inline-block h-3 w-3 align-text-top" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Detalle por estudiante (panel derecho) ─────────────────────────

function DetalleEstudianteContenido({
  prueba, resultados, estudianteActivo, setEstudianteActivo,
  updateRespuesta, updateResultado,
}: {
  prueba: PruebaTemplate
  resultados: ResultadoEstudiantePrueba[]
  estudianteActivo: string | null
  setEstudianteActivo: (id: string) => void
  updateRespuesta: (estId: string, itemId: string, r: RespuestaAlumno | null) => void
  updateResultado: (estId: string, p: Partial<ResultadoEstudiantePrueba>) => void
}) {
  const activo = resultados.find(r => r.estudianteId === estudianteActivo) || resultados[0]
  if (!activo) {
    return (
      <div className="p-8 text-center text-[12.5px] text-muted-foreground">
        Selecciona un estudiante para registrar su prueba.
      </div>
    )
  }

  const idxActivo = resultados.findIndex(r => r.estudianteId === activo.estudianteId)
  const anterior = resultados[idxActivo - 1]
  const siguiente = resultados[idxActivo + 1]
  const max = prueba.puntajeMaximo || 1

  return (
    <form
      className="flex flex-col gap-4 p-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
      // Auto-save real se conecta en tarea 9.3 (debounce). Por ahora se evita
      // submit nativo accidental.
      onSubmit={e => e.preventDefault()}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-extrabold text-foreground">
            {activo.nombre}
            {activo.hasPie && (
              <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10.5px] font-bold text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                PIE
              </span>
            )}
          </h3>
          {!activo.ausente && (
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              <span className="font-bold text-foreground">
                {activo.puntajeTotal} / {max} pts
              </span>
              {activo.nota !== undefined && (
                <>
                  {" · "}
                  <span
                    className={cn(
                      "font-bold",
                      (activo.nota || 1) >= 4 ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    Nota {(activo.nota || 1).toFixed(1)}
                  </span>
                </>
              )}
              {prueba.exigencia !== undefined && (
                <span className="ml-2 text-[10.5px] italic">
                  exigencia {Math.round(prueba.exigencia * 100)}%
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-[11.5px]">
            <input
              type="checkbox"
              checked={activo.ausente || false}
              onChange={e => updateResultado(activo.estudianteId, { ausente: e.target.checked })}
              className="focus-visible:ring-[var(--accent-pruebas)]"
              aria-label="Marcar estudiante como ausente"
            />
            Ausente
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px]">
            <input
              type="checkbox"
              checked={activo.completado}
              onChange={e => updateResultado(activo.estudianteId, { completado: e.target.checked })}
              className="focus-visible:ring-[var(--accent-pruebas)]"
              aria-label="Marcar prueba del estudiante como corregida"
            />
            Listo / corregido
          </label>
        </div>
      </header>

      {activo.ausente ? (
        <div className="rounded-[10px] border border-dashed border-border bg-muted/30 p-6 text-center text-[12.5px] text-muted-foreground">
          Estudiante ausente. No se calculará nota.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {prueba.secciones.map(sec => (
            <section
              key={sec.id}
              aria-label={`Sección: ${sec.titulo}`}
              className="rounded-[10px] border border-border bg-background/50"
            >
              <div className="rounded-t-[10px] bg-muted/40 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wide">
                {sec.titulo}
              </div>
              <div className="space-y-3 p-3">
                {sec.items.map((item, i) => (
                  <RespuestaInput
                    key={item.id}
                    item={item}
                    numero={i + 1}
                    respuesta={activo.respuestas[item.id]}
                    onChange={r => updateRespuesta(activo.estudianteId, item.id, r)}
                  />
                ))}
              </div>
            </section>
          ))}

          <textarea
            value={activo.observaciones || ""}
            onChange={e => updateResultado(activo.estudianteId, { observaciones: e.target.value })}
            rows={2}
            placeholder="Observaciones del estudiante (opcional)…"
            aria-label="Observaciones del estudiante"
            className="w-full resize-y rounded-[10px] border border-border bg-background px-3 py-2 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)]"
          />
        </div>
      )}

      {/* Navegación */}
      <nav
        aria-label="Navegar entre estudiantes"
        className="flex items-center justify-between gap-2"
      >
        <button
          type="button"
          onClick={() => anterior && setEstudianteActivo(anterior.estudianteId)}
          disabled={!anterior}
          aria-label={anterior ? `Anterior: ${anterior.nombre}` : "Sin estudiante anterior"}
          className="inline-flex items-center gap-1 rounded-[10px] border border-border bg-card px-3 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/60 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          ← {anterior?.nombre.split(" ")[0] || "—"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          {idxActivo + 1} / {resultados.length}
        </span>
        <button
          type="button"
          onClick={() => siguiente && setEstudianteActivo(siguiente.estudianteId)}
          disabled={!siguiente}
          aria-label={siguiente ? `Siguiente: ${siguiente.nombre}` : "Sin estudiante siguiente"}
          className="inline-flex items-center gap-1 rounded-[10px] border border-border bg-card px-3 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/60 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {siguiente?.nombre.split(" ")[0] || "—"} →
        </button>
      </nav>
    </form>
  )
}

// ─── Inputs por tipo de ítem ────────────────────────────────────────

function RespuestaInput({
  item, numero, respuesta, onChange,
}: {
  item: ItemPrueba
  numero: number
  respuesta: RespuestaAlumno | undefined
  onChange: (r: RespuestaAlumno | null) => void
}) {
  const puntos = calcularPuntajeItem(item, respuesta)
  const puntosClase = puntos === item.puntaje
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
    : puntos > 0
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
      : respuesta
        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
        : "bg-muted text-muted-foreground"

  return (
    <div className="rounded-[10px] border border-border bg-card p-3">
      <div className="mb-2 flex items-start gap-2">
        <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-[var(--accent-pruebas-soft)] text-[11px] font-bold text-[var(--accent-pruebas)]">
          {numero}
        </span>
        <div className="flex-1 text-[12.5px]">{item.enunciado}</div>
        <span
          aria-label={`Puntaje obtenido ${puntos} de ${item.puntaje}`}
          className={cn("whitespace-nowrap rounded px-2 py-0.5 text-[10.5px] font-bold", puntosClase)}
        >
          {puntos} / {item.puntaje} pts
        </span>
      </div>

      <div className="ml-8">
        {item.tipo === "seleccion_multiple" && (
          <div className="space-y-1">
            {item.alternativas.map((a, i) => {
              const seleccionada = respuesta?.tipo === "seleccion_multiple" && respuesta.alternativaId === a.id
              const isCorrecta = a.esCorrecta
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onChange({ tipo: "seleccion_multiple", alternativaId: a.id })}
                  className={cn(
                    "flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-[12px] transition-colors",
                    seleccionada
                      ? isCorrecta
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
                        : "border-red-500 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200"
                      : isCorrecta && respuesta
                        ? "border-emerald-300 bg-emerald-50/30 dark:border-emerald-700"
                        : "border-border hover:bg-muted/30",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)]"
                  )}
                >
                  {seleccionada
                    ? isCorrecta ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" /> : <X aria-hidden="true" className="h-4 w-4 text-red-600" />
                    : <Circle aria-hidden="true" className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-bold">{String.fromCharCode(97 + i)})</span>
                  <span>{a.texto}</span>
                  {isCorrecta && respuesta && !seleccionada && (
                    <span className="ml-auto text-[10px] font-bold text-emerald-600">← correcta</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {item.tipo === "verdadero_falso" && (
          <div className="flex gap-2">
            {[true, false].map(v => {
              const seleccionada = respuesta?.tipo === "verdadero_falso" && respuesta.valor === v
              const isCorrecta = item.respuestaCorrecta === v
              return (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => onChange({
                    tipo: "verdadero_falso",
                    valor: v,
                    justificacion: respuesta?.tipo === "verdadero_falso" ? respuesta.justificacion : undefined,
                  })}
                  className={cn(
                    "rounded border-2 px-4 py-1.5 text-[12.5px] font-bold transition-colors",
                    seleccionada
                      ? isCorrecta
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                        : "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                      : "border-border bg-background hover:bg-muted/30",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)]"
                  )}
                >
                  {v ? "Verdadero" : "Falso"}
                </button>
              )
            })}
            <span className="ml-2 self-center text-[10.5px] text-muted-foreground">
              Correcta: <b>{item.respuestaCorrecta ? "V" : "F"}</b>
            </span>
          </div>
        )}

        {item.tipo === "completar" && (
          <div className="space-y-1.5">
            {item.respuestas.map((esperada, i) => {
              const dada = respuesta?.tipo === "completar" ? respuesta.respuestas[i] || "" : ""
              const correcto = dada.trim().toLowerCase() === esperada.trim().toLowerCase()
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-16 text-[10.5px] text-muted-foreground">Blanco {i + 1}:</span>
                  <input
                    value={dada}
                    onChange={e => {
                      const next = respuesta?.tipo === "completar" ? [...respuesta.respuestas] : item.respuestas.map(() => "")
                      next[i] = e.target.value
                      onChange({ tipo: "completar", respuestas: next })
                    }}
                    aria-label={`Respuesta del blanco ${i + 1}`}
                    className={cn(
                      "flex-1 rounded border px-2 py-1 text-[12.5px]",
                      dada
                        ? correcto ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" : "border-red-500 bg-red-50 dark:bg-red-900/20"
                        : "border-border bg-background",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)]"
                    )}
                  />
                  <span className="text-[10px] text-muted-foreground">esperado: <b>{esperada}</b></span>
                </div>
              )
            })}
          </div>
        )}

        {(item.tipo === "respuesta_corta" || item.tipo === "desarrollo") && (
          <div className="space-y-1.5">
            <textarea
              value={respuesta?.tipo === item.tipo ? respuesta.texto : ""}
              onChange={e => {
                const v = e.target.value
                const previo = respuesta?.tipo === item.tipo ? respuesta : null
                if (item.tipo === "respuesta_corta") {
                  onChange({
                    tipo: "respuesta_corta",
                    texto: v,
                    puntajeManual: previo?.tipo === "respuesta_corta" ? previo.puntajeManual : undefined,
                  })
                } else {
                  onChange({
                    tipo: "desarrollo",
                    texto: v,
                    puntajeManual: previo?.tipo === "desarrollo" ? previo.puntajeManual : undefined,
                    puntajePorCriterio: previo?.tipo === "desarrollo" ? previo.puntajePorCriterio : undefined,
                  })
                }
              }}
              rows={item.lineasRespuesta || 3}
              placeholder="Respuesta del estudiante…"
              aria-label="Respuesta del estudiante"
              className="w-full resize-y rounded border border-border bg-background px-2 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)]"
            />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] text-muted-foreground">Puntaje manual:</span>
                <input
                  type="number"
                  min={0}
                  max={item.puntaje}
                  step={0.5}
                  value={
                    respuesta?.tipo === item.tipo && respuesta.puntajeManual !== undefined
                      ? respuesta.puntajeManual
                      : ""
                  }
                  onChange={e => {
                    const v = e.target.value === "" ? undefined : Number(e.target.value)
                    const previo = respuesta?.tipo === item.tipo ? respuesta : null
                    if (item.tipo === "respuesta_corta") {
                      onChange({
                        tipo: "respuesta_corta",
                        texto: previo?.tipo === "respuesta_corta" ? previo.texto : "",
                        puntajeManual: v,
                      })
                    } else {
                      onChange({
                        tipo: "desarrollo",
                        texto: previo?.tipo === "desarrollo" ? previo.texto : "",
                        puntajeManual: v,
                      })
                    }
                  }}
                  placeholder={`0-${item.puntaje}`}
                  aria-label="Puntaje manual del ítem"
                  className={cn(
                    "w-20 rounded border bg-background px-2 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)]",
                    respuesta?.tipo === item.tipo && respuesta.puntajeManual !== undefined && respuesta.puntajeManual > item.puntaje
                      ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                      : "border-border"
                  )}
                />
                <span className="text-[10.5px] text-muted-foreground">/ {item.puntaje}</span>
              </div>
              {respuesta?.tipo === item.tipo && respuesta.puntajeManual !== undefined && respuesta.puntajeManual > item.puntaje && (
                <div className="flex items-start gap-1.5 rounded-[8px] border border-red-500 bg-red-50 p-2 dark:bg-red-900/20">
                  <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-600 dark:text-red-400" />
                  <span className="text-[10.5px] font-semibold text-red-700 dark:text-red-300">
                    Puntaje no puede exceder {item.puntaje}
                  </span>
                </div>
              )}
            </div>
            {item.tipo === "respuesta_corta" && item.respuestaEsperada && (
              <div className="text-[10.5px] italic text-muted-foreground">
                Esperada: {item.respuestaEsperada}
              </div>
            )}
            {item.tipo === "desarrollo" && item.pautaCorreccion && (
              <div className="text-[10.5px] italic text-muted-foreground">
                Pauta: {item.pautaCorreccion}
              </div>
            )}
          </div>
        )}

        {item.tipo === "ordenar" && (
          <div className="space-y-1.5">
            <div className="text-[10.5px] text-muted-foreground">
              Marca el orden que dio el alumno (orden correcto: 1 → {item.pasos.length})
            </div>
            {item.pasos.map((p, i) => {
              const ordenAlumno = respuesta?.tipo === "ordenar" ? respuesta.orden : []
              const posicionAlumno = ordenAlumno.findIndex(id => id === p.id)
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={item.pasos.length}
                    value={posicionAlumno >= 0 ? posicionAlumno + 1 : ""}
                    onChange={e => {
                      const pos = Number(e.target.value) - 1
                      const orden = [...ordenAlumno]
                      // remover de su posición actual
                      const actualIdx = orden.indexOf(p.id)
                      if (actualIdx >= 0) orden.splice(actualIdx, 1)
                      // insertar en nueva
                      if (pos >= 0 && pos < item.pasos.length) {
                        // expandir array si hace falta
                        while (orden.length < pos) orden.push("")
                        orden.splice(pos, 0, p.id)
                      }
                      onChange({ tipo: "ordenar", orden })
                    }}
                    aria-label={`Posición del paso ${i + 1}`}
                    className="w-12 rounded border border-border bg-background px-2 py-1 text-center text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)]"
                  />
                  <span className="flex-1 text-[12px]">{p.texto}</span>
                  <span className="text-[10px] text-muted-foreground">correcto: {i + 1}</span>
                </div>
              )
            })}
          </div>
        )}

        {item.tipo === "pareados" && (
          <div className="space-y-1.5">
            {item.columnaA.map((a, i) => {
              const seleccion = respuesta?.tipo === "pareados" ? respuesta.emparejamientos[a.id] : undefined
              const correcta = item.columnaB.find(b => b.correctaParaAId === a.id)?.id
              const isCorrecta = seleccion === correcta
              return (
                <div key={a.id} className="flex items-center gap-2 text-[12px]">
                  <span className="w-6 font-bold">{i + 1}.</span>
                  <span className="flex-1">{a.texto}</span>
                  <span aria-hidden="true">→</span>
                  <select
                    value={seleccion || ""}
                    onChange={e => {
                      const previo = respuesta?.tipo === "pareados" ? respuesta.emparejamientos : {}
                      onChange({ tipo: "pareados", emparejamientos: { ...previo, [a.id]: e.target.value } })
                    }}
                    aria-label={`Emparejamiento para ${a.texto}`}
                    className={cn(
                      "rounded border px-2 py-1 text-[11.5px]",
                      seleccion
                        ? isCorrecta ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" : "border-red-500 bg-red-50 dark:bg-red-900/20"
                        : "border-border bg-background",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)]"
                    )}
                  >
                    <option value="">—</option>
                    {item.columnaB.map((b, j) => (
                      <option key={b.id} value={b.id}>{String.fromCharCode(97 + j)}) {b.texto}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Re-export del helper de cálculo de nota para mantener visible que esta vista
// depende de él (Req 8.3). No se usa directamente porque
// `calcularResultadoEstudiante` ya invoca internamente `calcularNotaPrueba`,
// pero el import explícito documenta el contrato y evita que el helper sea
// removido accidentalmente del bundle.
export const __PRUEBA_RESULTADOS_NOTA_HELPER = calcularNotaPrueba
