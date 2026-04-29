"use client"

import { useState } from "react"
import {
  ChevronDown, ChevronRight, Plus, Pencil,
  Check, X, Trash2,
} from "lucide-react"
import type { OAEditado, IndicadorEditado } from "@/lib/curriculo"

// Paleta de colores igual a /planificaciones
const OA_COLORS = [
  "#F59E0B", // amber  — OA 1
  "#3B82F6", // blue   — OA 2
  "#EF4444", // red    — OA 3
  "#22C55E", // green  — OA 4
  "#8B5CF6", // violet — OA 5
  "#F97316", // orange — OA 6
  "#06B6D4", // cyan   — OA 7
  "#D97706", // dark amber — OA 8
  "#EC4899", // pink   — OA 9
  "#10B981", // emerald — OA 10
]

function getOAColor(oa: OAEditado, index: number): string {
  if (oa.numero !== undefined) {
    return OA_COLORS[(oa.numero - 1) % OA_COLORS.length]
  }
  return OA_COLORS[index % OA_COLORS.length]
}

interface Props {
  oas: OAEditado[]
  onChange: (oas: OAEditado[]) => void
  asignatura?: string
  cargando?: boolean
}

export function RubricaOAEditor({ oas, onChange, asignatura = "Música", cargando = false }: Props) {
  const [expandedOAs, setExpandedOAs] = useState<Set<string>>(new Set())
  const [editingOA, setEditingOA]   = useState<string | null>(null)
  const [editingInd, setEditingInd] = useState<string | null>(null) // "oaId:indId"
  const [editText, setEditText]     = useState("")
  const [newIndText, setNewIndText] = useState<Record<string, string>>({})
  const [showNewOA, setShowNewOA]   = useState(false)
  const [newOAText, setNewOAText]   = useState("")
  const [newOATipo, setNewOATipo]   = useState<"oa" | "oat">("oa")
  const [newOANumero, setNewOANumero] = useState("")

  const update = (newOAs: OAEditado[]) => onChange(newOAs)

  const toggleOA = (id: string) =>
    update(oas.map(o => o.id === id ? { ...o, seleccionado: !o.seleccionado } : o))

  const toggleInd = (oaId: string, indId: string) =>
    update(oas.map(o => o.id !== oaId ? o : {
      ...o,
      indicadores: o.indicadores.map(i => i.id === indId ? { ...i, seleccionado: !i.seleccionado } : i),
    }))

  const toggleExpand = (id: string) =>
    setExpandedOAs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const startEditOA = (oa: OAEditado) => { setEditingOA(oa.id); setEditText(oa.descripcion) }
  const saveEditOA  = (id: string) => {
    update(oas.map(o => o.id === id ? { ...o, descripcion: editText } : o))
    setEditingOA(null)
  }

  const startEditInd = (oaId: string, ind: IndicadorEditado) => {
    setEditingInd(`${oaId}:${ind.id}`)
    setEditText(ind.texto)
  }
  const saveEditInd = (oaId: string, indId: string) => {
    update(oas.map(o => o.id !== oaId ? o : {
      ...o,
      indicadores: o.indicadores.map(i => i.id === indId ? { ...i, texto: editText } : i),
    }))
    setEditingInd(null)
  }

  const deleteInd = (oaId: string, indId: string) =>
    update(oas.map(o => o.id !== oaId ? o : {
      ...o,
      indicadores: o.indicadores.filter(i => i.id !== indId),
    }))

  const deleteOA = (id: string) => update(oas.filter(o => o.id !== id))

  const addInd = (oaId: string) => {
    const texto = (newIndText[oaId] ?? "").trim()
    if (!texto) return
    const nw: IndicadorEditado = {
      id: `${oaId}_IND${Date.now()}`,
      texto,
      seleccionado: true,
      esPropio: true,
    }
    update(oas.map(o => o.id !== oaId ? o : { ...o, indicadores: [...o.indicadores, nw] }))
    setNewIndText(prev => ({ ...prev, [oaId]: "" }))
  }

  const addOA = () => {
    const texto = newOAText.trim()
    if (!texto) return
    const parsedNum = parseInt(newOANumero.trim(), 10)
    const nw: OAEditado = {
      id: `PROP_${Date.now()}`,
      tipo: newOATipo,
      descripcion: texto,
      seleccionado: true,
      indicadores: [],
      esPropio: true,
      tags: [asignatura],
      ...(Number.isFinite(parsedNum) && parsedNum > 0 ? { numero: parsedNum } : {}),
    }
    update([...oas, nw])
    setExpandedOAs(prev => new Set([...prev, nw.id]))
    setNewOAText("")
    setNewOANumero("")
    setNewOATipo("oa")
    setShowNewOA(false)
  }

  if (cargando) {
    return (
      <div className="flex items-center gap-2 py-4 text-[12px] text-muted-foreground">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Cargando OA del currículum...
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {oas.length === 0 && (
        <div className="rounded-[10px] border border-dashed border-border px-4 py-5 text-center">
          <p className="text-[12px] text-muted-foreground">
            Selecciona una unidad curricular arriba para cargar los OA automáticamente.
          </p>
        </div>
      )}

      {oas.map((oa, index) => {
        const color      = getOAColor(oa, index)
        const isExpanded = expandedOAs.has(oa.id)
        const isEditOA   = editingOA === oa.id
        const indSelec   = oa.indicadores.filter(i => i.seleccionado).length
        const indTotal   = oa.indicadores.length

        return (
          <div
            key={oa.id}
            className={`overflow-hidden rounded-[10px] border transition-all ${
              oa.seleccionado
                ? "border-border bg-card"
                : "border-dashed border-border/40 bg-muted/10 opacity-55"
            }`}
          >
            {/* ── Header del OA ── */}
            <div className="flex items-start gap-2.5 px-3 py-2.5">
              {/* Botón de selección (punto de color) */}
              <button
                onClick={() => toggleOA(oa.id)}
                title={oa.seleccionado ? "Quitar de la rúbrica" : "Incluir en la rúbrica"}
                className="mt-1 flex-shrink-0"
              >
                <div
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 transition-colors"
                  style={
                    oa.seleccionado
                      ? { background: color, borderColor: color }
                      : { background: "transparent", borderColor: "#9CA3AF" }
                  }
                >
                  {oa.seleccionado && (
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </div>
              </button>

              <div className="min-w-0 flex-1">
                {/* Etiqueta OA N + asignatura */}
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-[11px] font-bold" style={{ color }}>
                    {oa.tipo === "oat"
                      ? (oa.esPropio
                        ? (oa.numero ? `OAA ${oa.numero} Propio` : "OAA Propio")
                        : `OAA ${oa.numero}`)
                      : (oa.esPropio
                        ? (oa.numero ? `OA ${oa.numero} Propio` : "OA Propio")
                        : `OA ${oa.numero}`)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{asignatura}</span>
                  {oa.tipo === "oat" && (
                    <span className="rounded px-1 py-0.5 text-[9px] font-semibold bg-violet-100 text-violet-700">
                      Transversal
                    </span>
                  )}
                  {oa.esPropio && oa.tipo !== "oat" && (
                    <span className="rounded px-1 py-0.5 text-[9px] font-semibold bg-primary/10 text-primary">
                      Propio
                    </span>
                  )}
                </div>

                {/* Descripción (editable) */}
                {isEditOA ? (
                  <div className="mt-1 flex gap-1.5">
                    <textarea
                      autoFocus
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={3}
                      className="flex-1 rounded-[8px] border border-primary/30 bg-background px-2 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => saveEditOA(oa.id)}
                        className="rounded p-1 text-green-600 hover:bg-green-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingOA(null)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] leading-snug text-foreground">{oa.descripcion}</p>
                )}

                {/* Contador de indicadores (expandible) — siempre visible para poder agregar */}
                <button
                  onClick={() => toggleExpand(oa.id)}
                  className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold transition-opacity hover:opacity-70"
                  style={{ color }}
                >
                  {isExpanded
                    ? <ChevronDown className="h-3 w-3" />
                    : <ChevronRight className="h-3 w-3" />}
                  {indTotal > 0
                    ? `${indSelec}/${indTotal} indicadores`
                    : "Agregar indicadores"}
                </button>
              </div>

              {/* Acciones: editar / eliminar */}
              <div className="flex flex-shrink-0 items-center gap-1">
                {!isEditOA && (
                  <button
                    onClick={() => startEditOA(oa)}
                    title="Editar descripción"
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                {oa.esPropio && (
                  <button
                    onClick={() => deleteOA(oa.id)}
                    title="Eliminar OA"
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-red-500"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* ── Indicadores expandidos ── */}
            {isExpanded && (
              <div className="space-y-1.5 border-t border-border bg-muted/10 px-3 py-2.5">
                {oa.indicadores.map(ind => {
                  const key     = `${oa.id}:${ind.id}`
                  const editing = editingInd === key
                  return (
                    <div key={ind.id} className="flex items-start gap-2">
                      {/* Checkbox indicador */}
                      <button onClick={() => toggleInd(oa.id, ind.id)} className="mt-0.5 flex-shrink-0">
                        <div
                          className="flex h-3.5 w-3.5 items-center justify-center rounded border-2 transition-colors"
                          style={
                            ind.seleccionado
                              ? { background: color, borderColor: color }
                              : { background: "transparent", borderColor: "#9CA3AF" }
                          }
                        >
                          {ind.seleccionado && <Check className="h-2 w-2 text-white" />}
                        </div>
                      </button>

                      {/* Label OA N */}
                      <span
                        className="mt-0.5 flex-shrink-0 text-[10px] font-bold"
                        style={{ color }}
                      >
                        {oa.tipo === "oat"
                          ? (oa.esPropio
                            ? (oa.numero ? `OAA ${oa.numero} Propio` : "OAA Propio")
                            : `OAA ${oa.numero}`)
                          : (oa.esPropio
                            ? (oa.numero ? `OA ${oa.numero} Propio` : "OA Propio")
                            : `OA ${oa.numero}`)}
                      </span>

                      {/* Texto del indicador */}
                      {editing ? (
                        <div className="flex flex-1 gap-1.5">
                          <textarea
                            autoFocus
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            rows={2}
                            className="flex-1 rounded-[6px] border border-primary/30 bg-background px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => saveEditInd(oa.id, ind.id)}
                              className="p-0.5 text-green-600"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setEditingInd(null)}
                              className="p-0.5 text-muted-foreground"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-1 items-start gap-1">
                          <p
                            className={`flex-1 text-[11px] leading-snug ${
                              ind.seleccionado
                                ? "text-foreground"
                                : "text-muted-foreground line-through"
                            }`}
                          >
                            {ind.texto}
                          </p>
                          <div className="flex flex-shrink-0 gap-0.5">
                            <button
                              onClick={() => startEditInd(oa.id, ind)}
                              className="rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
                            >
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                            {ind.esPropio && (
                              <button
                                onClick={() => deleteInd(oa.id, ind.id)}
                                className="rounded p-0.5 text-muted-foreground/50 hover:text-red-500"
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Agregar indicador propio */}
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newIndText[oa.id] ?? ""}
                    onChange={e => setNewIndText(prev => ({ ...prev, [oa.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addInd(oa.id)}
                    placeholder="Agregar indicador propio..."
                    className="flex-1 rounded-[6px] border border-dashed border-border bg-background px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  <button
                    onClick={() => addInd(oa.id)}
                    className="rounded-[6px] bg-muted/60 px-2 py-1 transition-colors hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* ── Agregar OA propio ── */}
      {showNewOA ? (
        <div className="space-y-2 rounded-[10px] border border-primary/30 p-3">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold text-muted-foreground flex-1">Nuevo objetivo propio</p>
            {/* Toggle OA / OAA */}
            <div className="flex items-center rounded-[8px] border border-border overflow-hidden text-[10px] font-bold">
              <button
                onClick={() => setNewOATipo("oa")}
                className={`px-2 py-1 transition-colors ${newOATipo === "oa" ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"}`}
              >
                OA
              </button>
              <button
                onClick={() => setNewOATipo("oat")}
                className={`px-2 py-1 transition-colors ${newOATipo === "oat" ? "bg-violet-600 text-white" : "hover:bg-muted/60 text-muted-foreground"}`}
              >
                OAA Transversal
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-muted-foreground">
              {newOATipo === "oat" ? "Numero OAA" : "Numero OA"} (opcional)
            </label>
            <input
              type="number"
              min="1"
              value={newOANumero}
              onChange={e => setNewOANumero(e.target.value)}
              placeholder={newOATipo === "oat" ? "Ej: 3" : "Ej: 5"}
              className="w-20 rounded-[8px] border border-border bg-background px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <textarea
            autoFocus
            value={newOAText}
            onChange={e => setNewOAText(e.target.value)}
            placeholder={newOATipo === "oat"
              ? "Ej: Demostrar confianza en sí mismos al presentar a otros..."
              : "Descripción del objetivo de aprendizaje..."}
            rows={2}
            className="w-full rounded-[8px] border border-border bg-background px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <div className="flex gap-2">
            <button
              onClick={addOA}
              className={`flex-1 rounded-[8px] py-1.5 text-[12px] font-medium text-white hover:opacity-90 ${newOATipo === "oat" ? "bg-violet-600" : "bg-primary"}`}
            >
              Agregar {newOATipo === "oat" ? "OAA" : "OA"}
            </button>
            <button
              onClick={() => { setShowNewOA(false); setNewOATipo("oa"); setNewOANumero("") }}
              className="flex-1 rounded-[8px] border border-border py-1.5 text-[12px] font-medium hover:bg-muted/60"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowNewOA(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar OA propio
        </button>
      )}
    </div>
  )
}
