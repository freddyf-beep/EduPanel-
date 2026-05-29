"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Selector visual del tipo de ítem para agregar a una sección de prueba
// o como tipo de actividad de guía
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react"
import {
  ListChecks, ToggleLeft, ArrowDownUp, Hash, PenLine,
  AlignLeft, FileText, Plus, X,
  CircleDot, Square, Palette, PenTool, Search, Grid3x3, FileQuestion,
} from "lucide-react"
import type { TipoItem } from "@/lib/pruebas"
import type { TipoActividadGuia } from "@/lib/guias"
import { cn } from "@/lib/utils"

const TIPOS_PRUEBA: Array<{ tipo: TipoItem; label: string; icon: any; descripcion: string; color: string }> = [
  { tipo: "seleccion_multiple", label: "Selección múltiple", icon: ListChecks,
    descripcion: "Pregunta con 4 alternativas, una correcta", color: "blue" },
  { tipo: "verdadero_falso", label: "Verdadero o Falso", icon: ToggleLeft,
    descripcion: "Afirmación que se marca V o F", color: "green" },
  { tipo: "pareados", label: "Términos pareados", icon: ArrowDownUp,
    descripcion: "Asociar columna A con columna B", color: "purple" },
  { tipo: "ordenar", label: "Ordenar", icon: Hash,
    descripcion: "Enumerar pasos en secuencia correcta", color: "amber" },
  { tipo: "completar", label: "Completar", icon: PenLine,
    descripcion: "Rellenar espacios en blanco", color: "pink" },
  { tipo: "respuesta_corta", label: "Respuesta corta", icon: AlignLeft,
    descripcion: "Pregunta abierta con pocas líneas", color: "cyan" },
  { tipo: "desarrollo", label: "Desarrollo", icon: FileText,
    descripcion: "Pregunta abierta extensa con criterios", color: "indigo" },
]

const TIPOS_GUIA: Array<{ tipo: TipoActividadGuia; label: string; icon: any; descripcion: string; color: string }> = [
  { tipo: "seleccion_multiple", label: "Selección múltiple", icon: ListChecks, descripcion: "Pregunta con alternativas", color: "blue" },
  { tipo: "verdadero_falso", label: "Verdadero / Falso", icon: ToggleLeft, descripcion: "Lista de afirmaciones V/F", color: "green" },
  { tipo: "completar", label: "Completar", icon: PenLine, descripcion: "Rellenar espacios", color: "pink" },
  { tipo: "respuesta_corta", label: "Respuesta corta", icon: AlignLeft, descripcion: "Pregunta abierta breve", color: "cyan" },
  { tipo: "ordenar", label: "Ordenar secuencia", icon: Hash, descripcion: "Enumerar pasos", color: "amber" },
  { tipo: "pareados", label: "Pareados", icon: ArrowDownUp, descripcion: "Unir con líneas", color: "purple" },
  { tipo: "encerrar", label: "Encerrar", icon: CircleDot, descripcion: "Encerrar opciones correctas", color: "rose" },
  { tipo: "marcar", label: "Marcar con X", icon: Square, descripcion: "Marcar opciones específicas", color: "orange" },
  { tipo: "colorear", label: "Colorear", icon: Palette, descripcion: "Colorear según instrucción", color: "yellow" },
  { tipo: "dibujar", label: "Dibujar", icon: PenTool, descripcion: "Espacio para dibujar", color: "teal" },
  { tipo: "investigar", label: "Investigar", icon: Search, descripcion: "Tarea de investigación", color: "indigo" },
  { tipo: "sopa_letras", label: "Sopa de letras", icon: Grid3x3, descripcion: "Buscar palabras", color: "lime" },
  { tipo: "abierta", label: "Abierta", icon: FileQuestion, descripcion: "Cualquier respuesta libre", color: "slate" },
]

const COLOR_CLASSES: Record<string, string> = {
  blue: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100",
  green: "bg-green-50 border-green-200 text-green-700 hover:bg-green-100",
  purple: "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100",
  amber: "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100",
  pink: "bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100",
  cyan: "bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100",
  indigo: "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100",
  rose: "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100",
  orange: "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100",
  yellow: "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100",
  teal: "bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100",
  lime: "bg-lime-50 border-lime-200 text-lime-700 hover:bg-lime-100",
  slate: "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100",
}

interface PropsPrueba {
  modo: "prueba"
  onSelect: (tipo: TipoItem) => void
}
interface PropsGuia {
  modo: "guia"
  onSelect: (tipo: TipoActividadGuia) => void
}

export function SelectorTipoItem(props: PropsPrueba | PropsGuia) {
  const [abierto, setAbierto] = useState(false)
  const tipos = props.modo === "prueba" ? TIPOS_PRUEBA : TIPOS_GUIA
  const label = props.modo === "prueba" ? "Agregar pregunta" : "Agregar actividad"

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-primary/40 bg-pink-light/40 px-3 py-3 text-[12.5px] font-bold text-primary hover:bg-pink-light hover:border-primary"
      >
        <Plus className="h-4 w-4" />
        {label}
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setAbierto(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-[16px] border border-border bg-card p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-[16px] font-extrabold">
                  {props.modo === "prueba" ? "¿Qué tipo de pregunta?" : "¿Qué tipo de actividad?"}
                </h3>
                <p className="text-[12px] text-muted-foreground">
                  Elige el formato. Podrás cambiarlo después solo eliminando y agregando otro.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tipos.map(t => {
                const Icon = t.icon
                return (
                  <button
                    key={t.tipo}
                    type="button"
                    onClick={() => {
                      if (props.modo === "prueba") props.onSelect(t.tipo as TipoItem)
                      else props.onSelect(t.tipo as TipoActividadGuia)
                      setAbierto(false)
                    }}
                    className={cn(
                      "flex items-start gap-2.5 rounded-[10px] border-2 p-3 text-left transition",
                      COLOR_CLASSES[t.color] || COLOR_CLASSES.slate,
                    )}
                  >
                    <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                    <div>
                      <div className="text-[12.5px] font-bold">{t.label}</div>
                      <div className="text-[11px] opacity-80">{t.descripcion}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
