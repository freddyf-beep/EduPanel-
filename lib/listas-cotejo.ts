import { db, auth } from "@/lib/firebase"
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore"
import { normalizeKeyPart } from "@/lib/shared"
import type { Estudiante } from "@/lib/estudiantes"
import { cargarEstudiantes } from "@/lib/estudiantes"
import type { OAEditado } from "@/lib/curriculo"
import type {
  SincronizarCalificacionesOptions,
  SincronizarCalificacionesResultado,
} from "@/lib/rubricas"

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

export interface IndicadorListaCotejo {
  id: string
  orden: number
  texto: string
  oasVinculados?: string[]
}

export interface SeccionListaCotejo {
  id: string
  orden: number
  nombre: string
  oasVinculados: string[]
  indicadores: IndicadorListaCotejo[]
}

export interface ListaCotejoMetadatosCurriculares {
  objetivos: string[]
  indicadores: string[]
  objetivosTransversales: string[]
}

export interface ListaCotejoTemplate {
  id: string
  nombre: string
  asignatura: string
  curso: string
  unidadId?: string
  unidadNombre?: string
  metadatosCurriculares?: ListaCotejoMetadatosCurriculares
  oas?: OAEditado[]
  secciones: SeccionListaCotejo[]
  puntajePorSi: number
  puntajeMaximo: number
  createdAt?: unknown
  updatedAt?: unknown
}

export interface EstudianteListaCotejo {
  estudianteId: string
  nombre: string
  hasPie: boolean
  respuestas: Record<string, boolean>
  observaciones: string
  puntaje?: number
  porcentaje?: number
  nota?: number
  completado: boolean
}

export interface ListaCotejoEvaluacion {
  id: string
  listaId: string
  listaNombre: string
  asignatura: string
  curso: string
  estudiantes: EstudianteListaCotejo[]
  puntajeMaximo: number
  bloqueada?: boolean
  bloqueadaEn?: unknown
  updatedAt?: unknown
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
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

export function metadatosListaVacios(): ListaCotejoMetadatosCurriculares {
  return {
    objetivos: [],
    indicadores: [],
    objetivosTransversales: [],
  }
}

function normalizeMetadatos(
  value?: ListaCotejoMetadatosCurriculares
): ListaCotejoMetadatosCurriculares {
  return {
    objetivos: normalizeTextList(value?.objetivos),
    indicadores: normalizeTextList(value?.indicadores),
    objetivosTransversales: normalizeTextList(value?.objetivosTransversales),
  }
}

function normalizeIndicador(
  indicador: IndicadorListaCotejo,
  index: number
): IndicadorListaCotejo {
  return {
    ...indicador,
    id: indicador.id || uid("ind"),
    orden: index + 1,
    texto: indicador.texto?.trim?.() ?? "",
    oasVinculados: normalizeTextList(indicador.oasVinculados),
  }
}

function normalizeSeccion(
  seccion: SeccionListaCotejo,
  index: number
): SeccionListaCotejo {
  return {
    ...seccion,
    id: seccion.id || uid("sec"),
    orden: index + 1,
    nombre: seccion.nombre?.trim?.() || `Seccion ${index + 1}`,
    oasVinculados: normalizeTextList(seccion.oasVinculados),
    indicadores: sortByOrder(seccion.indicadores ?? []).map(normalizeIndicador),
  }
}

export function normalizarListaCotejoTemplate(
  lista: ListaCotejoTemplate
): ListaCotejoTemplate {
  const secciones = sortByOrder(lista.secciones ?? []).map(normalizeSeccion)
  const puntajePorSi = Number.isFinite(lista.puntajePorSi) && lista.puntajePorSi > 0
    ? lista.puntajePorSi
    : 1

  return {
    ...lista,
    nombre: lista.nombre?.trim?.() ?? "",
    asignatura: lista.asignatura?.trim?.() ?? "",
    curso: lista.curso?.trim?.() ?? "",
    unidadNombre: lista.unidadNombre?.trim?.() || undefined,
    metadatosCurriculares: normalizeMetadatos(lista.metadatosCurriculares),
    secciones,
    puntajePorSi,
    puntajeMaximo: calcularPuntajeMaximoLista(secciones, puntajePorSi),
  }
}

export function buildListaCotejoId(asignatura: string, curso: string): string {
  return `lista_${normalizeKeyPart(asignatura)}_${normalizeKeyPart(curso)}_${Date.now()}`
}

export function buildListaEvaluacionId(listaId: string): string {
  return `eval_${listaId}`
}

export function calcularPuntajeMaximoLista(
  secciones: SeccionListaCotejo[],
  puntajePorSi = 1
): number {
  return secciones.reduce(
    (total, seccion) => total + seccion.indicadores.length * puntajePorSi,
    0
  )
}

export function getIndicadoresLista(lista: ListaCotejoTemplate): IndicadorListaCotejo[] {
  return lista.secciones.flatMap(seccion => seccion.indicadores)
}

export function calcularPuntajeLista(
  respuestas: Record<string, boolean>,
  lista: ListaCotejoTemplate
): number {
  const puntajePorSi = lista.puntajePorSi || 1
  return getIndicadoresLista(lista).reduce(
    (total, indicador) => total + (respuestas[indicador.id] === true ? puntajePorSi : 0),
    0
  )
}

export function calcularPorcentajeLista(
  respuestas: Record<string, boolean>,
  lista: ListaCotejoTemplate
): number {
  if (lista.puntajeMaximo <= 0) return 0
  return Math.round((calcularPuntajeLista(respuestas, lista) / lista.puntajeMaximo) * 100)
}

export function calcularNotaLista(puntaje: number, puntajeMax: number, exigencia = 0.6): number {
  if (puntajeMax <= 0) return 1.0
  const porcentaje = Math.min(1, Math.max(0, puntaje / puntajeMax))
  const exigenciaNormalizada = Math.min(0.95, Math.max(0.05, exigencia))
  const nota = porcentaje < exigenciaNormalizada
    ? 1 + (3 * porcentaje) / exigenciaNormalizada
    : 4 + (3 * (porcentaje - exigenciaNormalizada)) / (1 - exigenciaNormalizada)
  return Math.round(Math.min(7, Math.max(1, nota)) * 10) / 10
}

function completadoLista(
  respuestas: Record<string, boolean>,
  lista: ListaCotejoTemplate
): boolean {
  const ids = getIndicadoresLista(lista).map(indicador => indicador.id)
  return ids.length > 0 && ids.every(id => typeof respuestas[id] === "boolean")
}

export function recalcularEstudianteLista(
  estudiante: EstudianteListaCotejo,
  lista: ListaCotejoTemplate
): EstudianteListaCotejo {
  const puntaje = calcularPuntajeLista(estudiante.respuestas, lista)
  const porcentaje = calcularPorcentajeLista(estudiante.respuestas, lista)
  const nota = calcularNotaLista(puntaje, lista.puntajeMaximo, estudiante.hasPie ? 0.5 : 0.6)
  return {
    ...estudiante,
    puntaje,
    porcentaje,
    nota,
    completado: completadoLista(estudiante.respuestas, lista),
  }
}

function crearEstudianteEvaluacion(alumno: Estudiante): EstudianteListaCotejo {
  return {
    estudianteId: alumno.id,
    nombre: alumno.nombre,
    hasPie: alumno.pie ?? false,
    respuestas: {},
    observaciones: "",
    completado: false,
  }
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("es")
}

export function sincronizarEstudiantesLista(
  evaluacion: ListaCotejoEvaluacion,
  alumnos: Estudiante[],
  lista: ListaCotejoTemplate
): ListaCotejoEvaluacion {
  const alumnosPorId = new Map(alumnos.map(alumno => [alumno.id, alumno]))
  const alumnosPorNombre = new Map(alumnos.map(alumno => [normalizeName(alumno.nombre), alumno]))
  const existentes = evaluacion.estudiantes.map(estudiante => {
    const alumno = alumnosPorId.get(estudiante.estudianteId) ?? alumnosPorNombre.get(normalizeName(estudiante.nombre))
    return recalcularEstudianteLista({
      ...estudiante,
      nombre: alumno?.nombre || estudiante.nombre,
      hasPie: alumno?.pie ?? estudiante.hasPie,
      respuestas: estudiante.respuestas || {},
      observaciones: estudiante.observaciones || "",
    }, lista)
  })

  const ids = new Set(existentes.map(estudiante => estudiante.estudianteId))
  const nuevos = alumnos
    .filter(alumno => !ids.has(alumno.id))
    .map(alumno => recalcularEstudianteLista(crearEstudianteEvaluacion(alumno), lista))

  return {
    ...evaluacion,
    estudiantes: [...existentes, ...nuevos],
    puntajeMaximo: lista.puntajeMaximo,
  }
}

export function nuevaListaCotejo(asignatura: string, curso: string): ListaCotejoTemplate {
  return {
    id: buildListaCotejoId(asignatura, curso),
    nombre: "",
    asignatura,
    curso,
    unidadNombre: "",
    metadatosCurriculares: metadatosListaVacios(),
    secciones: [nuevaSeccionLista(1)],
    puntajePorSi: 1,
    puntajeMaximo: 1,
  }
}

export function nuevaSeccionLista(numero: number): SeccionListaCotejo {
  return {
    id: uid("sec"),
    orden: numero,
    nombre: `Seccion ${numero}`,
    oasVinculados: [],
    indicadores: [nuevoIndicadorLista()],
  }
}

export function nuevoIndicadorLista(): IndicadorListaCotejo {
  return {
    id: uid("ind"),
    orden: 1,
    texto: "",
    oasVinculados: [],
  }
}

export function nuevaEvaluacionLista(
  lista: ListaCotejoTemplate,
  alumnos: Estudiante[] = []
): ListaCotejoEvaluacion {
  return {
    id: buildListaEvaluacionId(lista.id),
    listaId: lista.id,
    listaNombre: lista.nombre,
    asignatura: lista.asignatura,
    curso: lista.curso,
    estudiantes: alumnos.map(alumno => recalcularEstudianteLista(crearEstudianteEvaluacion(alumno), lista)),
    puntajeMaximo: lista.puntajeMaximo,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripUndefined(value: any): any {
  if (Array.isArray(value)) return value.map(stripUndefined)
  if (
    value !== null &&
    typeof value === "object" &&
    (value as any)._methodName === undefined &&
    typeof (value as any).toDate !== "function" &&
    !(value?.constructor?.name?.includes("Timestamp"))
  ) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue
      out[key] = stripUndefined(item)
    }
    return out
  }
  return value
}

export async function cargarListasCotejo(
  asignatura: string,
  curso: string
): Promise<ListaCotejoTemplate[]> {
  const snap = await getDocs(query(userCol("listas_cotejo"), orderBy("createdAt", "desc")))
  const all = snap.docs.map(documento =>
    normalizarListaCotejoTemplate({ id: documento.id, ...documento.data() } as ListaCotejoTemplate)
  )
  return all.filter(lista => lista.asignatura === asignatura && lista.curso === curso)
}

export async function cargarListaCotejo(id: string): Promise<ListaCotejoTemplate | null> {
  const snap = await getDoc(userDoc("listas_cotejo", id))
  if (!snap.exists()) return null
  return normalizarListaCotejoTemplate({ id: snap.id, ...snap.data() } as ListaCotejoTemplate)
}

export async function guardarListaCotejo(lista: ListaCotejoTemplate): Promise<void> {
  const normalizada = normalizarListaCotejoTemplate(lista)
  const { id, ...data } = normalizada
  await setDoc(userDoc("listas_cotejo", id), stripUndefined({
    ...data,
    puntajeMaximo: normalizada.puntajeMaximo,
    updatedAt: serverTimestamp(),
    createdAt: lista.createdAt ?? serverTimestamp(),
  }))
}

export async function eliminarListaCotejo(id: string): Promise<void> {
  await deleteDoc(userDoc("listas_cotejo", id))
  try {
    await deleteDoc(userDoc("listas_cotejo_evaluaciones", buildListaEvaluacionId(id)))
  } catch {
    // No importa si no existe evaluacion asociada.
  }
}

export async function cargarEvaluacionLista(
  listaId: string
): Promise<ListaCotejoEvaluacion | null> {
  const id = buildListaEvaluacionId(listaId)
  const snap = await getDoc(userDoc("listas_cotejo_evaluaciones", id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as ListaCotejoEvaluacion
}

export async function guardarEvaluacionLista(evaluacion: ListaCotejoEvaluacion): Promise<void> {
  const { id, ...data } = evaluacion
  await setDoc(userDoc("listas_cotejo_evaluaciones", id), stripUndefined({
    ...data,
    updatedAt: serverTimestamp(),
  }))
}

// ─── Sincronización con Calificaciones ────────────────────────────────────────

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

function normalizarNota(value: unknown): string {
  if (value === undefined || value === null) return ""
  const str = String(value).trim()
  if (!str) return ""
  const num = Number.parseFloat(str.replace(",", "."))
  return Number.isFinite(num) ? num.toFixed(1) : str
}

function oaIdsDesdeLista(lista: ListaCotejoTemplate): string[] {
  const ids = new Set<string>()

  if (lista.oas && lista.oas.length > 0) {
    lista.oas
      .filter(oa => oa.seleccionado)
      .forEach(oa => ids.add(oa.id))
  }

  lista.secciones.forEach(seccion => {
    seccion.oasVinculados.forEach(ref => {
      const match = ref.match(/\bOA\s*(\d+)\b/i)
      if (match) ids.add(`OA${match[1]}`)
      else if (ref.trim()) ids.add(ref.trim())
    })
  })

  return Array.from(ids)
}

export async function sincronizarListaConCalificaciones(
  lista: ListaCotejoTemplate,
  evaluacion: ListaCotejoEvaluacion,
  opciones: SincronizarCalificacionesOptions = {},
): Promise<SincronizarCalificacionesResultado> {
  const evaluacionId = buildListaEvaluacionId(lista.id)
  const calificacionesId = buildCalificacionesId(lista.asignatura, lista.curso)
  const snap = await getDoc(userDoc("calificaciones", calificacionesId))
  const data = snap.exists() ? snap.data() : {}

  const estudiantesBase: any[] = Array.isArray(data.estudiantes) ? data.estudiantes : []
  const evaluacionesBase: any[] = Array.isArray(data.evaluaciones) ? data.evaluaciones : []
  const evaluacionExistia = evaluacionesBase.some(ev => ev.id === evaluacionId)

  const notasCalculadas = new Map<string, { nombre: string; nota: string }>()
  let estudiantesSinNota = 0

  evaluacion.estudiantes.forEach(estudiante => {
    const tieneRespuestas = Object.keys(estudiante.respuestas || {}).length > 0
    if (!tieneRespuestas && !estudiante.completado) {
      estudiantesSinNota += 1
      return
    }

    const puntaje = calcularPuntajeLista(estudiante.respuestas || {}, lista)
    const nota = calcularNotaLista(puntaje, lista.puntajeMaximo, estudiante.hasPie ? 0.5 : 0.6).toFixed(1)
    notasCalculadas.set(estudiante.estudianteId, { nombre: estudiante.nombre, nota })
  })

  const estudiantesRoster = await cargarEstudiantes(lista.curso).catch(() => [])
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
    label: lista.nombre || evaluacion.listaNombre || "Lista de cotejo",
    tipo: "sumativa" as const,
    periodo: periodoActual(),
    unidadId: lista.unidadId,
    oaIds: oaIdsDesdeLista(lista),
  }

  const evaluacionesActualizadas = evaluacionExistia
    ? evaluacionesBase.map(ev => ev.id === evaluacionId ? { ...ev, ...evaluacionCalificaciones } : ev)
    : [...evaluacionesBase, evaluacionCalificaciones]

  await setDoc(userDoc("calificaciones", calificacionesId), stripUndefined({
    asignatura: lista.asignatura,
    curso: lista.curso,
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
