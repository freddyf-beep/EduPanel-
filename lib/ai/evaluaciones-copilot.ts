// ═══════════════════════════════════════════════════════════════════════════
// Copiloto IA para Pruebas y Guias
// Arquitectura identica al copiloto de clases:
//   - Prompt en JSON -> respuesta en JSON
//   - Mismos proveedores BYOK (Gemini, OpenAI, Anthropic, Groq, Compatible)
//   - Modos separados para pruebas y guias
//   - Vinculacion automatica con curriculo, ver_unidad y clases planificadas
// ═══════════════════════════════════════════════════════════════════════════

import type { AIProvider, StoredAiConfig } from "@/lib/ai/copilot"
import type { OAEditado } from "@/lib/curriculo"
import type { ListaCotejoTemplate } from "@/lib/listas-cotejo"

// Stubs for missing modules in public repository
export interface PruebaTemplate { [key: string]: any }
export interface SeccionPrueba { [key: string]: any }
export interface GuiaTemplate { [key: string]: any }
export interface SeccionGuia { [key: string]: any }

export type EvalCopilotMode =
  | "prueba_generar"
  | "prueba_seccion"
  | "guia_generar"
  | "guia_seccion"
  | "chat"
  | "aplicar_cambios"
  | "rubrica_generar"
  | "lista_cotejo_generar"

export interface ContextoCurricular {
  asignatura: string
  curso: string
  nivelCurricular?: string
  unidadId?: string
  unidadNombre?: string
  oas: OAEditado[]
  habilidades: string[]
  conocimientos: string[]
  actitudes: string[]
  contextoDocente?: string
  objetivoDocente?: string
  clasesVinculadas?: ClaseVinculada[]
  actividadClaseVinculada?: ActividadClaseResumen
}

export interface ClaseVinculada {
  numero: number
  fecha?: string
  oaIds: string[]
  objetivo?: string
  inicio?: string
  desarrollo?: string
  cierre?: string
}

export interface ActividadClaseResumen {
  numeroClase: number
  fecha?: string
  objetivo?: string
  inicio?: string
  desarrollo?: string
  cierre?: string
  materiales?: string[]
}

export interface EvalCopilotRequest {
  modo: EvalCopilotMode
  contexto: ContextoCurricular
  documentoActual?: Partial<PruebaTemplate> | Partial<GuiaTemplate> | Partial<ListaCotejoTemplate>
  seccionActual?: Partial<SeccionPrueba> | Partial<SeccionGuia>
  instrucciones?: string
  chatHistory?: Array<{ role: "user" | "ai"; text: string }>
  tipoDoc: "prueba" | "guia" | "rubrica" | "lista_cotejo"
  modelProvider?: string
  customToken?: string
  customModel?: string
  customEndpoint?: string
  customPrompt?: string
}

export interface SeccionGeneradaPrueba {
  titulo: string
  instrucciones: string
  tipoPredominante: string
  items: ItemGenerado[]
}

export interface ItemGenerado {
  tipo: string
  enunciado: string
  puntaje: number
  oaVinculado?: string
  alternativas?: Array<{ texto: string; esCorrecta: boolean }>
  respuestaCorrecta?: boolean
  pideJustificacion?: boolean
  pasos?: Array<{ texto: string }>
  textoConBlancos?: string
  respuestas?: string[]
  bancoPalabras?: string[]
  columnaA?: Array<{ texto: string }>
  columnaB?: Array<{ texto: string; correctaParaAId: string }>
  lineasRespuesta?: number
  respuestaEsperada?: string
  pautaCorreccion?: string
  criterios?: Array<{ texto: string; puntaje: number }>
}

export interface SeccionGeneradaGuia {
  titulo: string
  descripcion: string
  contenidoHtml: string
  actividades: ActividadGenerada[]
}

export interface ActividadGenerada {
  tipo: string
  enunciado: string
  puntaje?: number
  oaVinculado?: string
  datos?: Record<string, unknown>
}

export interface EvalCopilotResponse {
  secciones?: SeccionGeneradaPrueba[]
  seccionesGuia?: SeccionGeneradaGuia[]
  seccion?: SeccionGeneradaPrueba
  seccionGuia?: SeccionGeneradaGuia
  respuestaChat?: string
  cambiosAplicados?: Record<string, unknown>
  explicacionCambios?: string
  oasSugeridos?: string[]
  indicadoresSugeridos?: string[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function formatOAs(oas: OAEditado[]): string {
  const sel = oas.filter(oa => oa.seleccionado || oa.esPropio)
  if (sel.length === 0) return "No hay OA seleccionados."
  return sel.map(oa => {
    const num = oa.numero ? `OA ${oa.numero}` : oa.id
    const desc = cleanStr(oa.descripcion)
    const inds = (oa.indicadores || [])
      .filter(i => i.seleccionado)
      .map(i => cleanStr(i.texto))
      .filter(Boolean)
    const indText = inds.length > 0 ? `\n  Indicadores: ${inds.join("; ")}` : ""
    return `- ${num}: ${desc}${indText}`
  }).join("\n")
}

function formatCtx(ctx: ContextoCurricular): string {
  return [
    `Asignatura: ${ctx.asignatura}`,
    `Curso: ${ctx.curso}${ctx.nivelCurricular ? ` (nivel: ${ctx.nivelCurricular})` : ""}`,
    ctx.unidadNombre ? `Unidad: ${ctx.unidadNombre}` : "",
    ctx.contextoDocente ? `Contexto docente: ${ctx.contextoDocente}` : "",
    ctx.objetivoDocente ? `Objetivo docente: ${ctx.objetivoDocente}` : "",
    ctx.habilidades.length > 0 ? `Habilidades: ${ctx.habilidades.join("; ")}` : "",
    ctx.conocimientos.length > 0 ? `Conocimientos: ${ctx.conocimientos.join("; ")}` : "",
    ctx.actitudes.length > 0 ? `Actitudes: ${ctx.actitudes.join("; ")}` : "",
  ].filter(Boolean).join("\n")
}

function formatClases(clases?: ClaseVinculada[]): string {
  if (!clases || clases.length === 0) return "No hay clases vinculadas."
  return clases.slice(0, 5).map(c => {
    const oaText = c.oaIds.length > 0 ? ` (OAs: ${c.oaIds.join(", ")})` : ""
    const objText = c.objetivo ? `\n  Objetivo: ${c.objetivo}` : ""
    return `- Clase ${c.numero}${c.fecha ? ` (${c.fecha})` : ""}${oaText}${objText}`
  }).join("\n")
}

function formatActividad(act?: ActividadClaseResumen): string {
  if (!act) return "No hay actividad vinculada."
  return [
    `Clase ${act.numeroClase}${act.fecha ? ` (${act.fecha})` : ""}`,
    act.objetivo ? `Objetivo: ${act.objetivo}` : "",
    act.inicio ? `Inicio: ${act.inicio.replace(/<[^>]+>/g, "").slice(0, 200)}` : "",
    act.desarrollo ? `Desarrollo: ${act.desarrollo.replace(/<[^>]+>/g, "").slice(0, 300)}` : "",
  ].filter(Boolean).join("\n")
}

// ─── Builder principal ────────────────────────────────────────────────────────

export function buildEvalCopilotPrompt(req: EvalCopilotRequest): string {
  const cp = cleanStr(req.customPrompt)
  const ins = cleanStr(req.instrucciones)
  switch (req.modo) {
    case "prueba_generar":   return buildPruebaGenerar(req, cp, ins)
    case "prueba_seccion":   return buildPruebaSeccion(req, cp, ins)
    case "guia_generar":     return buildGuiaGenerar(req, cp, ins)
    case "guia_seccion":     return buildGuiaSeccion(req, cp, ins)
    case "chat":             return buildChat(req, ins)
    case "aplicar_cambios":  return buildAplicarCambios(req, ins)
    case "rubrica_generar":  return buildRubricaGenerar(req, cp, ins)
    case "lista_cotejo_generar": return buildListaCotejoGenerar(req, cp, ins)
  }
}

// ─── Prueba completa ──────────────────────────────────────────────────────────

function buildPruebaGenerar(req: EvalCopilotRequest, cp: string, ins: string): string {
  const ctx = req.contexto
  const doc = req.documentoActual as Partial<PruebaTemplate> | undefined
  return `Eres un experto en evaluacion educativa chilena, especializado en el curriculo oficial Mineduc.

${cp ? `INSTRUCCIONES MAESTRAS:\n${cp}\n` : ""}
CONTEXTO CURRICULAR:
${formatCtx(ctx)}

OA SELECCIONADOS:
${formatOAs(ctx.oas)}

CLASES PLANIFICADAS VINCULADAS:
${formatClases(ctx.clasesVinculadas)}

ACTIVIDAD DE CLASE VINCULADA:
${formatActividad(ctx.actividadClaseVinculada)}

CONFIGURACION DE LA PRUEBA:
- Nombre: ${cleanStr((doc as any)?.nombre) || "Prueba"}
- Tipo: ${cleanStr((doc as any)?.tipoEvaluacion) || "sumativa"}
- Tiempo: ${(doc as any)?.tiempoMinutos || 90} minutos
- Exigencia: ${((doc as any)?.exigencia || 0.6) * 100}%
- Ponderacion: ${(doc as any)?.ponderacion || 15}%

INSTRUCCIONES ADICIONALES:
${ins || "Ninguna."}

TAREA: Genera una prueba escrita completa para ${ctx.curso} de ${ctx.asignatura}.

REGLAS:
1. Genera 3-5 secciones con tipos variados.
2. Total 20-40 items distribuidos coherentemente.
3. Seleccion multiple: 4 alternativas, una correcta (esCorrecta: true).
4. Vincula cada item al oaVinculado correspondiente.
5. Puntajes: SM=1pt, VF=1pt, desarrollo=2-4pts.
6. Enunciados claros y apropiados para el nivel.

RESPUESTA (JSON puro sin texto adicional):
{
  "secciones": [
    {
      "titulo": "Item I: Seleccion multiple",
      "instrucciones": "Marca con X la alternativa correcta. (1 pt c/u)",
      "tipoPredominante": "seleccion_multiple",
      "items": [
        {
          "tipo": "seleccion_multiple",
          "enunciado": "Pregunta...",
          "puntaje": 1,
          "oaVinculado": "OA1",
          "alternativas": [
            { "texto": "Opcion a", "esCorrecta": false },
            { "texto": "Opcion b", "esCorrecta": true },
            { "texto": "Opcion c", "esCorrecta": false },
            { "texto": "Opcion d", "esCorrecta": false }
          ]
        }
      ]
    },
    {
      "titulo": "Item II: Verdadero o Falso",
      "instrucciones": "Escribe V o F. Justifica las falsas. (1 pt c/u)",
      "tipoPredominante": "verdadero_falso",
      "items": [
        {
          "tipo": "verdadero_falso",
          "enunciado": "Afirmacion...",
          "puntaje": 1,
          "oaVinculado": "OA1",
          "respuestaCorrecta": true,
          "pideJustificacion": true
        }
      ]
    },
    {
      "titulo": "Item III: Desarrollo",
      "instrucciones": "Responde de manera completa.",
      "tipoPredominante": "desarrollo",
      "items": [
        {
          "tipo": "desarrollo",
          "enunciado": "Explica...",
          "puntaje": 4,
          "oaVinculado": "OA2",
          "lineasRespuesta": 6,
          "pautaCorreccion": "La respuesta debe incluir...",
          "criterios": [
            { "texto": "Identifica correctamente...", "puntaje": 2 },
            { "texto": "Argumenta con ejemplos...", "puntaje": 2 }
          ]
        }
      ]
    }
  ],
  "oasSugeridos": ["OA1: descripcion..."],
  "indicadoresSugeridos": ["Indicador 1..."]
}`
}

// ─── Rubrica completa ─────────────────────────────────────────────────────────

function buildRubricaGenerar(req: EvalCopilotRequest, cp: string, ins: string): string {
  const ctx = req.contexto
  return `Eres un experto en diseño de rúbricas de evaluación para el sistema educativo chileno, alineadas al currículum oficial Mineduc.
Tu tarea es generar una rúbrica analítica completa basada en los detalles de una clase planificada.

${cp ? "INSTRUCCIONES MAESTRAS:\n" + cp + "\n" : ""}
CONTEXTO CURRICULAR:
${formatCtx(ctx)}

OA SELECCIONADOS DE LA CLASE:
${formatOAs(ctx.oas)}

ACTIVIDAD DE CLASE PLANIFICADA:
${formatActividad(ctx.actividadClaseVinculada)}

INSTRUCCIONES ADICIONALES:
${ins || "Ninguna."}

TAREA: Genera una rúbrica estructurada en partes y criterios de evaluación de alta calidad pedagógica.

REGLAS DE DISEÑO DE RÚBRICA:
1. Divide la rúbrica en 1 o 2 partes temáticas o categorías de criterios lógicas (ej: "Aspectos Conceptuales", "Ejecución Práctica", "Habilidades Técnicas").
2. Cada parte debe tener de 2 a 4 criterios de evaluación específicos. En total, la rúbrica debe tener entre 3 y 6 criterios.
3. Cada criterio de evaluación DEBE tener descripciones claras e inequívocas para los 4 niveles de desempeño estándar:
   - "logrado" (4 puntos): Nivel óptimo que cumple plenamente con los indicadores de evaluación.
   - "casiLogrado" (3 puntos): Cumple con la mayor parte del desempeño esperado pero presenta mínimos detalles a mejorar.
   - "parcialmenteLogrado" (2 puntos): Cumple parcialmente, muestra vacíos importantes o inconsistencias en la aplicación.
   - "porLograr" (1 punto): Desempeño mínimo, no alcanza los requisitos básicos o requiere apoyo constante.
4. Vincula cada parte o criterio a los OAs correspondientes mediante la propiedad "oasVinculados" (lista de strings, ej: ["OA 2"]).
5. Las descripciones de los niveles deben ser específicas a la tarea/actividad de la clase descrita. No utilices descripciones genéricas como "Hace todo bien" o "No lo hace".

RESPUESTA (JSON puro sin texto adicional, sin code-fences, que coincida con la siguiente estructura):
{
  "nombre": "Rúbrica: [Nombre descriptivo alineado a la actividad]",
  "partes": [
    {
      "nombre": "Nombre de la Parte (ej: Evaluación del Producto/Desempeño)",
      "oasVinculados": ["OA 4"],
      "criterios": [
        {
          "nombre": "Nombre del Criterio (ej: Calidad del Trabajo, Afinación, Uso del Tiempo)",
          "niveles": {
            "logrado": { "descripcion": "Descripción detallada del desempeño de 4 puntos..." },
            "casiLogrado": { "descripcion": "Descripción detallada del desempeño de 3 puntos..." },
            "parcialmenteLogrado": { "descripcion": "Descripción detallada del desempeño de 2 puntos..." },
            "porLograr": { "descripcion": "Descripción detallada del desempeño de 1 punto..." }
          }
        }
      ]
    }
  ]
}`
}

// ─── Seccion de prueba ────────────────────────────────────────────────────────

function buildPruebaSeccion(req: EvalCopilotRequest, cp: string, ins: string): string {
  const ctx = req.contexto
  const sec = req.seccionActual as Partial<SeccionPrueba> | undefined
  return `Eres un experto en evaluacion educativa chilena.

${cp ? `INSTRUCCIONES MAESTRAS:\n${cp}\n` : ""}
CONTEXTO: ${formatCtx(ctx)}

OA: ${formatOAs(ctx.oas)}

SECCION A GENERAR:
- Tipo: ${cleanStr((sec as any)?.tipoPredominante) || "seleccion_multiple"}
- Titulo: ${cleanStr((sec as any)?.titulo) || "Nueva seccion"}

INSTRUCCIONES: ${ins || "Genera 5-10 items de calidad."}

RESPUESTA (JSON puro):
{
  "seccion": {
    "titulo": "Item X: Tipo",
    "instrucciones": "Instrucciones...",
    "tipoPredominante": "seleccion_multiple",
    "items": [
      {
        "tipo": "seleccion_multiple",
        "enunciado": "Pregunta...",
        "puntaje": 1,
        "oaVinculado": "OA1",
        "alternativas": [
          { "texto": "a", "esCorrecta": false },
          { "texto": "b", "esCorrecta": true },
          { "texto": "c", "esCorrecta": false },
          { "texto": "d", "esCorrecta": false }
        ]
      }
    ]
  }
}`
}

// ─── Guia completa ────────────────────────────────────────────────────────────

function buildGuiaGenerar(req: EvalCopilotRequest, cp: string, ins: string): string {
  const ctx = req.contexto
  const doc = req.documentoActual as Partial<GuiaTemplate> | undefined
  return `Eres un experto en diseno de material didactico para la educacion chilena. Creas guias que combinan contenido explicativo con actividades variadas intercaladas.

${cp ? `INSTRUCCIONES MAESTRAS:\n${cp}\n` : ""}
CONTEXTO CURRICULAR:
${formatCtx(ctx)}

OA SELECCIONADOS:
${formatOAs(ctx.oas)}

CLASES PLANIFICADAS VINCULADAS (usa como base de contenido):
${formatClases(ctx.clasesVinculadas)}

ACTIVIDAD DE CLASE VINCULADA:
${formatActividad(ctx.actividadClaseVinculada)}

CONFIGURACION:
- Nombre: ${cleanStr((doc as any)?.nombre) || "Guia"}
- Tipo: ${cleanStr((doc as any)?.tipoGuia) || "aprendizaje"}
- Objetivo: ${cleanStr((doc as any)?.objetivo) || "No especificado"}
- Tiempo: ${(doc as any)?.tiempoMinutos || 45} minutos

INSTRUCCIONES ADICIONALES:
${ins || "Ninguna."}

TAREA: Genera una guia de aprendizaje completa y didactica para ${ctx.curso} de ${ctx.asignatura}.

REGLAS:
1. Cada seccion: primero contenidoHtml (explicativo), luego actividades.
2. Contenido claro con ejemplos concretos para el nivel.
3. Actividades variadas: mezcla tipos diferentes.
4. HTML simple en contenidoHtml: <p>, <ul>, <li>, <b>, <br/>, <h3>.
5. Genera 2-4 secciones tematicas.
6. Tipos validos: seleccion_multiple, verdadero_falso, completar, respuesta_corta, ordenar, pareados, encerrar, marcar, colorear, dibujar, investigar, sopa_letras, abierta.

RESPUESTA (JSON puro sin texto adicional):
{
  "seccionesGuia": [
    {
      "titulo": "I. Titulo de la seccion",
      "descripcion": "Descripcion breve",
      "contenidoHtml": "<p>Contenido explicativo...</p><ul><li>Punto 1</li></ul>",
      "actividades": [
        {
          "tipo": "seleccion_multiple",
          "enunciado": "Segun el texto, cual es...?",
          "puntaje": 1,
          "oaVinculado": "OA1",
          "datos": {
            "tipo": "seleccion_multiple",
            "alternativas": [
              { "id": "a1", "texto": "Opcion a", "correcta": false },
              { "id": "a2", "texto": "Opcion b", "correcta": true },
              { "id": "a3", "texto": "Opcion c", "correcta": false },
              { "id": "a4", "texto": "Opcion d", "correcta": false }
            ]
          }
        },
        {
          "tipo": "completar",
          "enunciado": "Completa los espacios.",
          "puntaje": 2,
          "oaVinculado": "OA1",
          "datos": {
            "tipo": "completar",
            "texto": "La __ es importante porque __.",
            "respuestas": ["alimentacion", "nos da energia"],
            "banco": ["alimentacion", "nos da energia", "el agua", "el sol"]
          }
        }
      ]
    }
  ],
  "oasSugeridos": ["OA1: descripcion..."],
  "indicadoresSugeridos": ["Indicador 1..."]
}`
}

// ─── Seccion de guia ──────────────────────────────────────────────────────────

function buildGuiaSeccion(req: EvalCopilotRequest, cp: string, ins: string): string {
  const ctx = req.contexto
  const sec = req.seccionActual as Partial<SeccionGuia> | undefined
  return `Eres un experto en diseno de material didactico chileno.

${cp ? `INSTRUCCIONES MAESTRAS:\n${cp}\n` : ""}
CONTEXTO: ${formatCtx(ctx)}
OA: ${formatOAs(ctx.oas)}

SECCION A GENERAR:
- Titulo: ${cleanStr((sec as any)?.titulo) || "Nueva seccion"}
- Descripcion: ${cleanStr((sec as any)?.descripcion) || ""}

INSTRUCCIONES: ${ins || "Genera contenido didactico y 3-5 actividades variadas."}

RESPUESTA (JSON puro):
{
  "seccionGuia": {
    "titulo": "Titulo",
    "descripcion": "Descripcion",
    "contenidoHtml": "<p>Contenido...</p>",
    "actividades": [
      {
        "tipo": "verdadero_falso",
        "enunciado": "Lee y marca V o F.",
        "puntaje": 1,
        "oaVinculado": "OA1",
        "datos": {
          "tipo": "verdadero_falso",
          "afirmaciones": [
            { "id": "af1", "texto": "Afirmacion 1", "correcta": true },
            { "id": "af2", "texto": "Afirmacion 2", "correcta": false }
          ]
        }
      }
    ]
  }
}`
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

function buildChat(req: EvalCopilotRequest, ins: string): string {
  const ctx = req.contexto
  const doc = req.documentoActual
  const history = (req.chatHistory || []).slice(-12)
  const histText = history.length > 0
    ? history.map(t => `[${t.role === "ai" ? "Asistente" : "Docente"}]: ${t.text}`).join("\n")
    : "Sin conversacion previa."
  const docResumen = doc
    ? `Tipo: ${req.tipoDoc} | Nombre: ${cleanStr((doc as any)?.nombre)} | Curso: ${ctx.curso}`
    : "Sin documento activo."

  return `Eres un asesor pedagogico experto en evaluacion educativa chilena.

DOCUMENTO ACTIVO: ${docResumen}
CONTEXTO: ${formatCtx(ctx)}
OA: ${formatOAs(ctx.oas)}

CONVERSACION:
${histText}

INSTRUCCIONES: ${ins || "Responde de manera clara y pedagogica."}

Responde al ultimo mensaje del docente de forma util y concreta.`
}

// ─── Aplicar cambios ──────────────────────────────────────────────────────────

function buildAplicarCambios(req: EvalCopilotRequest, ins: string): string {
  const doc = req.documentoActual
  const history = (req.chatHistory || []).slice(-8)
  const histText = history.map(t => `[${t.role === "ai" ? "Asistente" : "Docente"}]: ${t.text}`).join("\n")
  const docJson = doc ? JSON.stringify(doc, null, 2).slice(0, 3000) : "{}"

  return `Eres un asistente que aplica cambios a documentos educativos en JSON.

DOCUMENTO ACTUAL (${req.tipoDoc}):
${docJson}

CONVERSACION (cambios acordados):
${histText}

INSTRUCCION: ${ins || "Aplica los cambios discutidos."}

REGLAS:
1. Solo modifica lo que el docente pidio.
2. Mantiene la estructura JSON exacta.
3. No inventes contenido no solicitado.

RESPUESTA (JSON puro):
{
  "cambiosAplicados": { ...documento modificado... },
  "explicacionCambios": "Descripcion breve de los cambios."
}`
}

function buildListaCotejoGenerar(req: EvalCopilotRequest, cp: string, ins: string): string {
  const ctx = req.contexto
  return `Actúa como un Diseñador Instruccional Experto en Evaluación y Currículum Chileno (Decreto 67 y Decreto 83).
Tu tarea es generar una Lista de Cotejo completa de manera estructurada para el curso ${ctx.curso} y la asignatura ${ctx.asignatura}.

${cp ? `INSTRUCCIONES MAESTRAS:\n${cp}\n` : ""}
CONTEXTO CURRICULAR:
${formatCtx(ctx)}

OA SELECCIONADOS DE LA CLASE:
${formatOAs(ctx.oas)}

INSTRUCCIONES ADICIONALES DEL DOCENTE:
${ins || "Ninguna."}

REGLAS DE DISEÑO OBLIGATORIAS:
1. Formulación Observable (Decreto 67): Redacta indicadores que representen acciones empíricas observables de forma directa (ej. 'Representa', 'Produce', 'Identifica', 'Ajusta', 'Mantiene'). Evita estrictamente el uso de verbos mentalistas o inobservables (ej. 'comprende', 'entiende', 'sabe', 'conoce', 'valora', 'aprecia').
2. Indicadores Generales y Flexibles: Los indicadores NO deben ser ejemplos específicos o conductas rígidas (por ejemplo, evita 'estirando los brazos para sonidos largos y palmada para cortos' o 'percutiendo con lápices'). En su lugar, redacta indicadores generales (ej. 'Representa mediante movimientos corporales o gestos libres...') para que el estudiante interprete y demuestre la habilidad a su manera, promoviendo su autonomía.
3. Adecuaciones DUA (Decreto 83): Para cada indicador, proporciona un 'Mecanismo de Salida Alternativo' (Canal Alternativo) que permita demostrar la misma competencia si existen barreras expresivas, motoras o sensoriales. Activa 'focoDiferenciadoActivo': true y describe el mecanismo en 'focoDiferenciadoTexto'.
4. Focos Actitudinales (OAT): Integra al menos 2 indicadores actitudinales transversales (OAT) alineados con la asignatura y márcalos con 'esTransversal': true.
5. Estructura del Documento: Crea de 3 a 5 secciones temáticas lógicas con 2 a 4 indicadores cada una.
6. Escala Dicotómica: Usa por defecto la escala ["Sí", "No"], o adáptala si el docente especificó otra en las instrucciones adicionales.

RESPUESTA (JSON puro sin texto adicional, sin code-fences, que coincida con la siguiente estructura):
{
  "nombre": "Lista de cotejo - ${ctx.asignatura} - ${ctx.curso}",
  "curso": "${ctx.curso}",
  "asignatura": "${ctx.asignatura}",
  "unidadNombre": "${ctx.unidadNombre || ""}",
  "instruccionesMetodologicas": "Marque con una 'X' en la casilla correspondiente si el estudiante cumple (Sí) o no cumple (No) con la acción descrita de manera general. Permita que el estudiante elija o proponga formas alternativas de representar cada habilidad según sus propias capacidades de expresión.",
  "escalaDicotomica": ["Sí", "No"],
  "puntajePorSi": 2,
  "secciones": [
    {
      "nombre": "I. Nombre de la Sección",
      "indicadores": [
        {
          "texto": "Texto del indicador observable y general.",
          "esTransversal": false,
          "focoDiferenciadoActivo": true,
          "focoDiferenciadoTexto": "Mecanismo alternativo de salida..."
        }
      ]
    }
  ]
}`
}

export type { AIProvider, StoredAiConfig }
