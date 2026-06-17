"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Eye,
  HeartHandshake,
  Loader2,
  Palette,
  RefreshCw,
  Save,
  Sparkles,
  Sprout,
  Users,
} from "lucide-react"
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import {
  buildDocId,
  getUnidadCompleta,
  getUnidades,
  type ObjetivoAprendizaje,
  type Unidad,
} from "@/lib/curriculo"
import {
  cargarNivelMapping,
  isNivelParvularia,
  resolveNivel,
} from "@/lib/nivel-mapping"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cn } from "@/lib/utils"
import { useActiveSubject } from "@/hooks/use-active-subject"

type SaveState = "idle" | "saving" | "saved" | "error"

interface ParvulariaPlan {
  selectedOaIds: string[]
  focoExperiencia: string
  experienciaCentral: string
  mediacionAdulto: string
  ambienteRecursos: string
  juegoExploracion: string
  participacionFamilias: string
  observacionEvaluativa: string
  apoyosInclusivos: string
  notasSeguimiento: string
}

const EMPTY_PLAN: ParvulariaPlan = {
  selectedOaIds: [],
  focoExperiencia: "",
  experienciaCentral: "",
  mediacionAdulto: "",
  ambienteRecursos: "",
  juegoExploracion: "",
  participacionFamilias: "",
  observacionEvaluativa: "",
  apoyosInclusivos: "",
  notasSeguimiento: "",
}

const FIELD_GROUPS: Array<{
  key: keyof Omit<ParvulariaPlan, "selectedOaIds">
  label: string
  icon: typeof Sparkles
  rows: number
}> = [
  { key: "focoExperiencia", label: "Foco pedagógico", icon: Sprout, rows: 3 },
  { key: "experienciaCentral", label: "Experiencia de aprendizaje", icon: Palette, rows: 5 },
  { key: "mediacionAdulto", label: "Mediación del equipo pedagógico", icon: HeartHandshake, rows: 4 },
  { key: "ambienteRecursos", label: "Ambiente y recursos", icon: BookOpen, rows: 3 },
  { key: "juegoExploracion", label: "Juego, exploración y movimiento", icon: Sparkles, rows: 3 },
  { key: "participacionFamilias", label: "Familias y comunidad", icon: Users, rows: 3 },
  { key: "observacionEvaluativa", label: "Observación evaluativa", icon: Eye, rows: 4 },
  { key: "apoyosInclusivos", label: "Apoyos e inclusión", icon: BadgeCheck, rows: 3 },
  { key: "notasSeguimiento", label: "Seguimiento", icon: ClipboardCheck, rows: 3 },
]

function getUid() {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

function planDocId(asignatura: string, curso: string, unidadId: string) {
  return `${buildDocId(asignatura, curso)}_${unidadId}`
}

function oaStableId(oa: ObjetivoAprendizaje) {
  return (oa as any).codigo || `OA_${oa.numero}`
}

function oaLabel(oa: ObjetivoAprendizaje) {
  const codigo = (oa as any).codigo
  if (codigo) return codigo
  return `${String(oa.tipo || "OA").toUpperCase()} ${String(oa.numero).padStart(2, "0")}`
}

export function ParvulariaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const curso = searchParams.get("curso") || ""
  const unidadParam = searchParams.get("unidad") || "unidad_1"
  const unitIdLocal = searchParams.get("unitIdLocal") || ""

  const [nivel, setNivel] = useState<string>("")
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [unidad, setUnidad] = useState<Unidad | null>(null)
  const [plan, setPlan] = useState<ParvulariaPlan>(EMPTY_PLAN)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [message, setMessage] = useState<string | null>(null)

  const isParvularia = isNivelParvularia(nivel)
  const objetivos = useMemo(
    () => [...(unidad?.objetivos_aprendizaje || [])].sort((a, b) => (a.numero || 0) - (b.numero || 0)),
    [unidad]
  )
  const selectedSet = useMemo(() => new Set(plan.selectedOaIds), [plan.selectedOaIds])
  const selectedCount = objetivos.filter((oa) => selectedSet.has(oaStableId(oa))).length

  useEffect(() => {
    let cancelled = false
    async function loadBase() {
      setLoading(true)
      setMessage(null)
      try {
        const mapping = await cargarNivelMapping()
        if (cancelled) return
        const resolved = curso ? resolveNivel(curso, mapping, ASIGNATURA) || "" : ""
        setNivel(resolved)
        if (!curso || !resolved) {
          setUnidades([])
          setUnidad(null)
          return
        }

        const curriculumUnits = await getUnidades(ASIGNATURA, resolved)
        if (cancelled) return
        setUnidades(curriculumUnits)
        const selected =
          curriculumUnits.find((u) => u.id === unidadParam) ||
          curriculumUnits.find((u) => `unidad_${u.numero_unidad}` === unidadParam) ||
          curriculumUnits[0] ||
          null
        const full = selected
          ? await getUnidadCompleta(ASIGNATURA, resolved, selected.id)
          : null
        if (cancelled) return
        setUnidad(full || selected)
      } catch (error) {
        console.error("[parvularia] carga base", error)
        if (!cancelled) setMessage("No pude cargar la base parvularia.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadBase()
    return () => {
      cancelled = true
    }
  }, [ASIGNATURA, curso, unidadParam])

  useEffect(() => {
    if (!curso || !unidad?.id) {
      void Promise.resolve().then(() => setPlan(EMPTY_PLAN))
      return
    }
    const unidadId = unidad.id
    let cancelled = false
    async function loadPlan() {
      setPlan(EMPTY_PLAN)
      try {
        const ref = doc(db, "users", getUid(), "parvularia_unidades", planDocId(ASIGNATURA, curso, unidadId))
        const snap = await getDoc(ref)
        if (cancelled) return
        const data = snap.exists() ? snap.data() : {}
        setPlan({
          ...EMPTY_PLAN,
          ...(data.plan || {}),
          selectedOaIds: Array.isArray(data.plan?.selectedOaIds) ? data.plan.selectedOaIds : [],
        })
      } catch (error) {
        console.error("[parvularia] carga plan", error)
        if (!cancelled) setPlan(EMPTY_PLAN)
      }
    }
    loadPlan()
    return () => {
      cancelled = true
    }
  }, [ASIGNATURA, curso, unidad?.id])

  const selectUnidad = (id: string) => {
    router.replace(buildUrl("/parvularia", withAsignatura({
      curso,
      unidad: id,
      unitIdLocal,
    }, ASIGNATURA)))
  }

  const toggleOa = (oa: ObjetivoAprendizaje) => {
    const id = oaStableId(oa)
    setPlan((prev) => {
      const selected = new Set(prev.selectedOaIds)
      if (selected.has(id)) selected.delete(id)
      else selected.add(id)
      return { ...prev, selectedOaIds: Array.from(selected) }
    })
  }

  const updateField = (key: keyof Omit<ParvulariaPlan, "selectedOaIds">, value: string) => {
    setPlan((prev) => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    if (!curso || !unidad?.id || saveState === "saving") return
    setSaveState("saving")
    setMessage(null)
    try {
      const ref = doc(db, "users", getUid(), "parvularia_unidades", planDocId(ASIGNATURA, curso, unidad.id))
      await setDoc(ref, {
        asignatura: ASIGNATURA,
        curso,
        nivel,
        unidadId: unidad.id,
        unidadNombre: unidad.nombre_unidad || "",
        unidadLocalId: unitIdLocal || null,
        plan,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setSaveState("saved")
      setTimeout(() => setSaveState("idle"), 1800)
    } catch (error) {
      console.error("[parvularia] guardar", error)
      setSaveState("error")
      setMessage("No pude guardar esta experiencia.")
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!curso || !nivel) {
    return (
      <EmptyState
        title="Falta configurar el curso"
        body="Asocia este curso a Sala Cuna, Nivel Medio o Nivel Transición en Mi Perfil."
        href="/perfil?tab=asignaturas"
        action="Ir a Mi Perfil"
      />
    )
  }

  if (!isParvularia) {
    return (
      <EmptyState
        title="Este curso usa el flujo general"
        body={`${curso} está asociado a ${nivel}.`}
        href={buildUrl("/ver-unidad", withAsignatura({ curso, unidad: unidadParam, unitIdLocal }, ASIGNATURA))}
        action="Abrir Ver Unidad"
      />
    )
  }

  return (
    <div className="mx-auto max-w-[1500px] px-3 pb-10 sm:px-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={buildUrl("/planificaciones", withAsignatura({ curso }, ASIGNATURA))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-bold text-muted-foreground hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Planificaciones
        </Link>
        <div className="flex items-center gap-2">
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1.5 text-[11px] font-bold text-green-700">
              <Check className="h-3.5 w-3.5" /> Guardado
            </span>
          )}
          {saveState === "error" && (
            <span className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-600">
              Error
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saveState === "saving"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[12px] font-extrabold text-primary-foreground shadow-sm hover:bg-pink-dark disabled:opacity-60"
          >
            {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </button>
        </div>
      </div>

      <section className="mb-5 overflow-hidden rounded-[16px] border border-border bg-card shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="bg-[linear-gradient(135deg,#0f766e,#2563eb_55%,#c026d3)] px-5 py-5 text-white sm:px-7">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide">
              <Sprout className="h-3.5 w-3.5" /> Parvularia
            </div>
            <h1 className="text-[24px] font-extrabold leading-tight sm:text-[30px]">
              {ASIGNATURA}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-white/85">
              <span>{curso}</span>
              <span className="h-1 w-1 rounded-full bg-white/60" />
              <span>{nivel}</span>
              <span className="h-1 w-1 rounded-full bg-white/60" />
              <span>{unidad?.nombre_unidad || "Núcleo"}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border bg-background/60">
            <Metric icon={BookOpen} label="Núcleos" value={unidades.length} />
            <Metric icon={ClipboardCheck} label="Objetivos" value={objetivos.length} />
            <Metric icon={BadgeCheck} label="Focalizados" value={selectedCount} />
          </div>
        </div>
      </section>

      {message && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
          {message}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-extrabold text-foreground">Núcleo curricular</h2>
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {unidades.map((u) => {
                const active = u.id === unidad?.id
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => selectUnidad(u.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-primary bg-pink-light text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/50"
                    )}
                  >
                    <span className="min-w-0 truncate text-[12px] font-bold">{u.nombre_unidad}</span>
                    <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-extrabold text-foreground">Objetivos del núcleo</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                {selectedCount}/{objetivos.length}
              </span>
            </div>
            <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
              {objetivos.map((oa) => {
                const id = oaStableId(oa)
                const selected = selectedSet.has(id)
                return (
                  <label
                    key={id}
                    className={cn(
                      "block cursor-pointer rounded-lg border p-3 transition-colors",
                      selected ? "border-primary bg-pink-light/60" : "border-border bg-background hover:border-primary/40"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleOa(oa)}
                        className="mt-1 h-4 w-4 flex-shrink-0 accent-primary"
                      />
                      <div className="min-w-0">
                        <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wide text-primary">
                          {oaLabel(oa)}
                        </div>
                        <p className="text-[12px] leading-relaxed text-foreground">
                          {oa.descripcion}
                        </p>
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        </aside>

        <main className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {FIELD_GROUPS.map((field) => {
              const Icon = field.icon
              return (
                <section key={field.key} className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
                  <label className="mb-2 flex items-center gap-2 text-[12px] font-extrabold text-foreground">
                    <Icon className="h-4 w-4 text-primary" />
                    {field.label}
                  </label>
                  <textarea
                    value={plan[field.key]}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    rows={field.rows}
                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[12.5px] leading-relaxed outline-none transition-colors focus:border-primary"
                  />
                </section>
              )
            })}
          </div>

          <section className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[13px] font-extrabold text-foreground">
                <CalendarDays className="h-4 w-4 text-primary" />
                Lectura pedagógica del núcleo
              </h2>
              <Link
                href={buildUrl("/cronograma", withAsignatura({ curso }, ASIGNATURA))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:border-primary hover:text-primary"
              >
                Cronograma del curso <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryTile label="Ámbito" value={ASIGNATURA} />
              <SummaryTile label="Tramo" value={nivel} />
              <SummaryTile label="Núcleo" value={unidad?.nombre_unidad || ""} />
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: number }) {
  return (
    <div className="flex min-h-[104px] flex-col justify-center gap-1 px-4 py-3">
      <Icon className="h-4 w-4 text-primary" />
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[24px] font-extrabold text-foreground">{value}</div>
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-[12.5px] font-bold text-foreground">{value || "-"}</div>
    </div>
  )
}

function EmptyState({ title, body, href, action }: { title: string; body: string; href: string; action: string }) {
  return (
    <div className="mx-auto flex min-h-[420px] max-w-xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-[14px] bg-pink-light text-primary">
        <Sprout className="h-6 w-6" />
      </div>
      <h1 className="text-[20px] font-extrabold text-foreground">{title}</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      <Link
        href={href}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[12px] font-extrabold text-primary-foreground hover:bg-pink-dark"
      >
        {action} <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
