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

import { getDoc, getDocs, setDoc, deleteDoc, query, orderBy, serverTimestamp } from "firebase/firestore"
import { normalizeKeyPart } from "@/lib/shared"
import type { BloqueContenido, MetadatosCurricularesEval, OAEditado } from "@/lib/evaluaciones-tipos"
import {
  cargarOAsParaDocumento,
  metadatosCurricularesVaciosEval,
  normalizeMetadatos,
  normalizeStringList,
  resolverMetadatosCurriculares,
  sortByOrder,
  stripUndefined,
  userCol,
  userDoc,
  type ResolucionCurricular,
} from "@/lib/edu-doc"

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

// ─── Resolución curricular (delegada a lib/edu-doc) ────────────────────────
// Mantenemos los nombres específicos de Guías para preservar la API pública.

export type { ResolucionCurricular }

export async function resolverMetadatosCurricularesGuia(
  guia: Pick<GuiaTemplate, "asignatura" | "curso" | "unidadNombre" | "metadatosCurriculares">
): Promise<ResolucionCurricular> {
  return resolverMetadatosCurriculares(guia)
}

export async function cargarOAsParaGuia(
  asignatura: string,
  curso: string,
  unidadId: string,
  oasExistentes?: OAEditado[]
): Promise<OAEditado[]> {
  return cargarOAsParaDocumento(asignatura, curso, unidadId, oasExistentes)
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
