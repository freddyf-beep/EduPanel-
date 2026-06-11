"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Edit2, Copy, Trash2, Printer, FileText, Clock, Users, Hash, Eye, FileCheck } from "lucide-react"
import { buildUrl, withAsignatura } from "@/lib/shared"
import {
  eliminarPrueba, duplicarPrueba, type PruebaTemplate,
} from "@/lib/pruebas"
import { abrirPruebaImprimible } from "@/lib/export/prueba-pdf"
import { cargarInfoColegio } from "@/lib/perfil"

interface Props {
  prueba: PruebaTemplate
  asignatura: string
  onEliminar: (id: string) => void
  onDuplicar?: (p: PruebaTemplate) => void
}

export function PruebaCard({ prueba, asignatura, onEliminar, onDuplicar }: Props) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const totalItems = prueba.secciones.reduce((a, s) => a + s.items.length, 0)

  const irAEditor = () => {
    router.push(buildUrl("/evaluaciones", withAsignatura({
      tab: "pruebas", view: "editor", pruebaId: prueba.id,
    }, asignatura)))
  }

  const irAResultados = () => {
    router.push(buildUrl("/evaluaciones", withAsignatura({
      tab: "pruebas", view: "resultados", pruebaId: prueba.id,
    }, asignatura)))
  }

  const exportar = async (modo: "para_alumno" | "con_pauta") => {
    const colegio = await cargarInfoColegio().catch(() => null)
    abrirPruebaImprimible({ prueba, colegio, modo })
  }

  const handleEliminar = async () => {
    if (!confirmando) { setConfirmando(true); return }
    setEliminando(true)
    try {
      await eliminarPrueba(prueba.id)
      onEliminar(prueba.id)
    } finally {
      setEliminando(false)
      setConfirmando(false)
    }
  }

  const handleDuplicar = async () => {
    try {
      const copia = await duplicarPrueba(prueba)
      onDuplicar?.(copia)
    } catch (e) {
      console.error(e)
    }
  }

  const tipoBadgeCls = prueba.tipoEvaluacion === "formativa"
    ? "bg-blue-100 text-blue-700"
    : prueba.tipoEvaluacion === "diagnostica"
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700"

  return (
    <div className="bg-card border border-border rounded-[14px] p-5 flex flex-col gap-3 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <FileText className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-0.5 ${tipoBadgeCls}`}>
              {prueba.tipoEvaluacion || "sumativa"}
            </span>
          </div>
          <h3 className="text-[15px] font-bold text-foreground leading-tight truncate">
            {prueba.nombre || "Sin nombre"}
          </h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">{prueba.curso}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Hash className="h-3 w-3" />
          {prueba.secciones.length} {prueba.secciones.length === 1 ? "sección" : "secciones"}
        </span>
        <span className="flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {totalItems} {totalItems === 1 ? "ítem" : "ítems"}
        </span>
        <span className="flex items-center gap-1 font-bold text-foreground">
          {prueba.puntajeMaximo} pts
        </span>
        {prueba.tiempoMinutos ? (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {prueba.tiempoMinutos} min
          </span>
        ) : null}
        {prueba.ponderacion ? (
          <span className="rounded-full bg-amber-100 px-2 text-amber-700 font-semibold">
            {prueba.ponderacion}%
          </span>
        ) : null}
      </div>

      {prueba.unidadNombre && (
        <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-[8px] px-2.5 py-1.5">
          <span className="text-primary font-medium">{prueba.unidadNombre}</span>
        </div>
      )}

      {(prueba.metadatosCurriculares?.objetivos?.length || 0) > 0 && (
        <div className="text-[11px] text-muted-foreground space-y-1">
          {(prueba.metadatosCurriculares?.objetivos || []).slice(0, 2).map((oa, i) => (
            <div key={i} className="line-clamp-1">{oa}</div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1 mt-auto">
        <button
          onClick={irAEditor}
          className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-medium bg-primary text-primary-foreground rounded-[10px] hover:opacity-90 transition-opacity"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Editar
        </button>
        <button
          onClick={irAResultados}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors"
          title="Aplicar y ver resultados"
        >
          <Users className="w-3.5 h-3.5" />
          Aplicar
        </button>
        <button
          onClick={() => exportar("para_alumno")}
          className="flex items-center gap-1.5 px-2.5 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors"
          title="Imprimir"
        >
          <Printer className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => exportar("con_pauta")}
          className="flex items-center gap-1.5 px-2.5 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors"
          title="Imprimir con pauta"
        >
          <FileCheck className="w-3.5 h-3.5" />
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
