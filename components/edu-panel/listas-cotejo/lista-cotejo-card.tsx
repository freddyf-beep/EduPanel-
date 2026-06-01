"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BarChart2, CheckSquare, Copy, Edit2, Trash2 } from "lucide-react"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { eliminarListaCotejo, type ListaCotejoTemplate } from "@/lib/listas-cotejo"

interface Props {
  lista: ListaCotejoTemplate
  asignatura: string
  onEliminar: (id: string) => void
  onDuplicar?: (lista: ListaCotejoTemplate) => void
}

export function ListaCotejoCard({ lista, asignatura, onEliminar, onDuplicar }: Props) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const totalIndicadores = lista.secciones.reduce(
    (acc, seccion) => acc + seccion.indicadores.length,
    0
  )

  const irA = (view: string) =>
    router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "listas", view, listaId: lista.id }, asignatura)))

  const handleEliminar = async () => {
    if (!confirmando) {
      setConfirmando(true)
      return
    }

    setEliminando(true)
    try {
      await eliminarListaCotejo(lista.id)
      onEliminar(lista.id)
    } catch (err) {
      console.error(err)
    } finally {
      setEliminando(false)
      setConfirmando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-5">
      <div>
        <h3 className="text-[15px] font-bold leading-tight text-foreground">
          {lista.nombre || "Lista de cotejo sin nombre"}
        </h3>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{lista.curso}</p>
      </div>

      <div className="flex flex-wrap gap-3 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          {lista.secciones.length} {lista.secciones.length === 1 ? "seccion" : "secciones"}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/50" />
          {totalIndicadores} indicadores
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/30" />
          Si/No
        </span>
      </div>

      {lista.secciones.length > 0 && (
        <div className="space-y-1">
          {lista.secciones.map(seccion => (
            <div key={seccion.id} className="rounded-[8px] bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{seccion.nombre}</span>
              {seccion.oasVinculados.length > 0 && (
                <span className="ml-1 text-primary">{seccion.oasVinculados.join(", ")}</span>
              )}
              <span className="ml-1">· {seccion.indicadores.length} indicadores</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => irA("evaluacion")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-3 py-2 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          Evaluar
        </button>
        <button
          type="button"
          onClick={() => irA("resultados")}
          className="flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[12px] font-medium transition-colors hover:bg-muted/60"
        >
          <BarChart2 className="h-3.5 w-3.5" />
          Resultados
        </button>
        <button
          type="button"
          onClick={() => irA("crear")}
          className="flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[12px] font-medium transition-colors hover:bg-muted/60"
        >
          <Edit2 className="h-3.5 w-3.5" />
          Editar
        </button>
        {onDuplicar && (
          <button
            type="button"
            onClick={() => onDuplicar(lista)}
            className="flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[12px] font-medium transition-colors hover:bg-muted/60"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicar
          </button>
        )}
        <button
          type="button"
          onClick={handleEliminar}
          disabled={eliminando}
          className={`flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-medium transition-colors ${
            confirmando
              ? "bg-red-500 text-white hover:bg-red-600"
              : "border border-border hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirmando ? "Confirmar" : ""}
        </button>
      </div>
    </div>
  )
}
