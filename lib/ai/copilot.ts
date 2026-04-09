// ═══════════════════════════════════════════════════════════════════════════
// Copiloto IA — EduPanel
// Arquitectura limpia: 3 modos bien separados
//  • crear_inicial  → prompt pedagógico de 5 pasos, solo se ejecuta UNA VEZ
//  • chat           → conversación libre, nunca toca la clase
//  • aplicar_cambios → extrae del chat qué cambiar y lo aplica como JSON
// ═══════════════════════════════════════════════════════════════════════════

export type CopilotMode = "crear_inicial" | "chat" | "aplicar_cambios"
export type AIProvider = "public" | "gemini" | "openai" | "anthropic" | "groq" | "compatible"

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface StoredAiConfig {
  provider: AIProvider
  token: string
  model: string
  endpoint: string // solo para el proveedor "compatible"
}

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
  modo?: string
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
  unidad?: UnitInput | null
  chatHistory?: ChatTurnInput[]
  // BYOK
  modelProvider?: string
  customToken?: string
  customModel?: string
  customEndpoint?: string
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

// ─── Configuración por defecto ────────────────────────────────────────────────

export const DEFAULT_AI_CONFIG: StoredAiConfig = {
  provider: "public",
  token: "",
  model: "gemini-2.0-flash",
  endpoint: "https://api.openai.com/v1",
}

export const AI_PROVIDER_OPTIONS: Array<{
  value: AIProvider
  label: string
  defaultModel: string
  endpointPlaceholder?: string
  helper: string
  apiKeyUrl?: string
}> = [
  {
    value: "public",
    label: "EduPanel Público (Gratis)",
    defaultModel: "gemini-2.0-flash",
    helper: "No requiere API key. Usa nuestra cuota compartida gratuita.",
  },
  {
    value: "groq",
    label: "Groq (Rápido y Gratis)",
    defaultModel: "llama-3.3-70b-versatile",
    helper: "Genera tu API key gratis. ¡Ultra veloz!",
    apiKeyUrl: "https://console.groq.com/keys",
  },
  {
    value: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    helper: "Obtén tu API key gratis en Google AI Studio.",
    apiKeyUrl: "https://aistudio.google.com/apikey",
  },
  {
    value: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    helper: "Genera o copia tu API key desde el panel de OpenAI.",
    apiKeyUrl: "https://platform.openai.com/api-keys",
  },
  {
    value: "anthropic",
    label: "Anthropic / Claude",
    defaultModel: "claude-3-5-sonnet-20241022",
    helper: "Crea tu API key en la consola de Anthropic.",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    value: "compatible",
    label: "Compatible OpenAI",
    defaultModel: "gpt-4o-mini",
    endpointPlaceholder: "https://tu-endpoint.com/v1",
    helper: "Para proveedores compatibles con la API de OpenAI (Ollama, Groq, etc.).",
  },
]

// ─── Utilidades ───────────────────────────────────────────────────────────────

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

const HTML_TAGS_REGEX = /<(p|ul|ol|li|b|strong|em|br)\b/i

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

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function clipText(text: string, maxLength = 900): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}...`
}

export function ensureHtmlBlock(value: unknown, fallback = ""): string {
  const text = cleanText(value) || fallback
  if (!text) return ""
  if (HTML_TAGS_REGEX.test(text)) return text
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return ""
  if (lines.length === 1) return `<p>${escapeHtml(lines[0])}</p>`
  return `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`
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
    if (!match) throw new Error("La IA devolvió una respuesta vacía o en formato inválido.")
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
    adecuacion: ensureHtmlBlock(raw.adecuacion, "<p>Sin sugerencias de adecuación por ahora.</p>"),
  }
}

export function resolveMode(rawMode: string | undefined): CopilotMode {
  if (rawMode === "chat" || rawMode === "aplicar_cambios" || rawMode === "crear_inicial") return rawMode
  return "crear_inicial"
}

export function normalizeAiConfig(input: unknown): StoredAiConfig {
  const raw = typeof input === "object" && input !== null ? input as Partial<StoredAiConfig> : {}
  const provider = raw.provider && AI_PROVIDER_OPTIONS.some((o) => o.value === raw.provider)
    ? raw.provider
    : DEFAULT_AI_CONFIG.provider
  return {
    provider,
    token: cleanText(raw.token),
    model: cleanText(raw.model) || getProviderMeta(provider).defaultModel,
    endpoint: cleanText(raw.endpoint) || DEFAULT_AI_CONFIG.endpoint,
  }
}

export function getProviderMeta(provider: AIProvider) {
  return AI_PROVIDER_OPTIONS.find((o) => o.value === provider) || AI_PROVIDER_OPTIONS[0]
}

// ─── Formatters para los prompts ──────────────────────────────────────────────

function formatOAs(oas: OAInput[] = []): string {
  if (oas.length === 0) return "No hay OA seleccionados."
  return oas.map((oa) => {
    const numero = typeof oa.numero === "number" ? String(oa.numero) : cleanText(oa.numero)
    const descripcion = cleanText(oa.descripcion)
    const indicadores = normalizeList((oa.indicadores || []).map((i) => cleanText(i?.texto)))
    const header = numero ? `OA ${numero}` : "OA sin número"
    const detail = descripcion || "Sin descripción"
    const indText = indicadores.length > 0 ? ` Indicadores: ${indicadores.join("; ")}.` : ""
    return `- ${header}: ${detail}.${indText}`
  }).join("\n")
}

function formatUnitContext(unit?: UnitInput | null): string {
  if (!unit) return "No hay contexto adicional de la unidad."
  const sections = [
    unit.nombre_unidad ? `Unidad: ${cleanText(unit.nombre_unidad)}` : "",
    unit.proposito ? `Propósito: ${cleanText(unit.proposito)}` : "",
    unit.contexto_docente ? `Contexto del profesor: ${cleanText(unit.contexto_docente)}` : "",
    unit.objetivo_docente ? `Objetivo del profesor: ${cleanText(unit.objetivo_docente)}` : "",
    normalizeList(unit.conocimientos).length > 0
      ? `Conocimientos clave: ${normalizeList(unit.conocimientos).join("; ")}`
      : "",
    normalizeList(unit.conocimientos_previos).length > 0
      ? `Conocimientos previos: ${normalizeList(unit.conocimientos_previos).join("; ")}`
      : "",
    unit.adecuaciones_dua ? `Sugerencias DUA: ${cleanText(unit.adecuaciones_dua)}` : "",
  ].filter(Boolean)
  return sections.length > 0 ? sections.join("\n") : "No hay contexto adicional de la unidad."
}

function formatClaseActual(clase?: ClaseInput | null): string {
  if (!clase) return "No hay clase existente."
  return JSON.stringify({
    objetivo: htmlToPlainText(clase.objetivo),
    inicio: clipText(htmlToPlainText(clase.inicio), 700),
    desarrollo: clipText(htmlToPlainText(clase.desarrollo), 1000),
    cierre: clipText(htmlToPlainText(clase.cierre), 700),
    adecuacion: clipText(htmlToPlainText(clase.adecuacion), 500),
    materiales: normalizeList(clase.materiales),
    tics: normalizeList(clase.tics),
  }, null, 2)
}

function formatChatHistory(history: ChatTurnInput[] = []): string {
  const turns = history
    .map((t) => ({ role: t.role === "ai" ? "Asistente" : "Profesor", text: clipText(htmlToPlainText(t.text), 600) }))
    .filter((t) => t.text)
    .slice(-12)
  if (turns.length === 0) return "No hay conversación previa."
  return turns.map((t) => `[${t.role}]: ${t.text}`).join("\n")
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 1: CREACIÓN INICIAL
// Se llama UNA SOLA VEZ cuando la clase está vacía.
// Devuelve JSON estructurado con todos los campos de la clase.
// ═══════════════════════════════════════════════════════════════════════════
function buildCrearInicialPrompt(body: LessonRequestBody): string {
  const curso = cleanText(body.curso) || "curso no especificado"
  const asignatura = cleanText(body.asignatura) || "la asignatura"
  const habilidades = normalizeList(body.habilidades)
  const actitudes = normalizeList(body.actitudes)
  const continuity = cleanText(body.contextoAnterior)
  const teacherPrompt = cleanText(body.instruccionesAdicionales)

  return `Actúa como un asesor pedagógico experto en el currículo escolar chileno, diseño didáctico innovador y la Taxonomía de Bloom revisada.

DATOS DE ENTRADA:
- Asignatura: ${asignatura}
- Curso: ${curso}
- Número de clase: ${body.numeroClase ?? "sin número"}
- OA curriculares:
${formatOAs(body.oas)}
- Habilidades priorizadas: ${habilidades.length > 0 ? habilidades.join("; ") : "No especificadas."}
- Actitudes priorizadas: ${actitudes.length > 0 ? actitudes.join("; ") : "No especificadas."}
- Contexto de unidad:
${formatUnitContext(body.unidad)}
- Continuidad con clase anterior: ${continuity || "Primera clase de la unidad."}
- Indicaciones específicas del profesor: ${teacherPrompt || "Ninguna."}

PROCESO INTERNO OBLIGATORIO (realiza estos 5 pasos antes de escribir la respuesta):
PASO 1: Analiza el nivel taxonómico de los OA (Bloom revisado). Determina qué habilidad cognitiva predomina.
PASO 2: Formula el objetivo de clase: Habilidad + Contenido específico + Actitud explícita.
PASO 3: Diseña 3 a 5 indicadores de evaluación: Verbo observable + Contenido + Condición o contexto.
PASO 4: Diseña una actividad de evaluación formativa lúdica e innovadora que recoja evidencia del aprendizaje.
PASO 5: Diseña los momentos de la clase con un gancho motivacional, actividades dinámicas y recursos atractivos.

CRITERIOS DE CALIDAD:
- El inicio debe activar conocimientos previos y abrir el propósito.
- El desarrollo debe estar secuenciado paso a paso, con acciones del docente y del estudiante.
- El cierre debe incluir síntesis y evidencia breve del aprendizaje.
- La evaluación formativa debe estar integrada dentro del desarrollo o el cierre.
- Materiales y TICs deben ser concretos y breves.
- La adecuación debe ser específica y útil para el contexto PIE/DUA.
- Usa solo HTML simple: <p>, <ul>, <li>, <b>, <br/>. No uses títulos redundantes como "Inicio:" dentro del campo inicio.
- Sé altamente creativo: propón dinámicas atractivas, metodologías activas y recursos memorables.

FORMATO DE RESPUESTA (solo JSON puro, sin texto adicional):
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

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 2: CHAT LIBRE
// Conversación completamente natural. NO devuelve JSON.
// La IA puede discutir, sugerir, explicar, corregir, proponer.
// NUNCA reescribe la clase completa. Solo dialoga.
// ═══════════════════════════════════════════════════════════════════════════
function buildChatPrompt(body: LessonRequestBody): string {
  const curso = cleanText(body.curso) || "curso no especificado"
  const asignatura = cleanText(body.asignatura) || "la asignatura"
  const mensaje = cleanText(body.instruccionesAdicionales)

  return `Eres un asistente pedagógico experto en el currículo escolar chileno. Estás conversando directamente con un profesor sobre su clase.

CONTEXTO DE LA CLASE ACTUAL:
- Asignatura: ${asignatura} | Curso: ${curso} | Clase N°${body.numeroClase ?? "?"}
- OA: ${formatOAs(body.oas)}
- Clase actual:
${formatClaseActual(body.claseActual)}

CONVERSACIÓN HASTA AHORA:
${formatChatHistory(body.chatHistory)}

REGLAS DE COMPORTAMIENTO:
- Responde de forma natural y conversacional, como lo haría cualquier asistente de IA.
- NO devuelvas JSON. NO reescribas la clase completa en tu respuesta.
- Si el profesor pide un cambio, descríbelo en lenguaje natural. Por ejemplo: "Te propongo cambiar el inicio así: ...".
- Si el profesor hace una pregunta pedagógica, respóndela con claridad y fundamentación.
- Puedes ser directo y honrado si algo de la clase no está bien. Propón mejoras concretas.
- Si detectas inconsistencias con los OA, menciónalas.
- Usa HTML simple si ayuda a estructurar tu respuesta: <p>, <ul>, <li>, <b>.

MENSAJE DEL PROFESOR:
${mensaje || "(Sin mensaje)"}`
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 3: APLICAR CAMBIOS
// Se ejecuta cuando el profesor hace clic en "Aplicar cambios".
// Lee la conversación, identifica qué acordaron, aplica SOLO ESO.
// Devuelve JSON con todos los campos (los no modificados quedan igual).
// ═══════════════════════════════════════════════════════════════════════════
function buildAplicarCambiosPrompt(body: LessonRequestBody): string {
  return `Eres un extractor de modificaciones pedagógicas. Tu única tarea es aplicar a la clase los cambios que el profesor y el asistente acordaron en la conversación.

CLASE ACTUAL (base de partida):
${formatClaseActual(body.claseActual)}

CONVERSACIÓN COMPLETA:
${formatChatHistory(body.chatHistory)}

INSTRUCCIONES ESTRICTAS:
1. Lee la conversación y determina qué campos de la clase el profesor quiso cambiar.
2. Aplica SOLO esos cambios. Si un campo no fue discutido, devuélvelo idéntico a la clase actual.
3. No inventes cambios que no fueron pedidos.
4. No escribas explicaciones dentro de los campos de la clase. Solo el contenido didáctico.
5. Usa HTML simple en inicio, desarrollo, cierre y adecuacion: <p>, <ul>, <li>, <b>, <br/>.
6. El campo "objetivo" debe ser texto plano, sin HTML.
7. El campo "resumen_cambios" debe ser un mensaje breve y conversacional para el profesor (ej: "¡Listo! Modifiqué el inicio para que sea más breve y dinámico.").

FORMATO DE RESPUESTA (solo JSON puro, sin texto adicional):
{
  "resumen_cambios": "",
  "objetivo": "",
  "inicio": "",
  "desarrollo": "",
  "cierre": "",
  "materiales": [],
  "tics": [],
  "adecuacion": ""
}`
}

// ─── Punto de entrada principal ───────────────────────────────────────────────

export function buildCopilotPrompt(body: LessonRequestBody, mode: CopilotMode): string {
  if (mode === "crear_inicial") return buildCrearInicialPrompt(body)
  if (mode === "aplicar_cambios") return buildAplicarCambiosPrompt(body)
  return buildChatPrompt(body)
}
