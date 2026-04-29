import { db, auth } from "@/lib/firebase"
import {
  doc, getDoc, getDocs, setDoc, deleteDoc,
  collection, query, orderBy, serverTimestamp
} from "firebase/firestore"
import {
  getUnidadCompleta, getUnidades,
  initOAs, mergeOAs, cargarVerUnidad,
  type OAEditado,
} from "@/lib/curriculo"
import { cargarEstudiantes } from "@/lib/estudiantes"
import { getCurriculoNivel, normalizeKeyPart } from "@/lib/shared"

// ─── Helpers Firestore ────────────────────────────────────────────────────────

function getUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

function userDoc(col: string, id: string) {
  return doc(db, "users", getUid(), col, id)
}

function userCol(col: string) {
  return collection(db, "users", getUid(), col)
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface NivelEvaluacion {
  descripcion: string
  puntos: number
}

export interface CriterioRubrica {
  id: string
  orden: number
  nombre: string
  ponderacion?: number   // multiplicador (default 1). Ej: 2 → pts obtenidos × 2
  niveles: {
    logrado: NivelEvaluacion           // 4 pts
    casiLogrado: NivelEvaluacion       // 3 pts
    parcialmenteLogrado: NivelEvaluacion // 2 pts
    porLograr: NivelEvaluacion         // 1 pt
  }
}

export interface RubricaParte {
  id: string
  orden: number
  nombre: string           // "Parte 1 (OA 2 & OA 4)"
  oasVinculados: string[]  // ["OA 2", "OA 4"]
  criterios: CriterioRubrica[]
}

export interface RubricaGrupoConfig {
  id: string
  nombre: string
  orden: number
}

export interface RubricaMetadatosCurriculares {
  objetivos: string[]
  indicadores: string[]
  objetivosTransversales: string[]
}

export interface RubricaCurriculoResolucion {
  metadatosCurriculares: RubricaMetadatosCurriculares
  unidadId?: string
  unidadNombre?: string
  resolvedFromDatabase: boolean
}

export interface RubricaTemplate {
  id: string
  nombre: string
  asignatura: string
  curso: string
  unidadId?: string
  unidadNombre?: string
  usaPonderaciones?: boolean   // cuando true, cada criterio puede tener ponderacion != 1
  metadatosCurriculares?: RubricaMetadatosCurriculares
  oas?: OAEditado[]            // OAs editables estilo /planificaciones
  gruposConfig?: RubricaGrupoConfig[]
  partes: RubricaParte[]
  puntajeMaximo: number
  createdAt?: unknown
  updatedAt?: unknown
}

// Re-export para que componentes puedan importar desde un solo lugar
export type { OAEditado } from "@/lib/curriculo"

export interface EstudianteEvaluacion {
  estudianteId: string
  nombre: string
  hasPie: boolean
  puntajes: Record<string, number>  // criterioId → 1|2|3|4
  observaciones: string
  nota?: number
  completado: boolean
}

export interface GrupoEvaluacion {
  id: string
  nombre: string   // "Grupo 1", "Grupo 2"...
  estudiantes: EstudianteEvaluacion[]
}

export interface EvaluacionRubrica {
  id: string
  rubricaId: string
  rubricaNombre: string
  asignatura: string
  curso: string
  grupos: GrupoEvaluacion[]
  puntajeMaximo: number
  updatedAt?: unknown
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => typeof item === "string" ? item.trim() : "")
    .filter(Boolean)
}

function sortByOrder<T extends { orden?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aOrden = typeof a.orden === "number" ? a.orden : Number.MAX_SAFE_INTEGER
    const bOrden = typeof b.orden === "number" ? b.orden : Number.MAX_SAFE_INTEGER
    return aOrden - bOrden
  })
}

export function metadatosCurricularesVacios(): RubricaMetadatosCurriculares {
  return {
    objetivos: [],
    indicadores: [],
    objetivosTransversales: [],
  }
}

function normalizeCompareText(value: string): string {
  return normalizeKeyPart(value).replace(/^unidad_/, "")
}

function extraerNumeroUnidad(value?: string): number | null {
  if (!value) return null
  const match = value.match(/unidad\s*(\d+)/i)
  if (!match) return null
  const numero = Number.parseInt(match[1], 10)
  return Number.isFinite(numero) ? numero : null
}

export function parseCurricularRefsInput(value: string): string[] {
  const cleaned = value.trim()
  if (!cleaned) return []

  const matches = Array.from(
    cleaned.matchAll(/\b(?:OA\s*\d+|OAA(?:\s*[A-Z])?)\b/gi),
    match => match[0].toUpperCase().replace(/\s+/g, " ")
  )

  if (matches.length > 0) {
    return Array.from(new Set(matches))
  }

  return cleaned
    .split(/\s*(?:,|;|\/|\||\sy\s| - | – | — )\s*/i)
    .map(item => item.trim())
    .filter(Boolean)
}

function mergeUnique(target: string[], values: string[]) {
  values.forEach(value => {
    const limpio = value.trim()
    if (limpio && !target.includes(limpio)) target.push(limpio)
  })
}

export async function resolverMetadatosCurricularesRubrica(
  rubrica: Pick<RubricaTemplate, "asignatura" | "curso" | "unidadNombre" | "metadatosCurriculares">
): Promise<RubricaCurriculoResolucion> {
  const fallback = normalizeMetadatosCurriculares(rubrica.metadatosCurriculares)
  const nivel = getCurriculoNivel(rubrica.curso)
  const unidades = await getUnidades(rubrica.asignatura, nivel)
  if (!unidades.length) {
    return { metadatosCurriculares: fallback, resolvedFromDatabase: false }
  }

  const unidadNumero = extraerNumeroUnidad(rubrica.unidadNombre)
  const unidadNombreComparable = rubrica.unidadNombre ? normalizeCompareText(rubrica.unidadNombre) : ""

  const unidadMatch = unidades.find(unidad => {
    if (unidadNumero !== null && unidad.numero_unidad === unidadNumero) return true
    const nombreComparable = normalizeCompareText(unidad.nombre_unidad || "")
    return !!unidadNombreComparable && (
      nombreComparable === unidadNombreComparable ||
      nombreComparable.includes(unidadNombreComparable) ||
      unidadNombreComparable.includes(nombreComparable)
    )
  })

  if (!unidadMatch) {
    return { metadatosCurriculares: fallback, resolvedFromDatabase: false }
  }

  const unidadCompleta = await getUnidadCompleta(rubrica.asignatura, nivel, unidadMatch.id)
  if (!unidadCompleta) {
    return { metadatosCurriculares: fallback, resolvedFromDatabase: false }
  }

  const objetivos: string[] = []
  const indicadores: string[] = []
  const objetivosTransversales: string[] = []

  ;(unidadCompleta.objetivos_aprendizaje || []).forEach(oa => {
    const descripcion = oa.descripcion?.trim()
    const isOAT = String(oa.tipo || "").toUpperCase() === "OAT"

    if (descripcion) {
      const texto = `${isOAT ? "OAA" : "OA"} ${oa.numero}: ${descripcion}`
      if (isOAT) objetivosTransversales.push(texto)
      else objetivos.push(texto)
    }

    if (!isOAT) {
      mergeUnique(indicadores, (oa.indicadores || []).map(ind => ind.trim()).filter(Boolean))
    }
  })

  const metadatosCurriculares: RubricaMetadatosCurriculares = {
    objetivos: objetivos.length > 0 ? objetivos : fallback.objetivos,
    indicadores: indicadores.length > 0 ? indicadores : fallback.indicadores,
    objetivosTransversales: objetivosTransversales.length > 0 ? objetivosTransversales : fallback.objetivosTransversales,
  }

  return {
    metadatosCurriculares,
    unidadId: unidadCompleta.id,
    unidadNombre: unidadCompleta.nombre_unidad || rubrica.unidadNombre,
    resolvedFromDatabase: true,
  }
}

// Carga los OAs de una rúbrica desde el currículum y los merge con los edits guardados en ver_unidad
export async function cargarOAsParaRubrica(
  asignatura: string,
  curso: string,
  unidadId: string,
  oasExistentes?: OAEditado[]
): Promise<OAEditado[]> {
  const nivel = getCurriculoNivel(curso)
  const unidad = await getUnidadCompleta(asignatura, nivel, unidadId)
  if (!unidad) return oasExistentes ?? []

  // OAs base del ministerio
  const base = initOAs(unidad, asignatura)

  // OAs guardados en /ver-unidad (si el profe ya trabajó esa unidad)
  let verUnidadOas: OAEditado[] = []
  try {
    const guardada = await cargarVerUnidad(asignatura, curso, unidadId)
    verUnidadOas = guardada?.oas ?? []
  } catch {
    // si no existe ver_unidad, no pasa nada
  }

  // Merge: currículum base ← ver_unidad ← edits propios de la rúbrica
  const mergedConVerUnidad = mergeOAs(base, verUnidadOas)
  if (oasExistentes && oasExistentes.length > 0) {
    return mergeOAs(mergedConVerUnidad, oasExistentes)
  }
  return mergedConVerUnidad
}

export function gruposConfigPorDefecto(count = 4): RubricaGrupoConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `grupo_${index + 1}`,
    nombre: `Grupo ${index + 1}`,
    orden: index + 1,
  }))
}

function normalizeMetadatosCurriculares(
  value?: RubricaMetadatosCurriculares
): RubricaMetadatosCurriculares {
  return {
    objetivos: normalizeTextList(value?.objetivos),
    indicadores: normalizeTextList(value?.indicadores),
    objetivosTransversales: normalizeTextList(value?.objetivosTransversales),
  }
}

function normalizeCriterio(
  criterio: CriterioRubrica,
  index: number
): CriterioRubrica {
  return {
    ...criterio,
    orden: index + 1,
  }
}

function normalizeParte(
  parte: RubricaParte,
  index: number
): RubricaParte {
  const criteriosOrdenados = sortByOrder(parte.criterios ?? []).map((criterio, criterioIndex) =>
    normalizeCriterio(criterio, criterioIndex)
  )

  return {
    ...parte,
    orden: index + 1,
    oasVinculados: normalizeTextList(parte.oasVinculados),
    criterios: criteriosOrdenados,
  }
}

export function normalizarRubricaTemplate(
  rubrica: RubricaTemplate
): RubricaTemplate {
  const partesOrdenadas = sortByOrder(rubrica.partes ?? []).map((parte, index) =>
    normalizeParte(parte, index)
  )
  const puntajeMaximo = calcularPuntajeMaximo(partesOrdenadas)

  return {
    ...rubrica,
    metadatosCurriculares: normalizeMetadatosCurriculares(rubrica.metadatosCurriculares),
    gruposConfig: sortByOrder(rubrica.gruposConfig ?? gruposConfigPorDefecto()).map((grupo, index) => ({
      ...grupo,
      orden: index + 1,
      nombre: grupo.nombre?.trim?.() || `Grupo ${index + 1}`,
      id: grupo.id || `grupo_${index + 1}`,
    })),
    partes: partesOrdenadas,
    puntajeMaximo,
  }
}

// ─── Helpers de ID ────────────────────────────────────────────────────────────

export function buildRubricaId(asignatura: string, curso: string, nombre: string): string {
  const ts = Date.now()
  return `rubrica_${normalizeKeyPart(asignatura)}_${normalizeKeyPart(curso)}_${ts}`
}

export function buildEvaluacionId(rubricaId: string): string {
  return `eval_${rubricaId}`
}

function buildCalificacionesId(asignatura: string, curso: string): string {
  return ("calif_" + asignatura + "_" + curso)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function periodoActual(): "s1" | "s2" {
  return new Date().getMonth() <= 6 ? "s1" : "s2"
}

function exigenciaParaEstudiante(estudiante: Pick<EstudianteEvaluacion, "hasPie">): number {
  return estudiante.hasPie ? 0.5 : 0.6
}

function normalizarNota(value: unknown): string {
  if (value === undefined || value === null) return ""
  const str = String(value).trim()
  if (!str) return ""
  const num = Number.parseFloat(str.replace(",", "."))
  return Number.isFinite(num) ? num.toFixed(1) : str
}

function oaIdsDesdeRubrica(rubrica: RubricaTemplate): string[] {
  const ids = new Set<string>()

  ;(rubrica.oas || [])
    .filter(oa => oa.seleccionado)
    .forEach(oa => ids.add(oa.id))

  rubrica.partes.forEach(parte => {
    parte.oasVinculados.forEach(ref => {
      const match = ref.match(/\bOA\s*(\d+)\b/i)
      if (match) ids.add(`OA${match[1]}`)
      else if (ref.trim()) ids.add(ref.trim())
    })
  })

  return Array.from(ids)
}

export interface SincronizarCalificacionesOptions {
  sobrescribir?: boolean
}

export interface SincronizarCalificacionesResultado {
  evaluacionId: string
  notasSincronizadas: number
  estudiantesSinNota: number
  evaluacionExistia: boolean
  requiereConfirmacion: boolean
  conflictos: Array<{ estudianteId: string; nombre: string; anterior: string; nueva: string }>
}

export async function sincronizarConCalificaciones(
  rubrica: RubricaTemplate,
  evaluacion: EvaluacionRubrica,
  opciones: SincronizarCalificacionesOptions = {},
): Promise<SincronizarCalificacionesResultado> {
  const evaluacionId = buildEvaluacionId(rubrica.id)
  const calificacionesId = buildCalificacionesId(rubrica.asignatura, rubrica.curso)
  const snap = await getDoc(userDoc("calificaciones", calificacionesId))
  const data = snap.exists() ? snap.data() : {}

  const estudiantesBase: any[] = Array.isArray(data.estudiantes) ? data.estudiantes : []
  const evaluacionesBase: any[] = Array.isArray(data.evaluaciones) ? data.evaluaciones : []
  const evaluacionExistia = evaluacionesBase.some(ev => ev.id === evaluacionId)

  const notasCalculadas = new Map<string, { nombre: string; nota: string }>()
  let estudiantesSinNota = 0

  evaluacion.grupos.flatMap(grupo => grupo.estudiantes).forEach(estudiante => {
    const tienePuntajes = Object.keys(estudiante.puntajes || {}).length > 0
    if (!tienePuntajes && !estudiante.completado) {
      estudiantesSinNota += 1
      return
    }

    const puntaje = calcularPuntajeEstudiante(estudiante.puntajes || {}, rubrica.partes)
    const nota = calcularNota(puntaje, rubrica.puntajeMaximo, exigenciaParaEstudiante(estudiante)).toFixed(1)
    notasCalculadas.set(estudiante.estudianteId, { nombre: estudiante.nombre, nota })
  })

  const estudiantesRoster = await cargarEstudiantes(rubrica.curso).catch(() => [])
  const estudiantesMap = new Map<string, any>()

  estudiantesRoster.forEach((est, index) => {
    estudiantesMap.set(est.id, {
      id: est.id,
      name: est.nombre,
      orden: est.orden ?? index + 1,
      notas: {},
      hasPie: est.pie === true,
      pieDiagnostico: est.pieDiagnostico || "",
    })
  })

  estudiantesBase.forEach(est => {
    if (!est?.id) return
    const existing = estudiantesMap.get(est.id)
    estudiantesMap.set(est.id, {
      ...existing,
      ...est,
      name: est.name || existing?.name || est.nombre || "",
      notas: { ...(existing?.notas || {}), ...(est.notas || {}) },
    })
  })

  notasCalculadas.forEach(({ nombre }, estudianteId) => {
    if (!estudiantesMap.has(estudianteId)) {
      estudiantesMap.set(estudianteId, {
        id: estudianteId,
        name: nombre,
        notas: {},
        hasPie: false,
      })
    }
  })

  const conflictos: SincronizarCalificacionesResultado["conflictos"] = []
  notasCalculadas.forEach(({ nombre, nota }, estudianteId) => {
    const estudiante = estudiantesMap.get(estudianteId)
    const anterior = normalizarNota(estudiante?.notas?.[evaluacionId])
    if (anterior && anterior !== nota) {
      conflictos.push({ estudianteId, nombre, anterior, nueva: nota })
    }
  })

  if (conflictos.length > 0 && !opciones.sobrescribir) {
    return {
      evaluacionId,
      notasSincronizadas: notasCalculadas.size,
      estudiantesSinNota,
      evaluacionExistia,
      requiereConfirmacion: true,
      conflictos,
    }
  }

  notasCalculadas.forEach(({ nota }, estudianteId) => {
    const estudiante = estudiantesMap.get(estudianteId)
    if (!estudiante) return
    estudiantesMap.set(estudianteId, {
      ...estudiante,
      notas: { ...(estudiante.notas || {}), [evaluacionId]: nota },
    })
  })

  const evaluacionCalificaciones = {
    id: evaluacionId,
    label: rubrica.nombre || evaluacion.rubricaNombre || "Rubrica",
    tipo: "sumativa" as const,
    periodo: periodoActual(),
    unidadId: rubrica.unidadId,
    oaIds: oaIdsDesdeRubrica(rubrica),
  }

  const evaluacionesActualizadas = evaluacionExistia
    ? evaluacionesBase.map(ev => ev.id === evaluacionId ? { ...ev, ...evaluacionCalificaciones } : ev)
    : [...evaluacionesBase, evaluacionCalificaciones]

  await setDoc(userDoc("calificaciones", calificacionesId), stripUndefined({
    asignatura: rubrica.asignatura,
    curso: rubrica.curso,
    estudiantes: Array.from(estudiantesMap.values()).sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999)),
    evaluaciones: evaluacionesActualizadas,
    updatedAt: serverTimestamp(),
  }), { merge: true })

  return {
    evaluacionId,
    notasSincronizadas: notasCalculadas.size,
    estudiantesSinNota,
    evaluacionExistia,
    requiereConfirmacion: false,
    conflictos,
  }
}

// ─── Nota chilena ─────────────────────────────────────────────────────────────

export function calcularNota(puntaje: number, puntajeMax: number, exigencia = 0.6): number {
  if (puntajeMax <= 0) return 1.0
  const porcentaje = Math.min(1, Math.max(0, puntaje / puntajeMax))
  const exigenciaNormalizada = Math.min(0.95, Math.max(0.05, exigencia))
  const nota = porcentaje < exigenciaNormalizada
    ? 1 + (3 * porcentaje) / exigenciaNormalizada
    : 4 + (3 * (porcentaje - exigenciaNormalizada)) / (1 - exigenciaNormalizada)
  return Math.round(Math.min(7, Math.max(1, nota)) * 10) / 10
}

export function calcularPuntajeEstudiante(
  puntajes: Record<string, number>,
  partes: RubricaParte[]
): number {
  let total = 0
  for (const parte of partes) {
    for (const criterio of parte.criterios) {
      const pond = criterio.ponderacion ?? 1
      total += (puntajes[criterio.id] ?? 0) * pond
    }
  }
  return total
}

export function calcularPuntajeMaximo(partes: RubricaParte[]): number {
  let total = 0
  for (const parte of partes) {
    for (const criterio of parte.criterios) {
      const pond = criterio.ponderacion ?? 1
      total += 4 * pond
    }
  }
  return total
}

// ─── Plantillas de Rúbrica ────────────────────────────────────────────────────

export async function cargarRubricas(
  asignatura: string,
  curso: string
): Promise<RubricaTemplate[]> {
  const col = userCol("rubricas")
  const snap = await getDocs(query(col, orderBy("createdAt", "desc")))
  const all = snap.docs.map(d => normalizarRubricaTemplate({ id: d.id, ...d.data() } as RubricaTemplate))
  return all.filter(
    r => r.asignatura === asignatura && r.curso === curso
  )
}

export async function cargarRubrica(id: string): Promise<RubricaTemplate | null> {
  const snap = await getDoc(userDoc("rubricas", id))
  if (!snap.exists()) return null
  return normalizarRubricaTemplate({ id: snap.id, ...snap.data() } as RubricaTemplate)
}

// Firestore rechaza campos con valor `undefined`. Este helper los elimina.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripUndefined(value: any): any {
  if (Array.isArray(value)) {
    return value.map(stripUndefined)
  }
  if (value !== null && typeof value === "object" && !(value?.constructor?.name?.includes("Timestamp"))) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = stripUndefined(v)
    }
    return out
  }
  return value
}

export async function guardarRubrica(rubrica: RubricaTemplate): Promise<void> {
  const normalizada = normalizarRubricaTemplate(rubrica)
  const { id, ...data } = normalizada
  const payload = stripUndefined({
    ...data,
    puntajeMaximo: normalizada.puntajeMaximo,
    updatedAt: serverTimestamp(),
    createdAt: rubrica.createdAt ?? serverTimestamp(),
  })
  await setDoc(userDoc("rubricas", id), payload)
}

export async function eliminarRubrica(id: string): Promise<void> {
  await deleteDoc(userDoc("rubricas", id))
  // También eliminar la evaluación asociada si existe
  try {
    await deleteDoc(userDoc("rubricas_evaluaciones", buildEvaluacionId(id)))
  } catch {
    // Si no existe, no importa
  }
}

// ─── Evaluaciones ─────────────────────────────────────────────────────────────

export async function cargarEvaluacion(
  rubricaId: string
): Promise<EvaluacionRubrica | null> {
  const id = buildEvaluacionId(rubricaId)
  const snap = await getDoc(userDoc("rubricas_evaluaciones", id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as EvaluacionRubrica
}

export async function guardarEvaluacion(evaluacion: EvaluacionRubrica): Promise<void> {
  const { id, ...data } = evaluacion
  const payload = stripUndefined({
    ...data,
    updatedAt: serverTimestamp(),
  })
  await setDoc(userDoc("rubricas_evaluaciones", id), payload)
}

// ─── Plantillas vacías ────────────────────────────────────────────────────────

export function nuevaRubrica(asignatura: string, curso: string): RubricaTemplate {
  const id = buildRubricaId(asignatura, curso, "nueva")
  return {
    id,
    nombre: "",
    asignatura,
    curso,
    metadatosCurriculares: metadatosCurricularesVacios(),
    gruposConfig: gruposConfigPorDefecto(),
    partes: [nuevaParte(1)],
    puntajeMaximo: 4,
  }
}

export function nuevaParte(numero: number): RubricaParte {
  return {
    id: `parte_${Date.now()}_${numero}`,
    orden: numero,
    nombre: `Parte ${numero}`,
    oasVinculados: [],
    criterios: [nuevoCriterio()],
  }
}

export function nuevoCriterio(): CriterioRubrica {
  return {
    id: `crit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    orden: 1,
    nombre: "",
    niveles: {
      logrado:               { descripcion: "", puntos: 4 },
      casiLogrado:           { descripcion: "", puntos: 3 },
      parcialmenteLogrado:   { descripcion: "", puntos: 2 },
      porLograr:             { descripcion: "", puntos: 1 },
    },
  }
}

export function nuevaEvaluacion(rubrica: RubricaTemplate): EvaluacionRubrica {
  const grupos = sortByOrder(rubrica.gruposConfig ?? gruposConfigPorDefecto()).map(grupo => ({
    id: grupo.id,
    nombre: grupo.nombre,
    estudiantes: [],
  }))

  return {
    id: buildEvaluacionId(rubrica.id),
    rubricaId: rubrica.id,
    rubricaNombre: rubrica.nombre,
    asignatura: rubrica.asignatura,
    curso: rubrica.curso,
    grupos,
    puntajeMaximo: rubrica.puntajeMaximo,
  }
}
