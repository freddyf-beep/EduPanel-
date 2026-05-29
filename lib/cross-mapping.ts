// ═══════════════════════════════════════════════════════════════════════════
// Cross-mapping Pruebas ⇄ Guías
// ─────────────────────────────────────────────────────────────────────────
// Módulo puro (sin Firestore, sin React) que convierte un `PruebaTemplate`
// en un `GuiaTemplate` y viceversa, mapeando solo los tipos de ítem que
// son compatibles entre ambos modelos.
//
// Tipos compatibles (Prueba ⇄ Guía):
//   • seleccion_multiple  ⇄ seleccion_multiple
//   • verdadero_falso     ⇄ verdadero_falso
//   • completar           ⇄ completar
//   • respuesta_corta     ⇄ respuesta_corta
//   • ordenar             ⇄ ordenar
//   • pareados            ⇄ pareados
//
// Mapeos asimétricos:
//   • desarrollo (prueba) → abierta (guía)   [con pérdida de criterios]
//   • abierta    (guía)   → desarrollo (prueba)
//
// Tipos exclusivos de guía (no migran a prueba):
//   • encerrar, marcar, colorear, dibujar, investigar, sopa_letras
//
// Este módulo solo CONSUME los exports de `lib/pruebas.ts` y `lib/guias.ts`;
// no modifica sus interfaces. Se usa en cards de cross-references
// (Req 10.2 / 10.3) y en el banco de ítems (Req 16.5).
// ═══════════════════════════════════════════════════════════════════════════

import type {
  PruebaTemplate,
  ItemPrueba,
  TipoItem,
} from "@/lib/pruebas"
import {
  nuevaPrueba,
  nuevaSeccion,
  nuevoItem,
  normalizarPrueba,
  romano,
} from "@/lib/pruebas"
import type {
  GuiaTemplate,
  ActividadGuia,
  TipoActividadGuia,
} from "@/lib/guias"
import {
  nuevaGuia,
  nuevaSeccionGuia,
  nuevaActividadGuia,
  nuevoIdGuia,
  normalizarGuia,
} from "@/lib/guias"
import type { BloqueContenido } from "@/lib/evaluaciones-tipos"

// ─── Tipos de salida ──────────────────────────────────────────────────────

/**
 * Detalle de un ítem o actividad que no pudo migrarse al documento destino.
 */
export interface OmitidoCrossMap {
  /** Índice base 0 de la sección dentro del documento origen. */
  seccionIndex: number
  /** Índice base 0 del ítem o actividad dentro de la sección. */
  itemIndex: number
  /** Tipo original que no tiene equivalente en el destino. */
  tipo: string
  /** Razón legible en español de la omisión. */
  razon: string
}

/**
 * Resultado de una conversión cross-mapping. Devuelve el documento destino
 * normalizado y la lista de elementos omitidos por incompatibilidad.
 */
export interface CrossMapResult<T> {
  documento: T
  omitidos: OmitidoCrossMap[]
  advertencias: string[]
}

// ─── Tablas de mapeo ──────────────────────────────────────────────────────

/**
 * Mapeo de tipos de ítem de prueba al tipo equivalente en una guía.
 * Si el valor es `null`, el tipo no tiene equivalente en guías.
 */
const PRUEBA_A_GUIA: Record<TipoItem, TipoActividadGuia | null> = {
  seleccion_multiple: "seleccion_multiple",
  verdadero_falso: "verdadero_falso",
  completar: "completar",
  respuesta_corta: "respuesta_corta",
  ordenar: "ordenar",
  pareados: "pareados",
  desarrollo: "abierta",
}

/**
 * Mapeo de tipos de actividad de guía al tipo equivalente en una prueba.
 * Si el valor es `null`, el tipo es exclusivo de guías y no migra a pruebas
 * (se reportará en `omitidos`).
 */
const GUIA_A_PRUEBA: Record<TipoActividadGuia, TipoItem | null> = {
  seleccion_multiple: "seleccion_multiple",
  verdadero_falso: "verdadero_falso",
  completar: "completar",
  respuesta_corta: "respuesta_corta",
  ordenar: "ordenar",
  pareados: "pareados",
  encerrar: null,
  marcar: null,
  colorear: null,
  dibujar: null,
  investigar: null,
  sopa_letras: null,
  abierta: "desarrollo",
}

/**
 * Indica si un tipo de ítem de prueba puede migrar hacia una guía.
 */
export function tipoCompatibleHaciaGuia(tipo: string): boolean {
  return (tipo in PRUEBA_A_GUIA) && PRUEBA_A_GUIA[tipo as TipoItem] !== null
}

/**
 * Indica si un tipo de actividad de guía puede migrar hacia una prueba.
 */
export function tipoCompatibleHaciaPrueba(tipo: string): boolean {
  return (tipo in GUIA_A_PRUEBA) && GUIA_A_PRUEBA[tipo as TipoActividadGuia] !== null
}

// ─── Helpers internos ─────────────────────────────────────────────────────

function clonarMetadatos<T extends { objetivos?: string[]; indicadores?: string[]; objetivosTransversales?: string[] } | undefined>(
  metadatos: T,
): T {
  if (!metadatos) return metadatos
  return {
    ...metadatos,
    objetivos: [...(metadatos.objetivos || [])],
    indicadores: [...(metadatos.indicadores || [])],
    objetivosTransversales: [...(metadatos.objetivosTransversales || [])],
  } as T
}

function clonarBloque(bloque: BloqueContenido): BloqueContenido {
  // Clon superficial estructural — los datos son objetos planos.
  return JSON.parse(JSON.stringify(bloque)) as BloqueContenido
}

function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// ─── Conversión Prueba → Guía: ítem a actividad ───────────────────────────

export function itemPruebaAActividadGuia(item: ItemPrueba): ActividadGuia | null {
  const tipoGuia = PRUEBA_A_GUIA[item.tipo]
  if (!tipoGuia) return null

  const actividad = nuevaActividadGuia(tipoGuia, item.puntaje)
  actividad.enunciado = item.enunciado
  if (item.oaVinculado) actividad.oaVinculado = item.oaVinculado
  actividad.recursos = (item.recursos || []).map(clonarBloque)

  switch (item.tipo) {
    case "seleccion_multiple":
      actividad.datos = {
        tipo: "seleccion_multiple",
        alternativas: item.alternativas.map(a => ({
          id: a.id,
          texto: a.texto,
          correcta: a.esCorrecta,
          imagenUrl: a.imagenUrl,
        })),
      }
      break
    case "verdadero_falso":
      actividad.datos = {
        tipo: "verdadero_falso",
        afirmaciones: [
          {
            id: nuevoIdGuia("af"),
            texto: item.enunciado,
            correcta: item.respuestaCorrecta,
          },
        ],
      }
      break
    case "completar":
      actividad.datos = {
        tipo: "completar",
        texto: item.textoConBlancos,
        respuestas: [...item.respuestas],
        banco: item.bancoPalabras ? [...item.bancoPalabras] : undefined,
      }
      break
    case "respuesta_corta":
      actividad.datos = {
        tipo: "respuesta_corta",
        lineas: item.lineasRespuesta ?? 2,
        respuestaSugerida: item.respuestaEsperada,
      }
      break
    case "ordenar":
      actividad.datos = {
        tipo: "ordenar",
        pasos: item.pasos.map((p, i) => ({
          id: p.id,
          texto: p.texto,
          numeroCorrecto: i + 1,
        })),
      }
      break
    case "pareados":
      actividad.datos = {
        tipo: "pareados",
        columnaA: item.columnaA.map(a => ({ id: a.id, texto: a.texto })),
        columnaB: item.columnaB.map(b => ({
          id: b.id,
          texto: b.texto,
          pareCon: b.correctaParaAId,
        })),
      }
      break
    case "desarrollo":
      actividad.datos = {
        tipo: "abierta",
        lineasRespuesta: item.lineasRespuesta ?? 5,
      }
      break
  }

  return actividad
}

// ─── Conversión Guía → Prueba: actividad a ítem ───────────────────────────

export function actividadGuiaAItemPrueba(
  actividad: ActividadGuia,
  advertencias: string[],
): ItemPrueba | null {
  const tipoPrueba = GUIA_A_PRUEBA[actividad.tipo]
  if (!tipoPrueba) return null

  const puntaje = actividad.puntaje ?? 1
  const item = nuevoItem(tipoPrueba, puntaje)

  // Campos comunes presentes en toda la unión ItemPrueba
  item.enunciado = actividad.enunciado
  if (actividad.oaVinculado) item.oaVinculado = actividad.oaVinculado
  item.recursos = (actividad.recursos || []).map(clonarBloque)
  item.puntaje = puntaje

  const datos = actividad.datos
  if (!datos) return item

  if (item.tipo === "seleccion_multiple" && datos.tipo === "seleccion_multiple") {
    item.alternativas = datos.alternativas.map(a => ({
      id: a.id,
      texto: a.texto,
      esCorrecta: !!a.correcta,
      imagenUrl: a.imagenUrl,
    }))
  } else if (item.tipo === "verdadero_falso" && datos.tipo === "verdadero_falso") {
    const primera = datos.afirmaciones[0]
    if (primera) {
      item.enunciado = primera.texto || actividad.enunciado
      item.respuestaCorrecta = !!primera.correcta
    } else {
      item.respuestaCorrecta = true
    }
    if (datos.afirmaciones.length > 1) {
      advertencias.push(
        `La actividad "${actividad.enunciado || actividad.id}" tenía ${datos.afirmaciones.length} afirmaciones; solo se conservó la primera.`,
      )
    }
  } else if (item.tipo === "completar" && datos.tipo === "completar") {
    item.textoConBlancos = datos.texto
    item.respuestas = [...datos.respuestas]
    item.bancoPalabras = datos.banco ? [...datos.banco] : undefined
  } else if (item.tipo === "respuesta_corta" && datos.tipo === "respuesta_corta") {
    item.lineasRespuesta = datos.lineas
    if (datos.respuestaSugerida) item.respuestaEsperada = datos.respuestaSugerida
  } else if (item.tipo === "ordenar" && datos.tipo === "ordenar") {
    const ordenados = [...datos.pasos].sort((a, b) => a.numeroCorrecto - b.numeroCorrecto)
    item.pasos = ordenados.map(p => ({ id: p.id, texto: p.texto }))
  } else if (item.tipo === "pareados" && datos.tipo === "pareados") {
    item.columnaA = datos.columnaA.map(a => ({ id: a.id, texto: a.texto }))
    item.columnaB = datos.columnaB.map(b => ({
      id: b.id,
      texto: b.texto,
      correctaParaAId: b.pareCon,
    }))
  } else if (item.tipo === "desarrollo" && datos.tipo === "abierta") {
    item.lineasRespuesta = datos.lineasRespuesta ?? 5
  }

  return item
}

// ─── API pública: pruebaToGuia ─────────────────────────────────────────────

/**
 * Convierte un `PruebaTemplate` en un `GuiaTemplate` mapeando los tipos de
 * ítem compatibles. Función PURA: no escribe a Firestore, no muta el origen.
 *
 * @param prueba - Documento origen.
 * @returns Documento guía + lista de ítems omitidos + advertencias.
 *
 * @see Req 10.2 (Duplicar como guía), Req 16.5 (sin alterar interfaces).
 */
export function pruebaToGuia(prueba: PruebaTemplate): CrossMapResult<GuiaTemplate> {
  const omitidos: OmitidoCrossMap[] = []
  const advertencias: string[] = []

  const guia = nuevaGuia(prueba.asignatura, prueba.curso)
  const nombreOrigen = prueba.nombre?.trim() || "Prueba sin título"
  guia.nombre = `Guía: ${nombreOrigen}`
  guia.objetivo = prueba.metadatosCurriculares?.objetivos?.[0] ?? ""

  if (prueba.metadatosCurriculares) {
    guia.metadatosCurriculares = clonarMetadatos(prueba.metadatosCurriculares)
  }
  if (prueba.unidadId) guia.unidadId = prueba.unidadId
  if (prueba.unidadNombre) guia.unidadNombre = prueba.unidadNombre
  if (typeof prueba.tiempoMinutos === "number") guia.tiempoMinutos = prueba.tiempoMinutos
  if (prueba.docenteNombre) guia.docenteNombre = prueba.docenteNombre

  // Si la prueba origen es formativa, la guía hereda ese carácter.
  if (prueba.tipoEvaluacion === "formativa") {
    guia.tipoGuia = "evaluacion_formativa"
  }

  guia.secciones = (prueba.secciones || []).map((seccionPrueba, sIdx) => {
    const seccion = nuevaSeccionGuia(sIdx + 1)
    seccion.titulo = seccionPrueba.titulo?.trim() || `Sección ${sIdx + 1}`

    // Las instrucciones de la prueba se preservan como descripción de la sección
    // de la guía (texto plano corto).
    if (seccionPrueba.instrucciones) {
      seccion.descripcion = seccionPrueba.instrucciones
    }

    // Estímulo + instrucciones largas → bloques de contenido didáctico (lectura).
    const contenido: BloqueContenido[] = []
    if (seccionPrueba.instrucciones && seccionPrueba.instrucciones.trim().length > 0) {
      contenido.push({
        id: nuevoIdGuia("blq"),
        tipo: "texto",
        data: {
          html: `<p>${seccionPrueba.instrucciones.replace(/</g, "&lt;")}</p>`,
          estilo: "instrucciones",
        },
      })
    }
    for (const bloque of seccionPrueba.estimulo || []) {
      contenido.push(clonarBloque(bloque))
    }
    seccion.contenido = contenido

    // Convertir ítems → actividades, registrando omitidos.
    seccion.actividades = []
    ;(seccionPrueba.items || []).forEach((item, iIdx) => {
      const actividad = itemPruebaAActividadGuia(item)
      if (!actividad) {
        omitidos.push({
          seccionIndex: sIdx,
          itemIndex: iIdx,
          tipo: item.tipo,
          razon: `El tipo "${item.tipo}" no tiene equivalente en guías.`,
        })
        return
      }
      seccion.actividades.push(actividad)
    })

    return seccion
  })

  return {
    documento: normalizarGuia(guia),
    omitidos,
    advertencias,
  }
}

// ─── API pública: guiaToPrueba ─────────────────────────────────────────────

/**
 * Convierte un `GuiaTemplate` en un `PruebaTemplate` mapeando los tipos de
 * actividad compatibles. Función PURA: no escribe a Firestore, no muta el
 * origen.
 *
 * Las actividades exclusivas de guías (encerrar, marcar, colorear, dibujar,
 * investigar, sopa_letras) se reportan en `omitidos` y no se incluyen en la
 * prueba resultante.
 *
 * @param guia - Documento origen.
 * @returns Documento prueba + lista de actividades omitidas + advertencias.
 *
 * @see Req 10.3 (Duplicar como prueba), Req 16.5 (sin alterar interfaces).
 */
export function guiaToPrueba(guia: GuiaTemplate): CrossMapResult<PruebaTemplate> {
  const omitidos: OmitidoCrossMap[] = []
  const advertencias: string[] = []

  const prueba = nuevaPrueba(guia.asignatura, guia.curso)
  const nombreOrigen = guia.nombre?.trim() || "Guía sin título"
  prueba.nombre = `Prueba: ${nombreOrigen}`

  if (guia.metadatosCurriculares) {
    prueba.metadatosCurriculares = clonarMetadatos(guia.metadatosCurriculares)
  }
  if (guia.unidadId) prueba.unidadId = guia.unidadId
  if (guia.unidadNombre) prueba.unidadNombre = guia.unidadNombre
  if (typeof guia.tiempoMinutos === "number") prueba.tiempoMinutos = guia.tiempoMinutos
  if (guia.docenteNombre) prueba.docenteNombre = guia.docenteNombre

  // Si la guía es de evaluación formativa, la prueba hereda el carácter formativo.
  if (guia.tipoGuia === "evaluacion_formativa") {
    prueba.tipoEvaluacion = "formativa"
  }

  prueba.secciones = (guia.secciones || []).map((seccionGuia, sIdx) => {
    const seccion = nuevaSeccion(sIdx + 1, "mixto")
    seccion.titulo = seccionGuia.titulo?.trim() || `Ítem ${romano(sIdx + 1)}`

    // Convertir contenido didáctico → instrucciones (texto) + estimulo (recursos visuales).
    const partesInstrucciones: string[] = []
    if (seccionGuia.descripcion && seccionGuia.descripcion.trim().length > 0) {
      partesInstrucciones.push(seccionGuia.descripcion.trim())
    }
    const estimulo: BloqueContenido[] = []
    for (const bloque of seccionGuia.contenido || []) {
      if (bloque.tipo === "texto") {
        const estilo = bloque.data?.estilo
        if (estilo === "lectura") {
          // Bloques de lectura permanecen como estímulo (preserva formato).
          estimulo.push(clonarBloque(bloque))
        } else {
          const texto = stripHtml(bloque.data?.html ?? "")
          if (texto) partesInstrucciones.push(texto)
        }
      } else {
        // Imágenes, tablas y separadores → estímulo.
        estimulo.push(clonarBloque(bloque))
      }
    }
    seccion.instrucciones = partesInstrucciones.join("\n").trim()
    seccion.estimulo = estimulo

    // Convertir actividades → ítems, registrando omitidos.
    seccion.items = []
    ;(seccionGuia.actividades || []).forEach((actividad, aIdx) => {
      const item = actividadGuiaAItemPrueba(actividad, advertencias)
      if (!item) {
        omitidos.push({
          seccionIndex: sIdx,
          itemIndex: aIdx,
          tipo: actividad.tipo,
          razon: `El tipo "${actividad.tipo}" no tiene equivalente en pruebas.`,
        })
        return
      }
      seccion.items.push(item)
    })

    return seccion
  })

  return {
    documento: normalizarPrueba(prueba),
    omitidos,
    advertencias,
  }
}
