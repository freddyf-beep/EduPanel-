"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Edit2, Copy, Trash2, Printer, ClipboardList, Clock, BookOpen, Lightbulb, Hash } from "lucide-react"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { eliminarGuia, duplicarGuia, type GuiaTemplate } from "@/lib/guias"
import { abrirGuiaImprimible } from "@/lib/export/guia-pdf"
import { cargarInfoColegio } from "@/lib/perfil"

interface Props {
  guia: GuiaTemplate
  asignatura: string
  onEliminar: (id: string) => void
  onDuplicar?: (g: GuiaTemplate) => void
}

export function GuiaCard({ guia, asignatura, onEliminar, onDuplicar }: Props) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const totalActividades = guia.secciones.reduce((a, s) => a + s.actividades.length, 0)

  const irAEditor = () => {
    router.push(buildUrl("/evaluaciones", withAsignatura({
      tab: "guias", view: "editor", guiaId: guia.id,
    }, asignatura)))
  }

  const exportar = async () => {
    const colegio = await cargarInfoColegio().catch(() => null)
    abrirGuiaImprimible({ guia, colegio, modo: "para_alumno" })
  }

  const handleEliminar = async () => {
    if (!confirmando) { setConfirmando(true); return }
    setEliminando(true)
    try {
      await eliminarGuia(guia.id)
      onEliminar(guia.id)
    } finally {
      setEliminando(false)
      setConfirmando(false)
    }
  }

  const handleDuplicar = async () => {
    try {
      const copia = await duplicarGuia(guia)
      onDuplicar?.(copia)
    } catch (e) { console.error(e) }
  }

  const tipoBadgeCls = guia.tipoGuia === "refuerzo"
    ? "bg-blue-100 text-blue-700"
    : guia.tipoGuia === "ejercitacion"
      ? "bg-amber-100 text-amber-700"
      : guia.tipoGuia === "evaluacion_formativa"
        ? "bg-orange-100 text-orange-700"
        : "bg-violet-100 text-violet-700"

  const tipoLabel = guia.tipoGuia === "refuerzo" ? "Refuerzo"
    : guia.tipoGuia === "ejercitacion" ? "Ejercitación"
    : guia.tipoGuia === "evaluacion_formativa" ? "Eval. formativa"
    : "Aprendizaje"

  return (
    <div className="bg-card border border-border rounded-[14px] p-5 flex flex-col gap-3 hover:border-violet-400/40 transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <ClipboardList className="h-3.5 w-3.5 text-violet-600 flex-shrink-0" />
            <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-0.5 ${tipoBadgeCls}`}>
              {tipoLabel}
            </span>
            {guia.numeroGuia && (
              <span className="text-[10px] font-bold text-muted-foreground">
                {guia.numeroGuia}
              </span>
            )}
          </div>
          <h3 className="text-[15px] font-bold text-foreground leading-tight truncate">
            {guia.nombre || "Sin nombre"}
          </h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">{guia.curso}</p>
        </div>
      </div>

      {guia.objetivo && (
        <div className="text-[11.5px] text-muted-foreground line-clamp-2 italic border-l-2 border-amber-300 pl-2">
          {guia.objetivo}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Hash className="h-3 w-3" />
          {guia.secciones.length} {guia.secciones.length === 1 ? "sección" : "secciones"}
        </span>
        <span className="flex items-center gap-1">
          <Lightbulb className="h-3 w-3" />
          {totalActividades} act.
        </span>
        {guia.puntajeMaximo ? (
          <span className="font-bold text-foreground">
            {guia.puntajeMaximo} pts
          </span>
        ) : null}
        {guia.tiempoMinutos ? (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {guia.tiempoMinutos} min
          </span>
        ) : null}
      </div>

      {guia.unidadNombre && (
        <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-[8px] px-2.5 py-1.5">
          <span className="text-violet-600 dark:text-violet-400 font-medium">{guia.unidadNombre}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1 mt-auto">
        <button
          onClick={irAEditor}
          className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-medium bg-violet-600 text-white rounded-[10px] hover:bg-violet-700 transition-colors"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Editar
        </button>
        <button
          onClick={exportar}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors"
          title="Imprimir"
        >
          <Printer className="w-3.5 h-3.5" />
        </button>
        {onDuplicar && (
          <button
            onClick={handleDuplicar}
            className="flex items-center gap-1.5 px-2.5 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors"
            title="Duplicar"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={handleEliminar}
          disabled={eliminando}
          className={`flex items-center gap-1.5 px-2.5 py-2 text-[12px] font-medium rounded-[10px] transition-colors ${
            confirmando
              ? "bg-red-500 text-white hover:bg-red-600"
              : "border border-border hover:bg-red-50 hover:text-red-600 hover:border-red-200"
          }`}
          title="Eliminar"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {confirmando ? "?" : ""}
        </button>
      </div>
    </div>
  )
}
