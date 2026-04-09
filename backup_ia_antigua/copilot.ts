export type CopilotMode = "crear_inicial" | "edicion" | "chat"
export type AIProvider = "gemini" | "openai" | "anthropic" | "compatible" | "firebase-vertex"

export interface OAInput {
  numero?: number | string
  descripcion?: string
  indicadores?: Array<{ texto?: string }>
}

export interface UnitInput {
  nombre_unidad?: string
  proposito?: string
  conocimientos?: string[]
  conocimientos_previos?: string[]
  habilidades?: string[]
  actitudes?: string[]
  adecuaciones_dua?: string
  contexto_docente?: string
  objetivo_docente?: string
}

export interface ClaseInput {
  objetivo?: string
  inicio?: string
  desarrollo?: string
  cierre?: string
  adecuacion?: string
  materiales?: string[]
  tics?: string[]
}

export interface ChatTurnInput {
  role?: "user" | "ai"
  text?: string
}

export interface LessonRequestBody {
  curso?: string
  asignatura?: string
  numeroClase?: number
  oas?: OAInput[]
  habilidades?: string[]
  actitudes?: string[]
  contextoAnterior?: string
  instruccionesAdicionales?: string
  objetivoClase?: string
  claseActual?: ClaseInput | null
  modelProvider?: string
  customToken?: string
  customPrompt?: string
  customModel?: string
  customEndpoint?: string
  promptOverride?: string
  modo?: string
  unidad?: UnitInput | null
  chatHistory?: ChatTurnInput[]
}

export interface GeneratedLesson {
  objetivo: string
  inicio: string
  desarrollo: string
  cierre: string
  materiales: string[]
  tics: string[]
  adecuacion: string
}

export interface StoredAiConfig {
  provider: AIProvider
  token: string
  model: string
  endpoint: string
  promptExtra: string
  promptOverrides: Record<CopilotMode, string>
}

export const DEFAULT_PROMPT_EXTRA = [
  "Prioriza claridad didactica, actividades realistas y evaluacion formativa visible.",
  "Evita relleno, frases grandilocuentes o propuestas imposibles de aplicar en aula.",
  "No uses ejemplos de actividades como plantilla base salvo que el contexto o el docente los pidan.",
].join(" ")

export const DEFAULT_AI_CONFIG: StoredAiConfig = {
  provider: "firebase-vertex",
  token: "",
  model: "gemini-2.5-flash",
  endpoint: "https://api.openai.com/v1",
  promptExtra: DEFAULT_PROMPT_EXTRA,
  promptOverrides: {
    crear_inicial: "",
    edicion: "",
    chat: "",
  },
}

export const PROMPT_MODE_LABELS: Record<CopilotMode, string> = {
  crear_inicial: "Generacion",
  edicion: "Edicion",
  chat: "Chat",
}

export const AI_PROVIDER_OPTIONS: Array<{
  value: AIProvider
  label: string
  defaultModel: string
  endpointPlaceholder?: string
  helper: string
}> = [
  {
    value: "firebase-vertex",
    label: "Firebase Vertex AI",
    defaultModel: "gemini-2.5-flash",
    helper: "Nativo y ultrarrápido desde el navegador (recomendado para producción).",
  },
  {
    value: "gemini",
    label: "Google Gemini (Backend)",
    defaultModel: "gemini-2.5-flash",
    helper: "Admite llave del servidor si no agregas token personal.",
  },
  {
    value: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4.1-mini",
    helper: "Usa tu token personal y el modelo de OpenAI que tengas habilitado.",
  },
  {
    value: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-sonnet-4-20250514",
    helper: "Usa tu API key personal de Claude. Si el modelo configurado falla, el servidor intentara un fallback compatible.",
  },
  {
    value: "compatible",
    label: "Compatible OpenAI",
    defaultModel: "gpt-4o-mini",
    endpointPlaceholder: "https://tu-endpoint.com/v1",
    helper: "Para proveedores compatibles con /chat/completions o gateways personales.",
  },
]

const HTML_TAGS_REGEX = /<(p|ul|ol|li|b|strong|em|br)\b/i

export function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const result: string[] = []

  for (const item of value) {
    const text = cleanText(item)
    if (!text) continue

    const key = text.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    result.push(text)
  }

  return result
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function htmlToPlainText(value: unknown): string {
  if (typeof value !== "string") return ""

  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

export function clipText(text: string, maxLength = 900): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}...`
}

export function ensureHtmlBlock(value: unknown, fallback = ""): string {
  const text = cleanText(value) || fallback
  if (!text) return ""
  if (HTML_TAGS_REGEX.test(text)) return text

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return ""
  if (lines.length === 1) return `<p>${escapeHtml(lines[0])}</p>`

  return `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
}

export function parseJsonResponse(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new Error("La IA devolvio una respuesta vacia o en formato invalido.")
    }

    return JSON.parse(match[0]) as Record<string, unknown>
  }
}

export function coerceGeneratedLesson(raw: Record<string, unknown>): GeneratedLesson {
  return {
    objetivo: htmlToPlainText(raw.objetivo),
    inicio: ensureHtmlBlock(raw.inicio, "<p>Inicio no generado.</p>"),
    desarrollo: ensureHtmlBlock(raw.desarrollo, "<p>Desarrollo no generado.</p>"),
    cierre: ensureHtmlBlock(raw.cierre, "<p>Cierre no generado.</p>"),
    materiales: normalizeList(raw.materiales),
    tics: normalizeList(raw.tics),
    adecuacion: ensureHtmlBlock(raw.adecuacion, "<p>Sin sugerencias de adecuacion por ahora.</p>"),
  }
}

export function resolveMode(rawMode: string | undefined): CopilotMode {
  if (rawMode === "chat" || rawMode === "edicion" || rawMode === "crear_inicial") {
    return rawMode
  }

  return "crear_inicial"
}

export function normalizeAiConfig(input: unknown): StoredAiConfig {
  const raw = typeof input === "object" && input !== null ? input as Partial<StoredAiConfig> : {}
  const provider = raw.provider && AI_PROVIDER_OPTIONS.some((item) => item.value === raw.provider)
    ? raw.provider
    : DEFAULT_AI_CONFIG.provider

  return {
    provider,
    token: cleanText(raw.token),
    model: cleanText(raw.model) || getProviderMeta(provider).defaultModel,
    endpoint: cleanText(raw.endpoint) || DEFAULT_AI_CONFIG.endpoint,
    promptExtra: cleanText(raw.promptExtra) || DEFAULT_AI_CONFIG.promptExtra,
    promptOverrides: {
      crear_inicial: cleanText(raw.promptOverrides?.crear_inicial),
      edicion: cleanText(raw.promptOverrides?.edicion),
      chat: cleanText(raw.promptOverrides?.chat),
    },
  }
}

export function getProviderMeta(provider: AIProvider) {
  return AI_PROVIDER_OPTIONS.find((item) => item.value === provider) || AI_PROVIDER_OPTIONS[0]
}

function formatOAs(oas: OAInput[] = []): string {
  if (oas.length === 0) return "No hay OA seleccionados."

  return oas
    .map((oa) => {
      const numero =
        typeof oa.numero === "number"
          ? String(oa.numero)
          : cleanText(oa.numero)
      const descripcion = cleanText(oa.descripcion)
      const indicadores = normalizeList((oa.indicadores || []).map((item) => cleanText(item?.texto)))

      const header = numero ? `OA ${numero}` : "OA sin numero"
      const detail = descripcion || "Sin descripcion"
      const indicadoresText = indicadores.length > 0
        ? ` Indicadores priorizados: ${indicadores.join("; ")}.`
        : ""

      return `- ${header}: ${detail}.${indicadoresText}`
    })
    .join("\n")
}

function formatUnitContext(unit?: UnitInput | null): string {
  if (!unit) return "No hay contexto adicional de la unidad."

  const sections = [
    unit.nombre_unidad ? `Nombre de la unidad: ${cleanText(unit.nombre_unidad)}` : "",
    unit.proposito ? `Proposito: ${cleanText(unit.proposito)}` : "",
    unit.contexto_docente ? `Contexto del profesor para esta unidad: ${cleanText(unit.contexto_docente)}` : "",
    unit.objetivo_docente ? `Objetivo del profesor para esta unidad: ${cleanText(unit.objetivo_docente)}` : "",
    normalizeList(unit.conocimientos).length > 0
      ? `Conocimientos clave: ${normalizeList(unit.conocimientos).join("; ")}`
      : "",
    normalizeList(unit.conocimientos_previos).length > 0
      ? `Conocimientos previos: ${normalizeList(unit.conocimientos_previos).join("; ")}`
      : "",
    normalizeList(unit.habilidades).length > 0
      ? `Habilidades oficiales de la unidad: ${normalizeList(unit.habilidades).join("; ")}`
      : "",
    normalizeList(unit.actitudes).length > 0
      ? `Actitudes oficiales de la unidad: ${normalizeList(unit.actitudes).join("; ")}`
      : "",
    unit.adecuaciones_dua ? `Sugerencias DUA de referencia: ${cleanText(unit.adecuaciones_dua)}` : "",
  ].filter(Boolean)

  return sections.length > 0 ? sections.join("\n") : "No hay contexto adicional de la unidad."
}

function formatCurrentClass(clase?: ClaseInput | null): string {
  if (!clase) return "No existe una clase previa que editar."

  const objetivo = htmlToPlainText(clase.objetivo)
  const inicio = clipText(htmlToPlainText(clase.inicio), 700)
  const desarrollo = clipText(htmlToPlainText(clase.desarrollo), 1000)
  const cierre = clipText(htmlToPlainText(clase.cierre), 700)
  const adecuacion = clipText(htmlToPlainText(clase.adecuacion), 500)
  const materiales = normalizeList(clase.materiales)
  const tics = normalizeList(clase.tics)

  return JSON.stringify(
    {
      objetivo,
      inicio,
      desarrollo,
      cierre,
      adecuacion,
      materiales,
      tics,
    },
    null,
    2,
  )
}

function formatConversationHistory(history: ChatTurnInput[] = []): string {
  const turns = history
    .map((turn) => ({
      role: turn.role === "ai" ? "Copiloto" : "Docente",
      text: clipText(htmlToPlainText(turn.text), 500),
    }))
    .filter((turn) => turn.text)
    .slice(-10)

  if (turns.length === 0) return "No hay conversacion previa."

  return turns
    .map((turn) => `- ${turn.role}: ${turn.text}`)
    .join("\n")
}

function inferMainTheme(body: LessonRequestBody): string {
  const candidates = [
    cleanText(body.unidad?.objetivo_docente),
    cleanText(body.unidad?.contexto_docente),
    htmlToPlainText(body.objetivoClase),
    ...(body.oas || []).map((oa) => cleanText(oa.descripcion)),
    cleanText(body.unidad?.proposito),
  ]
    .map((item) => clipText(item, 180))
    .filter(Boolean)

  return candidates[0] || "Inferir a partir del contexto entregado."
}

function buildChatPrompt(body: LessonRequestBody): string {
  const curso = cleanText(body.curso) || "curso no especificado"
  const asignatura = cleanText(body.asignatura) || "la asignatura"
  const objetivo = htmlToPlainText(body.objetivoClase) || "Sin objetivo redactado todavia."
  const habilidades = normalizeList(body.habilidades)
  const actitudes = normalizeList(body.actitudes)
  const pregunta = cleanText(body.instruccionesAdicionales)
  const conversation = formatConversationHistory(body.chatHistory)

  return `Eres un copiloto pedagogico chileno, claro y exigente con la calidad didactica.
Responde en espanol, de forma concreta y util para un profesor.
Usa HTML simple cuando quieras resaltar o estructurar mejor la respuesta: <p>, <ul>, <li>, <b>, <br/>.

CONTEXTO DE LA CLASE:
- Curso: ${curso}
- Asignatura: ${asignatura}
- Numero de clase: ${body.numeroClase ?? "sin numero"}
- Objetivo de clase actual: ${objetivo}

OA PRIORIZADOS:
${formatOAs(body.oas)}

HABILIDADES PRIORIZADAS:
${habilidades.length > 0 ? habilidades.join("; ") : "Sin habilidades seleccionadas."}

ACTITUDES PRIORIZADAS:
${actitudes.length > 0 ? actitudes.join("; ") : "Sin actitudes seleccionadas."}

CONTEXTO DE UNIDAD:
${formatUnitContext(body.unidad)}

CLASE ACTUAL:
${formatCurrentClass(body.claseActual)}

CONVERSACION PREVIA:
${conversation}

CONTINUIDAD PREVIA:
${cleanText(body.contextoAnterior) || "No hay continuidad previa informada."}

INSTRUCCIONES DEL DOCENTE:
${cleanText(body.customPrompt) || "Sin instrucciones base adicionales."}

PREGUNTA DEL DOCENTE:
${pregunta || "Sin pregunta."}

REGLAS:
- No devuelvas JSON.
- Tu rol aqui es conversar, aclarar dudas y proponer mejoras puntuales; no reescribas la clase completa por defecto.
- Responde exactamente a la duda o al ajuste pedido por el docente.
- Si propones un cambio, hazlo de forma focalizada sobre el bloque afectado. Solo entrega un fragmento breve de reemplazo si ayuda de verdad.
- No apliques cambios globales como si ya estuvieran aprobados; esos se ejecutan cuando el docente pida modificar la clase.
- Fundamenta tus sugerencias en el contexto entregado.
- Si el docente pide explicacion, explica el por que pedagogico.
- Si detectas una debilidad en la clase actual, mencionala con tacto y propone una mejora concreta.
- No impongas ejemplos tipo, actividades modelo ni metodologias cerradas si el docente no las pidio.
- No inventes OA ni datos curriculares ausentes.`
}

function buildLessonPrompt(body: LessonRequestBody, mode: CopilotMode): string {
  const curso = cleanText(body.curso) || "curso no especificado"
  const asignatura = cleanText(body.asignatura) || "la asignatura"
  const objetivo = htmlToPlainText(body.objetivoClase)
  const habilidades = normalizeList(body.habilidades)
  const actitudes = normalizeList(body.actitudes)
  const teacherPrompt = cleanText(body.customPrompt)
  const continuity = cleanText(body.contextoAnterior)
  const userInstructions = cleanText(body.instruccionesAdicionales)
  const unitName = cleanText(body.unidad?.nombre_unidad) || "Unidad no especificada"
  const mainTheme = inferMainTheme(body)

  const baseContext = `Actua como un asesor pedagogico experto en el curriculum escolar chileno, en diseno didactico innovador y en la Taxonomia de Bloom revisada.

FUENTE PRINCIPAL DE INFORMACION:
Debes basarte prioritariamente en la informacion seleccionada por el docente en la pagina de Actividades y en la base curricular cargada por EduPanel: OA, habilidades, actitudes, objetivo, contexto de unidad, contexto del profesor para esta unidad, objetivo del profesor para esta unidad, continuidad previa e instrucciones adicionales. No reemplaces esa informacion por otros OA, contenidos o enfoques que no hayan sido entregados.

DATOS DE ENTRADA PARA LA CLASE:
- Asignatura: ${asignatura}
- Curso: ${curso}
- Unidad y Numero de Clase: ${unitName}, Clase ${body.numeroClase ?? "sin numero"}
- Tema principal: ${mainTheme}
- Objetivos de Aprendizaje (OA) curriculares:
${formatOAs(body.oas)}
- Habilidades priorizadas: ${habilidades.length > 0 ? habilidades.join("; ") : "Sin habilidades seleccionadas."}
- Actitudes priorizadas: ${actitudes.length > 0 ? actitudes.join("; ") : "Sin actitudes seleccionadas."}
- Contexto de unidad:
${formatUnitContext(body.unidad)}
- Continuidad previa:
${continuity || "No hay continuidad previa informada."}
- Instrucciones base del docente:
${teacherPrompt || "Sin instrucciones base adicionales."}
- Indicaciones extra del docente:
${userInstructions || "No hay instrucciones extra."}

CRITERIOS DE CALIDAD GENERALES:
- Evita actividades genericas o vacias.
- El inicio debe activar conocimientos previos y abrir el proposito.
- El desarrollo debe estar secuenciado paso a paso, con acciones del docente y del estudiante.
- El cierre debe incluir sintesis y evidencia breve del aprendizaje.
- La evaluacion formativa debe estar integrada dentro de inicio, desarrollo o cierre, no como discurso abstracto.
- Los materiales y TIC deben ser concretos y breves, sin duplicados.
- La adecuacion curricular debe ser especifica, realista y util para un docente PIE/DUA.
- No uses ejemplos de actividades, nombres de dinamicas o secuencias modelo como plantilla base salvo que el contexto o el docente los pidan.
- Usa solo HTML simple en inicio, desarrollo, cierre y adecuacion: <p>, <ul>, <li>, <b>, <br/>.
- No escribas titulos redundantes como "Inicio:" dentro de cada bloque.
- No inventes OA ni datos curriculares ausentes.`

  if (mode === "edicion") {
    return `${baseContext}

MODO: EDICION
Debes actuar unicamente como editor de una clase ya existente.
Reescribe solo lo necesario para cumplir el pedido del docente, preservando lo que si funciona de la clase actual.
Si el pedido afecta una parte puntual, no cambies el resto de los bloques salvo por coherencia minima.
Debes considerar tambien los acuerdos y decisiones ya conversadas en el chat con el docente.

CLASE ACTUAL:
${formatCurrentClass(body.claseActual)}

CONVERSACION PREVIA:
${formatConversationHistory(body.chatHistory)}

PEDIDO DE EDICION DEL DOCENTE:
${userInstructions || "Aplica a la clase actual las mejoras, correcciones y acuerdos conversados en el chat."}

REGLAS DE EDICION:
- Aplica el pedido mas reciente del docente junto con los acuerdos relevantes ya conversados.
- Si algo del chat contradice el pedido actual, manda el pedido mas reciente.
- Si el docente pide cambiar explicitamente cierta etapa o elemento, modificalo en el JSON final y mantén el resto de los campos estables.
- ¡MUY IMPORTANTE! En este modo de edición NO debes re-diseñar la clase desde cero ni usar múltiples pasos. Tu único trabajo es aplicar la modificación sobre lo que ya existe.
- La explicacion de tus cambios NO debe ir en los bloques de la clase. Usa unicamente el campo "explicacion_cambios" en el JSON final para decirle al docente que editaste y por que.

RESTRICCION DE FORMATO:
Convierte el resultado final al esquema JSON del sistema usando esta correspondencia:
- "explicacion_cambios": Un mensaje breve y conversacional dirigido al docente (ej: "¡Entendido! Acabo de cambiar el objetivo...").
- "objetivo": objetivo de clase editado o el original si no se pidio cambio.
- "inicio": bloque de inicio editado o el original.
- "desarrollo": bloque de desarrollo editado o el original.
- "cierre": bloque de cierre editado o el original.
- "materiales": lista breve de recursos concretos.
- "tics": solo recursos tecnologicos o digitales.
- "adecuacion": apoyos DUA/PIE concretos.

Devuelve solo JSON puro con esta forma exacta:
{
  "explicacion_cambios": "",
  "objetivo": "",
  "inicio": "",
  "desarrollo": "",
  "cierre": "",
  "materiales": [],
  "tics": [],
  "adecuacion": ""
}`
  }

  return `${baseContext}

MODO: CREACION INICIAL
Tu tarea es disenar una clase completa, estructurada y alineada constructivamente, siguiendo secuencialmente 5 pasos obligatorios antes de redactar la respuesta final.
Tiene que sentirse util para aplicar manana mismo, no como una plantilla generica.
Si el objetivo del docente ya existe, mejoralo sin cambiar su intencion.

REGLA DE CREATIVIDAD:
Quiero que seas altamente creativo/a. No te limites a lo basico; utiliza tu conocimiento general para proponer dinamicas atractivas, metodologias activas y recursos memorables para los estudiantes. Si sugieres canciones, materiales, videos o recursos externos, prioriza referencias reconocibles y utiles para el nivel.

INSTRUCCIONES PASO A PASO PARA LA CREACION:
PASO 1: Analisis del objetivo curricular.
Analiza el nivel taxonomico de la habilidad requerida. Genera internamente una tabla con 3 columnas: "Categoria cognitiva", "Descripcion de la categoria" y "Justificacion pedagogica". Al final, determina el nivel cognitivo general y justifica por que se clasifica asi.

PASO 2: Formulacion del objetivo de clase.
Formula un unico objetivo de clase usando esta estructura: Habilidad + Contenido especifico + Actitud explicita. Luego identifica de forma interna: conocimiento, habilidad y actitud.

PASO 3: Formulacion de indicadores de evaluacion.
Disena entre 3 y 5 indicadores derivados del objetivo de la clase que abarquen Saber, Saber hacer y Ser. Usa esta estructura: Verbo observable + Contenido + Condicion o contexto.

PASO 4: Diseno de la actividad de evaluacion formativa.
Disena una actividad de monitoreo in situ que sea ludica, innovadora y que permita recoger evidencia del aprendizaje. Debe incluir como el docente entrega retroalimentacion inmediata si hay errores.

PASO 5: Diseno de la clase.
Disena los momentos de la clase integrando un gancho motivacional, actividades dinamicas y recursos atractivos. La propuesta debe sentirse aplicable, concreta y coherente con el nivel.

IMPORTANTE PARA LA CREACION DESDE CERO:
- Debes realizar internamente los 5 pasos antes de redactar la salida final.
- No muestres la tabla del paso 1 ni el razonamiento completo fuera del JSON final.
- Usa las conclusiones de los pasos 1 a 5 para construir una sola propuesta final coherente.

RESTRICCION DE FORMATO:
Convierte el resultado final al esquema JSON del sistema usando esta correspondencia:
- "objetivo": objetivo de clase final del paso 2.
- "inicio": bloque de inicio con enganche, ruta de aprendizaje y activacion de conocimientos previos.
- "desarrollo": secuencia principal de actividades, incorporando los indicadores relevantes y la evaluacion formativa del paso 4.
- "cierre": sintesis, reflexion final y preguntas metacognitivas o ticket de salida.
- "materiales": lista breve de recursos concretos.
- "tics": solo recursos tecnologicos o digitales realmente usados.
- "adecuacion": apoyos DUA/PIE concretos para esta clase.

Devuelve solo JSON puro con esta forma exacta:
{
  "objetivo": "",
  "inicio": "",
  "desarrollo": "",
  "cierre": "",
  "materiales": [],
  "tics": [],
  "adecuacion": ""
}`
}

export function buildCopilotPrompt(body: LessonRequestBody, mode: CopilotMode): string {
  const override = cleanText(body.promptOverride)
  if (override) return override

  return mode === "chat"
    ? buildChatPrompt(body)
    : buildLessonPrompt(body, mode)
}
