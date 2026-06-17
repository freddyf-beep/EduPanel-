// ═══════════════════════════════════════════════════════════════════════════
// Guías de aprendizaje (formativas)
// ─────────────────────────────────────────────────────────────────────────
// Una guía mezcla contenido didáctico (texto, imágenes, tablas, esquemas)
// con actividades intercaladas. A diferencia de una prueba, la guía
// "enseña" al alumno, no solo lo evalúa.
//
// Persistencia: `users/{uid}/guias/{id}`
// Las actividades reutilizan los tipos de ítem de pruebas para mantener
// consistencia (selección múltiple, V/F, completar, etc.) más algunas
// específicas de guías (colorear, encerrar, dibujar).
// ═══════════════════════════════════════════════════════════════════════════

import { db, auth } from "@/lib/firebase"
import {
  doc, getDoc, getDocs, setDoc, deleteDoc,
  collection, query, orderBy, serverTimestamp,
} from "firebase/firestore"
import {
  getUnidadCompleta, getUnidades,
  initOAs, mergeOAs, cargarVerUnidad,
} from "@/lib/curriculo"
import { getCurriculoNivel, normalizeKeyPart } from "@/lib/shared"
import type { BloqueContenido, MetadatosCurricularesEval, OAEditado } from "@/lib/evaluaciones-tipos"
import { metadatosCurricularesVaciosEval, stripUndefined } from "@/lib/evaluaciones-tipos"

// ─── Helpers Firestore ──────────────────────────────────────────────────────

function getUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}
function userDoc(col: string, id: string) { return doc(db, "users", getUid(), col, id) }
function userCol(col: string) { return collection(db, "users", getUid(), col) }

// ─── Tipos de actividad propios de guías ──────────────────────────────────

export type TipoActividadGuia =
  | "seleccion_multiple"
  | "verdadero_falso"
  | "completar"
  | "respuesta_corta"
  | "ordenar"
  | "pareados"
  | "encerrar"      // "Encierra los alimentos saludables"
  | "marcar"        // "Marca con X los..."
  | "colorear"      // "Colorea los..."
  | "dibujar"       // "Dibuja en este recuadro..."
  | "investigar"    // Tareas de investigación
  | "sopa_letras"   // Sopa de letras (texto descriptivo)
  | "abierta"       // cualquier otro tipo

export interface ActividadGuia {
  id: string
  tipo: TipoActividadGuia
  /** Numeración dentro de la sección (ej: "1.", "2."). Se calcula automático. */
  numero?: number
  enunciado: string
  /** Puntaje opcional (las guías pueden ser sin nota) */
  puntaje?: number
  /** Recursos visuales asociados */
  recursos?: BloqueContenido[]
  /** Datos específicos según tipo */
  datos?: ActividadGuiaData
  /** OA vinculado opcional */
  oaVinculado?: string
}

export type ActividadGuiaData =
  | { tipo: "seleccion_multiple"; alternativas: Array<{ id: string; texto: string; correcta?: boolean; imagenUrl?: string }> }
  | { tipo: "verdadero_falso"; afirmaciones: Array<{ id: string; texto: string; correcta: boolean }> }
  | { tipo: "completar"; texto: string; respuestas: string[]; banco?: string[] }
  | { tipo: "respuesta_corta"; lineas: number; respuestaSugerida?: string }
  | { tipo: "ordenar"; pasos: Array<{ id: string; texto: string; numeroCorrecto: number }> }
  | { tipo: "pareados"; columnaA: Array<{ id: string; texto: string }>; columnaB: Array<{ id: string; texto: string; pareCon: string }> }
  | { tipo: "encerrar"; opciones: Array<{ id: string; texto: string; imagenUrl?: string; correcta?: boolean }> }
  | { tipo: "marcar"; opciones: Array<{ id: string; texto: string; imagenUrl?: string; correcta?: boolean }> }
  | { tipo: "colorear"; instruccion: string; imagenUrl?: string }
  | { tipo: "dibujar"; instruccion: string; alturaCm?: number }
  | { tipo: "investigar"; instruccion: string; lineasRespuesta?: number }
  | { tipo: "sopa_letras"; palabras: string[]; tamañoCuadro?: number }
  | { tipo: "abierta"; lineasRespuesta?: number }

// ─── Sección de la guía ────────────────────────────────────────────────────

export interface SeccionGuia {
  id: string
  orden: number
  /** Título de la sección. Ej: "I. La alimentación" */
  titulo: string
  /** Descripción/objetivo opcional de la sección */
  descripcion?: string
  /** Bloques de contenido didáctico (texto explicativo, imágenes, tablas) */
  contenido: BloqueContenido[]
  /** Actividades de esta sección */
  actividades: ActividadGuia[]
}

// ─── Plantilla de Guía ────────────────────────────────────────────────────

export interface GuiaTemplate {
  id: string
  nombre: string
  asignatura: string
  curso: string
  unidadId?: string
  unidadNombre?: string
  numeroGuia?: string  // "Guía N°1", "Guía N°II"

  /** Datos del docente */
  docenteNombre?: string

  /** Tipo de guía: aprendizaje (didáctica), refuerzo, ejercitación, evaluación formativa */
  tipoGuia?: "aprendizaje" | "refuerzo" | "ejercitacion" | "evaluacion_formativa"

  /** Tiempo estimado en minutos */
  tiempoMinutos?: number

  /** Objetivo de la guía (lo que el alumno debe lograr) */
  objetivo: string

  /** Instrucciones generales para el alumno */
  instrucciones: string[]

  /** Metadatos curriculares vinculados */
  metadatosCurriculares?: MetadatosCurricularesEval
  oas?: OAEditado[]

  /** Secciones */
  secciones: SeccionGuia[]

  /** Cierre / reflexión final (autoevaluación, metacognición) */
  cierre?: BloqueContenido[]

  /** Puntaje total si la guía suma (opcional) */
  puntajeMaximo?: number

  estado?: "borrador" | "lista" | "archivada"

  createdAt?: unknown
  updatedAt?: unknown
}

// ─── Normalización ────────────────────────────────────────────────────────

function sortByOrder<T extends { orden?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aO = typeof a.orden === "number" ? a.orden : Number.MAX_SAFE_INTEGER
    const bO = typeof b.orden === "number" ? b.orden : Number.MAX_SAFE_INTEGER
    return aO - bO
  })
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => typeof item === "string" ? item.trim() : "")
    .filter(Boolean)
}

function normalizeMetadatos(v?: MetadatosCurricularesEval): MetadatosCurricularesEval {
  return {
    objetivos: normalizeStringList(v?.objetivos),
    indicadores: normalizeStringList(v?.indicadores),
    objetivosTransversales: normalizeStringList(v?.objetivosTransversales),
  }
}

export function calcularPuntajeMaximoGuia(secciones: SeccionGuia[]): number {
  return secciones.reduce((acc, sec) =>
    acc + sec.actividades.reduce((a, act) => a + (act.puntaje || 0), 0)
  , 0)
}

export function normalizarGuia(guia: GuiaTemplate): GuiaTemplate {
  const secciones = sortByOrder(guia.secciones || []).map((sec, i) => ({
    ...sec,
    orden: i + 1,
    titulo: sec.titulo?.trim() || `Sección ${i + 1}`,
    contenido: sec.contenido || [],
    actividades: (sec.actividades || []).map((act, j) => ({ ...act, numero: j + 1 })),
  }))

  return {
    ...guia,
    metadatosCurriculares: normalizeMetadatos(guia.metadatosCurriculares),
    instrucciones: normalizeStringList(guia.instrucciones),
    secciones,
    puntajeMaximo: calcularPuntajeMaximoGuia(secciones),
  }
}

// ─── IDs ──────────────────────────────────────────────────────────────────

export function buildGuiaId(asignatura: string, curso: string): string {
  return `guia_${normalizeKeyPart(asignatura)}_${normalizeKeyPart(curso)}_${Date.now()}`
}

export function nuevoIdGuia(prefix = "g"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ─── Resolución curricular ────────────────────────────────────────────────

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

function mergeUnique(target: string[], values: string[]) {
  values.forEach(value => {
    const limpio = value.trim()
    if (limpio && !target.includes(limpio)) target.push(limpio)
  })
}

export interface ResolucionCurricularGuia {
  metadatosCurriculares: MetadatosCurricularesEval
  unidadId?: string
  unidadNombre?: string
  resolvedFromDatabase: boolean
}

export async function resolverMetadatosCurricularesGuia(
  guia: Pick<GuiaTemplate, "asignatura" | "curso" | "unidadNombre" | "metadatosCurriculares">
): Promise<ResolucionCurricularGuia> {
  const fallback = normalizeMetadatos(guia.metadatosCurriculares)
  const nivel = await getCurriculoNivel(guia.curso, guia.asignatura)
  const unidades = await getUnidades(guia.asignatura, nivel)
  if (!unidades.length) return { metadatosCurriculares: fallback, resolvedFromDatabase: false }

  const numero = extraerNumeroUnidad(guia.unidadNombre)
  const comp = guia.unidadNombre ? normalizeCompareText(guia.unidadNombre) : ""

  const match = unidades.find(u => {
    if (numero !== null && u.numero_unidad === numero) return true
    const nc = normalizeCompareText(u.nombre_unidad || "")
    return !!comp && (nc === comp || nc.includes(comp) || comp.includes(nc))
  })

  if (!match) return { metadatosCurriculares: fallback, resolvedFromDatabase: false }

  const completa = await getUnidadCompleta(guia.asignatura, nivel, match.id)
  if (!completa) return { metadatosCurriculares: fallback, resolvedFromDatabase: false }

  const objetivos: string[] = []
  const indicadores: string[] = []
  const objetivosTransversales: string[] = []

  ;(completa.objetivos_aprendizaje || []).forEach(oa => {
    const desc = oa.descripcion?.trim()
    const isOAT = String(oa.tipo || "").toUpperCase() === "OAT"
    if (desc) {
      const t = `${isOAT ? "OAA" : "OA"} ${oa.numero}: ${desc}`
      if (isOAT) objetivosTransversales.push(t)
      else objetivos.push(t)
    }
    if (!isOAT) mergeUnique(indicadores, (oa.indicadores || []).map(i => i.trim()).filter(Boolean))
  })

  return {
    metadatosCurriculares: {
      objetivos: objetivos.length ? objetivos : fallback.objetivos,
      indicadores: indicadores.length ? indicadores : fallback.indicadores,
      objetivosTransversales: objetivosTransversales.length ? objetivosTransversales : fallback.objetivosTransversales,
    },
    unidadId: completa.id,
    unidadNombre: completa.nombre_unidad || guia.unidadNombre,
    resolvedFromDatabase: true,
  }
}

export async function cargarOAsParaGuia(
  asignatura: string,
  curso: string,
  unidadId: string,
  oasExistentes?: OAEditado[]
): Promise<OAEditado[]> {
  const nivel = await getCurriculoNivel(curso, asignatura)
  const unidad = await getUnidadCompleta(asignatura, nivel, unidadId)
  if (!unidad) return oasExistentes ?? []

  const base = initOAs(unidad, asignatura)
  let verUnidadOas: OAEditado[] = []
  try {
    const guardada = await cargarVerUnidad(asignatura, curso, unidadId)
    verUnidadOas = guardada?.oas ?? []
  } catch {}

  const merged = mergeOAs(base, verUnidadOas)
  if (oasExistentes && oasExistentes.length > 0) return mergeOAs(merged, oasExistentes)
  return merged
}

// ─── Persistencia ────────────────────────────────────────────────────────

export async function cargarGuias(asignatura: string, curso: string): Promise<GuiaTemplate[]> {
  const col = userCol("guias")
  const snap = await getDocs(query(col, orderBy("createdAt", "desc")))
  const all = snap.docs.map(d => normalizarGuia({ id: d.id, ...d.data() } as GuiaTemplate))
  return all.filter(g => g.asignatura === asignatura && g.curso === curso)
}

export async function cargarGuia(id: string): Promise<GuiaTemplate | null> {
  const snap = await getDoc(userDoc("guias", id))
  if (!snap.exists()) return null
  return normalizarGuia({ id: snap.id, ...snap.data() } as GuiaTemplate)
}

export async function guardarGuia(guia: GuiaTemplate): Promise<void> {
  const norm = normalizarGuia(guia)
  const { id, ...data } = norm
  const payload = stripUndefined({
    ...data,
    puntajeMaximo: norm.puntajeMaximo,
    updatedAt: serverTimestamp(),
    createdAt: guia.createdAt ?? serverTimestamp(),
  })
  await setDoc(userDoc("guias", id), payload)
}

export async function eliminarGuia(id: string): Promise<void> {
  await deleteDoc(userDoc("guias", id))
}

export async function duplicarGuia(guia: GuiaTemplate): Promise<GuiaTemplate> {
  const nuevaId = buildGuiaId(guia.asignatura, guia.curso)
  const copia: GuiaTemplate = {
    ...guia,
    id: nuevaId,
    nombre: `${guia.nombre || "Guía"} (copia)`,
    estado: "borrador",
    createdAt: undefined,
    updatedAt: undefined,
    secciones: guia.secciones.map(sec => ({
      ...sec,
      id: nuevoIdGuia("sec"),
      actividades: sec.actividades.map(act => ({ ...act, id: nuevoIdGuia(act.tipo) })),
    })),
  }
  await guardarGuia(copia)
  return copia
}

// ─── Plantillas vacías / fábricas ──────────────────────────────────────────

export function nuevaGuia(asignatura: string, curso: string): GuiaTemplate {
  const id = buildGuiaId(asignatura, curso)
  return {
    id,
    nombre: "",
    asignatura,
    curso,
    tipoGuia: "aprendizaje",
    tiempoMinutos: 45,
    objetivo: "",
    instrucciones: [
      "Lee atentamente el contenido y desarrolla cada actividad.",
      "Responde con letra clara y ordenada.",
      "Si tienes dudas, consulta al profesor.",
    ],
    metadatosCurriculares: metadatosCurricularesVaciosEval(),
    secciones: [],
    cierre: [],
    puntajeMaximo: 0,
    estado: "borrador",
  }
}

export function nuevaSeccionGuia(orden: number): SeccionGuia {
  return {
    id: nuevoIdGuia("sec"),
    orden,
    titulo: `Sección ${orden}`,
    descripcion: "",
    contenido: [],
    actividades: [],
  }
}

export function nuevaActividadGuia(tipo: TipoActividadGuia, puntaje?: number): ActividadGuia {
  const base: ActividadGuia = {
    id: nuevoIdGuia(tipo),
    tipo,
    enunciado: "",
    puntaje,
    recursos: [],
  }

  switch (tipo) {
    case "seleccion_multiple":
      return {
        ...base,
        datos: {
          tipo,
          alternativas: [
            { id: nuevoIdGuia("a"), texto: "" },
            { id: nuevoIdGuia("a"), texto: "" },
            { id: nuevoIdGuia("a"), texto: "" },
            { id: nuevoIdGuia("a"), texto: "" },
          ],
        },
      }
    case "verdadero_falso":
      return {
        ...base,
        datos: { tipo, afirmaciones: [
          { id: nuevoIdGuia("af"), texto: "", correcta: true },
          { id: nuevoIdGuia("af"), texto: "", correcta: false },
        ] },
      }
    case "completar":
      return { ...base, datos: { tipo, texto: "", respuestas: [] } }
    case "respuesta_corta":
      return { ...base, datos: { tipo, lineas: 2 } }
    case "ordenar":
      return {
        ...base,
        datos: { tipo, pasos: [
          { id: nuevoIdGuia("p"), texto: "", numeroCorrecto: 1 },
          { id: nuevoIdGuia("p"), texto: "", numeroCorrecto: 2 },
          { id: nuevoIdGuia("p"), texto: "", numeroCorrecto: 3 },
        ] },
      }
    case "pareados":
      return {
        ...base,
        datos: { tipo,
          columnaA: [
            { id: nuevoIdGuia("a"), texto: "" },
            { id: nuevoIdGuia("a"), texto: "" },
          ],
          columnaB: [
            { id: nuevoIdGuia("b"), texto: "", pareCon: "" },
            { id: nuevoIdGuia("b"), texto: "", pareCon: "" },
          ],
        },
      }
    case "encerrar":
    case "marcar":
      return {
        ...base,
        datos: { tipo, opciones: [
          { id: nuevoIdGuia("o"), texto: "" },
          { id: nuevoIdGuia("o"), texto: "" },
          { id: nuevoIdGuia("o"), texto: "" },
        ] },
      }
    case "colorear":
      return { ...base, datos: { tipo, instruccion: "" } }
    case "dibujar":
      return { ...base, datos: { tipo, instruccion: "", alturaCm: 8 } }
    case "investigar":
      return { ...base, datos: { tipo, instruccion: "", lineasRespuesta: 4 } }
    case "sopa_letras":
      return { ...base, datos: { tipo, palabras: [], tamañoCuadro: 12 } }
    case "abierta":
    default:
      return { ...base, datos: { tipo: "abierta", lineasRespuesta: 4 } }
  }
}
