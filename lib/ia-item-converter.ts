// ═══════════════════════════════════════════════════════════════════════════
// Conversores JSON de IA → ItemPrueba / ActividadGuia
// ─────────────────────────────────────────────────────────────────────────
// Usados por el panel AIPanel para transformar la respuesta del modelo en
// items tipados. La función principal es `normalizarTipoItemIA`, que mapea
// los strings que la IA puede emitir (a veces inconsistentes) al union
// discriminado. Las funciones `convertirItemIA` construyen el item final
// con valores por defecto razonables.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  ItemPrueba,
  ItemSeleccionMultiple,
  ItemVerdaderoFalso,
  ItemPareados,
  ItemOrdenar,
  ItemCompletar,
  ItemRespuestaCorta,
  ItemDesarrollo,
  TipoItem,
} from "@/lib/pruebas"

const TIPO_MAP: Record<string, TipoItem> = {
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

export function normalizarTipoItemIA(raw: string | undefined): TipoItem {
  if (!raw) return "seleccion_multiple"
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_")
  return TIPO_MAP[normalized] || "desarrollo"
}

function nuevoId(tipo: string): string {
  return `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${tipo}`
}

export function convertirItemIA(it: any): ItemPrueba {
  const tipo = normalizarTipoItemIA(it.tipo)
  const puntaje = Math.max(1, Number(it.puntaje) || 1)
  const enunciado = it.enunciado || ""
  const oaVinculado = it.oaVinculado || undefined

  switch (tipo) {
    case "seleccion_multiple": {
      const alternativas = Array.isArray(it.alternativas) && it.alternativas.length
        ? it.alternativas.map((a: any) => ({
            id: nuevoId("alt"),
            texto: typeof a === "string" ? a : a?.texto || "",
            esCorrecta: Boolean(a?.esCorrecta ?? a?.correcta),
            imagenUrl: a?.imagenUrl,
            imagenStoragePath: a?.imagenStoragePath,
          }))
        : [
            { id: nuevoId("alt"), texto: "", esCorrecta: false },
            { id: nuevoId("alt"), texto: "", esCorrecta: false },
            { id: nuevoId("alt"), texto: "", esCorrecta: false },
            { id: nuevoId("alt"), texto: "", esCorrecta: false },
          ]
      const item: ItemSeleccionMultiple = {
        id: nuevoId(tipo),
        tipo,
        enunciado,
        alternativas,
        recursos: it.recursos || [],
        puntaje,
        oaVinculado,
      }
      return item
    }
    case "verdadero_falso": {
      const item: ItemVerdaderoFalso = {
        id: nuevoId(tipo),
        tipo,
        enunciado,
        respuestaCorrecta: Boolean(it.respuestaCorrecta ?? it.correcta ?? true),
        pideJustificacion: Boolean(it.pideJustificacion),
        recursos: it.recursos || [],
        puntaje,
        oaVinculado,
      }
      return item
    }
    case "pareados": {
      const colA = Array.isArray(it.columnaA) && it.columnaA.length
        ? it.columnaA.map((a: any) => ({ id: nuevoId("a"), texto: a?.texto || "" }))
        : [
            { id: nuevoId("a"), texto: "" },
            { id: nuevoId("a"), texto: "" },
          ]
      const colB = Array.isArray(it.columnaB) && it.columnaB.length
        ? it.columnaB.map((b: any) => ({
            id: nuevoId("b"),
            texto: b?.texto || "",
            correctaParaAId: b?.correctaParaAId || b?.pareCon || "",
          }))
        : [
            { id: nuevoId("b"), texto: "", correctaParaAId: "" },
            { id: nuevoId("b"), texto: "", correctaParaAId: "" },
          ]
      const item: ItemPareados = {
        id: nuevoId(tipo),
        tipo,
        enunciado,
        columnaA: colA,
        columnaB: colB,
        recursos: it.recursos || [],
        puntaje,
        oaVinculado,
      }
      return item
    }
    case "ordenar": {
      const pasos = Array.isArray(it.pasos) && it.pasos.length
        ? it.pasos.map((p: any) => ({ id: nuevoId("p"), texto: p?.texto || "" }))
        : [
            { id: nuevoId("p"), texto: "" },
            { id: nuevoId("p"), texto: "" },
            { id: nuevoId("p"), texto: "" },
          ]
      const item: ItemOrdenar = {
        id: nuevoId(tipo),
        tipo,
        enunciado,
        pasos,
        recursos: it.recursos || [],
        puntaje,
        oaVinculado,
      }
      return item
    }
    case "completar": {
      const item: ItemCompletar = {
        id: nuevoId(tipo),
        tipo,
        enunciado,
        textoConBlancos: it.textoConBlancos || "",
        respuestas: Array.isArray(it.respuestas) ? it.respuestas : [],
        bancoPalabras: it.bancoPalabras,
        recursos: it.recursos || [],
        puntaje,
        oaVinculado,
      }
      return item
    }
    case "respuesta_corta": {
      const item: ItemRespuestaCorta = {
        id: nuevoId(tipo),
        tipo,
        enunciado,
        respuestaEsperada: it.respuestaEsperada,
        recursos: it.recursos || [],
        lineasRespuesta: it.lineasRespuesta ?? 2,
        puntaje,
        oaVinculado,
      }
      return item
    }
    case "desarrollo": {
      const item: ItemDesarrollo = {
        id: nuevoId(tipo),
        tipo,
        enunciado,
        pautaCorreccion: it.pautaCorreccion,
        criterios: Array.isArray(it.criterios)
          ? it.criterios.map((c: any) => ({
              id: nuevoId("crit"),
              texto: c?.texto || "",
              puntaje: Math.max(0, Number(c?.puntaje) || 0),
            }))
          : undefined,
        recursos: it.recursos || [],
        lineasRespuesta: it.lineasRespuesta ?? 5,
        puntaje,
        oaVinculado,
      }
      return item
    }
  }
}
