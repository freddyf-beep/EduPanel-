import { db, auth } from "@/lib/firebase"

export function getUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

export function userDoc(col: string, id: string) {
  return doc(db, "users", getUid(), col, id)
}

export function userCol(col: string) {
  return collection(db, "users", getUid(), col)
}
import {
  doc, getDoc, getDocs, setDoc, deleteDoc,
  collection, query, orderBy, serverTimestamp, where
} from "firebase/firestore"

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ObjetivoAprendizaje {
  id: string
  tipo: string
  numero: number
  descripcion: string
  indicadores: string[]
}

export interface ActividadSugerida {
  id: string
  nombre: string
  oas_asociados: number[]
  descripcion: string
}

export interface EjemploEvaluacion {
  id: string
  titulo: string
  oas_evaluados: number[]
  actividad_evaluacion: string
  criterios_proceso: string[]
  criterios_presentacion: string[]
}

export interface Unidad {
  id: string
  numero_unidad: number
  nombre_unidad: string
  proposito: string
  palabras_clave: string[]
  conocimientos: string[]
  habilidades: string[]
  actitudes: string[]
  conocimientos_previos: string[]
  adecuaciones_dua: string
  objetivos_aprendizaje?: ObjetivoAprendizaje[]
  actividades_sugeridas?: ActividadSugerida[]
  ejemplos_evaluacion?: EjemploEvaluacion[]
}

// ─── ID del documento en Firestore ───────────────────────────────────────────
// Ej: nivel="1ro Básico", asignatura="Música" → "musica_1ro_basico"
export function buildDocId(asignatura: string, nivel: string): string {
  return (asignatura + "_" + nivel)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

// ─── Leer todas las unidades de una asignatura/nivel ─────────────────────────
export async function getUnidades(asignatura: string, nivel: string): Promise<Unidad[]> {
  const docId = buildDocId(asignatura, nivel)
  const unidadesRef = collection(db, "curriculo", docId, "unidades")
  const snap = await getDocs(query(unidadesRef, orderBy("numero_unidad")))

  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  })) as Unidad[]
}

// ─── Leer una unidad específica con todos sus sub-datos ──────────────────────
export async function getUnidadCompleta(
  asignatura: string,
  nivel: string,
  unidadId: string
): Promise<Unidad | null> {
  const docId = buildDocId(asignatura, nivel)
  const unidadRef = doc(db, "curriculo", docId, "unidades", unidadId)
  const unidadSnap = await getDoc(unidadRef)

  if (!unidadSnap.exists()) return null

  const unidad = { id: unidadSnap.id, ...unidadSnap.data() } as Unidad

  // Cargar subcolecciones en paralelo
  const [oaSnap, actSnap, evalSnap] = await Promise.all([
    getDocs(query(
      collection(db, "curriculo", docId, "unidades", unidadId, "objetivos_aprendizaje"),
      orderBy("numero")
    )),
    getDocs(collection(db, "curriculo", docId, "unidades", unidadId, "actividades_sugeridas")),
    getDocs(collection(db, "curriculo", docId, "unidades", unidadId, "ejemplos_evaluacion")),
  ])

  unidad.objetivos_aprendizaje = oaSnap.empty
    ? (unidad.objetivos_aprendizaje || [])
    : (oaSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ObjetivoAprendizaje[])

  unidad.actividades_sugeridas = actSnap.empty
    ? (unidad.actividades_sugeridas || [])
    : (actSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ActividadSugerida[])

  unidad.ejemplos_evaluacion = evalSnap.empty
    ? (unidad.ejemplos_evaluacion || [])
    : (evalSnap.docs.map(d => ({ id: d.id, ...d.data() })) as EjemploEvaluacion[])

  return unidad
}

// ─── Leer solo los OA de una unidad ─────────────────────────────────────────
export async function getOADeUnidad(
  asignatura: string,
  nivel: string,
  unidadId: string
): Promise<ObjetivoAprendizaje[]> {
  const docId = buildDocId(asignatura, nivel)
  const snap = await getDocs(query(
    collection(db, "curriculo", docId, "unidades", unidadId, "objetivos_aprendizaje"),
    orderBy("numero")
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as ObjetivoAprendizaje[]
}

// ─── Tipos para planificación guardada ───────────────────────────────────────

export interface PlanificacionGuardada {
  asignatura: string
  curso: string
  fechas: Record<number, { start: string; end: string }>
  matriz: {
    oa: Record<string, boolean>
    habilidades: Record<string, boolean>
    conocimientos: Record<string, boolean>
    actitudes: Record<string, boolean>
  }
  updatedAt?: any
}

// ─── ID único para la planificación ──────────────────────────────────────────
export function buildPlanId(asignatura: string, curso: string): string {
  return "plan_" + buildDocId(asignatura, curso)
}

// ─── Guardar planificación del docente ───────────────────────────────────────
export async function guardarPlanificacion(
  asignatura: string,
  curso: string,
  fechas: Record<number, { start: string; end: string }>,
  matriz: {
    oa: Record<string, boolean>
    habilidades: Record<string, boolean>
    conocimientos: Record<string, boolean>
    actitudes: Record<string, boolean>
  }
): Promise<void> {
  const planId = buildPlanId(asignatura, curso)
  await setDoc(userDoc("planificaciones", planId), {
    asignatura,
    curso,
    fechas,
    matriz,
    updatedAt: serverTimestamp()
  })
}

// ─── Cargar planificación guardada ───────────────────────────────────────────
export async function cargarPlanificacion(
  asignatura: string,
  curso: string
): Promise<PlanificacionGuardada | null> {
  const planId = buildPlanId(asignatura, curso)
  const snap = await getDoc(userDoc("planificaciones", planId))
  if (!snap.exists()) return null
  return snap.data() as PlanificacionGuardada
}

// ─── Tipos para Ver Unidad ────────────────────────────────────────────────────

export interface ActividadDocente {
  id: string
  nombre: string
  tipo: "Clase" | "Actividad" | "Evaluacion"
  fecha: string
  duracion: string
  estado: "pendiente" | "completada"
}

// Indicador editable (puede ser del ministerio o creado por el docente)
export interface IndicadorEditado {
  id: string
  texto: string
  seleccionado: boolean
  esPropio?: boolean
}

// OA editable con sus indicadores
export interface OAEditado {
  id: string           // "OA1", "OA2", ... o "PROP_1" para propios
  numero?: number      // para OA del ministerio
  descripcion: string  // puede ser editada
  seleccionado: boolean
  indicadores: IndicadorEditado[]
  esPropio?: boolean
  tags?: string[]      // categoria, asignatura, nivel
}

// Elemento curricular editable (habilidad, conocimiento, actitud)
export interface ElementoCurricular {
  id: string
  texto: string
  seleccionado: boolean
  esPropio?: boolean
}

export interface VerUnidadGuardada {
  descripcion: string
  contextoDocente: string
  objetivoDocente: string
  horas: number
  clases: number
  oas: OAEditado[]
  habilidades: ElementoCurricular[]
  conocimientos: ElementoCurricular[]
  actitudes: ElementoCurricular[]
  actividades: ActividadDocente[]
  updatedAt?: any
}

export function buildVerUnidadId(asignatura: string, curso: string, unidadId: string): string {
  return buildDocId(asignatura, curso) + "_" + unidadId
}

export async function guardarVerUnidad(
  asignatura: string,
  curso: string,
  unidadId: string,
  data: Omit<VerUnidadGuardada, "updatedAt">
): Promise<void> {
  const id = buildVerUnidadId(asignatura, curso, unidadId)
  await setDoc(userDoc("ver_unidad", id), {
    asignatura, curso, unidadId,
    ...data,
    updatedAt: serverTimestamp()
  })
}

export async function cargarVerUnidad(
  asignatura: string,
  curso: string,
  unidadId: string
): Promise<VerUnidadGuardada | null> {
  const id = buildVerUnidadId(asignatura, curso, unidadId)
  const snap = await getDoc(userDoc("ver_unidad", id))
  if (!snap.exists()) return null
  return snap.data() as VerUnidadGuardada
}

// ─── Banco Curricular del Docente (Aislamiento por nivel) ────────────────────

export interface BancoCurricular {
  asignatura: string
  nivel: string
  updatedAt?: any
  [key: string]: any
}

export async function cargarBancoCurricular(
  asignatura: string,
  nivel: string
): Promise<BancoCurricular | null> {
  const id = buildDocId(asignatura, nivel)
  const snap = await getDoc(userDoc("banco_curricular", id))
  if (!snap.exists()) return null
  return snap.data() as BancoCurricular
}

export async function guardarBancoCurricular(
  asignatura: string,
  nivel: string,
  data: Omit<BancoCurricular, "updatedAt" | "asignatura" | "nivel">
): Promise<void> {
  const id = buildDocId(asignatura, nivel)
  await setDoc(userDoc("banco_curricular", id), {
    asignatura,
    nivel,
    ...data,
    updatedAt: serverTimestamp()
  })
}

// ─── Tipos para Cronograma ────────────────────────────────────────────────────

export interface ActividadCronograma {
  id: string
  nombre: string
  tipo: "clase" | "actividad" | "evaluacion"
  dia: string
  semana: number
  hora: string
  duracion: string
  unidad: string
  color: string
}

export interface CronogramaGuardado {
  actividades: ActividadCronograma[]
  updatedAt?: any
}

export async function guardarCronograma(
  asignatura: string,
  nivel: string,
  actividades: ActividadCronograma[]
): Promise<void> {
  const id = "crono_" + buildDocId(asignatura, nivel)
  await setDoc(userDoc("cronogramas", id), {
    asignatura, nivel,
    actividades,
    updatedAt: serverTimestamp()
  })
}

export async function cargarCronograma(
  asignatura: string,
  nivel: string
): Promise<CronogramaGuardado | null> {
  const id = "crono_" + buildDocId(asignatura, nivel)
  const snap = await getDoc(userDoc("cronogramas", id))
  if (!snap.exists()) return null
  return snap.data() as CronogramaGuardado
}

// ─── Tipos para Planificaciones por curso ─────────────────────────────────────

export interface UnidadPlan {
  id: number
  name: string
  color: string
  hours: number
  start: string
  end: string
  type: "tradicional" | "invertida" | "proyecto" | "unidad0"
  unidadCurricularId?: string
}

export interface PlanificacionCurso {
  curso: string
  asignatura: string
  units: UnidadPlan[]
  updatedAt?: any
}

export function buildPlanCursoId(asignatura: string, curso: string): string {
  return ("plan_" + asignatura + "_" + curso)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

export async function guardarPlanCurso(
  asignatura: string,
  curso: string,
  units: UnidadPlan[]
): Promise<void> {
  const id = buildPlanCursoId(asignatura, curso)
  await setDoc(userDoc("planificaciones_curso", id), {
    asignatura, curso, units,
    updatedAt: serverTimestamp()
  })
}

export async function cargarPlanCurso(
  asignatura: string,
  curso: string
): Promise<PlanificacionCurso | null> {
  const id = buildPlanCursoId(asignatura, curso)
  const snap = await getDoc(userDoc("planificaciones_curso", id))
  if (!snap.exists()) return null
  return snap.data() as PlanificacionCurso
}


// ─── Tipos para Libro de clases digital ─────────────────────────────────────

export type EstadoAsistencia = "presente" | "ausente" | "atraso" | "retirado"

export interface AsistenciaEstudiante {
  id: string
  nombre: string
  estado: EstadoAsistencia
}

export interface BloqueLibroClase {
  id: string
  bloque: string
  horaInicio: string
  horaFin: string
  objetivo: string
  actividad: string
  firmado: boolean
  asistencia: AsistenciaEstudiante[]
}

export interface LibroClasesGuardado {
  asignatura: string
  curso: string
  fecha: string
  bloques: BloqueLibroClase[]
  updatedAt?: any
}

export function buildLibroClaseId(asignatura: string, curso: string, fecha: string): string {
  return `libro_${buildDocId(asignatura, curso)}_${fecha}`
}

export async function guardarLibroClases(
  asignatura: string,
  curso: string,
  fecha: string,
  bloques: BloqueLibroClase[]
): Promise<void> {
  const id = buildLibroClaseId(asignatura, curso, fecha)
  await setDoc(userDoc("libro_clases", id), {
    asignatura, curso, fecha, bloques,
    updatedAt: serverTimestamp(),
  })
}

export async function cargarLibroClases(
  asignatura: string,
  curso: string,
  fecha: string,
): Promise<LibroClasesGuardado | null> {
  const id = buildLibroClaseId(asignatura, curso, fecha)
  const snap = await getDoc(userDoc("libro_clases", id))
  if (!snap.exists()) return null
  return snap.data() as LibroClasesGuardado
}

export async function listarLibroClasesCurso(
  asignatura: string,
  curso: string,
): Promise<LibroClasesGuardado[]> {
  const snap = await getDocs(userCol("libro_clases"))
  return snap.docs
    .map((d) => d.data() as LibroClasesGuardado)
    .filter((item) => item.asignatura === asignatura && item.curso === curso)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}


// ─── Helpers de sincronización curricular ───────────────────────────────────

export interface MatrizSeleccion {
  oa: Record<string, boolean>
  habilidades: Record<string, boolean>
  conocimientos: Record<string, boolean>
  actitudes: Record<string, boolean>
}

export function normalizarTextoId(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export function buildOfficialOAId(numero: number): string {
  return `oa_${numero}`
}

export function buildOfficialElementoId(tipo: "habilidades" | "conocimientos" | "actitudes", texto: string): string {
  return `${tipo}_${normalizarTextoId(texto)}`
}

export function buildMatrixCellKey(itemId: string, unitIndex: number): string {
  return `${itemId}__u${unitIndex + 1}`
}

export function emptyMatrizSeleccion(): MatrizSeleccion {
  return { oa: {}, habilidades: {}, conocimientos: {}, actitudes: {} }
}

export async function cargarVerUnidadesCurso(
  asignatura: string,
  curso: string,
): Promise<Record<string, VerUnidadGuardada>> {
  const q = query(
    userCol("ver_unidad"),
    where("asignatura", "==", asignatura),
    where("curso", "==", curso)
  )
  const snap = await getDocs(q)
  const result: Record<string, VerUnidadGuardada> = {}
  snap.docs.forEach((d) => {
    const data = d.data() as VerUnidadGuardada & { unidadId: string }
    if (data.unidadId) {
      result[data.unidadId] = data
    }
  })
  return result
}

export function construirMatrizDesdeVerUnidad(
  unidadId: string,
  unitIndex: number,
  data: Pick<VerUnidadGuardada, "oas" | "habilidades" | "conocimientos" | "actitudes">,
): MatrizSeleccion {
  const matriz = emptyMatrizSeleccion()

  ;(data.oas || []).forEach((oa) => {
    matriz.oa[buildMatrixCellKey(oa.id, unitIndex)] = !!oa.seleccionado
  })
  ;(data.habilidades || []).forEach((item) => {
    matriz.habilidades[buildMatrixCellKey(item.id, unitIndex)] = !!item.seleccionado
  })
  ;(data.conocimientos || []).forEach((item) => {
    matriz.conocimientos[buildMatrixCellKey(item.id, unitIndex)] = !!item.seleccionado
  })
  ;(data.actitudes || []).forEach((item) => {
    matriz.actitudes[buildMatrixCellKey(item.id, unitIndex)] = !!item.seleccionado
  })

  return matriz
}

// ─── Cronograma de Unidad (OA × Clases) ──────────────────────────────────────

export interface ClaseCronograma {
  numero: number          // 1, 2, 3...
  fecha: string           // "DD/MM/YYYY" o ""
  oaIds: string[]         // IDs de OA asignados a esta clase (ej: ["OA1","OA2"])
  duplicadaDe?: number    // si es copia de otra clase
}

export interface CronogramaUnidadData {
  asignatura: string
  curso: string
  unidadId: string
  totalClases: number
  clases: ClaseCronograma[]
  updatedAt?: any
}

export function buildCronogramaUnidadId(asignatura: string, curso: string, unidadId: string): string {
  return buildDocId(asignatura, curso) + "_crono_" + unidadId
}

export async function guardarCronogramaUnidad(
  asignatura: string,
  curso: string,
  unidadId: string,
  totalClases: number,
  clases: ClaseCronograma[]
): Promise<void> {
  const id = buildCronogramaUnidadId(asignatura, curso, unidadId)
  await setDoc(userDoc("cronograma_unidad", id), {
    asignatura, curso, unidadId, totalClases, clases,
    updatedAt: serverTimestamp()
  })
}

export async function cargarCronogramaUnidad(
  asignatura: string,
  curso: string,
  unidadId: string
): Promise<CronogramaUnidadData | null> {
  const id = buildCronogramaUnidadId(asignatura, curso, unidadId)
  const snap = await getDoc(userDoc("cronograma_unidad", id))
  if (!snap.exists()) return null
  return snap.data() as CronogramaUnidadData
}

// ─── Actividad de Clase (planificación diaria) ────────────────────────────────

export interface ActividadClase {
  id: string                    // "{curso}_{unidadId}_clase{N}"
  asignatura: string
  curso: string
  unidadId: string
  numeroClase: number
  fecha: string
  oaIds: string[]               // OA asignados a esta clase
  objetivo: string              // objetivo redactado por el docente
  inicio: string                // rich text
  desarrollo: string            // rich text (lo que va al leccionario)
  cierre: string                // rich text
  adecuacion: string            // adecuación curricular PIE
  habilidades: string[]
  actitudes: string[]
  materiales: string[]
  tics: string[]
  estado: "no_planificada" | "planificada" | "realizada"
  sincronizada: boolean
  updatedAt?: any
}

export function buildActividadClaseId(curso: string, unidadId: string, numeroClase: number): string {
  return buildDocId("Música", curso) + "_" + unidadId + "_clase" + numeroClase
}

export async function guardarActividadClase(data: Omit<ActividadClase, "updatedAt">): Promise<void> {
  const id = buildActividadClaseId(data.curso, data.unidadId, data.numeroClase)
  await setDoc(userDoc("actividades_clase", id), { ...data, updatedAt: serverTimestamp() })
}

export async function cargarActividadClase(
  curso: string,
  unidadId: string,
  numeroClase: number
): Promise<ActividadClase | null> {
  const id = buildActividadClaseId(curso, unidadId, numeroClase)
  const snap = await getDoc(userDoc("actividades_clase", id))
  if (!snap.exists()) return null
  return snap.data() as ActividadClase
}

export async function cargarTodasActividadesUnidad(
  curso: string,
  unidadId: string,
  totalClases: number
): Promise<Record<number, ActividadClase>> {
  const result: Record<number, ActividadClase> = {}
  await Promise.all(
    Array.from({ length: totalClases }, (_, i) => i + 1).map(async n => {
      const act = await cargarActividadClase(curso, unidadId, n)
      if (act) result[n] = act
    })
  )
  return result
}

export async function cargarBancoActividades(asignatura: string): Promise<ActividadClase[]> {
  const q = query(
    userCol("actividades_clase"),
    where("asignatura", "==", asignatura)
  )
  const snap = await getDocs(q)
  const list = snap.docs.map(d => d.data() as ActividadClase)
  // Filtrar las que tengan objetivo, para evitar vacías sugeridas
  return list.filter(a => a.objetivo && a.objetivo.trim() !== "")
}

// ─── Anotaciones de clase ─────────────────────────────────────────────────────

export async function guardarAnotacion(
  curso: string,
  fecha: string,
  texto: string
): Promise<void> {
  const id = buildDocId("Música", curso) + "_anot_" + fecha.replace(/\//g, "-")
  await setDoc(userDoc("anotaciones", id), {
    curso, fecha, texto, updatedAt: serverTimestamp()
  })
}

export async function cargarAnotacion(
  curso: string,
  fecha: string
): Promise<string> {
  const id = buildDocId("Música", curso) + "_anot_" + fecha.replace(/\//g, "-")
  const snap = await getDoc(userDoc("anotaciones", id))
  if (!snap.exists()) return ""
  return (snap.data().texto as string) || ""
}

// ─── Helpers de procesamiento de datos curriculares ───────────────────────────

// Re-export constants for easy parsing in UI
const DEFAULT_SUBJECT = "Música"

export function initOAs(unidad: Unidad): OAEditado[] {
  return (unidad.objetivos_aprendizaje || []).map(oa => ({
    id: buildOfficialOAId(oa.numero),
    numero: oa.numero,
    descripcion: oa.descripcion,
    seleccionado: true,
    indicadores: (oa.indicadores || []).map((ind, i) => ({
      id: `OA${oa.numero}_IND${i}`,
      texto: ind,
      seleccionado: true,
      esPropio: false,
    })),
    esPropio: false,
    tags: [DEFAULT_SUBJECT],
  }))
}

export function initElems(lista: string[], tipo: "habilidades" | "conocimientos" | "actitudes"): ElementoCurricular[] {
  return lista.map((texto) => ({ id: buildOfficialElementoId(tipo, texto), texto, seleccionado: true, esPropio: false }))
}

export function mergeOAs(base: OAEditado[], saved: OAEditado[] = []): OAEditado[] {
  const own = saved.filter((oa) => oa.esPropio === true)  // strict: only truly user-created OAs
  const byId = new Map(saved.map((oa) => [oa.id, oa]))
  const mergedBase = base.map((oa) => {
    const existing = byId.get(oa.id)
    if (!existing) return oa
    return {
      ...oa,
      descripcion: existing.descripcion || oa.descripcion,
      seleccionado: existing.seleccionado,
      indicadores: oa.indicadores.map((ind) => existing.indicadores.find((x) => x.id === ind.id) || ind).concat(existing.indicadores.filter((x) => x.esPropio)),
    }
  })
  // Deduplicate by id: mergedBase takes priority over own (own are user-created extras)
  const combined = [...mergedBase, ...own]
  const seen = new Set<string>()
  return combined.filter((oa) => {
    if (seen.has(oa.id)) return false
    seen.add(oa.id)
    return true
  })
}

export function mergeElementos(base: ElementoCurricular[], saved: ElementoCurricular[] = []): ElementoCurricular[] {
  const own = saved.filter((el) => el.esPropio)
  const byId = new Map(saved.map((el) => [el.id, el]))
  const mergedBase = base.map((el) => byId.get(el.id) ? { ...el, ...byId.get(el.id)! } : el)
  return [...mergedBase, ...own]
}

export function applyPlanSelection<T extends { id: string; seleccionado: boolean }>(items: T[], matrix: Record<string, boolean> | undefined, unitIndex: number): T[] {
  if (!matrix) return items
  return items.map((item) => {
    const key = buildMatrixCellKey(item.id, unitIndex)
    return key in matrix ? { ...item, seleccionado: !!matrix[key] } : item
  })
}
