"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BarChart2, Edit2, Trash2, Users } from "lucide-react"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { eliminarRubrica, type RubricaTemplate } from "@/lib/rubricas"

interface Props {
  rubrica: RubricaTemplate
  asignatura: string
  onEliminar: (id: string) => void
}

export function RubricaCard({ rubrica, asignatura, onEliminar }: Props) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const totalCriterios = rubrica.partes.reduce(
    (acc, p) => acc + p.criterios.length, 0
  )

  const irA = (view: string) =>
    router.push(buildUrl("/rubricas", withAsignatura({ view, rubricaId: rubrica.id }, asignatura)))

  const handleEliminar = async () => {
    if (!confirmando) { setConfirmando(true); return }
    setEliminando(true)
    try {
      await eliminarRubrica(rubrica.id)
      onEliminar(rubrica.id)
    } catch (e) {
      console.error(e)
    } finally {
      setEliminando(false)
      setConfirmando(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-[14px] p-5 flex flex-col gap-3">
      {/* Nombre */}
      <div>
        <h3 className="text-[15px] font-bold text-foreground leading-tight">
          {rubrica.nombre || "Sin nombre"}
        </h3>
        <p className="text-[12px] text-muted-foreground mt-0.5">{rubrica.curso}</p>
      </div>

      {/* Stats */}
      <div className="flex gap-3 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
          {rubrica.partes.length} {rubrica.partes.length === 1 ? "parte" : "partes"}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/50 inline-block" />
          {totalCriterios} criterios
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/30 inline-block" />
          {rubrica.puntajeMaximo} pts máx
        </span>
      </div>

      {/* Partes detalle */}
      {rubrica.partes.length > 0 && (
        <div className="space-y-1">
          {rubrica.partes.map(parte => (
            <div key={parte.id} className="text-[11px] text-muted-foreground bg-muted/30 rounded-[8px] px-2.5 py-1.5">
              <span className="font-medium text-foreground">{parte.nombre}</span>
              {parte.oasVinculados.length > 0 && (
                <span className="ml-1 text-primary">{parte.oasVinculados.join(", ")}</span>
              )}
              <span className="ml-1">· {parte.criterios.length} criterios</span>
            </div>
          ))}
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-2 pt-1 flex-wrap">
        <button
          onClick={() => irA("evaluacion")}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-medium bg-primary text-primary-foreground rounded-[10px] hover:opacity-90 transition-opacity"
        >
          <Users className="w-3.5 h-3.5" />
          Evaluar
        </button>
        <button
          onClick={() => irA("resultados")}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors"
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Resultados
        </button>
        <button
          onClick={() => irA("crear")}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Editar
        </button>
        <button
          onClick={handleEliminar}
          disabled={eliminando}
          className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-[10px] transition-colors ${
            confirmando
              ? "bg-red-500 text-white hover:bg-red-600"
              : "border border-border hover:bg-red-50 hover:text-red-600 hover:border-red-200"
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {confirmando ? "¿Confirmar?" : ""}
        </button>
      </div>
    </div>
  )
}
