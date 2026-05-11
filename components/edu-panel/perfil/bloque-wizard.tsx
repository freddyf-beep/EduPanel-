"use client"

import { useEffect, useMemo, useState } from "react"
import {
  X, ArrowLeft, ArrowRight, Check, Clock, Coffee, Sparkles, BookOpen,
  Users, ClipboardList, AlertCircle, Calendar, BedDouble, Brain, FileText,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type ClaseHorario, type TipoHorario, esTipoLibre, colisionaConHorario,
  horaToMinutos, duracionBloque, formatHorasMinutos, ETIQUETA_TIPO_LIBRE,
} from "@/lib/horario"
import { UNIT_COLORS } from "@/lib/shared"

// ─────────────────────────────────────────────────────────────────────────────
//   Tipos y constantes
// ─────────────────────────────────────────────────────────────────────────────

type Dia = ClaseHorario["dia"]
const DIAS: Dia[] = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

type TipoMeta = {
  value: TipoHorario
  label: string
  desc: string
  icon: typeof BookOpen
  defaultColor: string
}

const TIPOS_CON_CURSO: TipoMeta[] = [
  { value: "clase",       label: "Clase regular",  desc: "Clase de una asignatura del curso",            icon: BookOpen,       defaultColor: "#EC4899" },
  { value: "taller",      label: "Taller",         desc: "Taller, electivo o academia",                  icon: Sparkles,       defaultColor: "#8B5CF6" },
  { value: "orientacion", label: "Orientación",    desc: "Hora de jefatura/orientación con un curso",    icon: Users,          defaultColor: "#3B82F6" },
  { value: "consejo",     label: "Consejo",        desc: "Consejo de profesores o reunión",              icon: ClipboardList,  defaultColor: "#14B8A6" },
]

const TIPOS_LIBRES: TipoMeta[] = [
  { value: "almuerzo",      label: "Almuerzo",      desc: "Bloque libre — comida",            icon: Coffee,    defaultColor: "#F59E0B" },
  { value: "recreo",        label: "Recreo",        desc: "Bloque libre — descanso",          icon: BedDouble, defaultColor: "#22C55E" },
  { value: "planificacion", label: "Planificación", desc: "Tiempo personal de planificación", icon: Brain,     defaultColor: "#6366F1" },
  { value: "libre",         label: "Bloque libre",  desc: "Otro bloque libre",                icon: FileText,  defaultColor: "#94A3B8" },
]

const HORAS_DISPONIBLES = Array.from({ length: 16 }, (_, i) => i + 7) // 7:00 a 22:00
const MINUTOS_DISPONIBLES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

// ─────────────────────────────────────────────────────────────────────────────
//   Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export function BloqueWizard({
  open,
  onClose,
  onCreate,
  existingBloques,
  presetCurso,
  presetAsignatura,
  asignaturasSugeridas = [],
  cursosSugeridos = [],
}: {
  open: boolean
  onClose: () => void
  onCreate: (bloques: ClaseHorario[]) => void
  existingBloques: ClaseHorario[]
  presetCurso?: string
  presetAsignatura?: string
  asignaturasSugeridas?: string[]
  cursosSugeridos?: string[]
}) {
  const [step, setStep] = useState(1)
  const [tipo, setTipo] = useState<TipoHorario>("clase")
  const [diasSeleccionados, setDiasSeleccionados] = useState<Dia[]>([])
  const [aplicarTodosDias, setAplicarTodosDias] = useState(false)

  const [hInicio, setHInicio] = useState(8)
  const [mInicio, setMInicio] = useState(0)
  const [hFin, setHFin] = useState(8)
  const [mFin, setMFin] = useState(45)

  const [curso, setCurso] = useState(presetCurso || "")
  const [asignatura, setAsignatura] = useState(presetAsignatura || "")
  const [etiqueta, setEtiqueta] = useState("")
  const [color, setColor] = useState("#EC4899")

  // Reset al abrir
  useEffect(() => {
    if (!open) return
    setStep(1)
    setTipo("clase")
    setDiasSeleccionados([])
    setAplicarTodosDias(false)
    setHInicio(8); setMInicio(0)
    setHFin(8); setMFin(45)
    setCurso(presetCurso || "")
    setAsignatura(presetAsignatura || "")
    setEtiqueta("")
    setColor("#EC4899")
  }, [open, presetCurso, presetAsignatura])

  // Cuando cambia el tipo, ajusta defaults
  useEffect(() => {
    const meta = [...TIPOS_CON_CURSO, ...TIPOS_LIBRES].find(t => t.value === tipo)
    if (meta) setColor(meta.defaultColor)
    if (esTipoLibre(tipo)) {
      setEtiqueta(prev => prev || ETIQUETA_TIPO_LIBRE[tipo] || "")
    }
  }, [tipo])

  const tipoLibre = esTipoLibre(tipo)
  const meta = [...TIPOS_CON_CURSO, ...TIPOS_LIBRES].find(t => t.value === tipo)!

  const horaInicioStr = `${String(hInicio).padStart(2, "0")}:${String(mInicio).padStart(2, "0")}`
  const horaFinStr = `${String(hFin).padStart(2, "0")}:${String(mFin).padStart(2, "0")}`
  const minutosTotales = horaToMinutos(horaFinStr) - horaToMinutos(horaInicioStr)
  const horarioValido = minutosTotales > 0

  const diasFinales: Dia[] = aplicarTodosDias ? DIAS : diasSeleccionados

  // Calcula colisiones contra el horario existente
  const colisiones = useMemo(() => {
    if (!horarioValido || diasFinales.length === 0) return []
    const out: Array<{ dia: Dia; bloque: ClaseHorario }> = []
    for (const d of diasFinales) {
      const candidato: ClaseHorario = {
        uid: "__nuevo__",
        dia: d,
        horaInicio: horaInicioStr,
        horaFin: horaFinStr,
        resumen: tipoLibre ? (etiqueta || "Libre") : (curso || "Curso"),
        tipo,
        color,
      }
      const c = colisionaConHorario(existingBloques, candidato)
      if (c) out.push({ dia: d, bloque: c })
    }
    return out
  }, [diasFinales, horaInicioStr, horaFinStr, tipo, color, curso, etiqueta, tipoLibre, horarioValido, existingBloques])

  const toggleDia = (d: Dia) => {
    setAplicarTodosDias(false)
    setDiasSeleccionados(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  const canGoNext = (): boolean => {
    if (step === 1) return !!tipo
    if (step === 2) return diasFinales.length > 0
    if (step === 3) return horarioValido
    if (step === 4) {
      if (tipoLibre) return etiqueta.trim().length > 0
      return curso.trim().length > 0 && asignatura.trim().length > 0
    }
    return true
  }

  const handleSubmit = () => {
    if (!canGoNext()) return
    const baseTs = Date.now()
    const bloques: ClaseHorario[] = diasFinales.map((d, i) => ({
      uid: `${d.toLowerCase().slice(0, 3)}-${(tipoLibre ? etiqueta : curso).replace(/\s+/g, "").toLowerCase()}-${baseTs + i}`,
      dia: d,
      horaInicio: horaInicioStr,
      horaFin: horaFinStr,
      resumen: tipoLibre ? etiqueta.trim() : curso.trim(),
      tipo,
      color,
      ...(tipoLibre ? {} : { asignatura: asignatura.trim() }),
    }))
    onCreate(bloques)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-[680px] overflow-hidden rounded-[20px] border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-background/80 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-pink-light">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold leading-none">Nuevo bloque del horario</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Paso {step} de 4 · {meta.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stepper visual */}
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-2">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="flex flex-1 items-center gap-2">
              <div className={cn(
                "grid h-6 w-6 place-items-center rounded-full text-[11px] font-extrabold transition-colors",
                step > n && "bg-emerald-500 text-white",
                step === n && "bg-primary text-primary-foreground",
                step < n && "bg-muted text-muted-foreground"
              )}>
                {step > n ? <Check className="h-3 w-3" /> : n}
              </div>
              {n < 4 && <div className={cn("h-0.5 flex-1 rounded", step > n ? "bg-emerald-500" : "bg-muted")} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-5">
          {/* Paso 1 — Tipo */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Bloques con curso
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS_CON_CURSO.map(t => (
                    <TipoCard key={t.value} meta={t} active={tipo === t.value} onClick={() => setTipo(t.value)} />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Bloques libres (no requieren curso)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS_LIBRES.map(t => (
                    <TipoCard key={t.value} meta={t} active={tipo === t.value} onClick={() => setTipo(t.value)} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Paso 2 — Días */}
          {step === 2 && (
            <div className="space-y-4">
              {tipoLibre && (
                <label className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[14px] border-2 px-4 py-3 transition-colors",
                  aplicarTodosDias
                    ? "border-primary bg-pink-light/40 text-foreground"
                    : "border-dashed border-border bg-muted/20 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}>
                  <input
                    type="checkbox"
                    checked={aplicarTodosDias}
                    onChange={e => {
                      setAplicarTodosDias(e.target.checked)
                      if (e.target.checked) setDiasSeleccionados([])
                    }}
                    className="h-5 w-5 accent-primary"
                  />
                  <div>
                    <p className="text-[13px] font-extrabold">🔁 Aplicar a todos los días (Lunes a Viernes)</p>
                    <p className="text-[11px] opacity-80">Crea 5 bloques de una sola vez · ideal para almuerzo o recreo</p>
                  </div>
                </label>
              )}

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {aplicarTodosDias ? "Días que se crearán" : tipoLibre ? "...o selecciona días específicos" : "Selecciona uno o más días"}
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {DIAS.map(d => {
                    const seleccionado = aplicarTodosDias || diasSeleccionados.includes(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={aplicarTodosDias}
                        onClick={() => toggleDia(d)}
                        className={cn(
                          "rounded-lg border-2 px-2 py-3 text-[12px] font-bold transition-colors",
                          seleccionado
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-primary/50",
                          aplicarTodosDias && "opacity-90 cursor-not-allowed"
                        )}
                      >
                        {d.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {diasFinales.length === 0 && (
                <p className="text-[11.5px] text-amber-700">Selecciona al menos un día para continuar.</p>
              )}
              {diasFinales.length > 1 && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[11.5px] font-bold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                  Se crearán {diasFinales.length} bloques en total ({diasFinales.join(", ")})
                </p>
              )}
            </div>
          )}

          {/* Paso 3 — Horario */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <Clock className="h-3 w-3" /> Hora de inicio
                  </label>
                  <div className="flex items-center gap-2">
                    <SelectorHora label="HH" value={hInicio} options={HORAS_DISPONIBLES} onChange={setHInicio} />
                    <span className="text-[20px] font-bold text-muted-foreground">:</span>
                    <SelectorHora label="MM" value={mInicio} options={MINUTOS_DISPONIBLES} onChange={setMInicio} />
                  </div>
                </div>
                <div>
                  <label className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <Clock className="h-3 w-3" /> Hora de fin
                  </label>
                  <div className="flex items-center gap-2">
                    <SelectorHora label="HH" value={hFin} options={HORAS_DISPONIBLES} onChange={setHFin} />
                    <span className="text-[20px] font-bold text-muted-foreground">:</span>
                    <SelectorHora label="MM" value={mFin} options={MINUTOS_DISPONIBLES} onChange={setMFin} />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
                {horarioValido ? (
                  <>
                    <p className="text-[13px] font-extrabold text-foreground">
                      {horaInicioStr} → {horaFinStr}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">Duración: {formatHorasMinutos(minutosTotales)}</p>
                  </>
                ) : (
                  <p className="text-[11.5px] font-bold text-amber-700">La hora de fin debe ser posterior al inicio.</p>
                )}
              </div>

              {colisiones.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-[11.5px] dark:border-amber-500/30 dark:bg-amber-500/10">
                  <div className="mb-1 flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                    <AlertCircle className="h-4 w-4" />
                    {colisiones.length === 1 ? "Hay una colisión:" : `Hay ${colisiones.length} colisiones:`}
                  </div>
                  <ul className="space-y-0.5 text-amber-900 dark:text-amber-200">
                    {colisiones.map((c, i) => (
                      <li key={i}>• <strong>{c.dia}</strong>: choca con "{c.bloque.resumen}" ({c.bloque.horaInicio}–{c.bloque.horaFin})</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[10.5px] text-amber-800 dark:text-amber-300">Aún puedes continuar, pero revisa antes de crear.</p>
                </div>
              )}
            </div>
          )}

          {/* Paso 4 — Detalles */}
          {step === 4 && (
            <div className="space-y-4">
              {tipoLibre ? (
                <div>
                  <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                    Etiqueta del bloque
                  </label>
                  <input
                    type="text"
                    value={etiqueta}
                    onChange={e => setEtiqueta(e.target.value)}
                    placeholder={ETIQUETA_TIPO_LIBRE[tipo] || "Ej. Almuerzo"}
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-medium outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                      Curso (Ej. 4° A)
                    </label>
                    <input
                      type="text"
                      value={curso}
                      onChange={e => setCurso(e.target.value)}
                      placeholder="Ej. 4° A"
                      list="cursos-sugeridos-wizard"
                      disabled={!!presetCurso}
                      className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-medium outline-none focus:border-primary disabled:bg-muted/40"
                      autoFocus={!presetCurso}
                    />
                    <datalist id="cursos-sugeridos-wizard">
                      {cursosSugeridos.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                      Asignatura
                    </label>
                    <input
                      type="text"
                      value={asignatura}
                      onChange={e => setAsignatura(e.target.value)}
                      placeholder="Ej. Música, Lenguaje..."
                      list="asignaturas-sugeridas-wizard"
                      disabled={!!presetAsignatura}
                      className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-medium outline-none focus:border-primary disabled:bg-muted/40"
                      autoFocus={!!presetCurso && !presetAsignatura}
                    />
                    <datalist id="asignaturas-sugeridas-wizard">
                      {asignaturasSugeridas.map(a => <option key={a} value={a} />)}
                    </datalist>
                  </div>
                </>
              )}

              <div>
                <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                  Color
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border border-border bg-card"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {UNIT_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={cn(
                          "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                          color === c ? "border-foreground" : "border-transparent"
                        )}
                        style={{ background: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Resumen final */}
              <div className="rounded-[12px] border-2 border-primary/30 bg-pink-light/30 p-3">
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-primary">Vas a crear</p>
                <p className="mt-1 text-[13px] font-extrabold text-foreground">
                  {diasFinales.length} bloque{diasFinales.length === 1 ? "" : "s"} de "{tipoLibre ? etiqueta : `${asignatura} (${curso})`}"
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {diasFinales.join(", ")} · {horaInicioStr}–{horaFinStr} ({formatHorasMinutos(minutosTotales)})
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer con botones */}
        <div className="flex items-center justify-between border-t border-border bg-background/80 px-5 py-3">
          <button
            type="button"
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-bold text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {step === 1 ? "Cancelar" : "Atrás"}
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={!canGoNext()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-[12px] font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canGoNext()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-[12px] font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Crear {diasFinales.length} bloque{diasFinales.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//   Subcomponentes
// ─────────────────────────────────────────────────────────────────────────────

function TipoCard({ meta, active, onClick }: { meta: TipoMeta; active: boolean; onClick: () => void }) {
  const Icon = meta.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-[12px] border-2 p-3 text-left transition-all",
        active
          ? "border-primary bg-pink-light/40 shadow-sm"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
      )}
    >
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${meta.defaultColor}25`, color: meta.defaultColor }}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[12.5px] font-extrabold text-foreground">{meta.label}</span>
      </div>
      <p className="text-[10.5px] text-muted-foreground">{meta.desc}</p>
    </button>
  )
}

function SelectorHora({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (v: number) => void }) {
  return (
    <div className="flex-1">
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-12 w-full rounded-lg border-2 border-border bg-background text-center text-[18px] font-extrabold outline-none focus:border-primary"
      >
        {options.map(o => (
          <option key={o} value={o}>{String(o).padStart(2, "0")}</option>
        ))}
      </select>
    </div>
  )
}
