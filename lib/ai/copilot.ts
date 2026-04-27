// ═══════════════════════════════════════════════════════════════════════════
// Copiloto IA — EduPanel
// Arquitectura limpia: 3 modos bien separados
//  • crear_inicial  → prompt pedagógico de 5 pasos, solo se ejecuta UNA VEZ
//  • chat           → conversación libre, nunca toca la clase
//  • aplicar_cambios → extrae del chat qué cambiar y lo aplica como JSON
// ═══════════════════════════════════════════════════════════════════════════

export type CopilotMode =
  | "crear_inicial"
  | "chat"
  | "aplicar_cambios"
  | "freddy_detallado"
  | "regenerar_bloom"
  | "regenerar_indicadores"
export type AIProvider = "public" | "gemini" | "openai" | "anthropic" | "groq" | "compatible"

export const PROMPT_MODE_LABELS: Record<CopilotMode, string> = {
  crear_inicial: "Crear inicial",
  chat: "Conversar",
  aplicar_cambios: "Aplicar cambios",
  freddy_detallado: "Detallado pedagógico",
  regenerar_bloom: "Regenerar Bloom",
  regenerar_indicadores: "Regenerar indicadores",
}

// ─── Tipos pedagógicos (metodología Freddy) ──────────────────────────────────

export type NivelBloom = "BAJO" | "MEDIO" | "ALTO"
export type CategoriaBloom = "Recordar" | "Comprender" | "Aplicar" | "Analizar" | "Evaluar" | "Crear"
export type DimensionAprendizaje = "saber" | "saber_hacer" | "ser"
export type TipoEvaluacion = "diagnostica" | "formativa" | "sumativa"

export interface AnalisisBloom {
  oaId: string
  categoria: CategoriaBloom
  nivel: NivelBloom
  justificacion: string
  verbosSugeridos: string[]
}

export interface ObjetivoMultinivel {
  basico: string
  intermedio: string
  avanzado: string
  recomendado: "basico" | "intermedio" | "avanzado"
}

export interface IndicadorEvaluacion {
  id: string
  texto: string
  dimension: DimensionAprendizaje
  nivelBloom: NivelBloom
  oaId: string
}

export interface ActividadEvaluacion {
  tipo: TipoEvaluacion
  descripcion: string
  criterios: string[]
  alineacionMBE: string[]
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface StoredAiConfig {
  provider: AIProvider
  token: string
  model: string
  endpoint: string // solo para el proveedor "compatible"
  promptExtra?: string
  promptOverrides: Partial<Record<CopilotMode, string>>
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
  totalClasesUnidad?: number
  nivelCurricular?: string
  duracionMinutos?: number
  contextoProfesor?: string
  oas?: OAInput[]
  habilidades?: string[]
  actitudes?: string[]
  contextoAnterior?: string
  instruccionesAdicionales?: string
  objetivoClase?: string
  claseActual?: ClaseInput | null
  unidad?: UnitInput | null
  chatHistory?: ChatTurnInput[]
  estadoActual?: {
    analisisBloom?: AnalisisBloom[]
    objetivoMultinivel?: ObjetivoMultinivel
    indicadoresEvaluacion?: IndicadorEvaluacion[]
    actividadEvaluacion?: ActividadEvaluacion
  }
  // BYOK
  modelProvider?: string
  customToken?: string
  customModel?: string
  customEndpoint?: string
  customPrompt?: string
  promptOverride?: string
}

export interface GeneratedLesson {
  objetivo: string
  inicio: string
  desarrollo: string
  cierre: string
  materiales: string[]
  tics: string[]
  adecuacion: string
  analisisBloom?: AnalisisBloom[]
  objetivoMultinivel?: ObjetivoMultinivel
  indicadoresEvaluacion?: IndicadorEvaluacion[]
  actividadEvaluacion?: ActividadEvaluacion
}

// ─── Configuración por defecto ────────────────────────────────────────────────

export const DEFAULT_AI_CONFIG: StoredAiConfig = {
  provider: "public",
  token: "",
  model: "gemini-2.0-flash",
  endpoint: "https://api.openai.com/v1",
  promptExtra: "",
  promptOverrides: {},
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
    helper: "No pide API key al docente cuando el servidor tiene GEMINI_API_KEY configurada. En local, si falta esa variable, usa Gemini con tu key personal.",
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

function coerceAnalisisBloom(raw: unknown): AnalisisBloom[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const validCategorias: CategoriaBloom[] = ["Recordar", "Comprender", "Aplicar", "Analizar", "Evaluar", "Crear"]
  const validNiveles: NivelBloom[] = ["BAJO", "MEDIO", "ALTO"]
  const out: AnalisisBloom[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const oaId = cleanText(r.oaId)
    if (!oaId) continue
    const categoria = validCategorias.includes(r.categoria as CategoriaBloom) ? (r.categoria as CategoriaBloom) : "Comprender"
    const nivel = validNiveles.includes(r.nivel as NivelBloom) ? (r.nivel as NivelBloom) : "MEDIO"
    out.push({
      oaId,
      categoria,
      nivel,
      justificacion: cleanText(r.justificacion),
      verbosSugeridos: normalizeList(r.verbosSugeridos),
    })
  }
  return out.length > 0 ? out : undefined
}

function coerceObjetivoMultinivel(raw: unknown): ObjetivoMultinivel | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const r = raw as Record<string, unknown>
  const basico = cleanText(r.basico)
  const intermedio = cleanText(r.intermedio)
  const avanzado = cleanText(r.avanzado)
  if (!basico && !intermedio && !avanzado) return undefined
  const recomendadoRaw = cleanText(r.recomendado).toLowerCase()
  const recomendado: ObjetivoMultinivel["recomendado"] =
    recomendadoRaw === "basico" || recomendadoRaw === "intermedio" || recomendadoRaw === "avanzado"
      ? recomendadoRaw
      : "intermedio"
  return { basico, intermedio, avanzado, recomendado }
}

function coerceIndicadoresEvaluacion(raw: unknown): IndicadorEvaluacion[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const validDim: DimensionAprendizaje[] = ["saber", "saber_hacer", "ser"]
  const validNiv: NivelBloom[] = ["BAJO", "MEDIO", "ALTO"]
  const out: IndicadorEvaluacion[] = []
  raw.forEach((item, idx) => {
    if (!item || typeof item !== "object") return
    const r = item as Record<string, unknown>
    const texto = cleanText(r.texto)
    if (!texto) return
    const dimRaw = cleanText(r.dimension).toLowerCase().replace(/\s|-/g, "_")
    const dimension = validDim.includes(dimRaw as DimensionAprendizaje) ? (dimRaw as DimensionAprendizaje) : "saber"
    const nivelBloom = validNiv.includes(r.nivelBloom as NivelBloom) ? (r.nivelBloom as NivelBloom) : "MEDIO"
    out.push({
      id: cleanText(r.id) || `IND_${Date.now()}_${idx}`,
      texto,
      dimension,
      nivelBloom,
      oaId: cleanText(r.oaId),
    })
  })
  return out.length > 0 ? out : undefined
}

function coerceActividadEvaluacion(raw: unknown): ActividadEvaluacion | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const r = raw as Record<string, unknown>
  const descripcion = cleanText(r.descripcion)
  if (!descripcion) return undefined
  const tipoRaw = cleanText(r.tipo).toLowerCase()
  const tipo: TipoEvaluacion =
    tipoRaw === "diagnostica" || tipoRaw === "sumativa" ? tipoRaw : "formativa"
  return {
    tipo,
    descripcion,
    criterios: normalizeList(r.criterios),
    alineacionMBE: normalizeList(r.alineacionMBE),
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
    analisisBloom: coerceAnalisisBloom(raw.analisisBloom),
    objetivoMultinivel: coerceObjetivoMultinivel(raw.objetivoMultinivel),
    indicadoresEvaluacion: coerceIndicadoresEvaluacion(raw.indicadoresEvaluacion),
    actividadEvaluacion: coerceActividadEvaluacion(raw.actividadEvaluacion),
  }
}

export function resolveMode(rawMode: string | undefined): CopilotMode {
  if (
    rawMode === "chat" ||
    rawMode === "aplicar_cambios" ||
    rawMode === "crear_inicial" ||
    rawMode === "freddy_detallado" ||
    rawMode === "regenerar_bloom" ||
    rawMode === "regenerar_indicadores"
  ) {
    return rawMode
  }
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
    promptExtra: cleanText(raw.promptExtra),
    promptOverrides:
      raw.promptOverrides && typeof raw.promptOverrides === "object"
        ? raw.promptOverrides
        : {},
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
    .slice(-24)
  if (turns.length === 0) return "No hay conversación previa."
  return turns.map((t) => `[${t.role}]: ${t.text}`).join("\n")
}

function sugerirNivelBloom(numeroClase: number, totalClases: number): { nivel: NivelBloom; recomendado: ObjetivoMultinivel["recomendado"] } {
  const total = Math.max(totalClases, 1)
  const ratio = numeroClase / total
  if (ratio <= 0.34) return { nivel: "BAJO", recomendado: "basico" }
  if (ratio <= 0.67) return { nivel: "MEDIO", recomendado: "intermedio" }
  return { nivel: "ALTO", recomendado: "avanzado" }
}

const FREDDY_PROMPTS_OFICIALES = `
PROMPT 1: Analisis del objetivo curricular.
Rol: Actua como un asesor pedagogico experto en el curriculum escolar chileno y en la Taxonomia de Bloom revisada (Anderson y Krathwohl).
Accion: Analiza el nivel taxonomico de la habilidad del objetivo curricular.
Formato: categoria cognitiva, descripcion de la categoria, justificacion pedagogica, nivel cognitivo general (bajo, medio o alto) y razon de la clasificacion.

PROMPT 2: Formulacion del objetivo de clase.
Rol: Actua como especialista en diseno curricular y planificacion de clases en el sistema educativo chileno.
Accion: Formula un objetivo de clase para un OA curricular, considerando nivel cognitivo, una habilidad, un conocimiento especifico y una actitud explicita.
Formato: conocimiento, habilidad, actitud y objetivo final claro, preciso y centrado en el aprendizaje.

PROMPT 3: Formulacion de indicadores de evaluacion.
Rol: Actua como asesor pedagogico experto en evaluacion para el aprendizaje en el sistema escolar chileno.
Accion: Disena indicadores derivados del objetivo de clase.
Formato: minimo 3 y maximo 5 indicadores con verbo observable + contenido + condicion/contexto, cubriendo saber, saber hacer y ser.

PROMPT 4: Diseno de una actividad de evaluacion alineada al monitoreo del aprendizaje.
Rol: Actua como asesor pedagogico experto en curriculum escolar chileno, evaluacion formativa y Marco para la Buena Ensenanza.
Accion: Disena una actividad de evaluacion alineada al OA, objetivo e indicadores, factible de aplicar, diversa en evidencias y alineada a MBE 4.1, 4.2 y 9.2.

PROMPT 5: Omitido en el documento de Freddy.

PROMPT 6: Diseno de una clase.
Rol: Actua como asesor pedagogico experto en curriculum escolar chileno, evaluacion formativa y Marco para la Buena Ensenanza.
Accion: Disena una clase completa en base al objetivo anterior.
Formato: inicio con activacion de conocimientos previos, desarrollo activo y participativo, cierre con reflexion o aplicacion, evaluacion diagnostica/formativa/sumativa, estrategias didacticas activas, retroalimentacion y caracterizacion de estudiantes.
`.trim()

const OBJETIVO_CLASE_FREDDY = `
REGLA FREDDY PARA EL OBJETIVO DE CLASE:
El objetivo NO es un resumen de toda la clase. Debe ser una sola oracion precisa con esta formula:
VERBO + CONTENIDO + CONTEXTO.

- VERBO: un solo verbo cognitivo Bloom en infinitivo, acorde al nivel.
  Basico: identificar, reconocer, describir, distinguir.
  Intermedio: clasificar, relacionar, representar, aplicar.
  Avanzado: crear, evaluar, argumentar, elaborar.
- CONTENIDO: la materia concreta que se aprende. No copies el OA completo. Extrae el nucleo disciplinar de los OA e indicadores seleccionados.
  Ejemplos de contenido: duracion del sonido; sonidos largos y cortos; cualidades del sonido; figuras musicales simples.
- CONTEXTO: como se aprendera o demostrara. Normalmente comienza con "a traves de", "mediante" o "por medio de" y resume la estrategia real de la clase.
  Ejemplos de contexto: escucha guiada; movimiento corporal; guia visual; juego musical; representacion visual o verbal.
- Extension: idealmente 12 a 24 palabras; maximo 32 palabras.
- No incluyas actitudes, evaluacion, MBE, materiales, listas de actividades ni varias acciones encadenadas.
- No uses mas de un verbo principal. Si aparecen varias acciones, deja solo la accion cognitiva central.

Ejemplos correctos:
- Identificar sonidos largos y cortos a traves de la escucha guiada y la representacion visual.
- Relacionar la duracion del sonido con figuras musicales simples mediante juegos de escucha y movimiento corporal.

Ejemplo incorrecto:
- Identificar sonidos largos y cortos mediante guias, dibujos, expresion oral, figuras musicales, participando con respeto y completando actividades.
`.trim()

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 1: CREACIÓN INICIAL — metodología 6 pasos Freddy
// Estructura objetivo personalizada: VERBO + CONTENIDO + CONTEXTO
// Genera análisis Bloom + objetivo multinivel + indicadores + actividad eval +
// inicio/desarrollo/cierre en una sola pasada (un round-trip).
// ═══════════════════════════════════════════════════════════════════════════
function buildCrearInicialPrompt(body: LessonRequestBody): string {
  const curso = cleanText(body.curso) || "curso no especificado"
  const asignatura = cleanText(body.asignatura) || "la asignatura"
  const nivelCurricular = cleanText(body.nivelCurricular) || curso
  const habilidades = normalizeList(body.habilidades)
  const actitudes = normalizeList(body.actitudes)
  const continuity = cleanText(body.contextoAnterior)
  const teacherPrompt = cleanText(body.instruccionesAdicionales)
  const contextoProfesor = cleanText(body.contextoProfesor) || teacherPrompt
  const numeroClase = body.numeroClase ?? 1
  const totalClases = body.totalClasesUnidad ?? 8
  const duracion = body.duracionMinutos ?? 90
  const sugerencia = sugerirNivelBloom(numeroClase, totalClases)

  return `Eres un asesor pedagógico chileno especializado en el currículum oficial Mineduc y la Taxonomía de Bloom revisada. Acompañas al profesor Freddy Figueroa siguiendo su metodología de 6 pasos.

BASE OFICIAL DE LOS PROMPTS DE FREDDY:
${FREDDY_PROMPTS_OFICIALES}

INSTRUCCIONES MAESTRAS DEL PROFESOR:
${cleanText(body.customPrompt) || "Sin instrucciones maestras adicionales."}

CONTEXTO DE LA CLASE:
- Asignatura: ${asignatura}
- Curso: ${curso} (nivel curricular: ${nivelCurricular})
- Clase ${numeroClase} de ${totalClases} → progresión Bloom sugerida: nivel ${sugerencia.nivel} (recomendado: ${sugerencia.recomendado})
- Duración: ${duracion} minutos
- OA seleccionados:
${formatOAs(body.oas)}
- Habilidades priorizadas: ${habilidades.length > 0 ? habilidades.join("; ") : "No especificadas."}
- Actitudes priorizadas: ${actitudes.length > 0 ? actitudes.join("; ") : "No especificadas."}
- Contexto de la unidad:
${formatUnitContext(body.unidad)}
- Continuidad con clase anterior: ${continuity || "Primera clase de la unidad."}
- IDEA / CONTEXTO DEL PROFESOR (clave — todo gira en torno a esto): "${contextoProfesor || "(sin idea explícita)"}"

${OBJETIVO_CLASE_FREDDY}

EJECUTA EN ORDEN LOS 6 PASOS DE LA METODOLOGÍA FREDDY:

PASO 1 — Análisis taxonómico Bloom de cada OA:
Para CADA OA seleccionado, identifica:
- categoría cognitiva (una de: Recordar / Comprender / Aplicar / Analizar / Evaluar / Crear)
- nivel BAJO / MEDIO / ALTO
- justificación pedagógica breve (1-2 líneas)
- 5 a 8 verbos observables sugeridos para ese nivel

PASO 2 — Objetivo de clase MULTINIVEL (estructura VERBO + CONTENIDO + CONTEXTO):
Redacta TRES versiones del mismo objetivo, una por cada nivel Bloom:
- "basico" — verbo cognitivo de nivel BAJO (recordar/comprender)
- "intermedio" — verbo cognitivo de nivel MEDIO (aplicar/analizar)
- "avanzado" — verbo cognitivo de nivel ALTO (evaluar/crear)
Cada versión debe usar:
  • Verbo: cognitivo Bloom apropiado al nivel
  • Contenido: materia concreta de la clase, derivada de los OA/indicadores marcados
  • Contexto: forma concreta de trabajo tomada de la idea del profesor "${contextoProfesor || "(usa el contexto curricular)"}"
IMPORTANTE: las 3 versiones deben ser objetivos breves y precisos. No redactes un objetivo narrativo largo. No mezcles contenido con contexto: el contenido responde "que materia aprenden" y el contexto responde "como lo aprenderan o demostraran".
Marca como "recomendado" la versión "${sugerencia.recomendado}" salvo que el contexto del profesor exija otro nivel.

PASO 3 — Indicadores de evaluación (3 a 5):
Cada indicador con estructura: Verbo observable + Contenido + Condición/contexto.
Cubre las 3 dimensiones del aprendizaje:
- "saber" (conceptual)
- "saber_hacer" (procedimental)
- "ser" (actitudinal)
Asocia cada indicador a su oaId y al nivelBloom correspondiente.

PASO 4 — Actividad de evaluación formativa:
Diseña UNA actividad alineada al Marco para la Buena Enseñanza (MBE 4.1, 4.2 y 9.2). Incluye:
- tipo: "formativa" (también puede ser "diagnostica" si es clase 1, o "sumativa" si es la última)
- descripción narrativa de la actividad
- 3-4 criterios observables
- alineación MBE (lista de códigos)

PASO 5 — (omitido en metodología Freddy)

PASO 6 — Diseño de la clase (Inicio / Desarrollo / Cierre):
Construye la clase en torno a la idea del profesor. Cada momento debe respetar:
- INICIO: gancho motivacional + activación de conocimientos previos + presentación del propósito
- DESARROLLO: secuencia paso a paso con acciones del docente y del estudiante, integrando la actividad de evaluación formativa
- CIERRE: síntesis + metacognición breve + evidencia del aprendizaje + retroalimentación
Materiales y TICs concretos. Adecuación PIE/DUA específica.

CRITERIOS DE CALIDAD OBLIGATORIOS:
- El campo "objetivo" final = exactamente la versión marcada por objetivoMultinivel.recomendado.
- El objetivo final y cada objetivo multinivel deben obedecer estrictamente VERBO + CONTENIDO + CONTEXTO, en una sola frase de maximo 32 palabras.
- El CONTENIDO debe ser la materia especifica de la clase, no el OA completo ni la actividad. El CONTEXTO debe ser la estrategia/metodologia concreta.
- Sé altamente creativo y didáctico — propón dinámicas atractivas, metodologías activas, recursos memorables.
- Usa solo HTML simple en inicio/desarrollo/cierre/adecuacion: <p>, <ul>, <li>, <b>, <br/>.
- NO uses títulos redundantes ("Inicio:", "Desarrollo:") dentro de los campos.
- "objetivo" y los 3 niveles del objetivoMultinivel son TEXTO PLANO (sin HTML).

FORMATO DE RESPUESTA (solo JSON puro, sin texto adicional, sin code-fences):
{
  "analisisBloom": [
    { "oaId": "OA1", "categoria": "Comprender", "nivel": "MEDIO", "justificacion": "...", "verbosSugeridos": ["..."] }
  ],
  "objetivoMultinivel": {
    "basico": "...",
    "intermedio": "...",
    "avanzado": "...",
    "recomendado": "${sugerencia.recomendado}"
  },
  "objetivo": "(igual a la versión recomendada)",
  "indicadoresEvaluacion": [
    { "id": "IND_1", "texto": "...", "dimension": "saber", "nivelBloom": "MEDIO", "oaId": "OA1" }
  ],
  "actividadEvaluacion": {
    "tipo": "formativa",
    "descripcion": "...",
    "criterios": ["...", "..."],
    "alineacionMBE": ["4.1", "4.2", "9.2"]
  },
  "inicio": "<p>...</p>",
  "desarrollo": "<p>...</p>",
  "cierre": "<p>...</p>",
  "materiales": ["..."],
  "tics": ["..."],
  "adecuacion": "<p>...</p>"
}`
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT FREDDY DETALLADO — versión expandida para tab Adec. curricular
// Igual al crear_inicial pero los 3 momentos vienen ENRIQUECIDOS con
// activación de conocimientos previos, modelado/práctica guiada/práctica
// autónoma, síntesis + metacognición + retroalimentación formativa.
// ═══════════════════════════════════════════════════════════════════════════
function buildFreddyDetalladoPrompt(body: LessonRequestBody): string {
  const base = buildCrearInicialPrompt(body)
  return base.replace(
    "PASO 6 — Diseño de la clase (Inicio / Desarrollo / Cierre):",
    `PASO 6 — Diseño de la clase EN VERSIÓN PEDAGÓGICA FORMAL EXTENDIDA (formato Freddy detallado):

INICIO debe contener explícitamente:
  (a) gancho motivacional alineado al contexto del profesor
  (b) activación de conocimientos previos (qué pregunta concreta hace el docente)
  (c) presentación del propósito de aprendizaje (cómo lo enuncia)
  (d) caracterización breve de los estudiantes y posibles barreras de acceso

DESARROLLO debe contener explícitamente y en este orden:
  (a) MODELADO — el docente muestra/ejemplifica
  (b) PRÁCTICA GUIADA — el docente acompaña al curso
  (c) PRÁCTICA AUTÓNOMA — los estudiantes aplican
  (d) integración de la actividad de evaluación formativa con criterios observables
  (e) adecuaciones DUA específicas (representación / acción / motivación)

CIERRE debe contener explícitamente:
  (a) síntesis de los aprendizajes
  (b) pregunta METACOGNITIVA concreta para los estudiantes
  (c) evidencia breve recogida del aprendizaje
  (d) retroalimentación formativa hacia el grupo y proyección a la próxima clase

Cada momento debe ser un párrafo (o lista) extenso, formal, redactado para una planificación oficial Mineduc. Usa HTML simple: <p>, <ul>, <li>, <b>.`
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT REGENERAR BLOOM — solo el objetivoMultinivel + analisisBloom
// ═══════════════════════════════════════════════════════════════════════════
function buildRegenerarBloomPrompt(body: LessonRequestBody): string {
  const numeroClase = body.numeroClase ?? 1
  const totalClases = body.totalClasesUnidad ?? 8
  const sugerencia = sugerirNivelBloom(numeroClase, totalClases)
  const contextoProfesor = cleanText(body.contextoProfesor) || cleanText(body.instruccionesAdicionales)

  return `Eres un asesor pedagógico chileno experto en Bloom revisado. Reescribe SOLO el análisis Bloom y las 3 versiones multinivel del objetivo de clase.

CONTEXTO:
- Asignatura: ${cleanText(body.asignatura) || "asignatura"}
- Curso: ${cleanText(body.curso) || "curso"}
- Clase ${numeroClase} de ${totalClases} → recomendado: ${sugerencia.recomendado}
- OA: ${formatOAs(body.oas)}
- Idea del profesor: "${contextoProfesor || "(sin idea explícita)"}"

${OBJETIVO_CLASE_FREDDY}

Reescribe las 3 versiones como objetivos breves. El contenido debe ser la materia especifica de la clase; el contexto debe ser la forma concreta de trabajo. El campo recomendado debe mantenerse en "${sugerencia.recomendado}" salvo que el profesor pida explicitamente otro nivel.

FORMATO (solo JSON):
{
  "analisisBloom": [
    { "oaId": "...", "categoria": "...", "nivel": "...", "justificacion": "...", "verbosSugeridos": ["..."] }
  ],
  "objetivoMultinivel": {
    "basico": "...", "intermedio": "...", "avanzado": "...",
    "recomendado": "${sugerencia.recomendado}"
  }
}`
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT REGENERAR INDICADORES — solo indicadoresEvaluacion + actividadEvaluacion
// ═══════════════════════════════════════════════════════════════════════════
function buildRegenerarIndicadoresPrompt(body: LessonRequestBody): string {
  const objetivoActual =
    body.estadoActual?.objetivoMultinivel?.[body.estadoActual.objetivoMultinivel.recomendado] ||
    cleanText(body.objetivoClase)

  return `Eres un asesor pedagógico chileno. Diseña SOLO los indicadores de evaluación y la actividad de evaluación formativa para esta clase.

CONTEXTO:
- OA: ${formatOAs(body.oas)}
- Objetivo de la clase: ${objetivoActual || "(no definido aún)"}
- Idea del profesor: "${cleanText(body.contextoProfesor) || cleanText(body.instruccionesAdicionales) || "(sin idea explícita)"}"

INDICADORES (3-5): Verbo observable + Contenido + Condición. Cubre saber/saber_hacer/ser.
ACTIVIDAD EVAL: tipo formativa, alineación MBE 4.1/4.2/9.2, 3-4 criterios.

FORMATO (solo JSON):
{
  "indicadoresEvaluacion": [
    { "id": "IND_1", "texto": "...", "dimension": "saber", "nivelBloom": "MEDIO", "oaId": "..." }
  ],
  "actividadEvaluacion": {
    "tipo": "formativa", "descripcion": "...", "criterios": ["..."], "alineacionMBE": ["4.1","4.2","9.2"]
  }
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

${OBJETIVO_CLASE_FREDDY}

INSTRUCCIONES ESTRICTAS:
1. Lee la conversación y determina qué campos de la clase el profesor quiso cambiar.
2. Aplica SOLO esos cambios. Si un campo no fue discutido, devuélvelo idéntico a la clase actual.
3. No inventes cambios que no fueron pedidos.
4. No escribas explicaciones dentro de los campos de la clase. Solo el contenido didáctico.
5. Usa HTML simple en inicio, desarrollo, cierre y adecuacion: <p>, <ul>, <li>, <b>, <br/>.
6. El campo "objetivo" debe ser texto plano, sin HTML. Si lo modificas, debe seguir estrictamente VERBO + CONTENIDO + CONTEXTO y no superar 32 palabras.
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
  const override = cleanText(body.promptOverride)
  if (override) return override
  if (mode === "crear_inicial") return buildCrearInicialPrompt(body)
  if (mode === "aplicar_cambios") return buildAplicarCambiosPrompt(body)
  if (mode === "freddy_detallado") return buildFreddyDetalladoPrompt(body)
  if (mode === "regenerar_bloom") return buildRegenerarBloomPrompt(body)
  if (mode === "regenerar_indicadores") return buildRegenerarIndicadoresPrompt(body)
  return buildChatPrompt(body)
}
