// ═══════════════════════════════════════════════════════════════════════════
// Cliente fetch para `/api/generar-evaluacion`
// ─────────────────────────────────────────────────────────────────────────
// Helper "thin" que envuelve la llamada al endpoint productivo
// `/api/generar-evaluacion` (ver `app/api/generar-evaluacion/route.ts` y la
// firma `EvalCopilotRequest` de `lib/ai/evaluaciones-copilot.ts`).
//
// Responsabilidades:
//   • Construir el `EvalCopilotRequest` correcto a partir de los parámetros
//     que devuelven los modales `IAStructuredModalPrueba` /
//     `IAStructuredModalGuia` y del contexto curricular del docente
//     (asignatura, curso, unidad opcional).
//   • Realizar la llamada autenticada con `apiFetch` (Bearer Firebase
//     ID-Token) y manejar errores HTTP no 2xx con mensajes en español.
//   • Convertir la respuesta intermedia (`SeccionGeneradaPrueba[]` /
//     `SeccionGeneradaGuia[]`) en `PruebaTemplate` / `GuiaTemplate` con
//     `estado: "borrador"`, listos para abrirlos en el editor.
//
// NO-MODIFY guard:
//   - No modifica `app/api/generar-evaluacion/route.ts` ni
//     `lib/ai/evaluaciones-copilot.ts` (read-only consumers).
//   - No altera las firmas de `nuevaPrueba`, `nuevaGuia`, `nuevaSeccion`,
//     `nuevaSeccionGuia`, `nuevaActividadGuia` ni los tipos exportados de
//     `lib/pruebas.ts` / `lib/guias.ts`.
//
// Refs: Req 4.5, Req 16.7
// ═══════════════════════════════════════════════════════════════════════════

import { apiFetch, ApiError } from "@/lib/api-client"
import type {
  ContextoCurricular,
  EvalCopilotRequest,
  ItemGenerado,
  SeccionGeneradaPrueba,
  SeccionGeneradaGuia,
  ActividadGenerada,
} from "@/lib/ai/evaluaciones-copilot"
import type { OAEditado } from "@/lib/curriculo"
import {
  nuevaPrueba,
  nuevaSeccion,
  normalizarPrueba,
  type ItemPrueba,
  type PruebaTemplate,
  type SeccionPrueba,
  type TipoItem,
} from "@/lib/pruebas"
import {
  nuevaGuia,
  nuevaSeccionGuia,
  nuevaActividadGuia,
  normalizarGuia,
  type ActividadGuia,
  type ActividadGuiaData,
  type GuiaTemplate,
  type SeccionGuia,
  type TipoActividadGuia,
} from "@/lib/guias"
import type { BloqueContenido } from "@/lib/evaluaciones-tipos"
import type { IAStructuredModalPruebaParams } from "@/components/edu-panel/evaluaciones/shared/ia-structured-modal-prueba"
import type { IAStructuredModalGuiaParams } from "@/components/edu-panel/evaluaciones/shared/ia-structured-modal-guia"

// ─── API pública ────────────────────────────────────────────────────────────

/**
 * Datos disponibles en el contexto del hub para enriquecer la llamada IA.
 * Compartido entre prueba y guía.
 */
interface ContextoComun {
  asignatura: string
  curso: string
  unidadId?: string
  unidadNombre?: string
  /**
   * OAs disponibles en la unidad activa (los mismos que se mostraron en el
   * modal). Al pasarlos, el endpoint puede enviar a la IA los códigos junto
   * con sus descripciones, mejorando la calidad del prompt. Si no se proveen,
   * sólo se transmiten los códigos seleccionados.
   */
  oasDisponibles?: Array<{ code: string; descripcion: string }>
}

export interface GenerarPruebaInput extends ContextoComun {
  params: IAStructuredModalPruebaParams
}

export interface GenerarGuiaInput extends ContextoComun {
  params: IAStructuredModalGuiaParams
}

export interface GenerarPruebaResultado {
  prueba: PruebaTemplate
  /** Avisos o advertencias de conversión (ej. ítems descartados). */
  advertencias?: string[]
}

export interface GenerarGuiaResultado {
  guia: GuiaTemplate
  advertencias?: string[]
}

/**
 * Llama a `/api/generar-evaluacion` en modo `prueba_generar` con los
 * parámetros del modal de IA y devuelve un {@link PruebaTemplate} en estado
 * `"borrador"` listo para abrir en el editor.
 *
 * @throws Error con mensaje en español si la API responde con error HTTP
 *   o si la respuesta no contiene secciones válidas.
 */
export async function generarPruebaIA(
  input: GenerarPruebaInput,
): Promise<GenerarPruebaResultado> {
  const advertencias: string[] = []
  const body = construirRequestPrueba(input)
  const data = await postEvaluacion(body, "Error al generar la prueba con IA.")

  const seccionesIA = Array.isArray((data as any)?.secciones)
    ? ((data as any).secciones as SeccionGeneradaPrueba[])
    : []

  if (seccionesIA.length === 0) {
    throw new Error(
      "La IA no devolvió secciones válidas para la prueba. Inténtalo nuevamente.",
    )
  }

  const scaffold = nuevaPrueba(input.asignatura, input.curso)
  const secciones = seccionesIA.map((sec, i) =>
    convertirSeccionPrueba(sec, i + 1, advertencias),
  )

  const oasSugeridos = Array.isArray((data as any)?.oasSugeridos)
    ? (((data as any).oasSugeridos as unknown[]).filter(
        (s): s is string => typeof s === "string",
      ) as string[])
    : []

  const indicadoresSugeridos = Array.isArray((data as any)?.indicadoresSugeridos)
    ? (((data as any).indicadoresSugeridos as unknown[]).filter(
        (s): s is string => typeof s === "string",
      ) as string[])
    : []

  const metadatosBase =
    scaffold.metadatosCurriculares ?? {
      objetivos: [],
      indicadores: [],
      objetivosTransversales: [],
    }

  const pruebaSinNormalizar: PruebaTemplate = {
    ...scaffold,
    unidadId: input.unidadId,
    unidadNombre: input.unidadNombre,
    tipoEvaluacion: input.params.tipoEvaluacion,
    metadatosCurriculares: {
      ...metadatosBase,
      objetivos:
        oasSugeridos.length > 0 ? oasSugeridos : metadatosBase.objetivos,
      indicadores:
        indicadoresSugeridos.length > 0
          ? indicadoresSugeridos
          : metadatosBase.indicadores,
    },
    secciones,
    estado: "borrador",
  }

  return {
    prueba: normalizarPrueba(pruebaSinNormalizar),
    advertencias: advertencias.length > 0 ? advertencias : undefined,
  }
}

/**
 * Llama a `/api/generar-evaluacion` en modo `guia_generar` con los
 * parámetros del modal de IA y devuelve un {@link GuiaTemplate} en estado
 * `"borrador"` listo para abrir en el editor.
 *
 * @throws Error con mensaje en español si la API responde con error HTTP
 *   o si la respuesta no contiene secciones válidas.
 */
export async function generarGuiaIA(
  input: GenerarGuiaInput,
): Promise<GenerarGuiaResultado> {
  const advertencias: string[] = []
  const body = construirRequestGuia(input)
  const data = await postEvaluacion(body, "Error al generar la guía con IA.")

  const seccionesIA = Array.isArray((data as any)?.seccionesGuia)
    ? ((data as any).seccionesGuia as SeccionGeneradaGuia[])
    : []

  if (seccionesIA.length === 0) {
    throw new Error(
      "La IA no devolvió secciones válidas para la guía. Inténtalo nuevamente.",
    )
  }

  const scaffold = nuevaGuia(input.asignatura, input.curso)
  const secciones = seccionesIA.map((sec, i) =>
    convertirSeccionGuia(sec, i + 1, advertencias),
  )

  const oasSugeridos = Array.isArray((data as any)?.oasSugeridos)
    ? (((data as any).oasSugeridos as unknown[]).filter(
        (s): s is string => typeof s === "string",
      ) as string[])
    : []

  const indicadoresSugeridos = Array.isArray((data as any)?.indicadoresSugeridos)
    ? (((data as any).indicadoresSugeridos as unknown[]).filter(
        (s): s is string => typeof s === "string",
      ) as string[])
    : []

  const metadatosBase =
    scaffold.metadatosCurriculares ?? {
      objetivos: [],
      indicadores: [],
      objetivosTransversales: [],
    }

  const guiaSinNormalizar: GuiaTemplate = {
    ...scaffold,
    unidadId: input.unidadId,
    unidadNombre: input.unidadNombre,
    tipoGuia: input.params.tipoGuia,
    tiempoMinutos: input.params.duracionMin,
    objetivo: input.params.objetivo,
    metadatosCurriculares: {
      ...metadatosBase,
      objetivos:
        oasSugeridos.length > 0 ? oasSugeridos : metadatosBase.objetivos,
      indicadores:
        indicadoresSugeridos.length > 0
          ? indicadoresSugeridos
          : metadatosBase.indicadores,
    },
    secciones,
    estado: "borrador",
  }

  return {
    guia: normalizarGuia(guiaSinNormalizar),
    advertencias: advertencias.length > 0 ? advertencias : undefined,
  }
}

// ─── Construcción del payload ──────────────────────────────────────────────

function construirRequestPrueba(
  input: GenerarPruebaInput,
): EvalCopilotRequest {
  const { params, asignatura, curso, unidadId, unidadNombre, oasDisponibles } =
    input

  const oas = construirOAEditados(params.oasSeleccionados, oasDisponibles)

  // Instrucciones derivadas del formulario para que la IA respete el formato.
  const partes: string[] = []
  partes.push(`Cantidad objetivo de ítems: ${params.numeroPreguntas}.`)
  if (params.tiposIncluir.length > 0) {
    partes.push(
      `Tipos de pregunta a incluir (usa solo estos): ${params.tiposIncluir.join(
        ", ",
      )}.`,
    )
  }
  partes.push(`Dificultad esperada: ${params.dificultad}.`)
  if (params.nivel.trim()) {
    partes.push(`Nivel de referencia: ${params.nivel.trim()}.`)
  }

  const contexto: ContextoCurricular = {
    asignatura,
    curso,
    unidadId,
    unidadNombre,
    oas,
    habilidades: [],
    conocimientos: [],
    actitudes: [],
  }

  return {
    modo: "prueba_generar",
    tipoDoc: "prueba",
    contexto,
    documentoActual: {
      tipoEvaluacion: params.tipoEvaluacion,
      asignatura,
      curso,
      unidadId,
      unidadNombre,
    },
    instrucciones: partes.join(" "),
  }
}

function construirRequestGuia(input: GenerarGuiaInput): EvalCopilotRequest {
  const { params, asignatura, curso, unidadId, unidadNombre, oasDisponibles } =
    input

  const oas = construirOAEditados(params.oasSeleccionados, oasDisponibles)

  const partes: string[] = []
  partes.push(`Tipo de guía: ${params.tipoGuia}.`)
  partes.push(`Objetivo de la guía: ${params.objetivo}`)
  partes.push(`Cantidad objetivo de secciones: ${params.numeroSecciones}.`)
  if (params.tiposActividades.length > 0) {
    partes.push(
      `Tipos de actividades a incluir (usa solo estos): ${params.tiposActividades.join(
        ", ",
      )}.`,
    )
  }
  partes.push(`Duración estimada: ${params.duracionMin} minutos.`)

  const contexto: ContextoCurricular = {
    asignatura,
    curso,
    unidadId,
    unidadNombre,
    oas,
    habilidades: [],
    conocimientos: [],
    actitudes: [],
    objetivoDocente: params.objetivo,
  }

  return {
    modo: "guia_generar",
    tipoDoc: "guia",
    contexto,
    documentoActual: {
      tipoGuia: params.tipoGuia,
      objetivo: params.objetivo,
      tiempoMinutos: params.duracionMin,
      asignatura,
      curso,
      unidadId,
      unidadNombre,
    },
    instrucciones: partes.join(" "),
  }
}

/**
 * Convierte los códigos OA seleccionados en el modal a {@link OAEditado}
 * mínimos, enriqueciéndolos con la descripción si está disponible en
 * `oasDisponibles`.
 */
function construirOAEditados(
  codigosSeleccionados: string[],
  oasDisponibles?: Array<{ code: string; descripcion: string }>,
): OAEditado[] {
  if (codigosSeleccionados.length === 0) return []
  const indice = new Map(
    (oasDisponibles ?? []).map((oa) => [oa.code, oa.descripcion]),
  )
  return codigosSeleccionados.map((code) => {
    const numero = parseNumeroOA(code)
    const descripcion = indice.get(code) ?? ""
    return {
      id: code,
      numero,
      tipo: "oa",
      descripcion,
      seleccionado: true,
      indicadores: [],
    }
  })
}

function parseNumeroOA(code: string): number | undefined {
  const match = code.match(/(\d+)/)
  if (!match) return undefined
  const n = Number.parseInt(match[1], 10)
  return Number.isFinite(n) ? n : undefined
}

// ─── HTTP wrapper ──────────────────────────────────────────────────────────

/**
 * Realiza el POST al endpoint y devuelve el JSON parseado, o lanza un
 * {@link Error} con un mensaje en español orientado al usuario final.
 */
async function postEvaluacion(
  body: EvalCopilotRequest,
  mensajeFallback: string,
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await apiFetch("/api/generar-evaluacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch (e) {
    if (e instanceof ApiError) {
      const detalle = extraerMensajeErrorApi(e)
      throw new Error(detalle ?? mensajeFallback)
    }
    throw e instanceof Error
      ? new Error(`${mensajeFallback} ${e.message}`.trim())
      : new Error(mensajeFallback)
  }

  let data: Record<string, unknown>
  try {
    data = (await response.json()) as Record<string, unknown>
  } catch {
    throw new Error(
      `${mensajeFallback} La respuesta del servidor no era JSON válido.`,
    )
  }

  // El endpoint puede devolver 200 OK con `error: "json_parse_failed"` cuando
  // la IA respondió texto malformado. Lo tratamos como error explícito.
  if (typeof (data as any)?.error === "string") {
    const mensaje =
      (data as any).message ?? (data as any).error ?? mensajeFallback
    throw new Error(String(mensaje))
  }

  return data
}

function extraerMensajeErrorApi(error: ApiError): string | null {
  const body = error.body as Record<string, unknown> | string | undefined
  if (body && typeof body === "object") {
    const msg = (body as any).error ?? (body as any).message
    if (typeof msg === "string" && msg.trim().length > 0) return msg
  }
  if (typeof body === "string" && body.trim().length > 0) return body
  return error.message || null
}

// ─── Conversión: Sección de Prueba ─────────────────────────────────────────

function convertirSeccionPrueba(
  sec: SeccionGeneradaPrueba,
  orden: number,
  advertencias: string[],
): SeccionPrueba {
  const tipoPredominante = normalizarTipoItem(sec.tipoPredominante) ?? "mixto"
  const base = nuevaSeccion(orden, tipoPredominante)
  const itemsRaw = Array.isArray(sec.items) ? sec.items : []
  const items = itemsRaw
    .map((it) => convertirItem(it, advertencias))
    .filter((it): it is ItemPrueba => it !== null)

  return {
    ...base,
    titulo: cleanString(sec.titulo) || base.titulo,
    instrucciones: cleanString(sec.instrucciones) || base.instrucciones,
    tipoPredominante,
    items,
  }
}

const TIPOS_ITEM_VALIDOS: Record<string, TipoItem> = {
  seleccion_multiple: "seleccion_multiple",
  seleccion: "seleccion_multiple",
  multiple: "seleccion_multiple",
  alternativas: "seleccion_multiple",
  verdadero_falso: "verdadero_falso",
  verdadero: "verdadero_falso",
  vf: "verdadero_falso",
  pareados: "pareados",
  pareado: "pareados",
  terminos_pareados: "pareados",
  ordenar: "ordenar",
  orden: "ordenar",
  secuencia: "ordenar",
  completar: "completar",
  rellenar: "completar",
  respuesta_corta: "respuesta_corta",
  respuesta: "respuesta_corta",
  desarrollo: "desarrollo",
  desarrollo_visual: "desarrollo",
  abierta: "desarrollo",
}

function normalizarTipoItem(raw: string | undefined): TipoItem | null {
  if (!raw) return null
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_")
  return TIPOS_ITEM_VALIDOS[key] ?? null
}

function convertirItem(
  it: ItemGenerado | undefined,
  advertencias: string[],
): ItemPrueba | null {
  if (!it || typeof it !== "object") return null
  const enunciado = cleanString(it.enunciado)
  if (!enunciado && !it.tipo) return null

  const tipo = normalizarTipoItem(it.tipo) ?? "desarrollo"
  if (tipo === "desarrollo" && it.tipo && !TIPOS_ITEM_VALIDOS[
    it.tipo.toLowerCase().replace(/[\s-]+/g, "_")
  ]) {
    advertencias.push(
      `Se convirtió un ítem de tipo desconocido "${it.tipo}" en pregunta de desarrollo.`,
    )
  }

  const puntaje = Math.max(1, Math.round(Number(it.puntaje) || 1))
  const id = nuevoIdLocal(tipo)
  const oaVinculado = cleanString(it.oaVinculado) || undefined

  switch (tipo) {
    case "seleccion_multiple": {
      const altsRaw = Array.isArray(it.alternativas) ? it.alternativas : []
      const alternativas = altsRaw.map((a, idx) => ({
        id: nuevoIdLocal(`alt_${idx}`),
        texto: cleanString((a as any)?.texto) || "",
        esCorrecta:
          (a as any)?.esCorrecta === true || (a as any)?.correcta === true,
      }))
      // Si la IA no marcó ninguna correcta, marcamos la primera como fallback
      // para no romper la prueba; queda al docente confirmarlo en el editor.
      if (
        alternativas.length > 0 &&
        !alternativas.some((a) => a.esCorrecta)
      ) {
        alternativas[0].esCorrecta = true
        advertencias.push(
          "La IA no marcó alternativa correcta en una pregunta de selección múltiple. Se preseleccionó la primera; revísala antes de aplicar.",
        )
      }
      return { id, tipo, enunciado, puntaje, oaVinculado, alternativas }
    }
    case "verdadero_falso":
      return {
        id,
        tipo,
        enunciado,
        puntaje,
        oaVinculado,
        respuestaCorrecta: it.respuestaCorrecta === true,
        pideJustificacion: Boolean(it.pideJustificacion),
      }
    case "pareados": {
      const colA = Array.isArray(it.columnaA) ? it.columnaA : []
      const colB = Array.isArray(it.columnaB) ? it.columnaB : []
      return {
        id,
        tipo,
        enunciado,
        puntaje,
        oaVinculado,
        columnaA: colA.map((a, idx) => ({
          id: nuevoIdLocal(`a_${idx}`),
          texto: cleanString((a as any)?.texto) || "",
        })),
        columnaB: colB.map((b, idx) => ({
          id: nuevoIdLocal(`b_${idx}`),
          texto: cleanString((b as any)?.texto) || "",
          correctaParaAId: cleanString((b as any)?.correctaParaAId) || "",
        })),
      }
    }
    case "ordenar": {
      const pasos = Array.isArray(it.pasos) ? it.pasos : []
      return {
        id,
        tipo,
        enunciado,
        puntaje,
        oaVinculado,
        pasos: pasos.map((p, idx) => ({
          id: nuevoIdLocal(`p_${idx}`),
          texto: cleanString((p as any)?.texto) || "",
        })),
      }
    }
    case "completar":
      return {
        id,
        tipo,
        enunciado,
        puntaje,
        oaVinculado,
        textoConBlancos: cleanString(it.textoConBlancos) || enunciado,
        respuestas: Array.isArray(it.respuestas)
          ? it.respuestas.map((r) => cleanString(String(r))).filter(Boolean)
          : [],
        bancoPalabras:
          Array.isArray(it.bancoPalabras) && it.bancoPalabras.length > 0
            ? it.bancoPalabras
                .map((p) => cleanString(String(p)))
                .filter(Boolean)
            : undefined,
      }
    case "respuesta_corta":
      return {
        id,
        tipo,
        enunciado,
        puntaje,
        oaVinculado,
        lineasRespuesta:
          typeof it.lineasRespuesta === "number" ? it.lineasRespuesta : 2,
        respuestaEsperada: cleanString(it.respuestaEsperada) || undefined,
      }
    case "desarrollo": {
      const criterios = Array.isArray(it.criterios)
        ? it.criterios
            .map((c, idx) => ({
              id: nuevoIdLocal(`crit_${idx}`),
              texto: cleanString((c as any)?.texto) || "",
              puntaje: Math.max(0, Math.round(Number((c as any)?.puntaje) || 1)),
            }))
            .filter((c) => c.texto.length > 0)
        : undefined
      return {
        id,
        tipo,
        enunciado,
        puntaje: Math.max(2, puntaje),
        oaVinculado,
        lineasRespuesta:
          typeof it.lineasRespuesta === "number" ? it.lineasRespuesta : 5,
        pautaCorreccion: cleanString(it.pautaCorreccion) || undefined,
        criterios,
      }
    }
  }
}

// ─── Conversión: Sección de Guía ───────────────────────────────────────────

function convertirSeccionGuia(
  sec: SeccionGeneradaGuia,
  orden: number,
  advertencias: string[],
): SeccionGuia {
  const base = nuevaSeccionGuia(orden)
  const titulo = cleanString(sec.titulo) || base.titulo
  const descripcion = cleanString(sec.descripcion)

  const contenido: BloqueContenido[] = []
  const html = cleanString(sec.contenidoHtml)
  if (html) {
    contenido.push({
      id: nuevoIdLocal("bl"),
      tipo: "texto",
      data: { html, estilo: "normal" },
    })
  }

  const actsRaw = Array.isArray(sec.actividades) ? sec.actividades : []
  const actividades = actsRaw
    .map((act) => convertirActividadGuia(act, advertencias))
    .filter((a): a is ActividadGuia => a !== null)

  return {
    ...base,
    titulo,
    descripcion,
    contenido,
    actividades,
  }
}

const TIPOS_ACTIVIDAD_VALIDOS: TipoActividadGuia[] = [
  "seleccion_multiple",
  "verdadero_falso",
  "completar",
  "respuesta_corta",
  "ordenar",
  "pareados",
  "encerrar",
  "marcar",
  "colorear",
  "dibujar",
  "investigar",
  "sopa_letras",
  "abierta",
]

function normalizarTipoActividad(
  raw: string | undefined,
): TipoActividadGuia | null {
  if (!raw) return null
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_")
  if ((TIPOS_ACTIVIDAD_VALIDOS as string[]).includes(key)) {
    return key as TipoActividadGuia
  }
  // Aliases comunes provenientes del prompt.
  if (key === "vf" || key === "verdadero") return "verdadero_falso"
  if (key === "seleccion" || key === "alternativas") return "seleccion_multiple"
  return null
}

function convertirActividadGuia(
  act: ActividadGenerada | undefined,
  advertencias: string[],
): ActividadGuia | null {
  if (!act || typeof act !== "object") return null
  const enunciado = cleanString(act.enunciado)
  if (!enunciado) return null

  let tipo = normalizarTipoActividad(act.tipo)
  if (!tipo) {
    advertencias.push(
      `Actividad con tipo desconocido "${act.tipo ?? ""}" convertida en "abierta".`,
    )
    tipo = "abierta"
  }

  const base = nuevaActividadGuia(tipo, act.puntaje)
  const oaVinculado = cleanString(act.oaVinculado) || undefined

  // Si la IA proveyó `datos` con la forma esperada, los respetamos. En caso
  // contrario, conservamos los `datos` del scaffold para no romper el editor.
  const datos = (act.datos as ActividadGuiaData | undefined) ?? base.datos

  return {
    ...base,
    enunciado,
    puntaje: typeof act.puntaje === "number" ? act.puntaje : base.puntaje,
    oaVinculado,
    datos,
  }
}

// ─── Utilidades locales ────────────────────────────────────────────────────

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Generador de IDs locales para los ítems convertidos. Mismo formato que
 * `nuevoItemId` / `nuevoIdGuia` pero sin acoplar este módulo a los helpers
 * privados de los archivos de datos.
 */
function nuevoIdLocal(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
