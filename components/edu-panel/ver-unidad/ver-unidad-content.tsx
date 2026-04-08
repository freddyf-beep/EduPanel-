"use client"

import { useState, useEffect, Suspense, useRef } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ChevronLeft, Download, MessageCircle, Bookmark,
  Plus, Pencil, Calendar, Clock, Target, Layers,
  Heart, FileText, X, Sparkles, Loader2, Check,
  Eye, Trash2, AlertCircle, BookOpen, ArrowRight
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getUnidadCompleta, guardarVerUnidad, cargarVerUnidad, guardarPlanificacion, cargarPlanificacion, buildMatrixCellKey, buildOfficialOAId, buildOfficialElementoId, emptyMatrizSeleccion,
  initOAs, initElems, mergeOAs, mergeElementos, applyPlanSelection
} from "@/lib/curriculo"
import type {
  Unidad, OAEditado, IndicadorEditado,
  ElementoCurricular, ActividadDocente
} from "@/lib/curriculo"
import { ASIGNATURA, UNIT_COLORS, buildUrl } from "@/lib/shared"
import { cargarNivelMapping, resolveNivel } from "@/lib/nivel-mapping"
import { CronogramaUnidadContent } from "@/components/edu-panel/cronograma-unidad/cronograma-unidad-content"
import { ActividadesEmbedded } from "@/components/edu-panel/actividades/actividades-content"

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Modal OA + Indicadores (estilo Lirmi) ────────────────────────────────────
function ModalOA({ oas, cursoParam, onClose, onChange }: {
  oas: OAEditado[]
  cursoParam: string
  onClose: () => void
  onChange: (v: OAEditado[]) => void
}) {
  const [sel, setSel]           = useState<OAEditado | null>(oas[0] || null)
  const [editOA, setEditOA]     = useState<string | null>(null)
  const [editInd, setEditInd]   = useState<string | null>(null)
  const [textoEdit, setTextoEdit] = useState("")
  const [nuevoInd, setNuevoInd] = useState("")
  const [nuevoOA, setNuevoOA]   = useState("")
  const [showNewOA, setShowNewOA] = useState(false)
  const [showNewInd, setShowNewInd] = useState(false)

  const upd = (newOas: OAEditado[]) => {
    onChange(newOas)
    if (sel) setSel(newOas.find(o => o.id === sel.id) || null)
  }

  const toggleOA  = (id: string) => upd(oas.map(o => o.id === id ? { ...o, seleccionado: !o.seleccionado } : o))
  const toggleInd = (oaId: string, indId: string) =>
    upd(oas.map(o => o.id === oaId ? { ...o, indicadores: o.indicadores.map(i => i.id === indId ? { ...i, seleccionado: !i.seleccionado } : i) } : o))

  const saveEditOA  = (id: string) => { upd(oas.map(o => o.id === id ? { ...o, descripcion: textoEdit } : o)); setEditOA(null) }
  const saveEditInd = (oaId: string, indId: string) => {
    upd(oas.map(o => o.id === oaId ? { ...o, indicadores: o.indicadores.map(i => i.id === indId ? { ...i, texto: textoEdit } : i) } : o))
    setEditInd(null)
  }

  const addInd = (oaId: string) => {
    if (!nuevoInd.trim()) return
    const nw: IndicadorEditado = { id: `${oaId}_IND${Date.now()}`, texto: nuevoInd.trim(), seleccionado: true, esPropio: true }
    upd(oas.map(o => o.id === oaId ? { ...o, indicadores: [...o.indicadores, nw] } : o))
    setNuevoInd(""); setShowNewInd(false)
  }

  const addOA = () => {
    if (!nuevoOA.trim()) return
    const nw: OAEditado = { id: `PROP_${Date.now()}`, descripcion: nuevoOA.trim(), seleccionado: true, indicadores: [], esPropio: true, tags: [cursoParam] }
    upd([...oas, nw]); setSel(nw); setNuevoOA(""); setShowNewOA(false)
  }

  const delOA  = (id: string) => { const n = oas.filter(o => o.id !== id); upd(n); setSel(n[0] || null) }
  const delInd = (oaId: string, indId: string) =>
    upd(oas.map(o => o.id === oaId ? { ...o, indicadores: o.indicadores.filter(i => i.id !== indId) } : o))

  return (
    <div className="fixed inset-0 z-[600] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-[18px] shadow-2xl w-full max-w-[780px] h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-7 py-5 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-[17px] font-extrabold">{cursoParam}: Objetivos de Aprendizaje & Indicadores</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">Selecciona, edita o crea OA e indicadores propios.</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-background grid place-items-center text-muted-foreground hover:bg-border transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Columna OA */}
          <div className="w-[54%] border-r border-border flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
              <span className="text-[13px] font-bold">{oas.length} Objetivos de Aprendizaje</span>
              <div className="flex gap-2">
                <button onClick={() => setShowNewOA(!showNewOA)} className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground"><Plus className="w-3.5 h-3.5" /> Crear</button>
                <button className="text-[12px] font-bold text-primary border border-primary rounded-full px-3 py-1 hover:bg-pink-light transition-colors">Agregar</button>
              </div>
            </div>
            {showNewOA && (
              <div className="px-5 py-3 border-b border-border bg-background flex-shrink-0">
                <textarea value={nuevoOA} onChange={e => setNuevoOA(e.target.value)} placeholder="Nuevo objetivo…" rows={2} autoFocus
                  className="w-full border-[1.5px] border-primary rounded-[8px] px-3 py-2 text-[12px] outline-none resize-none mb-2" />
                <div className="flex gap-2">
                  <button onClick={addOA} className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-[#d6335e]">Crear OA</button>
                  <button onClick={() => setShowNewOA(false)} className="text-[11px] text-muted-foreground px-3 py-1.5">Cancelar</button>
                </div>
              </div>
            )}
            <div className="overflow-y-auto flex-1">
              {oas.map((oa, i) => (
                <div key={oa.id} onClick={() => setSel(oa)}
                  className={cn("border-b border-border px-5 py-4 cursor-pointer transition-colors", sel?.id === oa.id ? "bg-pink-light/40" : "hover:bg-background")}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={oa.seleccionado} onChange={() => toggleOA(oa.id)} onClick={e => e.stopPropagation()}
                      className="mt-1 h-4 w-4 accent-primary flex-shrink-0 cursor-pointer" />
                    <div className="flex-1 min-w-0">
                      {editOA === oa.id ? (
                        <div onClick={e => e.stopPropagation()}>
                          <textarea value={textoEdit} onChange={e => setTextoEdit(e.target.value)} rows={3} autoFocus
                            className="w-full border-[1.5px] border-primary rounded-[8px] px-3 py-2 text-[12px] outline-none resize-none mb-2" />
                          <div className="flex gap-2">
                            <button onClick={() => saveEditOA(oa.id)} className="bg-primary text-white text-[11px] font-bold px-3 py-1 rounded-lg">Guardar</button>
                            <button onClick={() => setEditOA(null)} className="text-[11px] text-muted-foreground px-3 py-1">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: UNIT_COLORS[i % UNIT_COLORS.length] }} />
                            <span className="text-[12px] font-bold text-primary">{oa.esPropio ? "N AE" : `OA ${oa.numero}`}</span>
                            {oa.esPropio && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Propio</span>}
                          </div>
                          <p className={cn("text-[12px] leading-snug", !oa.seleccionado && "line-through text-muted-foreground")}>{oa.descripcion}</p>
                          {oa.tags && <div className="flex flex-wrap gap-1 mt-1.5">{oa.tags.filter(Boolean).map((t, ti) => (<span key={ti} className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5">{t}</span>))}</div>}
                        </>
                      )}
                    </div>
                    {editOA !== oa.id && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={e => { e.stopPropagation(); setEditOA(oa.id); setTextoEdit(oa.descripcion) }} className="p-1 rounded hover:bg-border text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                        {oa.esPropio && <button onClick={e => { e.stopPropagation(); delOA(oa.id) }} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Columna indicadores */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {sel ? (
              <>
                <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold">{sel.indicadores.filter(i => i.seleccionado).length} Indicadores</span>
                    <div className="w-2 h-2 rounded-full" style={{ background: UNIT_COLORS[(oas.indexOf(sel)) % UNIT_COLORS.length] }} />
                    <span className="text-[12px] text-primary font-semibold">{sel.esPropio ? "N AE" : `OA ${sel.numero}`}</span>
                  </div>
                  <button onClick={() => setShowNewInd(!showNewInd)} className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground"><Plus className="w-3.5 h-3.5" /> Crear</button>
                </div>
                {showNewInd && (
                  <div className="px-5 py-3 border-b border-border bg-background flex-shrink-0">
                    <textarea value={nuevoInd} onChange={e => setNuevoInd(e.target.value)} placeholder="Nuevo indicador…" rows={2} autoFocus
                      className="w-full border-[1.5px] border-primary rounded-[8px] px-3 py-2 text-[12px] outline-none resize-none mb-2" />
                    <div className="flex gap-2">
                      <button onClick={() => addInd(sel.id)} className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">Agregar</button>
                      <button onClick={() => setShowNewInd(false)} className="text-[11px] text-muted-foreground px-3 py-1.5">Cancelar</button>
                    </div>
                  </div>
                )}
                <div className="overflow-y-auto flex-1">
                  {sel.indicadores.length === 0
                    ? <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground"><AlertCircle className="w-7 h-7" /><p className="text-[13px]">Sin indicadores. Crea uno arriba.</p></div>
                    : sel.indicadores.map(ind => (
                      <div key={ind.id} className="border-b border-border px-5 py-4">
                        <div className="flex items-start gap-3">
                          <input type="checkbox" checked={ind.seleccionado} onChange={() => toggleInd(sel.id, ind.id)} className="mt-1 h-4 w-4 accent-primary flex-shrink-0 cursor-pointer" />
                          <div className="flex-1 min-w-0">
                            {editInd === ind.id
                              ? <div>
                                  <textarea value={textoEdit} onChange={e => setTextoEdit(e.target.value)} rows={2} autoFocus
                                    className="w-full border-[1.5px] border-primary rounded-[8px] px-3 py-2 text-[12px] outline-none resize-none mb-2" />
                                  <div className="flex gap-2">
                                    <button onClick={() => saveEditInd(sel.id, ind.id)} className="bg-primary text-white text-[11px] font-bold px-3 py-1 rounded-lg">Guardar</button>
                                    <button onClick={() => setEditInd(null)} className="text-[11px] text-muted-foreground px-3 py-1">Cancelar</button>
                                  </div>
                                </div>
                              : <p className={cn("text-[12px] leading-snug", !ind.seleccionado && "line-through text-muted-foreground")}>
                                  {ind.texto}{ind.esPropio && <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Propio</span>}
                                </p>}
                          </div>
                          {editInd !== ind.id && (
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => { setEditInd(ind.id); setTextoEdit(ind.texto) }} className="p-1 rounded hover:bg-border text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                              {ind.esPropio && <button onClick={() => delInd(sel.id, ind.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </>
            ) : <div className="flex-1 flex items-center justify-center text-muted-foreground text-[13px]">Selecciona un OA</div>}
          </div>
        </div>

        <div className="flex items-center justify-between px-7 py-4 border-t border-border flex-shrink-0">
          <span className="text-[12px] text-muted-foreground">{oas.filter(o => o.seleccionado).length}/{oas.length} OA seleccionados</span>
          <button onClick={onClose} className="bg-green-500 text-white font-bold text-[13px] px-6 py-2.5 rounded-[10px] hover:bg-green-600 transition-colors">Listo</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal genérico elementos ─────────────────────────────────────────────────
function ModalElementos({ titulo, tipo, elementos, cursoParam, onClose, onChange }: {
  titulo: string; tipo: string; elementos: ElementoCurricular[]
  cursoParam: string; onClose: () => void; onChange: (v: ElementoCurricular[]) => void
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [textoEdit, setTextoEdit] = useState("")
  const [nuevoTexto, setNuevoTexto] = useState("")
  const [showNuevo, setShowNuevo] = useState(false)

  const toggle = (id: string) => onChange(elementos.map(e => e.id === id ? { ...e, seleccionado: !e.seleccionado } : e))
  const saveEdit = (id: string) => { onChange(elementos.map(e => e.id === id ? { ...e, texto: textoEdit } : e)); setEditando(null) }
  const add = () => {
    if (!nuevoTexto.trim()) return
    onChange([...elementos, { id: `${tipo}_PROP_${Date.now()}`, texto: nuevoTexto.trim(), seleccionado: true, esPropio: true }])
    setNuevoTexto(""); setShowNuevo(false)
  }
  const del = (id: string) => onChange(elementos.filter(e => e.id !== id))

  return (
    <div className="fixed inset-0 z-[600] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-[18px] shadow-2xl w-full max-w-[500px] h-[65vh] flex flex-col">
        <div className="flex items-center justify-between px-7 py-5 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-[17px] font-extrabold">{cursoParam}: {titulo}</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">Selecciona, edita o crea elementos propios.</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-background grid place-items-center text-muted-foreground hover:bg-border"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <span className="text-[13px] font-bold">{elementos.filter(e => e.seleccionado).length}/{elementos.length} seleccionados</span>
          <div className="flex gap-2">
            <button onClick={() => setShowNuevo(!showNuevo)} className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground"><Plus className="w-3.5 h-3.5" /> Crear</button>
            <button className="text-[12px] font-bold text-primary border border-primary rounded-full px-3 py-1 hover:bg-pink-light">Agregar</button>
          </div>
        </div>
        {showNuevo && (
          <div className="px-5 py-3 border-b border-border bg-background flex-shrink-0">
            <textarea value={nuevoTexto} onChange={e => setNuevoTexto(e.target.value)} placeholder={`Nuevo elemento de ${titulo.toLowerCase()}…`} rows={2} autoFocus
              className="w-full border-[1.5px] border-primary rounded-[8px] px-3 py-2 text-[12px] outline-none resize-none mb-2" />
            <div className="flex gap-2">
              <button onClick={add} className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">Crear</button>
              <button onClick={() => setShowNuevo(false)} className="text-[11px] text-muted-foreground px-3 py-1.5">Cancelar</button>
            </div>
          </div>
        )}
        <div className="overflow-y-auto flex-1">
          {elementos.map(el => (
            <div key={el.id} className="border-b border-border px-5 py-4">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={el.seleccionado} onChange={() => toggle(el.id)} className="mt-1 h-4 w-4 accent-primary flex-shrink-0 cursor-pointer" />
                <div className="flex-1 min-w-0">
                  {editando === el.id
                    ? <div>
                        <textarea value={textoEdit} onChange={e => setTextoEdit(e.target.value)} rows={2} autoFocus
                          className="w-full border-[1.5px] border-primary rounded-[8px] px-3 py-2 text-[12px] outline-none resize-none mb-2" />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(el.id)} className="bg-primary text-white text-[11px] font-bold px-3 py-1 rounded-lg">Guardar</button>
                          <button onClick={() => setEditando(null)} className="text-[11px] text-muted-foreground px-3 py-1">Cancelar</button>
                        </div>
                      </div>
                    : <p className={cn("text-[12px] leading-snug", !el.seleccionado && "line-through text-muted-foreground")}>
                        {el.texto}{el.esPropio && <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Propio</span>}
                      </p>}
                </div>
                {editando !== el.id && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => { setEditando(el.id); setTextoEdit(el.texto) }} className="p-1 rounded hover:bg-border text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                    {el.esPropio && <button onClick={() => del(el.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end px-7 py-4 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="bg-green-500 text-white font-bold text-[13px] px-6 py-2.5 rounded-[10px] hover:bg-green-600">Listo</button>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
function VerUnidadInner() {
  const searchParams = useSearchParams()
  const unidadParam  = searchParams.get("unidad") || "unidad_1"
  const unidadLocalParam = searchParams.get("unitIdLocal") || unidadParam
  const cursoParam   = searchParams.get("curso")  || "1° A"
  const unitIndex    = parseInt(unidadLocalParam.replace(/\D/g, "")) - 1 || 0

  const [unidad, setUnidad]             = useState<Unidad | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [saveStatus, setSaveStatus]     = useState<"idle"|"saving_silent"|"saved"|"error">("idle")
  const [descripcion, setDescripcion]   = useState("")
  const [contextoDocente, setContextoDocente] = useState("")
  const [objetivoDocente, setObjetivoDocente] = useState("")
  const [editDesc, setEditDesc]         = useState(false)
  const [horas, setHoras]               = useState(16)
  const [clases, setClases]             = useState(8)
  const [oas, setOas]                   = useState<OAEditado[]>([])
  const [habilidades, setHabilidades]   = useState<ElementoCurricular[]>([])
  const [conocimientos, setConocimientos] = useState<ElementoCurricular[]>([])
  const [actitudes, setActitudes]       = useState<ElementoCurricular[]>([])
  const [actividades, setActividades]   = useState<ActividadDocente[]>([])
  const [modalOA, setModalOA]           = useState(false)
  const [modalHab, setModalHab]         = useState(false)
  const [modalCon, setModalCon]         = useState(false)
  const [modalAct, setModalAct]         = useState(false)
  const [showModal, setShowModal]       = useState(false)
  const [showNuevaAct, setShowNuevaAct] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeTab, setActiveTab]       = useState<"unidad"|"cronograma"|"actividades">("unidad")
  const [showPdf, setShowPdf]           = useState(false)
  const [pdfPos, setPdfPos]             = useState({ right: 32, bottom: 32 })
  const [isDraggingPdf, setIsDraggingPdf] = useState(false)
  const pdfDragRef = useRef<{ startX: number, startY: number, startRight: number, startBottom: number } | null>(null)
  
  const handlePdfPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pdfDragRef.current = { startX: e.clientX, startY: e.clientY, startRight: pdfPos.right, startBottom: pdfPos.bottom }
    setIsDraggingPdf(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePdfPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingPdf && pdfDragRef.current) {
      setPdfPos({
        right: pdfDragRef.current.startRight - (e.clientX - pdfDragRef.current.startX),
        bottom: pdfDragRef.current.startBottom - (e.clientY - pdfDragRef.current.startY)
      })
    }
  }

  const handlePdfPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingPdf(false)
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }

  const [nivelAsignado, setNivelAsignado] = useState<string>("")
  const [nuevaAct, setNuevaAct]         = useState({
    nombre: "", tipo: "Clase" as "Clase"|"Actividad"|"Evaluacion", fecha: "", duracion: "45 min"
  })

  useEffect(() => {
    async function cargar() {
      setLoading(true)
      try {
        const mapping = await cargarNivelMapping()
        const nivel = resolveNivel(cursoParam, mapping)
        if (nivel) setNivelAsignado(nivel)
        if (!nivel) {
          setError(`No hay bases curriculares configuradas para "${cursoParam}". Ve a Planificaciones y selecciona el nivel en "Bases curriculares de".`)
          return
        }
        const [u, guardada, planificacion] = await Promise.all([
          getUnidadCompleta(ASIGNATURA, nivel, unidadParam),
          cargarVerUnidad(ASIGNATURA, cursoParam, unidadLocalParam),
          cargarPlanificacion(ASIGNATURA, cursoParam),
        ])
        if (!u) { setError("Unidad no encontrada en las bases curriculares de " + nivel); return }
        setUnidad(u)

        const baseOas = mergeOAs(initOAs(u), guardada?.oas || [])
        const baseHabilidades = mergeElementos(initElems(u.habilidades || [], "habilidades"), guardada?.habilidades || [])
        const baseConocimientos = mergeElementos(initElems(u.conocimientos || [], "conocimientos"), guardada?.conocimientos || [])
        const baseActitudes = mergeElementos(initElems(u.actitudes || [], "actitudes"), guardada?.actitudes || [])

        setDescripcion(guardada?.descripcion || u.proposito || "")
        setContextoDocente(guardada?.contextoDocente || "")
        setObjetivoDocente(guardada?.objetivoDocente || "")
        setHoras(guardada?.horas || 16)
        setClases(guardada?.clases || 8)
        setOas(applyPlanSelection(baseOas, planificacion?.matriz.oa, unitIndex))
        setHabilidades(applyPlanSelection(baseHabilidades, planificacion?.matriz.habilidades, unitIndex))
        setConocimientos(applyPlanSelection(baseConocimientos, planificacion?.matriz.conocimientos, unitIndex))
        setActitudes(applyPlanSelection(baseActitudes, planificacion?.matriz.actitudes, unitIndex))
        setActividades(guardada?.actividades || [])
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
        ignoreNextSaveRef.current = true;
      }
    }
    cargar()
  }, [cursoParam, unidadParam, unitIndex])

  const ignoreNextSaveRef = useRef(true);
  useEffect(() => {
    if (loading) return;
    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false;
      return;
    }
    setSaveStatus("saving_silent");
    const timer = setTimeout(() => {
      handleGuardar(true);
    }, 2500)
    return () => clearTimeout(timer);
  }, [descripcion, contextoDocente, objetivoDocente, horas, clases, oas, habilidades, conocimientos, actitudes, actividades])

  const handleGuardar = async (isAutoSave = false) => {
    if (!isAutoSave) setSaving(true)
    try {
      await guardarVerUnidad(ASIGNATURA, cursoParam, unidadLocalParam, {
        descripcion,
        contextoDocente,
        objetivoDocente,
        horas,
        clases,
        oas,
        habilidades,
        conocimientos,
        actitudes,
        actividades,
      })

      const planificacion = await cargarPlanificacion(ASIGNATURA, cursoParam)
      const matriz = planificacion?.matriz || emptyMatrizSeleccion()

      oas.forEach((oa) => { matriz.oa[buildMatrixCellKey(oa.id, unitIndex)] = !!oa.seleccionado })
      habilidades.forEach((item) => { matriz.habilidades[buildMatrixCellKey(item.id, unitIndex)] = !!item.seleccionado })
      conocimientos.forEach((item) => { matriz.conocimientos[buildMatrixCellKey(item.id, unitIndex)] = !!item.seleccionado })
      actitudes.forEach((item) => { matriz.actitudes[buildMatrixCellKey(item.id, unitIndex)] = !!item.seleccionado })

      await guardarPlanificacion(ASIGNATURA, cursoParam, planificacion?.fechas || {}, matriz)

      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } finally {
      if (!isAutoSave) setSaving(false)
    }
  }

  const agregarActividad = () => {
    if (!nuevaAct.nombre.trim()) return
    setActividades(prev => [...prev, { id: `act_${Date.now()}`, ...nuevaAct, estado: "pendiente" }])
    setNuevaAct({ nombre: "", tipo: "Clase", fecha: "", duracion: "45 min" })
    setShowNuevaAct(false); setShowModal(false)
  }

  const toggleEstadoAct = (id: string) =>
    setActividades(prev => prev.map(a => a.id === id ? { ...a, estado: a.estado === "completada" ? "pendiente" : "completada" } : a))

  const eliminarActividad = (id: string) =>
    setActividades(prev => prev.filter(a => a.id !== id))

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-[14px] font-medium">Cargando unidad de {cursoParam}…</span>
    </div>
  )

  if (error || !unidad) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
      <AlertCircle className="w-8 h-8 text-amber-500" />
      <p className="text-[14px] text-muted-foreground max-w-md leading-relaxed">{error || "Unidad no encontrada"}</p>
      <Link href={buildUrl("/planificaciones", { curso: cursoParam })}
        className="flex items-center gap-2 text-[13px] font-semibold text-primary hover:underline">
        <ArrowRight className="w-4 h-4" /> Ir a Planificaciones para configurar el nivel
      </Link>
    </div>
  )

  const unitColor         = UNIT_COLORS[unitIndex % UNIT_COLORS.length]
  const oasSeleccionados  = oas.filter(o => o.seleccionado)
  const habsSeleccionadas = habilidades.filter(h => h.seleccionado)
  const consSel           = conocimientos.filter(c => c.seleccionado)
  const actsSel           = actitudes.filter(a => a.seleccionado)

  return (
    <div className="max-w-[1320px] mx-auto">
      {/* Header — diseño original */}
      <div className="flex items-center justify-between mb-7 flex-wrap gap-3.5">
        <div className="flex items-center gap-3">
          <Link href={buildUrl("/planificaciones", { curso: cursoParam })}
            className="w-8 h-8 border-[1.5px] border-border rounded-lg bg-card grid place-items-center text-muted-foreground hover:bg-background transition-colors print:hidden">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="w-3 h-3 rounded-full flex-shrink-0 print:hidden" style={{ background: unitColor }} />
          <h1 className="text-[22px] font-extrabold">{unidad.nombre_unidad} — {cursoParam}</h1>
        </div>
        <div className="flex gap-2.5 flex-wrap items-center print:hidden">
          <button onClick={() => setShowPdf(true)} className="flex items-center gap-[7px] border-[1.5px] border-primary text-primary rounded-[10px] px-4 py-2.5 text-[13px] font-bold bg-pink-light/30 hover:bg-pink-light/60 transition-colors">
            <FileText className="w-[15px] h-[15px]" /> Programa Oficial
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-[7px] border-[1.5px] border-border rounded-[10px] px-4 py-2.5 text-[13px] font-semibold bg-card hover:bg-background transition-colors">
            <Download className="w-[15px] h-[15px] text-muted-foreground" /> Descargar
          </button>
          <button className="flex items-center gap-[7px] border-[1.5px] border-border rounded-[10px] px-4 py-2.5 text-[13px] font-semibold bg-card hover:bg-background transition-colors">
            <MessageCircle className="w-[15px] h-[15px] text-muted-foreground" /> Retroalimentación
          </button>
          {saveStatus === "saving_silent" && (
            <span className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground animate-pulse">
              Guardando...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-[12px] font-semibold text-green-600">
              <Check className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
          <button onClick={() => handleGuardar(false)} disabled={saving || saveStatus === "saving_silent"}
            className="flex items-center gap-[7px] bg-primary text-primary-foreground border-none rounded-[10px] px-[18px] py-2.5 text-[13px] font-bold hover:bg-[#d6335e] transition-colors disabled:opacity-60">
            {saving ? <><Loader2 className="w-[15px] h-[15px] animate-spin" /> Guardando…</> : <><Bookmark className="w-[15px] h-[15px]" /> Guardar</>}
          </button>
        </div>
      </div>

      {/* Tabs estilo Lirmi */}
      <div className="flex border-b-2 border-border mb-7 gap-0 print:hidden">
        {([
          { key: "unidad",      label: "Unidad" },
          { key: "cronograma",  label: "Cronograma" },
          { key: "actividades", label: "Actividades" },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-5 py-2.5 text-[13px] font-semibold border-b-2 -mb-[2px] transition-colors bg-none cursor-pointer",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Cronograma */}
      {activeTab === "cronograma" && (
        <CronogramaUnidadContent
          oas={oas}
          totalClases={clases}
          curso={cursoParam}
          unidadId={unidadLocalParam}
          unidadCurricularId={unidadParam}
        />
      )}

      {/* Tab: Actividades — embebido */}
      {activeTab === "actividades" && (
        <Suspense fallback={
          <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[14px]">Cargando actividades…</span>
          </div>
        }>
          <ActividadesEmbedded
            cursoOverride={cursoParam}
            unidadOverride={unidadLocalParam}
            unidadCurricularOverride={unidadParam}
            compact={true}
            oasOverride={oas}
          />
        </Suspense>
      )}

      {/* Tab: Unidad (contenido original) */}
      {activeTab === "unidad" && <>

      {/* Info Cards — diseño original */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        <div className="bg-card border border-border rounded-[14px] p-4 animate-fade-up" style={{ animationDelay:"0.04s" }}>
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg bg-pink-light grid place-items-center"><Target className="w-4 h-4 text-primary" /></div>
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">OA</span>
          </div>
          <div className="text-sm font-semibold">{oasSeleccionados.length} objetivos</div>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-4 animate-fade-up" style={{ animationDelay:"0.08s" }}>
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 grid place-items-center"><Layers className="w-4 h-4 text-blue-600" /></div>
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Habilidades</span>
          </div>
          <div className="text-sm font-semibold">{habsSeleccionadas.length} habilidades</div>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-4 animate-fade-up" style={{ animationDelay:"0.12s" }}>
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-50 grid place-items-center"><Heart className="w-4 h-4 text-green-600" /></div>
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Actitudes</span>
          </div>
          <div className="text-sm font-semibold">{actsSel.length} actitudes</div>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-4 animate-fade-up" style={{ animationDelay:"0.16s" }}>
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 grid place-items-center">
              <div className="flex items-center gap-1">
                <button onClick={() => setHoras(h => Math.max(1,h-1))} className="text-amber-600 font-bold text-[10px] hover:opacity-70">–</button>
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <button onClick={() => setHoras(h => h+1)} className="text-amber-600 font-bold text-[10px] hover:opacity-70">+</button>
              </div>
            </div>
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Horas</span>
          </div>
          <div className="text-sm font-semibold">{horas} horas · {clases} clases</div>
        </div>
      </div>

      {/* Propósito — diseño original */}
      <div className="bg-card border border-border rounded-[14px] p-5 mb-7 animate-fade-up" style={{ animationDelay:"0.2s" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">Propósito de la unidad</h3>
          <button onClick={() => setEditDesc(!editDesc)} className="text-xs text-primary font-semibold flex items-center gap-1.5 hover:opacity-70">
            <Pencil className="w-3.5 h-3.5" /> {editDesc ? "Cerrar" : "Editar"}
          </button>
        </div>
        {editDesc
          ? <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={4}
              className="w-full border-[1.5px] border-border rounded-[10px] px-3.5 py-2.5 text-[13px] leading-relaxed outline-none focus:border-primary resize-none" />
          : <p className="text-[13px] leading-relaxed text-muted-foreground">{descripcion || "Sin propósito definido."}</p>
        }
      </div>

      <div className="grid grid-cols-1 gap-4 mb-7 lg:grid-cols-2">
        <div className="bg-card border border-border rounded-[14px] p-5 animate-fade-up" style={{ animationDelay:"0.22s" }}>
          <div className="mb-3">
            <h3 className="text-sm font-bold">Contexto del profesor para esta unidad</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Describe el foco real de este curso o grupo para orientar a la IA mas alla del curriculum formal.
            </p>
          </div>
          <textarea
            value={contextoDocente}
            onChange={e => setContextoDocente(e.target.value)}
            rows={5}
            placeholder="Ej: En este curso estoy reforzando teoria, lectura musical y reconocimiento auditivo antes de abrir mas la parte creativa."
            className="w-full border-[1.5px] border-border rounded-[10px] px-3.5 py-2.5 text-[13px] leading-relaxed outline-none focus:border-primary resize-none"
          />
        </div>

        <div className="bg-card border border-border rounded-[14px] p-5 animate-fade-up" style={{ animationDelay:"0.24s" }}>
          <div className="mb-3">
            <h3 className="text-sm font-bold">Objetivo del profesor para esta unidad</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Define la meta pedagogica propia que quieres empujar en este curso para que la IA la priorice al planificar.
            </p>
          </div>
          <textarea
            value={objetivoDocente}
            onChange={e => setObjetivoDocente(e.target.value)}
            rows={5}
            placeholder="Ej: Lograr que el curso domine conceptos basicos de teoria y pueda aplicarlos con seguridad en actividades breves y guiadas."
            className="w-full border-[1.5px] border-border rounded-[10px] px-3.5 py-2.5 text-[13px] leading-relaxed outline-none focus:border-primary resize-none"
          />
        </div>
      </div>

      {/* Dos columnas — diseño original */}
      <div className="grid grid-cols-[1fr_380px] gap-6">

        {/* Izquierda: Currículo con botones "Ver detalles" */}
        <div>
          {/* OA */}
          <div className="bg-card border border-border rounded-[14px] p-5 mb-5 animate-fade-up" style={{ animationDelay:"0.24s" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Target className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold">Objetivos de Aprendizaje</h3>
                <span className="text-[11px] text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">{oasSeleccionados.length}</span>
              </div>
              <button onClick={() => setModalOA(true)} className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:opacity-70 border border-primary rounded-full px-3 py-1">
                <Eye className="w-3.5 h-3.5" /> Ver detalles
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              {oasSeleccionados.slice(0,3).map((oa, i) => (
                <div key={oa.id} className="flex items-start gap-2.5 bg-background rounded-lg p-3">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: UNIT_COLORS[i % UNIT_COLORS.length] }} />
                  <div>
                    <span className="font-bold text-[13px]">{oa.esPropio ? "Propio" : `OA ${oa.numero}`}:</span>
                    <span className="text-[13px] ml-1 leading-snug">{oa.descripcion.length > 80 ? oa.descripcion.substring(0,80)+"…" : oa.descripcion}</span>
                  </div>
                </div>
              ))}
              {oasSeleccionados.length > 3 && (
                <button onClick={() => setModalOA(true)} className="text-[12px] text-primary font-semibold text-left pl-2 hover:opacity-70">
                  + {oasSeleccionados.length - 3} más…
                </button>
              )}
              {oasSeleccionados.length === 0 && <p className="text-[13px] text-muted-foreground text-center py-2">Sin OA seleccionados.</p>}
            </div>
          </div>

          {/* Habilidades */}
          <div className="bg-card border border-border rounded-[14px] p-5 mb-5 animate-fade-up" style={{ animationDelay:"0.28s" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Layers className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold">Habilidades</h3>
                <span className="text-[11px] text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">{habsSeleccionadas.length}</span>
              </div>
              <button onClick={() => setModalHab(true)} className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:opacity-70 border border-primary rounded-full px-3 py-1">
                <Eye className="w-3.5 h-3.5" /> Ver detalles
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {habsSeleccionadas.map((hab, i) => (
                <span key={hab.id} className="px-3 py-1.5 rounded-full text-xs font-semibold text-white" style={{ background: UNIT_COLORS[i % UNIT_COLORS.length] }}>
                  {hab.texto.length > 40 ? hab.texto.substring(0,40)+"…" : hab.texto}
                </span>
              ))}
              {habsSeleccionadas.length === 0 && <p className="text-[13px] text-muted-foreground">Sin habilidades seleccionadas.</p>}
            </div>
          </div>

          {/* Conocimientos */}
          <div className="bg-card border border-border rounded-[14px] p-5 mb-5 animate-fade-up" style={{ animationDelay:"0.30s" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold">Conocimientos</h3>
                <span className="text-[11px] text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">{consSel.length}</span>
              </div>
              <button onClick={() => setModalCon(true)} className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:opacity-70 border border-primary rounded-full px-3 py-1">
                <Eye className="w-3.5 h-3.5" /> Ver detalles
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {consSel.slice(0,4).map((con, i) => (
                <div key={con.id} className="flex items-start gap-2 text-[13px]">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-amber-400" />{con.texto}
                </div>
              ))}
              {consSel.length === 0 && <p className="text-[13px] text-muted-foreground">Sin conocimientos seleccionados.</p>}
            </div>
          </div>

          {/* Actitudes */}
          <div className="bg-card border border-border rounded-[14px] p-5 animate-fade-up" style={{ animationDelay:"0.32s" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Heart className="w-5 h-5 text-red-500" />
                <h3 className="text-sm font-bold">Actitudes</h3>
                <span className="text-[11px] text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">{actsSel.length}</span>
              </div>
              <button onClick={() => setModalAct(true)} className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:opacity-70 border border-primary rounded-full px-3 py-1">
                <Eye className="w-3.5 h-3.5" /> Ver detalles
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-col gap-2">
                {actsSel.length === 0
                  ? <p className="text-[13px] text-muted-foreground">Sin actitudes seleccionadas.</p>
                  : actsSel.map((act, i) => (
                      <div key={act.id} className="flex items-start gap-2 text-[13px]">
                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-red-400" />
                        {act.texto}
                      </div>
                    ))
                }
              </div>
            </div>
          </div>
        </div>

        {/* Derecha: Cronograma / Clases */}
        <div className="bg-card border border-border rounded-[14px] p-5 h-fit animate-fade-up" style={{ animationDelay:"0.24s" }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold">Clases planificadas</h3>
          </div>

          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="w-8 h-8 mx-auto mb-3" />
            <p className="text-[13px] mb-4">Las clases de esta unidad se gestionan en el cronograma.</p>
            <button onClick={() => setActiveTab("cronograma")}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary text-primary-foreground rounded-full text-[13px] font-bold hover:bg-[#d6335e] transition-colors">
              Ir a Cronograma de Unidad
            </button>
          </div>
        </div>
      </div>

      </> /* fin tab unidad */}

      {/* Ventana Flotante Programa PDF (Estilo Sticky) */}
      {showPdf && (
        <div 
          className={cn("fixed z-[600] bg-card border-[2px] border-border rounded-[18px] flex flex-col transition-shadow", isDraggingPdf ? "shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] opacity-95" : "shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] opacity-100")}
          style={{ right: `${pdfPos.right}px`, bottom: `${pdfPos.bottom}px`, width: "520px", height: "70vh", resize: "both", overflow: "hidden" }}
        >
          <div 
            className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur cursor-move touch-none"
            onPointerDown={handlePdfPointerDown}
            onPointerMove={handlePdfPointerMove}
            onPointerUp={handlePdfPointerUp}
            onPointerCancel={handlePdfPointerUp}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-pink-light flex items-center justify-center pointer-events-none">
                <FileText className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="pointer-events-none">
                <h3 className="text-[13px] font-extrabold text-foreground leading-none">Programa Oficial</h3>
                <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">{ASIGNATURA} — {nivelAsignado || cursoParam}</p>
              </div>
            </div>
            <div className="flex gap-1.5" onPointerDown={e => e.stopPropagation()}>
              <button onClick={() => window.open(`https://www.curriculumnacional.cl/sites/default/files/adjuntos/recursos/2024-12/${encodeURIComponent(`${ASIGNATURA} ${cursoParam.charAt(0)}.pdf`)}`, "_blank")} 
                className="w-8 h-8 rounded-full bg-background border border-border grid place-items-center text-muted-foreground hover:bg-muted transition-colors cursor-pointer" title="Abrir en pestaña nueva">
                <Download className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setShowPdf(false)} 
                className="w-8 h-8 rounded-full bg-background border border-border grid place-items-center text-muted-foreground hover:bg-muted transition-colors cursor-pointer" title="Cerrar ventana">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 bg-muted relative">
            {isDraggingPdf && <div className="absolute inset-0 z-10" />}
            <iframe 
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(`https://www.curriculumnacional.cl/sites/default/files/adjuntos/recursos/2024-12/${ASIGNATURA} ${cursoParam.charAt(0)}.pdf`)}&embedded=true`}
              className="absolute inset-0 w-full h-full border-none bg-white" 
              title="Programa de Estudio"
            />
          </div>
        </div>
      )}

      {/* Modales de currículo */}
      {modalOA  && <ModalOA oas={oas} cursoParam={cursoParam} onClose={() => setModalOA(false)} onChange={setOas} />}
      {modalHab && <ModalElementos titulo="Habilidades" tipo="hab" elementos={habilidades} cursoParam={cursoParam} onClose={() => setModalHab(false)} onChange={setHabilidades} />}
      {modalCon && <ModalElementos titulo="Conocimientos" tipo="con" elementos={conocimientos} cursoParam={cursoParam} onClose={() => setModalCon(false)} onChange={setConocimientos} />}
      {modalAct && <ModalElementos titulo="Actitudes" tipo="act" elementos={actitudes} cursoParam={cursoParam} onClose={() => setModalAct(false)} onChange={setActitudes} />}
    </div>
  )
}

export function VerUnidadContent() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[14px] font-medium">Cargando…</span>
      </div>
    }>
      <VerUnidadInner />
    </Suspense>
  )
}
