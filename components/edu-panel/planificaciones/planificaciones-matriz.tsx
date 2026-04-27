"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import {
  Download, MessageCircle, Bookmark, Plus, Calendar, MoreHorizontal, ExternalLink,
  Loader2, Check, BookOpen
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getUnidadCompleta, guardarPlanificacion, cargarPlanificacion, cargarPlanCurso } from "@/lib/curriculo"
import type { Unidad, UnidadPlan } from "@/lib/curriculo"
import { UNIT_COLORS, buildUrl, unidadIdFromIndex } from "@/lib/shared"
import { cargarNivelMapping, resolveNivel } from "@/lib/nivel-mapping"
import { useActiveSubject } from "@/hooks/use-active-subject"

interface MatrizItem {
  id: string
  text: string
  code?: string
  color?: string
  unidades: number[]
}

type TabKey = "oa" | "habilidades" | "conocimientos" | "actitudes"

const TABS: { key: TabKey; label: string }[] = [
  { key: "oa",            label: "Objetivos de Aprendizaje" },
  { key: "habilidades",   label: "Habilidades" },
  { key: "conocimientos", label: "Conocimientos" },
  { key: "actitudes",     label: "Actitudes" },
]

const BTN_LABELS: Record<TabKey, string> = {
  oa:            "Agregar OA",
  habilidades:   "Agregar Habilidad",
  conocimientos: "Agregar Conocimiento",
  actitudes:     "Agregar Actitud",
}

function buildMatrizOA(unidades: Unidad[]): MatrizItem[] {
  const map = new Map<number, MatrizItem>()
  unidades.forEach(u => {
    u.objetivos_aprendizaje?.forEach(oa => {
      if (map.has(oa.numero)) {
        if (!map.get(oa.numero)!.unidades.includes(u.numero_unidad))
          map.get(oa.numero)!.unidades.push(u.numero_unidad)
      } else {
        map.set(oa.numero, {
          id: `oa-${oa.numero}`,
          code: `OA ${oa.numero}`,
          text: oa.descripcion,
          color: UNIT_COLORS[(oa.numero - 1) % UNIT_COLORS.length],
          unidades: [u.numero_unidad],
        })
      }
    })
  })
  return Array.from(map.values()).sort((a, b) =>
    parseInt(a.id.split("-")[1] || "0") - parseInt(b.id.split("-")[1] || "0")
  )
}

function buildMatrizTexto(unidades: Unidad[], campo: "habilidades" | "conocimientos" | "actitudes"): MatrizItem[] {
  const map = new Map<string, MatrizItem>()
  unidades.forEach(u => {
    const lista = (u[campo] as string[]) || []
    lista.forEach((texto, i) => {
      const key = texto.trim()
      if (map.has(key)) {
        if (!map.get(key)!.unidades.includes(u.numero_unidad))
          map.get(key)!.unidades.push(u.numero_unidad)
      } else {
        map.set(key, { id: `${campo}-${u.numero_unidad}-${i}`, text: key, unidades: [u.numero_unidad] })
      }
    })
  })
  return Array.from(map.values())
}

function CheckCell({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <td className="px-4 py-3 text-center align-middle border-b border-border">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-5 w-5 cursor-pointer rounded-[5px] border-[1.5px] border-border accent-primary"
      />
    </td>
  )
}

export function PlanificacionesMatriz({ cursoParam }: { cursoParam: string }) {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const [activeTab, setActiveTab] = useState<TabKey>("oa")
  const [showDateModal, setShowDateModal] = useState(false)
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null)

  const [planUnits, setPlanUnits] = useState<UnidadPlan[]>([])
  const [currUnidades, setCurrUnidades] = useState<Unidad[]>([])
  
  const [oaItems, setOaItems] = useState<MatrizItem[]>([])
  const [habItems, setHabItems] = useState<MatrizItem[]>([])
  const [conItems, setConItems] = useState<MatrizItem[]>([])
  const [actItems, setActItems] = useState<MatrizItem[]>([])
  
  const [unitDates, setUnitDates] = useState<Record<number, { start: string; end: string }>>({})
  
  const [oaChecked,  setOaChecked] = useState<Record<string, boolean>>({})
  const [habChecked, setHabChecked] = useState<Record<string, boolean>>({})
  const [conChecked, setConChecked] = useState<Record<string, boolean>>({})
  const [actChecked, setActChecked] = useState<Record<string, boolean>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle"|"saving_silent"|"saved"|"error">("idle")

  useEffect(() => {
    async function cargar() {
      setLoading(true)
      try {
        const mapping = await cargarNivelMapping()
        const nivel = resolveNivel(cursoParam, mapping)

        const planData = await cargarPlanCurso(ASIGNATURA, cursoParam)
        const units = planData?.units ?? []
        setPlanUnits(units)

        if (units.length === 0 || !nivel) {
          setCurrUnidades([])
          setOaItems([]); setHabItems([]); setConItems([]); setActItems([])
          setLoading(false)
          return
        }

        const currIds = units.map(u => u.unidadCurricularId || "unidad_1")
        const currCompletas = await Promise.all(
          currIds.map(id => getUnidadCompleta(ASIGNATURA, nivel, id).catch(() => null))
        )
        const us = currCompletas.filter(Boolean) as Unidad[]
        setCurrUnidades(us)

        const oas  = buildMatrizOA(us)
        const habs = buildMatrizTexto(us, "habilidades")
        const cons = buildMatrizTexto(us, "conocimientos")
        const acts = buildMatrizTexto(us, "actitudes")
        setOaItems(oas); setHabItems(habs); setConItems(cons); setActItems(acts)

        const guardada = await cargarPlanificacion(ASIGNATURA, cursoParam)

        const initChecks = (items: MatrizItem[]) =>
          Object.fromEntries(items.flatMap(item =>
            units.map((_, i) => [`${item.id}-${i}`, item.unidades.includes(i + 1)])
          ))

        const fechasInit: Record<number, { start: string; end: string }> = {}
        units.forEach((u, i) => { fechasInit[i] = { start: u.start || "", end: u.end || "" } })

        if (guardada) {
          setUnitDates({ ...fechasInit, ...guardada.fechas })
          setOaChecked(guardada.matriz.oa || initChecks(oas))
          setHabChecked(guardada.matriz.habilidades || initChecks(habs))
          setConChecked(guardada.matriz.conocimientos || initChecks(cons))
          setActChecked(guardada.matriz.actitudes || initChecks(acts))
        } else {
          setUnitDates(fechasInit)
          setOaChecked(initChecks(oas))
          setHabChecked(initChecks(habs))
          setConChecked(initChecks(cons))
          setActChecked(initChecks(acts))
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
        ignoreNextSaveRef.current = true;
      }
    }
    cargar()
  }, [cursoParam, ASIGNATURA])

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
  }, [oaChecked, habChecked, conChecked, actChecked, unitDates])

  const toggle = (setter: React.Dispatch<React.SetStateAction<Record<string,boolean>>>, key: string) =>
    setter(prev => ({ ...prev, [key]: !prev[key] }))

  const handleGuardar = async (isAutoSave = false) => {
    if (!isAutoSave) setSaving(true)
    try {
      await guardarPlanificacion(ASIGNATURA, cursoParam, unitDates, {
        oa: oaChecked,
        habilidades: habChecked,
        conocimientos: conChecked,
        actitudes: actChecked,
      })
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } finally {
      if (!isAutoSave) setSaving(false)
    }
  }

  const getRows = () => {
    if (activeTab === "oa") return oaItems.map(o => ({
      id: o.id, left: (
        <td className="sticky left-0 z-10 bg-card px-4 py-3 text-left align-top min-w-[200px] max-w-[260px] border-b border-r border-border">
          <div className="flex items-start gap-2 mb-1">
            <div className="mt-1 h-[9px] w-[9px] flex-shrink-0 rounded-full" style={{ background: o.color }} />
            <span className="font-bold text-[13px]">{o.code}</span>
          </div>
          <div className="text-[13px] leading-snug pl-[17px]">{o.text}</div>
        </td>
      ), checked: oaChecked, setter: setOaChecked
    }))
    if (activeTab === "habilidades") return habItems.map(h => ({
      id: h.id, left: (
        <td className="sticky left-0 z-10 bg-card px-4 py-3 text-left align-top min-w-[200px] max-w-[260px] border-b border-r border-border">
          <div className="text-[13px] font-semibold leading-snug">{h.text}</div>
        </td>
      ), checked: habChecked, setter: setHabChecked
    }))
    if (activeTab === "conocimientos") return conItems.map(c => ({
      id: c.id, left: (
        <td className="sticky left-0 z-10 bg-card px-4 py-3 text-left align-top min-w-[200px] max-w-[260px] border-b border-r border-border">
          <div className="text-[13px] font-semibold leading-snug">{c.text}</div>
        </td>
      ), checked: conChecked, setter: setConChecked
    }))
    return actItems.map(a => ({
      id: a.id, left: (
        <td className="sticky left-0 z-10 bg-card px-4 py-3 text-left align-top min-w-[200px] max-w-[260px] border-b border-r border-border">
          <div className="text-[13px] font-semibold leading-snug">{a.text}</div>
        </td>
      ), checked: actChecked, setter: setActChecked
    }))
  }

  const completadasPct = planUnits.length > 0
    ? Math.round((planUnits.filter(u => u.start && u.end).length / planUnits.length) * 100)
    : 0

  return (
    <div className="mx-auto max-w-[1320px] pt-2">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-3.5">
        <h1 className="text-[22px] font-extrabold">Matriz Curricular – {cursoParam}</h1>
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:justify-end">
          <button className="flex items-center gap-[7px] border-[1.5px] border-border rounded-[10px] px-4 py-2.5 text-[13px] font-semibold bg-card hover:bg-background transition-colors">
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
          {saveStatus === "saved" && <span className="flex items-center gap-1.5 text-[13px] font-semibold text-green-600"><Check className="w-4 h-4" /> Guardado</span>}
          {saveStatus === "error" && <span className="text-[13px] font-semibold text-red-500">Error al guardar</span>}
          <button
            onClick={() => handleGuardar(false)}
            disabled={saving || planUnits.length === 0 || saveStatus === "saving_silent"}
            className="flex items-center gap-[7px] bg-primary text-primary-foreground border-none rounded-[10px] px-[18px] py-2.5 text-[13px] font-bold hover:bg-pink-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? <><Loader2 className="w-[15px] h-[15px] animate-spin" /> Guardando…</> : <><Bookmark className="w-[15px] h-[15px]" /> Guardar matriz</>}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-16 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[14px]">Cargando matriz de {cursoParam}…</span>
        </div>
      ) : planUnits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 border-2 border-dashed border-border rounded-[14px] mb-8 bg-card">
          <div className="w-14 h-14 rounded-full bg-pink-light grid place-items-center">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-[15px] font-bold mb-1">Sin unidades para {cursoParam}</p>
            <p className="text-[13px] text-muted-foreground">Primero crea las unidades en la pestaña "Mis Unidades".</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-7 rounded-[14px] border border-border bg-card px-4 py-4 sm:px-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-bold">Cobertura curricular planificada</span>
              <span className="text-[13px] font-bold text-primary">{completadasPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-background overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completadasPct}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {planUnits.filter(u => u.start && u.end).length} de {planUnits.length} unidades con fechas definidas
            </p>
          </div>

          <h2 className="text-[17px] font-extrabold mb-5">Distribuye los elementos curriculares por unidad</h2>

          <div className="mb-6 flex overflow-x-auto border-b-2 border-border scrollbar-none">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={cn("whitespace-nowrap text-[13px] font-semibold px-5 py-2.5 border-b-2 -mb-[2px] transition-colors bg-none cursor-pointer",
                  activeTab === t.key ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"
                )}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 mb-5">
            <button className="flex items-center gap-[7px] bg-primary text-primary-foreground border-none rounded-full px-[18px] py-2.5 text-[13px] font-bold hover:bg-pink-dark transition-colors cursor-pointer">
              <Plus className="w-[15px] h-[15px]" /> {BTN_LABELS[activeTab]}
            </button>
          </div>

          <div className="mb-12 scroll-hint-x rounded-[14px]">
          <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="bg-background">
                  <th className="sticky left-0 z-10 bg-background px-4 py-3 text-xs font-bold text-muted-foreground text-left border-b border-r border-border min-w-[200px]">
                    {TABS.find(t => t.key === activeTab)?.label}
                  </th>
                  {planUnits.map((u, i) => (
                    <th key={i} className="px-4 py-3 text-xs font-bold text-muted-foreground text-center border-b border-border whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: u.color || UNIT_COLORS[i % UNIT_COLORS.length] }} />
                        {u.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {getRows().length === 0 ? (
                  <tr><td colSpan={planUnits.length + 1} className="px-4 py-8 text-center text-[13px] text-muted-foreground">Sin datos curriculares para esta pestaña.</td></tr>
                ) : getRows().map(row => (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    {row.left}
                    {planUnits.map((_, i) => (
                      <CheckCell
                        key={i}
                        checked={!!row.checked[`${row.id}-${i}`]}
                        onChange={() => toggle(row.setter, `${row.id}-${i}`)}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  )
}
