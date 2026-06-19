// ═══════════════════════════════════════════════════════════════════════════
// Pruebas escritas (evaluaciones sumativas)
// ─────────────────────────────────────────────────────────────────────────
// Modelo, persistencia en Firestore y utilidades de cálculo.
//
// Estructura inspirada en pruebas reales del colegio (ítems con tipos
// diferentes: selección múltiple, V/F, pareados, ordenar, completar,
// desarrollo, lectura comprensiva).
//
// Cada prueba se persiste en `users/{uid}/pruebas/{id}` y sus aplicaciones
// (resultados por estudiante) en `users/{uid}/pruebas_aplicaciones/{evalId}`.
// ═══════════════════════════════════════════════════════════════════════════

import { db, auth } from "@/lib/firebase"
import {
  doc, getDoc, getDocs, setDoc, deleteDoc,
  collection, query, orderBy, serverTimestamp,
} from "firebase/firestore"
import {
  getUnidadCompleta, getUnidades,
  initOAs, mergeOAs,
  resolverUnidadIdsCurriculares, cargarVerUnidadConFallback,
} from "@/lib/curriculo"
import { cargarEstudiantes } from "@/lib/estudiantes"
import { getCurriculoNivel, normalizeKeyPart } from "@/lib/shared"
import type { BloqueContenido, MetadatosCurricularesEval, OAEditado } from "@/lib/evaluaciones-tipos"
import { metadatosCurricularesVaciosEval, stripUndefined } from "@/lib/evaluaciones-tipos"

// ─── Helpers Firestore ──────────────────────────────────────────────────────

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

// ─── Tipos de ítem ──────────────────────────────────────────────────────────

export type TipoItem =
  | "seleccion_multiple"
  | "verdadero_falso"
  | "pareados"
  | "ordenar"
  | "completar"
  | "respuesta_corta"
  | "desarrollo"

/** Una alternativa de selección múltiple */
export interface AlternativaSM {
  id: string
  texto: string
  esCorrecta: boolean
  /** Imagen opcional para alternativa visual (ej. instrumentos, figuras) */
  imagenUrl?: string
  imagenStoragePath?: string
}

export interface ItemSeleccionMultiple {
  id: string
  tipo: "seleccion_multiple"
  enunciado: string
  alternativas: AlternativaSM[]
  /** Bloques de contenido visual asociados al ítem (imágenes inline) */
  recursos?: BloqueContenido[]
  puntaje: number
  oaVinculado?: string
  habilidad?: "recordar" | "comprender" | "aplicar" | "analizar" | "evaluar" | "crear"
}

export interface ItemVerdaderoFalso {
  id: string
  tipo: "verdadero_falso"
  enunciado: string
  respuestaCorrecta: boolean
  /** Si true, el alumno debe justificar las falsas */
  pideJustificacion?: boolean
  recursos?: BloqueContenido[]
  puntaje: number
  oaVinculado?: string
}

export interface ItemPareados {
  id: string
  tipo: "pareados"
  enunciado: string
  /** Columna A: ítems numerados */
  columnaA: Array<{ id: string; texto: string; imagenUrl?: string }>
  /** Columna B: respuestas con letras (a, b, c, ...). El campo correctaParaAId
   *  indica el id de columnaA al que esta respuesta corresponde. */
  columnaB: Array<{ id: string; texto: string; correctaParaAId: string }>
  recursos?: BloqueContenido[]
  /** Puntaje total del ítem (se reparte equitativamente entre los pares) */
  puntaje: number
  oaVinculado?: string
}

export interface ItemOrdenar {
  id: string
  tipo: "ordenar"
  enunciado: string
  /** Pasos en el orden correcto */
  pasos: Array<{ id: string; texto: string }>
  recursos?: BloqueContenido[]
  puntaje: number
  oaVinculado?: string
}

export interface ItemCompletar {
  id: string
  tipo: "completar"
  enunciado: string
  /** Texto con __ donde el alumno debe completar. Las respuestas correctas
   *  van en `respuestas[]` en el orden en que aparecen los espacios. */
  textoConBlancos: string
  respuestas: string[]
  /** Banco opcional de palabras para que el alumno escoja */
  bancoPalabras?: string[]
  recursos?: BloqueContenido[]
  puntaje: number
  oaVinculado?: string
}

export interface ItemRespuestaCorta {
  id: string
  tipo: "respuesta_corta"
  enunciado: string
  /** Respuesta esperada (referencia para corrección manual) */
  respuestaEsperada?: string
  recursos?: BloqueContenido[]
  /** Líneas a mostrar en la prueba impresa */
  lineasRespuesta?: number
  puntaje: number
  oaVinculado?: string
}

export interface ItemDesarrollo {
  id: string
  tipo: "desarrollo"
  enunciado: string
  /** Pauta de corrección sugerida para el docente */
  pautaCorreccion?: string
  /** Criterios opcionales: cada criterio suma al puntaje total del ítem */
  criterios?: Array<{ id: string; texto: string; puntaje: number }>
  recursos?: BloqueContenido[]
  /** Líneas a mostrar en la prueba impresa */
  lineasRespuesta?: number
  puntaje: number
  oaVinculado?: string
}

export type ItemPrueba =
  | ItemSeleccionMultiple
  | ItemVerdaderoFalso
  | ItemPareados
  | ItemOrdenar
  | ItemCompletar
  | ItemRespuestaCorta
  | ItemDesarrollo

// ─── Sección de prueba ──────────────────────────────────────────────────────

export interface SeccionPrueba {
  id: string
  /** Numero romano automático (I, II, III...) */
  orden: number
  /** Título de la sección. Si vacío, se usa "Ítem {orden}: {tipo}" */
  titulo: string
  /** Instrucciones específicas de la sección */
  instrucciones: string
  /** Recursos visuales/textuales antes de las preguntas (lectura comprensiva, afiches, etc.) */
  estimulo?: BloqueContenido[]
  /** Tipo predominante (puede ser "mixto") */
  tipoPredominante?: TipoItem | "mixto"
  items: ItemPrueba[]
}

export interface AdecuacionPiePrueba {
  id: string
  nombre: string
  estudianteId?: string
  estudianteNombre?: string
  diagnostico: string
  notasAdecuacion: string
  instruccionesGenerales: string[]
  secciones: SeccionPrueba[]
  createdAt?: unknown
  updatedAt?: unknown
}

// ─── Plantilla de Prueba ────────────────────────────────────────────────────

export interface PruebaTemplate {
  id: string
  nombre: string
  asignatura: string
  curso: string
  unidadId?: string
  unidadNombre?: string

  /** Datos del docente */
  docenteNombre?: string

  /** Tipo de evaluación: sumativa, formativa, diagnóstica */
  tipoEvaluacion?: "sumativa" | "formativa" | "diagnostica"
  /** Ponderación porcentual sobre la nota del semestre/trimestre */
  ponderacion?: number
  /** Tiempo estimado en minutos */
  tiempoMinutos?: number
  /** Exigencia (default 0.6 → 60%) */
  exigencia?: number

  /** Instrucciones generales */
  instruccionesGenerales: string[]

  /** OA y metadatos curriculares */
  metadatosCurriculares?: MetadatosCurricularesEval
  oas?: OAEditado[]

  /** Secciones con preguntas */
  secciones: SeccionPrueba[]
  adaptacionesPie?: AdecuacionPiePrueba[]

  /** Puntaje máximo calculado */
  puntajeMaximo: number

  /** Estado del documento */
  estado?: "borrador" | "lista" | "aplicada" | "archivada"
  bloqueada?: boolean

  createdAt?: unknown
  updatedAt?: unknown
}

// ─── Resultados (aplicación de la prueba) ───────────────────────────────────

/** Respuesta de un alumno a un ítem. La forma depende del tipo. */
export type RespuestaAlumno =
  | { tipo: "seleccion_multiple"; alternativaId: string }
  | { tipo: "verdadero_falso"; valor: boolean; justificacion?: string }
  | { tipo: "pareados"; emparejamientos: Record<string, string> /* aId -> bId */ }
  | { tipo: "ordenar"; orden: string[] /* ids de pasos en el orden del alumno */ }
  | { tipo: "completar"; respuestas: string[] }
  | { tipo: "respuesta_corta"; texto: string; puntajeManual?: number }
  | { tipo: "desarrollo"; texto: string; puntajePorCriterio?: Record<string, number>; puntajeManual?: number }

export interface ResultadoEstudiantePrueba {
  estudianteId: string
  nombre: string
  hasPie: boolean
  /** itemId → respuesta */
  respuestas: Record<string, RespuestaAlumno>
  /** itemId → puntaje obtenido (calculado) */
  puntajePorItem: Record<string, number>
  /** Puntaje total */
  puntajeTotal: number
  nota?: number
  observaciones?: string
  completado: boolean
  ausente?: boolean
}

export interface AplicacionPrueba {
  id: string
  pruebaId: string
  pruebaNombre: string
  asignatura: string
  curso: string
  fechaAplicacion?: string  // ISO date
  resultados: ResultadoEstudiantePrueba[]
  bloqueada?: boolean
  bloqueadaEn?: unknown
  updatedAt?: unknown
}

// ─── Helpers de normalización ───────────────────────────────────────────────

function sortByOrder<T extends { orden?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aOrden = typeof a.orden === "number" ? a.orden : Number.MAX_SAFE_INTEGER
    const bOrden = typeof b.orden === "number" ? b.orden : Number.MAX_SAFE_INTEGER
    return aOrden - bOrden
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

function calcularPuntajeMaximoSeccion(seccion: SeccionPrueba): number {
  return seccion.items.reduce((acc, item) => acc + (item.puntaje || 0), 0)
}

export function calcularPuntajeMaximoPrueba(secciones: SeccionPrueba[]): number {
  return secciones.reduce((acc, sec) => acc + calcularPuntajeMaximoSeccion(sec), 0)
}

function normalizeSeccionesPrueba(secciones: SeccionPrueba[] | undefined): SeccionPrueba[] {
  return sortByOrder(secciones || []).map((sec, index) => ({
    ...sec,
    orden: index + 1,
    instrucciones: sec.instrucciones?.trim() || "",
    titulo: sec.titulo?.trim() || `Ítem ${romano(index + 1)}`,
    items: (sec.items || []).map(it => normalizeItem(it)),
  }))
}

function normalizeAdaptacionesPie(value: unknown): AdecuacionPiePrueba[] | undefined {
  if (!Array.isArray(value)) return undefined
  const adaptaciones = value
    .filter((raw): raw is Partial<AdecuacionPiePrueba> => !!raw && typeof raw === "object")
    .map((raw, index) => ({
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id : `pie_${index + 1}`,
      nombre: typeof raw.nombre === "string" && raw.nombre.trim() ? raw.nombre.trim() : `Adecuación PIE ${index + 1}`,
      estudianteId: typeof raw.estudianteId === "string" && raw.estudianteId.trim() ? raw.estudianteId : undefined,
      estudianteNombre: typeof raw.estudianteNombre === "string" && raw.estudianteNombre.trim() ? raw.estudianteNombre.trim() : undefined,
      diagnostico: typeof raw.diagnostico === "string" ? raw.diagnostico.trim() : "",
      notasAdecuacion: typeof raw.notasAdecuacion === "string" ? raw.notasAdecuacion.trim() : "",
      instruccionesGenerales: normalizeStringList(raw.instruccionesGenerales),
      secciones: normalizeSeccionesPrueba(raw.secciones),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    }))
  return adaptaciones.length ? adaptaciones : undefined
}

export function normalizarPrueba(prueba: PruebaTemplate): PruebaTemplate {
  const seccionesOrdenadas = normalizeSeccionesPrueba(prueba.secciones)

  return {
    ...prueba,
    metadatosCurriculares: normalizeMetadatos(prueba.metadatosCurriculares),
    instruccionesGenerales: normalizeStringList(prueba.instruccionesGenerales),
    secciones: seccionesOrdenadas,
    adaptacionesPie: normalizeAdaptacionesPie(prueba.adaptacionesPie),
    puntajeMaximo: calcularPuntajeMaximoPrueba(seccionesOrdenadas),
    exigencia: typeof prueba.exigencia === "number" ? prueba.exigencia : 0.6,
  }
}

function normalizeItem(item: ItemPrueba): ItemPrueba {
  // Asegurar puntaje >= 0
  const puntaje = Math.max(0, Number(item.puntaje) || 0)
  return { ...item, puntaje }
}

// ─── Numeración romana para títulos de sección ─────────────────────────────

export function romano(n: number): string {
  if (n <= 0 || n > 39) return String(n)
  const map: Array<[number, string]> = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ]
  let result = ""
  let value = n
  for (const [num, sym] of map) {
    while (value >= num) {
      result += sym
      value -= num
    }
  }
  return result
}

// ─── IDs ────────────────────────────────────────────────────────────────────

export function buildPruebaId(asignatura: string, curso: string): string {
  return `prueba_${normalizeKeyPart(asignatura)}_${normalizeKeyPart(curso)}_${Date.now()}`
}

export function buildAplicacionId(pruebaId: string): string {
  return `apl_${pruebaId}`
}

export function nuevoItemId(prefix = "it"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ─── Resolución curricular (similar a rúbricas) ────────────────────────────

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

export interface ResolucionCurricular {
  metadatosCurriculares: MetadatosCurricularesEval
  unidadId?: string
  unidadNombre?: string
  resolvedFromDatabase: boolean
}

export async function resolverMetadatosCurricularesPrueba(
  prueba: Pick<PruebaTemplate, "asignatura" | "curso" | "unidadNombre" | "metadatosCurriculares">
): Promise<ResolucionCurricular> {
  const fallback = normalizeMetadatos(prueba.metadatosCurriculares)
  const nivel = await getCurriculoNivel(prueba.curso, prueba.asignatura)
  const unidades = await getUnidades(prueba.asignatura, nivel)
  if (!unidades.length) {
    return { metadatosCurriculares: fallback, resolvedFromDatabase: false }
  }

  const unidadNumero = extraerNumeroUnidad(prueba.unidadNombre)
  const unidadNombreComp = prueba.unidadNombre ? normalizeCompareText(prueba.unidadNombre) : ""

  const match = unidades.find(unidad => {
    if (unidadNumero !== null && unidad.numero_unidad === unidadNumero) return true
    const nombreComp = normalizeCompareText(unidad.nombre_unidad || "")
    return !!unidadNombreComp && (
      nombreComp === unidadNombreComp ||
      nombreComp.includes(unidadNombreComp) ||
      unidadNombreComp.includes(nombreComp)
    )
  })

  if (!match) return { metadatosCurriculares: fallback, resolvedFromDatabase: false }

  const completa = await getUnidadCompleta(prueba.asignatura, nivel, match.id)
  if (!completa) return { metadatosCurriculares: fallback, resolvedFromDatabase: false }

  const objetivos: string[] = []
  const indicadores: string[] = []
  const objetivosTransversales: string[] = []

  ;(completa.objetivos_aprendizaje || []).forEach(oa => {
    const descripcion = oa.descripcion?.trim()
    const isOAT = String(oa.tipo || "").toUpperCase() === "OAT"

    if (descripcion) {
      const texto = `${isOAT ? "OAA" : "OA"} ${oa.numero}: ${descripcion}`
      if (isOAT) objetivosTransversales.push(texto)
      else objetivos.push(texto)
    }

    if (!isOAT) {
      mergeUnique(indicadores, (oa.indicadores || []).map(i => i.trim()).filter(Boolean))
    }
  })

  return {
    metadatosCurriculares: {
      objetivos: objetivos.length ? objetivos : fallback.objetivos,
      indicadores: indicadores.length ? indicadores : fallback.indicadores,
      objetivosTransversales: objetivosTransversales.length ? objetivosTransversales : fallback.objetivosTransversales,
    },
    unidadId: completa.id,
    unidadNombre: completa.nombre_unidad || prueba.unidadNombre,
    resolvedFromDatabase: true,
  }
}

export async function cargarOAsParaPrueba(
  asignatura: string,
  curso: string,
  unidadId: string,
  oasExistentes?: OAEditado[]
): Promise<OAEditado[]> {
  const nivel = await getCurriculoNivel(curso, asignatura)
  const unidadIds = await resolverUnidadIdsCurriculares(asignatura, curso, unidadId)
  const unidad = await getUnidadCompleta(asignatura, nivel, unidadIds.unidadCurricularId)
  if (!unidad) return oasExistentes ?? []

  const base = initOAs(unidad, asignatura)
  let verUnidadOas: OAEditado[] = []
  try {
    const guardada = await cargarVerUnidadConFallback(asignatura, curso, unidadIds)
    verUnidadOas = guardada?.oas ?? []
  } catch {}

  const merged = mergeOAs(base, verUnidadOas)
  if (oasExistentes && oasExistentes.length > 0) {
    return mergeOAs(merged, oasExistentes)
  }
  return merged
}

// ─── Cálculos de corrección ────────────────────────────────────────────────

/** Calcula el puntaje obtenido de un ítem según la respuesta del alumno */
export function calcularPuntajeItem(item: ItemPrueba, respuesta: RespuestaAlumno | undefined): number {
  if (!respuesta) return 0
  const maxScore = normalizarPuntaje(item.puntaje)

  switch (item.tipo) {
    case "seleccion_multiple": {
      if (respuesta.tipo !== "seleccion_multiple") return 0
      const correcta = item.alternativas.find(a => a.id === respuesta.alternativaId)
      return correcta?.esCorrecta ? maxScore : 0
    }
    case "verdadero_falso": {
      if (respuesta.tipo !== "verdadero_falso") return 0
      return respuesta.valor === item.respuestaCorrecta ? maxScore : 0
    }
    case "pareados": {
      if (respuesta.tipo !== "pareados") return 0
      const total = item.columnaA.length
      if (!total) return 0
      const valorPorPar = maxScore / total
      let correctos = 0
      item.columnaA.forEach(a => {
        const expected = item.columnaB.find(b => b.correctaParaAId === a.id)
        if (!expected) return
        if (respuesta.emparejamientos[a.id] === expected.id) correctos += 1
      })
      return Math.round(correctos * valorPorPar * 10) / 10
    }
    case "ordenar": {
      if (respuesta.tipo !== "ordenar") return 0
      const total = item.pasos.length
      if (!total) return 0
      // Crédito parcial: cuántos están en su posición correcta
      let correctos = 0
      item.pasos.forEach((paso, i) => {
        if (respuesta.orden[i] === paso.id) correctos += 1
      })
      const valorPorPaso = maxScore / total
      return Math.round(correctos * valorPorPaso * 10) / 10
    }
    case "completar": {
      if (respuesta.tipo !== "completar") return 0
      const total = item.respuestas.length
      if (!total) return 0
      const valorPorBlanco = maxScore / total
      let correctos = 0
      item.respuestas.forEach((esperada, i) => {
        const dada = (respuesta.respuestas[i] || "").trim().toLowerCase()
        const exp = esperada.trim().toLowerCase()
        if (dada && exp && dada === exp) correctos += 1
      })
      return Math.round(correctos * valorPorBlanco * 10) / 10
    }
    case "respuesta_corta":
    case "desarrollo": {
      if (respuesta.tipo !== item.tipo) return 0
      if (typeof respuesta.puntajeManual === "number") {
        return Math.max(0, Math.min(maxScore, normalizarPuntaje(respuesta.puntajeManual)))
      }
      // Si tiene desglose por criterios
      if (respuesta.tipo === "desarrollo" && respuesta.puntajePorCriterio && item.tipo === "desarrollo") {
        const criterios = item.criterios || []
        const total = criterios.reduce((acc, c) => {
          const v = respuesta.puntajePorCriterio?.[c.id] || 0
          return acc + Math.max(0, Math.min(normalizarPuntaje(c.puntaje), normalizarPuntaje(v)))
        }, 0)
        return Math.max(0, Math.min(maxScore, Math.round(total * 10) / 10))
      }
      return 0
    }
  }
}

export function calcularResultadoEstudiante(
  prueba: PruebaTemplate,
  resultado: ResultadoEstudiantePrueba
): ResultadoEstudiantePrueba {
  const puntajePorItem: Record<string, number> = {}
  let total = 0

  prueba.secciones.forEach(sec => {
    sec.items.forEach(item => {
      const r = resultado.respuestas[item.id]
      const puntos = calcularPuntajeItem(item, r)
      puntajePorItem[item.id] = puntos
      total += puntos
    })
  })

  const exigencia = exigenciaParaResultado(resultado, prueba.exigencia ?? 0.6)
  const nota = calcularNotaPrueba(total, prueba.puntajeMaximo, exigencia)

  return {
    ...resultado,
    puntajePorItem,
    puntajeTotal: Math.round(total * 10) / 10,
    nota,
  }
}

function exigenciaParaResultado(r: Pick<ResultadoEstudiantePrueba, "hasPie">, base: number): number {
  return r.hasPie ? Math.max(0.05, Math.min(base - 0.1, 0.5)) : base
}

/** Escala chilena 1.0–7.0 con exigencia configurable */
export function calcularNotaPrueba(puntaje: number, max: number, exigencia = 0.6): number {
  if (!Number.isFinite(max) || max <= 0) return 1.0
  const puntos = Number.isFinite(puntaje) ? puntaje : 0
  const porcentaje = Math.min(1, Math.max(0, puntos / max))
  const exigenciaBase = Number.isFinite(exigencia) ? exigencia : 0.6
  const exig = Math.min(0.95, Math.max(0.05, exigenciaBase))
  const nota = porcentaje < exig
    ? 1 + (3 * porcentaje) / exig
    : 4 + (3 * (porcentaje - exig)) / (1 - exig)
  return Math.round(Math.min(7, Math.max(1, nota)) * 10) / 10
}

// ─── Persistencia Firestore ────────────────────────────────────────────────

function normalizarPuntaje(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0
}

export async function cargarPruebas(asignatura: string, curso: string): Promise<PruebaTemplate[]> {
  const col = userCol("pruebas")
  const snap = await getDocs(query(col, orderBy("createdAt", "desc")))
  const all = snap.docs.map(d => normalizarPrueba({ id: d.id, ...d.data() } as PruebaTemplate))
  return all.filter(p => p.asignatura === asignatura && p.curso === curso)
}

export async function cargarPruebasCurso(curso: string): Promise<PruebaTemplate[]> {
  const col = userCol("pruebas")
  const snap = await getDocs(query(col, orderBy("createdAt", "desc")))
  const all = snap.docs.map(d => normalizarPrueba({ id: d.id, ...d.data() } as PruebaTemplate))
  return all.filter(p => p.curso === curso)
}

export async function cargarPrueba(id: string): Promise<PruebaTemplate | null> {
  const snap = await getDoc(userDoc("pruebas", id))
  if (!snap.exists()) return null
  return normalizarPrueba({ id: snap.id, ...snap.data() } as PruebaTemplate)
}

export async function guardarPrueba(prueba: PruebaTemplate): Promise<void> {
  const norm = normalizarPrueba(prueba)
  const { id, ...data } = norm
  const payload = stripUndefined({
    ...data,
    puntajeMaximo: norm.puntajeMaximo,
    updatedAt: serverTimestamp(),
    createdAt: prueba.createdAt ?? serverTimestamp(),
  })
  await setDoc(userDoc("pruebas", id), payload)
}

export async function eliminarPrueba(id: string): Promise<void> {
  await deleteDoc(userDoc("pruebas", id))
  try { await deleteDoc(userDoc("pruebas_aplicaciones", buildAplicacionId(id))) } catch {}
}

export async function cargarAplicacion(pruebaId: string): Promise<AplicacionPrueba | null> {
  const id = buildAplicacionId(pruebaId)
  const snap = await getDoc(userDoc("pruebas_aplicaciones", id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as AplicacionPrueba
}

export async function guardarAplicacion(aplicacion: AplicacionPrueba): Promise<void> {
  const { id, ...data } = aplicacion
  await setDoc(userDoc("pruebas_aplicaciones", id), stripUndefined({
    ...data,
    updatedAt: serverTimestamp(),
  }))
}

export async function duplicarPrueba(prueba: PruebaTemplate): Promise<PruebaTemplate> {
  const nuevaId = buildPruebaId(prueba.asignatura, prueba.curso)
  const copia: PruebaTemplate = {
    ...prueba,
    id: nuevaId,
    nombre: `${prueba.nombre || "Prueba"} (copia)`,
    estado: "borrador",
    bloqueada: false,
    createdAt: undefined,
    updatedAt: undefined,
    secciones: prueba.secciones.map(sec => ({
      ...sec,
      id: nuevoItemId("sec"),
      items: sec.items.map(it => ({ ...it, id: nuevoItemId(it.tipo) })) as ItemPrueba[],
    })),
  }
  await guardarPrueba(copia)
  return copia
}

// ─── Plantillas vacías / fábricas ──────────────────────────────────────────

export function nuevaPrueba(asignatura: string, curso: string): PruebaTemplate {
  const id = buildPruebaId(asignatura, curso)
  return {
    id,
    nombre: "",
    asignatura,
    curso,
    tipoEvaluacion: "sumativa",
    ponderacion: 15,
    tiempoMinutos: 90,
    exigencia: 0.6,
    instruccionesGenerales: [
      "Escribe tu nombre y apellido con letra clara.",
      "Escucha con atención las instrucciones del docente previas a la evaluación.",
      "Lee cada pregunta con detención.",
      "Contesta tu evaluación con lápiz de grafito y letra legible. Cuando estés seguro/a de tus respuestas, márcalas con lápiz pasta.",
      "Revisa tu evaluación antes de entregarla.",
    ],
    metadatosCurriculares: metadatosCurricularesVaciosEval(),
    secciones: [],
    puntajeMaximo: 0,
    estado: "borrador",
  }
}

export function nuevaSeccion(orden: number, tipoPredominante: TipoItem | "mixto" = "mixto"): SeccionPrueba {
  return {
    id: nuevoItemId("sec"),
    orden,
    titulo: `Ítem ${romano(orden)}`,
    instrucciones: defaultInstrucciones(tipoPredominante),
    estimulo: [],
    tipoPredominante,
    items: [],
  }
}

export function defaultInstrucciones(tipo: TipoItem | "mixto"): string {
  switch (tipo) {
    case "seleccion_multiple":
      return "Lee atentamente cada enunciado y marca con una X la alternativa correcta."
    case "verdadero_falso":
      return "Lee atentamente cada enunciado y marca con una V cuando sea verdadero o una F cuando sea falso. Justifica las falsas."
    case "pareados":
      return "Asocia cada elemento de la columna A con su correspondiente en la columna B, escribiendo la letra en la línea."
    case "ordenar":
      return "Ordena los hechos enumerándolos del 1 al N, según corresponda."
    case "completar":
      return "Completa los espacios en blanco con la palabra o expresión correcta."
    case "respuesta_corta":
      return "Responde brevemente cada pregunta."
    case "desarrollo":
      return "Lee cada pregunta y responde de manera completa y argumentada."
    default:
      return "Sigue las instrucciones específicas para cada pregunta."
  }
}

export function nuevoItem(tipo: TipoItem, puntaje = 1): ItemPrueba {
  const base = { id: nuevoItemId(tipo), puntaje }
  switch (tipo) {
    case "seleccion_multiple":
      return {
        ...base,
        tipo,
        enunciado: "",
        alternativas: [
          { id: nuevoItemId("alt"), texto: "", esCorrecta: false },
          { id: nuevoItemId("alt"), texto: "", esCorrecta: false },
          { id: nuevoItemId("alt"), texto: "", esCorrecta: false },
          { id: nuevoItemId("alt"), texto: "", esCorrecta: false },
        ],
      }
    case "verdadero_falso":
      return { ...base, tipo, enunciado: "", respuestaCorrecta: true, pideJustificacion: false }
    case "pareados":
      return {
        ...base, tipo, enunciado: "",
        columnaA: [
          { id: nuevoItemId("a"), texto: "" },
          { id: nuevoItemId("a"), texto: "" },
        ],
        columnaB: [
          { id: nuevoItemId("b"), texto: "", correctaParaAId: "" },
          { id: nuevoItemId("b"), texto: "", correctaParaAId: "" },
        ],
      }
    case "ordenar":
      return {
        ...base, tipo, enunciado: "",
        pasos: [
          { id: nuevoItemId("p"), texto: "" },
          { id: nuevoItemId("p"), texto: "" },
          { id: nuevoItemId("p"), texto: "" },
        ],
      }
    case "completar":
      return { ...base, tipo, enunciado: "", textoConBlancos: "", respuestas: [] }
    case "respuesta_corta":
      return { ...base, tipo, enunciado: "", lineasRespuesta: 2 }
    case "desarrollo":
      return { ...base, tipo, enunciado: "", lineasRespuesta: 5, puntaje: Math.max(2, puntaje) }
  }
}

// ─── Sincronización con calificaciones ─────────────────────────────────────

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

function oaIdsDesdePrueba(prueba: PruebaTemplate): string[] {
  const ids = new Set<string>()
  ;(prueba.oas || []).filter(oa => oa.seleccionado).forEach(oa => ids.add(oa.id))
  prueba.secciones.forEach(sec =>
    sec.items.forEach(it => {
      if (it.oaVinculado) ids.add(it.oaVinculado)
    })
  )
  return Array.from(ids)
}

export interface SincronizarCalifPruebaOpts {
  sobrescribir?: boolean
}

export interface SincronizarCalifPruebaResultado {
  evaluacionId: string
  notasSincronizadas: number
  estudiantesSinNota: number
  evaluacionExistia: boolean
  requiereConfirmacion: boolean
  conflictos: Array<{ estudianteId: string; nombre: string; anterior: string; nueva: string }>
}

function normalizarNotaStr(v: unknown): string {
  if (v === undefined || v === null) return ""
  const s = String(v).trim()
  if (!s) return ""
  const num = Number.parseFloat(s.replace(",", "."))
  return Number.isFinite(num) ? num.toFixed(1) : s
}

export async function sincronizarPruebaConCalificaciones(
  prueba: PruebaTemplate,
  aplicacion: AplicacionPrueba,
  opts: SincronizarCalifPruebaOpts = {},
): Promise<SincronizarCalifPruebaResultado> {
  const evaluacionId = buildAplicacionId(prueba.id)
  const calificacionesId = buildCalificacionesId(prueba.asignatura, prueba.curso)
  const snap = await getDoc(userDoc("calificaciones", calificacionesId))
  const data = snap.exists() ? snap.data() : {}

  const estudiantesBase: any[] = Array.isArray(data.estudiantes) ? data.estudiantes : []
  const evaluacionesBase: any[] = Array.isArray(data.evaluaciones) ? data.evaluaciones : []
  const evaluacionExistia = evaluacionesBase.some(e => e.id === evaluacionId)

  const notasCalculadas = new Map<string, { nombre: string; nota: string }>()
  let estudiantesSinNota = 0

  aplicacion.resultados.forEach(r => {
    if (r.ausente) return
    const tieneRespuestas = Object.keys(r.respuestas || {}).length > 0
    if (!tieneRespuestas && !r.completado) {
      estudiantesSinNota += 1
      return
    }
    const calc = calcularResultadoEstudiante(prueba, r)
    notasCalculadas.set(r.estudianteId, {
      nombre: r.nombre,
      nota: (calc.nota ?? 1).toFixed(1),
    })
  })

  const roster = await cargarEstudiantes(prueba.curso).catch(() => [])
  const estudiantesMap = new Map<string, any>()

  roster.forEach((est, index) => {
    estudiantesMap.set(est.id, {
      id: est.id,
      name: est.nombre,
      orden: est.orden ?? index + 1,
      notas: {},
      hasPie: est.pie === true,
      pieDiagnostico: est.pieDiagnostico || "",
    })
  })

  estudiantesBase.forEach(e => {
    if (!e?.id) return
    const existing = estudiantesMap.get(e.id)
    estudiantesMap.set(e.id, {
      ...existing,
      ...e,
      name: e.name || existing?.name || e.nombre || "",
      notas: { ...(existing?.notas || {}), ...(e.notas || {}) },
    })
  })

  notasCalculadas.forEach(({ nombre }, id) => {
    if (!estudiantesMap.has(id)) {
      estudiantesMap.set(id, { id, name: nombre, notas: {}, hasPie: false })
    }
  })

  const conflictos: SincronizarCalifPruebaResultado["conflictos"] = []
  notasCalculadas.forEach(({ nombre, nota }, id) => {
    const est = estudiantesMap.get(id)
    const anterior = normalizarNotaStr(est?.notas?.[evaluacionId])
    if (anterior && anterior !== nota) {
      conflictos.push({ estudianteId: id, nombre, anterior, nueva: nota })
    }
  })

  if (conflictos.length > 0 && !opts.sobrescribir) {
    return {
      evaluacionId,
      notasSincronizadas: notasCalculadas.size,
      estudiantesSinNota,
      evaluacionExistia,
      requiereConfirmacion: true,
      conflictos,
    }
  }

  notasCalculadas.forEach(({ nota }, id) => {
    const est = estudiantesMap.get(id)
    if (!est) return
    estudiantesMap.set(id, { ...est, notas: { ...(est.notas || {}), [evaluacionId]: nota } })
  })

  const evCalif = {
    id: evaluacionId,
    label: prueba.nombre || "Prueba",
    tipo: prueba.tipoEvaluacion === "formativa" ? "formativa" as const :
          prueba.tipoEvaluacion === "diagnostica" ? "diagnostica" as const : "sumativa" as const,
    periodo: periodoActual(),
    unidadId: prueba.unidadId,
    oaIds: oaIdsDesdePrueba(prueba),
    ponderacion: prueba.ponderacion,
  }

  const evaluacionesActualizadas = evaluacionExistia
    ? evaluacionesBase.map(e => e.id === evaluacionId ? { ...e, ...evCalif } : e)
    : [...evaluacionesBase, evCalif]

  await setDoc(userDoc("calificaciones", calificacionesId), stripUndefined({
    asignatura: prueba.asignatura,
    curso: prueba.curso,
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
