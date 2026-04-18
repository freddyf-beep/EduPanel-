// ═══════════════════════════════════════════════════════════════════════════
// Copiloto IA — EduPanel
// Arquitectura limpia: 3 modos bien separados
//  • crear_inicial  → prompt pedagógico de 5 pasos, solo se ejecuta UNA VEZ
//  • chat           → conversación libre, nunca toca la clase
//  • aplicar_cambios → extrae del chat qué cambiar y lo aplica como JSON
// ═══════════════════════════════════════════════════════════════════════════

export type CopilotMode = "crear_inicial" | "chat" | "aplicar_cambios" | "destilar_simple" | "estructurar_notebook_lm"
export type AIProvider = "public" | "gemini" | "openai" | "anthropic" | "groq" | "compatible"

// Tipos de contenido que NotebookLM puede haber generado. Se usa en modo "estructurar_notebook_lm"
// para que el prompt sepa qué sección de la clase rellenar y cuáles dejar intactas.
export type NotebookLmContentType =
  | "clase_completa"
  | "rubrica"
  | "analisis_bloom"
  | "indicadores"
  | "evaluacion"
  | "otro"

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
  // Artefactos pedagógicos del método 6-pasos (si la clase ya fue generada por IA)
  analisisBloom?: AnalisisBloom
  indicadoresEvaluacion?: IndicadorEvaluacion[]
  actividadEvaluacion?: string
  // Versión RICA de los 3 momentos (generada por crear_inicial, visible en tab Adecuación)
  inicioDetallado?: string
  desarrolloDetallado?: string
  cierreDetallado?: string
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
  // Contexto extra para el prompt (agregado para método 6-pasos)
  nivelCurricular?: string     // "4to Básico", "2do Medio", etc.
  duracionMinutos?: number     // duración de la clase (45, 90, etc.)
  // BYOK
  modelProvider?: string
  customToken?: string
  customModel?: string
  customEndpoint?: string
  // NotebookLM integration (modo "estructurar_notebook_lm")
  textoNotebookLm?: string            // texto crudo que el profesor pegó desde NotebookLM
  tipoContenido?: NotebookLmContentType
}

// Análisis Bloom del OA (Paso 1 del método de Freddy)
export interface AnalisisBloom {
  categoria: string                            // "recordar" | "comprender" | "aplicar" | "analizar" | "evaluar" | "crear"
  nivelGeneral: "BAJO" | "MEDIO" | "ALTO"
  justificacion: string
}

// Indicadores de evaluación cubriendo las 3 dimensiones (Paso 3 del método)
export interface IndicadorEvaluacion {
  dimension: "saber" | "saber_hacer" | "ser"
  texto: string
}

export interface GeneratedLesson {
  analisisBloom?: AnalisisBloom                 // Paso 1: categoría cognitiva del OA
  objetivo: string                              // Paso 2: habilidad + contenido + actitud
  indicadoresEvaluacion?: IndicadorEvaluacion[] // Paso 3: 3-5 indicadores por dimensión
  actividadEvaluacion?: string                  // Paso 4: actividad formativa (HTML)
  // Versión RICA detallada (MBE/Bloom/estrategias/tiempos) — se muestra en tab "Adecuación Curricular"
  inicioDetallado?: string
  desarrolloDetallado?: string
  cierreDetallado?: string
  // Versión SIMPLE narrativa estilo DOCX oficial — se muestra en tab "Desarrollo" y alimenta el Word
  inicio: string                                // Paso 5: momentos de la clase
  desarrollo: string
  cierre: string
  materiales: string[]
  tics: string[]
  adecuacion: string                            // DUA/PIE
}

// Resultado de la call de destilación (modo "destilar_simple")
export interface DestiledLesson {
  inicio: string
  desarrollo: string
  cierre: string
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

function coerceAnalisisBloom(raw: unknown): AnalisisBloom | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const r = raw as Record<string, unknown>
  const categoria = cleanText(r.categoria)
  const nivelRaw = cleanText(r.nivelGeneral).toUpperCase()
  const justificacion = cleanText(r.justificacion)
  if (!categoria && !justificacion) return undefined
  const nivelGeneral: AnalisisBloom["nivelGeneral"] =
    nivelRaw === "BAJO" || nivelRaw === "MEDIO" || nivelRaw === "ALTO" ? nivelRaw : "MEDIO"
  return { categoria: categoria || "comprender", nivelGeneral, justificacion }
}

function coerceIndicadores(raw: unknown): IndicadorEvaluacion[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: IndicadorEvaluacion[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const texto = cleanText(r.texto)
    if (!texto) continue
    const dimRaw = cleanText(r.dimension).toLowerCase().replace(/\s+/g, "_")
    const dimension: IndicadorEvaluacion["dimension"] =
      dimRaw === "saber" || dimRaw === "saber_hacer" || dimRaw === "ser" ? dimRaw : "saber"
    out.push({ dimension, texto })
  }
  return out.length > 0 ? out : undefined
}

export function coerceGeneratedLesson(raw: Record<string, unknown>): GeneratedLesson {
  const analisisBloom = coerceAnalisisBloom(raw.analisisBloom)
  const indicadoresEvaluacion = coerceIndicadores(raw.indicadoresEvaluacion)
  const actividadEvaluacionRaw = cleanText(raw.actividadEvaluacion)
  const actividadEvaluacion = actividadEvaluacionRaw
    ? ensureHtmlBlock(actividadEvaluacionRaw, "")
    : undefined

  // Los campos ricos (inicioDetallado/desarrolloDetallado/cierreDetallado) los produce `crear_inicial`.
  // Si no vienen, quedan undefined (backward compat con proveedores que los ignoren).
  const inicioDetalladoRaw = cleanText(raw.inicioDetallado)
  const desarrolloDetalladoRaw = cleanText(raw.desarrolloDetallado)
  const cierreDetalladoRaw = cleanText(raw.cierreDetallado)

  return {
    analisisBloom,
    objetivo: htmlToPlainText(raw.objetivo),
    indicadoresEvaluacion,
    actividadEvaluacion,
    inicioDetallado: inicioDetalladoRaw ? ensureHtmlBlock(inicioDetalladoRaw, "") : undefined,
    desarrolloDetallado: desarrolloDetalladoRaw ? ensureHtmlBlock(desarrolloDetalladoRaw, "") : undefined,
    cierreDetallado: cierreDetalladoRaw ? ensureHtmlBlock(cierreDetalladoRaw, "") : undefined,
    // Versión SIMPLE narrativa. `crear_inicial` ya NO la genera (la genera call 2 "destilar_simple"),
    // pero mantenemos fallback para compat hacia atrás. Defaults a "" para no pisar state previo.
    inicio: cleanText(raw.inicio) ? ensureHtmlBlock(raw.inicio, "") : "",
    desarrollo: cleanText(raw.desarrollo) ? ensureHtmlBlock(raw.desarrollo, "") : "",
    cierre: cleanText(raw.cierre) ? ensureHtmlBlock(raw.cierre, "") : "",
    materiales: normalizeList(raw.materiales),
    tics: normalizeList(raw.tics),
    adecuacion: ensureHtmlBlock(raw.adecuacion, "<p>Sin sugerencias de adecuación por ahora.</p>"),
  }
}

// Normaliza el JSON de la call "destilar_simple" que sólo devuelve los 3 momentos simples.
export function coerceDestiledLesson(raw: Record<string, unknown>): DestiledLesson {
  return {
    inicio: ensureHtmlBlock(raw.inicio, "<p>Inicio no generado.</p>"),
    desarrollo: ensureHtmlBlock(raw.desarrollo, "<p>Desarrollo no generado.</p>"),
    cierre: ensureHtmlBlock(raw.cierre, "<p>Cierre no generado.</p>"),
  }
}

export function resolveMode(rawMode: string | undefined): CopilotMode {
  if (
    rawMode === "chat" ||
    rawMode === "aplicar_cambios" ||
    rawMode === "crear_inicial" ||
    rawMode === "destilar_simple" ||
    rawMode === "estructurar_notebook_lm"
  ) return rawMode
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
  const base: Record<string, unknown> = {
    objetivo: htmlToPlainText(clase.objetivo),
    // Versión SIMPLE narrativa (la que va al DOCX oficial)
    inicio: clipText(htmlToPlainText(clase.inicio), 700),
    desarrollo: clipText(htmlToPlainText(clase.desarrollo), 1000),
    cierre: clipText(htmlToPlainText(clase.cierre), 700),
    adecuacion: clipText(htmlToPlainText(clase.adecuacion), 500),
    materiales: normalizeList(clase.materiales),
    tics: normalizeList(clase.tics),
  }
  // Versión RICA (con MBE/Bloom/estrategias/tiempos) — la que el profesor discute en chat
  if (clase.inicioDetallado) base.inicioDetallado = clipText(htmlToPlainText(clase.inicioDetallado), 1200)
  if (clase.desarrolloDetallado) base.desarrolloDetallado = clipText(htmlToPlainText(clase.desarrolloDetallado), 1800)
  if (clase.cierreDetallado) base.cierreDetallado = clipText(htmlToPlainText(clase.cierreDetallado), 1000)
  // Incluir artefactos pedagógicos si existen
  if (clase.analisisBloom) base.analisisBloom = clase.analisisBloom
  if (clase.indicadoresEvaluacion && clase.indicadoresEvaluacion.length > 0) {
    base.indicadoresEvaluacion = clase.indicadoresEvaluacion
  }
  if (clase.actividadEvaluacion) {
    base.actividadEvaluacion = clipText(htmlToPlainText(clase.actividadEvaluacion), 600)
  }
  return JSON.stringify(base, null, 2)
}

function formatChatHistory(history: ChatTurnInput[] = []): string {
  const turns = history
    .map((t) => ({ role: t.role === "ai" ? "Asistente" : "Profesor", text: clipText(htmlToPlainText(t.text), 600) }))
    .filter((t) => t.text)
    .slice(-24) // ampliado de 12 a 24 para preservar más contexto de iteraciones
  if (turns.length === 0) return "No hay conversación previa."
  return turns.map((t) => `[${t.role}]: ${t.text}`).join("\n")
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 1: CREACIÓN INICIAL — Método 6-pasos de Freddy (versión FULL)
//
// Ejecuta los 6 prompts pedagógicos originales como chain-of-thought interno
// (Análisis Bloom → Objetivo → Indicadores → Actividad evaluación → Momentos →
// Coherencia) y emite un JSON con TODOS los artefactos pedagógicos completos.
//
// Referencia textual: PDF-FREDDY/PROMPTS para planificaciones(1).docx
// Incluye los descriptores textuales completos del MBE (4.1, 4.2, 9.2) y las
// tres dimensiones de evaluación (diagnóstica / formativa / sumativa) tal
// como Freddy las usa manualmente en su planificación.
// ═══════════════════════════════════════════════════════════════════════════
function buildCrearInicialPrompt(body: LessonRequestBody): string {
  const curso = cleanText(body.curso) || "curso no especificado"
  const asignatura = cleanText(body.asignatura) || "la asignatura"
  const nivelCurricular = cleanText(body.nivelCurricular) || "no especificado"
  const duracionMin = typeof body.duracionMinutos === "number" && body.duracionMinutos > 0
    ? body.duracionMinutos
    : 90
  const duracion = `${duracionMin} minutos`
  // Distribución sugerida de tiempos (inicio 15%, desarrollo 65%, cierre 20%)
  const tInicio = Math.max(5, Math.round(duracionMin * 0.15))
  const tCierre = Math.max(5, Math.round(duracionMin * 0.20))
  const tDesarrollo = Math.max(10, duracionMin - tInicio - tCierre)

  const habilidades = normalizeList(body.habilidades)
  const actitudes = normalizeList(body.actitudes)
  const continuity = cleanText(body.contextoAnterior)
  const teacherPrompt = cleanText(body.instruccionesAdicionales)

  return `Actúa como un ASESOR PEDAGÓGICO EXPERTO en el currículum escolar chileno, la Taxonomía de Bloom revisada (Anderson-Krathwohl), el Marco para la Buena Enseñanza (MBE) chileno y el Diseño Universal para el Aprendizaje (DUA). Tu nivel de detalle y rigor debe ser equivalente al de un asesor pedagógico con 15+ años de experiencia que diseña planificaciones listas para llevar al aula.

═══════════════════════════════════════════════════════════════════
DATOS DE ENTRADA
═══════════════════════════════════════════════════════════════════
• Asignatura: ${asignatura}
• Curso: ${curso}
• Nivel curricular (bases oficiales): ${nivelCurricular}
• Clase N°${body.numeroClase ?? "sin número"} de la unidad
• Duración total: ${duracion}
  - Inicio: ~${tInicio} min
  - Desarrollo: ~${tDesarrollo} min
  - Cierre: ~${tCierre} min

• Objetivos de Aprendizaje (OA) a abordar:
${formatOAs(body.oas)}

• Habilidades priorizadas por el profesor: ${habilidades.length > 0 ? habilidades.join("; ") : "No especificadas (infiere del OA)."}
• Actitudes priorizadas por el profesor: ${actitudes.length > 0 ? actitudes.join("; ") : "No especificadas (infiere del OA/unidad)."}

• Contexto de la unidad:
${formatUnitContext(body.unidad)}

• Continuidad con clase anterior: ${continuity || "Es la primera clase de la unidad — diseña un arranque que ancle el hilo conductor."}
• Indicaciones específicas del profesor: ${teacherPrompt || "Ninguna — tienes libertad creativa dentro del rigor pedagógico."}

═══════════════════════════════════════════════════════════════════
PROCESO PEDAGÓGICO OBLIGATORIO (6 pasos — método Freddy)
Ejecuta los 6 pasos internamente antes de emitir la respuesta.
═══════════════════════════════════════════════════════════════════

━━━ PASO 1 — ANÁLISIS DEL OBJETIVO CURRICULAR (Taxonomía Bloom revisada) ━━━
Analiza el verbo rector del OA y determina la categoría cognitiva dominante:
  • RECORDAR (BAJO): reconocer, identificar, listar, nombrar, definir.
  • COMPRENDER (BAJO): explicar, resumir, parafrasear, clasificar, comparar.
  • APLICAR (MEDIO): usar, ejecutar, implementar, demostrar, resolver.
  • ANALIZAR (MEDIO): diferenciar, organizar, atribuir, deconstruir, relacionar.
  • EVALUAR (ALTO): comprobar, criticar, juzgar, argumentar, fundamentar.
  • CREAR (ALTO): generar, planificar, producir, diseñar, componer.
Elabora una JUSTIFICACIÓN PEDAGÓGICA de 2-4 oraciones que incluya:
  - Qué verbo rector tiene el OA y qué exige cognitivamente.
  - Por qué lo clasificas como BAJO/MEDIO/ALTO.
  - Qué tipo de desempeño esperas del estudiante en esta clase.

━━━ PASO 2 — FORMULACIÓN DEL OBJETIVO DE CLASE ━━━
Formula UN SOLO objetivo con estructura estricta:
  HABILIDAD (verbo alineado al nivel Bloom) + CONTENIDO específico del OA + ACTITUD explícita
Ejemplo de correcta formulación: "Analizar los efectos del cambio climático en Chile, valorando la importancia del cuidado ambiental."
Resguardos:
  - UNA sola habilidad, UN conocimiento específico, UNA actitud.
  - El verbo debe ser coherente con el nivel Bloom identificado en Paso 1.
  - Describe lo que el ESTUDIANTE APRENDERÁ (aprendizaje), no lo que hará (actividad).
  - Redacción en infinitivo, clara, precisa, centrada en el aprendizaje.

━━━ PASO 3 — INDICADORES DE EVALUACIÓN (3 a 5) ━━━
Estructura estricta por indicador: VERBO OBSERVABLE + CONTENIDO + CONDICIÓN/CONTEXTO.
Ejemplo: "Explica (verbo observable) con ejemplos concretos (condición) las causas de la Revolución Francesa (contenido)."
Cobertura OBLIGATORIA de las tres dimensiones del aprendizaje:
  • SABER (conocimiento conceptual): qué debe saber el estudiante. Verbos: define, identifica, reconoce, distingue, enumera.
  • SABER HACER (habilidad en acción): qué debe ser capaz de hacer. Verbos: aplica, describe, resuelve, interpreta, construye, compara.
  • SER (actitud observable): cómo debe comportarse/valorar. Verbos: demuestra, participa, colabora, respeta, persiste, valora.
Entrega 3 a 5 indicadores repartidos entre las 3 dimensiones (al menos uno por dimensión).

━━━ PASO 4 — ACTIVIDAD DE EVALUACIÓN FORMATIVA ━━━
Diseña UNA actividad concreta de evaluación formativa alineada al objetivo y a los indicadores.
REQUISITOS OBLIGATORIOS (descriptores MBE chileno):
  • MBE 4.1: "Planifica la evaluación considerando los momentos adecuados y diversas técnicas e instrumentos para esta, incluyendo la auto y coevaluación por parte de sus estudiantes, de modo que todos puedan demostrar lo que han aprendido y sus resultados aporten información oportuna y pertinente respecto del avance y logro de los objetivos de aprendizaje."
  • MBE 4.2: "Diseña evaluaciones que permitan diversificar y ampliar la evidencia, formativas para monitorear y hacer seguimiento del aprendizaje, y sumativas para recoger información sobre el nivel de logro de los objetivos de aprendizaje."
  • MBE 9.2: "Comprueba durante la clase, mediante preguntas o actividades relevantes, el nivel de comprensión de sus estudiantes e identifica dificultades y errores para reorientar la enseñanza."
La actividad debe:
  - Ser factible en la duración de la clase.
  - Ser LÚDICA, innovadora y ACTIVA (no un cuestionario plano).
  - Explicitar: (a) qué hará el estudiante paso a paso, (b) qué evidencia se recoge, (c) cómo el docente monitorea, (d) instrumento concreto (rúbrica breve, lista de cotejo, ticket de salida, semáforo, pulgares, etc.), (e) cómo se da retroalimentación inmediata.
  - Diversificar formas de demostrar aprendizaje (oral, escrito, corporal, visual, grupal) — UDL/DUA.
  - Incluir al menos UNA instancia de auto o coevaluación.

━━━ PASO 5 — DISEÑO DE LOS MOMENTOS DE LA CLASE ━━━
Distribuye los tres momentos con tiempos explícitos y estrategias activas concretas (mencionando el nombre de la estrategia: "gancho visual", "pregunta problematizadora", "aprendizaje cooperativo Kagan", "think-pair-share", "gamificación", "aprendizaje basado en problemas (ABP)", "aprendizaje basado en proyectos (ABPy)", "aula invertida", "estaciones de aprendizaje", "rutinas de pensamiento visible", "modelaje", "scaffolding", "carrusel", etc.).

INICIO (~${tInicio} min) — debe contener:
  (a) GANCHO MOTIVACIONAL concreto (anécdota, imagen, audio, video corto, pregunta provocadora, objeto misterioso, situación cotidiana).
  (b) EVALUACIÓN DIAGNÓSTICA explícita (ej: lluvia de ideas, pregunta al grupo con paletas de colores, palabra-clave en post-it, kahoot de 3 preguntas, mapa conceptual incompleto).
  (c) ACTIVACIÓN DE CONOCIMIENTOS PREVIOS (conectar con la clase anterior o con la vida del estudiante).
  (d) EXPLICITACIÓN DEL PROPÓSITO al estudiante (qué aprenderán hoy y para qué sirve).

DESARROLLO (~${tDesarrollo} min) — debe contener:
  (a) Una SECUENCIA NUMERADA de al menos 3-4 momentos/actividades didácticas, cada una con rol del docente y rol del estudiante.
  (b) Metodologías activas NOMBRADAS (no genérico "trabajo grupal": di "aprendizaje cooperativo Kagan — estructura 'parafraseo por turnos'", por ejemplo).
  (c) INTEGRACIÓN EXPLÍCITA de la actividad de evaluación formativa del Paso 4 (di "aquí aplica la evaluación formativa descrita arriba").
  (d) DIFERENCIACIÓN para distintos ritmos y estilos de aprendizaje (1-2 líneas).
  (e) Recursos concretos, memorables, conectados con el mundo del estudiante.

CIERRE (~${tCierre} min) — debe contener:
  (a) SÍNTESIS del aprendizaje con rutina de pensamiento (ej: "Antes pensaba... ahora pienso...", "3-2-1", "una palabra, una imagen, una acción").
  (b) EVALUACIÓN SUMATIVA BREVE O TICKET DE SALIDA (pregunta abierta, micro-quiz, autoevaluación con escala, exit ticket con 2 preguntas clave).
  (c) RETROALIMENTACIÓN EXPLÍCITA: qué logros destaca el docente, qué aspectos se trabajarán en la próxima clase.
  (d) Proyección hacia la siguiente clase (conector para mantener el hilo).

━━━ PASO 6 — COHERENCIA FINAL ━━━
Antes de emitir, verifica en orden:
  OA → análisis Bloom → objetivo → indicadores (3 dimensiones) → actividad evaluación formativa → momentos (inicio/desarrollo/cierre con evaluación diagnóstica/formativa/sumativa/retroalimentación).
Si encuentras inconsistencias (ej: objetivo "analizar" pero actividad solo "recordar"), CORRIGE antes de responder.

═══════════════════════════════════════════════════════════════════
CRITERIOS DE CALIDAD (OBLIGATORIOS)
═══════════════════════════════════════════════════════════════════
• EXTENSIÓN MÍNIMA por campo (no entregues respuestas flojas):
  - inicioDetallado: 2-3 párrafos sólidos con los 4 componentes (gancho, diagnóstica, conocimientos previos, propósito).
  - desarrolloDetallado: al menos 4-6 párrafos o una lista de 4+ pasos numerados, cada uno con rol docente + rol estudiante.
  - cierreDetallado: 2-3 párrafos con síntesis, ticket de salida, retroalimentación y proyección.
  - actividadEvaluacion: 2-3 párrafos describiendo (qué hace el estudiante, evidencia, monitoreo, instrumento, retroalimentación).
  - adecuacion: al menos 3-4 líneas con adecuaciones DUA/PIE CONCRETAS (no genéricas tipo "dar más tiempo" solamente).
• Redacción HTML simple en campos de texto largo: <p>, <ul>, <li>, <b>, <br/>. Nada de <h1>-<h6>, <div>, estilos inline, ni markdown (##, **).
• NO pongas títulos redundantes como "Inicio:" dentro del campo inicioDetallado — el campo ya representa ese momento.
• "objetivo" es texto PLANO, sin HTML.
• Materiales y TICs concretos y breves (ítems cortos, 1 idea por ítem).
• Adecuación DUA/PIE: mencionar al menos uno de los principios DUA (múltiples formas de representación / acción y expresión / compromiso) y al menos una adecuación PIE específica (estudiantes con TEA, TDAH, dificultades específicas de aprendizaje, etc.).
• SÉ ALTAMENTE CREATIVO en las dinámicas, pero pedagógicamente riguroso y contextualizado a ${asignatura} en ${nivelCurricular}.
• LENGUAJE CHILENO: usa términos y ejemplos del contexto escolar chileno (JEC, PIE, lenguaje profesores, realidad aula).

═══════════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA (SOLO JSON PURO — sin texto adicional, sin markdown, sin fences ${"```"})
═══════════════════════════════════════════════════════════════════
{
  "analisisBloom": {
    "categoria": "analizar",
    "nivelGeneral": "MEDIO",
    "justificacion": "El verbo rector del OA es 'describir', que en Bloom revisado se ubica en 'comprender' pero al exigir vincular elementos del lenguaje musical con su propósito expresivo escala a 'analizar'. Por eso lo clasifico como nivel MEDIO: requiere que el estudiante diferencie componentes y atribuya funciones expresivas, no solo reconocer."
  },
  "objetivo": "Describir los elementos del lenguaje musical en piezas escuchadas e interpretadas, relacionándolos con su propósito expresivo, demostrando curiosidad y disfrute por los sonidos.",
  "indicadoresEvaluacion": [
    { "dimension": "saber", "texto": "Identifica con precisión al menos cuatro elementos del lenguaje musical (pulso, acento, tempo, dinámica) al escuchar una pieza breve." },
    { "dimension": "saber_hacer", "texto": "Describe con ejemplos concretos la función expresiva de un patrón rítmico en una obra musical propuesta." },
    { "dimension": "saber_hacer", "texto": "Compara dos fragmentos musicales identificando al menos dos diferencias en sus elementos del lenguaje." },
    { "dimension": "ser", "texto": "Participa con atención, respeto y disfrute durante las audiciones y discusiones grupales, aportando al menos una idea propia." }
  ],
  "actividadEvaluacion": "<p><b>Laboratorio de escucha activa en tríos.</b> Los estudiantes, organizados en tríos, escuchan tres fragmentos musicales contrastantes (ej: una cueca, una pieza de Bach, un tema de rock). Cada trío completa una ficha con tres columnas (elementos detectados / propósito expresivo / emoción que genera). Luego, un integrante expone al curso y los demás coevalúan con una rúbrica breve de 3 criterios (claridad, precisión, respeto al turno).</p><p><b>Instrumento:</b> rúbrica de 3 niveles (inicial/intermedio/avanzado) + ticket de coevaluación.</p><p><b>Monitoreo del docente (MBE 9.2):</b> mientras los tríos trabajan, el docente circula con un semáforo de post-it para marcar avance (verde = logrado, amarillo = necesita apoyo, rojo = requiere intervención), reorientando la enseñanza en tiempo real. <b>Retroalimentación inmediata:</b> al final, el docente destaca 2 logros del curso y señala 1 foco a reforzar la próxima clase.</p>",
  "inicioDetallado": "<p><b>Gancho (3 min):</b> El docente entra al aula con un parlante reproduciendo un fragmento misterioso de 15 segundos (ej: inicio de 'Bohemian Rhapsody' o cueca chilena). Les pregunta: '¿Qué sintieron? ¿Qué imaginaron?' — lluvia de ideas rápida.</p><p><b>Evaluación diagnóstica (5 min):</b> En la pizarra dibuja un mapa conceptual incompleto con 'elementos del lenguaje musical' en el centro. Los estudiantes, con paletas verde/rojo, responden si reconocen términos como pulso, tempo, dinámica, textura. El docente registra mentalmente los vacíos conceptuales.</p><p><b>Activación + propósito (3 min):</b> Conecta con la clase anterior ('la vez pasada vimos que la música tiene partes; hoy vamos a descubrir cuáles son esas partes y por qué cada una existe') y escribe el objetivo en la pizarra parafraseado a ellos: 'Hoy vamos a ser detectives del sonido.'</p>",
  "desarrolloDetallado": "<ol><li><b>Modelaje (${Math.max(5, Math.round(tDesarrollo * 0.15))} min).</b> El docente escucha junto a los estudiantes un fragmento de 30 segundos y modela en voz alta cómo detecta elementos ('escucho un pulso constante de unos 120 bpm, una dinámica fuerte al inicio...'). Estudiante: observa y copia la estrategia en su cuaderno con anotaciones propias.</li><li><b>Aprendizaje cooperativo Kagan — 'parafraseo por turnos' (${Math.max(10, Math.round(tDesarrollo * 0.3))} min).</b> En tríos, cada estudiante explica al compañero de al lado qué es un elemento del lenguaje musical distinto (pulso, acento, tempo) usando sus propias palabras. Rotan. Docente: monitorea con lista de cotejo mental quién necesita scaffolding.</li><li><b>Laboratorio de escucha (Paso 4 — evaluación formativa) (${Math.max(15, Math.round(tDesarrollo * 0.4))} min).</b> Aplica integralmente la actividad de evaluación descrita en el campo actividadEvaluacion: tres fragmentos contrastantes, ficha por tríos, exposición, coevaluación. El docente circula con el semáforo de monitoreo (MBE 9.2).</li><li><b>Consolidación grupal (${Math.max(5, Math.round(tDesarrollo * 0.15))} min).</b> Puesta en común de hallazgos. El docente construye con el grupo un 'glosario visual' en la pizarra conectando términos con ejemplos aportados por los estudiantes.</li></ol><p><b>Diferenciación:</b> los estudiantes con apoyo PIE trabajan con una ficha que incluye pictogramas y opción de respuesta oral grabada (celular). Estudiantes avanzados reciben un cuarto fragmento más complejo y una pregunta de profundización sobre textura.</p>",
  "cierreDetallado": "<p><b>Síntesis — rutina '3-2-1' (${Math.max(3, Math.round(tCierre * 0.4))} min):</b> cada estudiante escribe en su cuaderno: 3 elementos del lenguaje musical que aprendió hoy, 2 ejemplos de piezas donde los identificó, 1 pregunta que le quedó dando vueltas.</p><p><b>Ticket de salida — evaluación sumativa breve (${Math.max(3, Math.round(tCierre * 0.4))} min):</b> en un post-it responden: '¿Qué elemento del lenguaje musical fue el que mejor comprendiste y cuál el más difícil?'. El docente los recoge en la puerta al salir.</p><p><b>Retroalimentación + proyección (${Math.max(2, Math.round(tCierre * 0.2))} min):</b> el docente destaca 2 logros observados ('vi que varios tríos detectaron diferencias de tempo con mucha precisión') y anuncia la próxima clase: 'la próxima vez vamos a crear nuestros propios patrones rítmicos aplicando lo aprendido hoy'.</p>",
  "materiales": ["parlante o altavoz bluetooth", "fichas de escucha impresas (una por trío)", "post-it de 2 colores", "pizarra y plumones", "paletas verde/rojo para diagnóstico", "semáforo del docente (3 post-it)"],
  "tics": ["YouTube: fragmentos de audio seleccionados (cueca, Bach, rock)", "Spotify/Deezer como respaldo", "Kahoot opcional para cierre gamificado"],
  "adecuacion": "<p><b>DUA — Múltiples formas de representación:</b> ofrecer el mismo fragmento en audio + partitura visual simplificada + pictogramas para estudiantes con dificultades de procesamiento auditivo.</p><p><b>DUA — Múltiples formas de acción/expresión:</b> permitir que los estudiantes con dificultades de escritura respondan oralmente grabándose en el celular o dictándole al compañero.</p><p><b>PIE específico:</b> para estudiantes con TEA, anticipar la estructura de la clase con pictogramas en la pizarra y reducir estímulos visuales durante las audiciones. Para TDAH, fragmentar las escuchas en segmentos de máximo 45 segundos y ofrecer un ancla kinestésica (palillos para marcar pulso). Tiempo extendido y apoyo de la educadora diferencial durante el laboratorio en tríos.</p>"
}

IMPORTANTE: responde ÚNICAMENTE con el JSON anterior completado. Nada más.`
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 2: CHAT LIBRE
// Conversación pedagógica con el profesor. NO devuelve JSON ni reescribe la
// clase completa. El contexto incluye los artefactos del método 6-pasos para
// que la IA mantenga coherencia curricular al sugerir cambios.
// ═══════════════════════════════════════════════════════════════════════════
function buildChatPrompt(body: LessonRequestBody): string {
  const curso = cleanText(body.curso) || "curso no especificado"
  const asignatura = cleanText(body.asignatura) || "la asignatura"
  const nivelCurricular = cleanText(body.nivelCurricular) || "no especificado"
  const duracion = typeof body.duracionMinutos === "number" && body.duracionMinutos > 0
    ? `${body.duracionMinutos} min`
    : "no especificada"
  const mensaje = cleanText(body.instruccionesAdicionales)

  return `Eres un ASESOR PEDAGÓGICO EXPERTO en el currículum escolar chileno, la Taxonomía de Bloom revisada (Anderson-Krathwohl), el Marco para la Buena Enseñanza (MBE) chileno y el Diseño Universal para el Aprendizaje (DUA). Conversas DIRECTAMENTE con un profesor de aula chileno sobre la clase que está planificando.

═══════════════════════════════════════════════════════════════════
CONTEXTO CURRICULAR
═══════════════════════════════════════════════════════════════════
• Asignatura: ${asignatura} | Curso: ${curso} | Nivel: ${nivelCurricular}
• Clase N°${body.numeroClase ?? "?"} | Duración: ${duracion}
• Objetivos de Aprendizaje:
${formatOAs(body.oas)}

• Unidad:
${formatUnitContext(body.unidad)}

═══════════════════════════════════════════════════════════════════
CLASE ACTUAL (incluye artefactos pedagógicos del método 6-pasos si ya se generaron)
═══════════════════════════════════════════════════════════════════
${formatClaseActual(body.claseActual)}

═══════════════════════════════════════════════════════════════════
CONVERSACIÓN PREVIA
═══════════════════════════════════════════════════════════════════
${formatChatHistory(body.chatHistory)}

═══════════════════════════════════════════════════════════════════
REGLAS DE COMPORTAMIENTO
═══════════════════════════════════════════════════════════════════
• Responde de forma NATURAL, cálida y CONVERSACIONAL, como un colega-asesor que acompaña.
• NO devuelvas JSON. NO reescribas la clase completa en tu respuesta. Si propones un cambio, descríbelo en prosa breve: "Te propongo cambiar el inicio así: ..." o "Una alternativa sería...".
• Mantén COHERENCIA con el análisis Bloom y los indicadores existentes. Si una sugerencia desalinearía la taxonomía (ej: el objetivo es 'analizar' pero el profesor pide una actividad de 'recordar'), ADVIÉRTELO explícitamente y propone una alternativa alineada.
• Cuida las TRES DIMENSIONES (saber / saber hacer / ser): si el profesor quiere cambiar un indicador, verifica que siga cubriéndose la dimensión correspondiente.
• Si detectas inconsistencias OA ↔ objetivo ↔ indicadores ↔ actividad evaluación ↔ momentos, MENCIÓNALAS concretamente.
• Si el profesor hace una pregunta pedagógica (ej: "¿qué metodología activa sirve para esto?"), respóndela con fundamento curricular chileno y cita al menos una estrategia nombrada (ABP, aula invertida, Kagan, rutinas de pensamiento visible, gamificación, etc.).
• Sé DIRECTO y honesto si algo de la clase no está bien; propone mejoras concretas y viables.
• Usa ejemplos cortos, específicos y contextualizados a ${asignatura} en ${nivelCurricular} chileno.
• Cuando propongas actividades, indica el tiempo estimado en minutos y la estrategia activa específica.
• Usa HTML simple SOLO si ayuda a estructurar: <p>, <ul>, <li>, <b>. Prefiere prosa natural para la conversación.
• Longitud: respuestas DENSAS pero no interminables — apunta a 3-6 oraciones o 2-3 párrafos cortos con <ul> si hay lista. No te extiendas gratuitamente.

═══════════════════════════════════════════════════════════════════
MENSAJE ACTUAL DEL PROFESOR
═══════════════════════════════════════════════════════════════════
${mensaje || "(El profesor no escribió nada; saluda o continúa la conversación previa con algo útil.)"}`
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 3: APLICAR CAMBIOS
// Se ejecuta cuando el profesor hace clic en "Aplicar cambios a la clase".
// Lee el historial completo, identifica qué acordaron, aplica SOLO ESO,
// preservando íntegramente los artefactos pedagógicos no discutidos y sin
// degradar la riqueza de redacción de los campos intactos.
// ═══════════════════════════════════════════════════════════════════════════
function buildAplicarCambiosPrompt(body: LessonRequestBody): string {
  const asignatura = cleanText(body.asignatura) || "la asignatura"
  const nivelCurricular = cleanText(body.nivelCurricular) || "no especificado"

  return `Eres un EXTRACTOR DE MODIFICACIONES PEDAGÓGICAS con rigor curricular chileno. Tu única tarea es aplicar a la clase los cambios acordados entre el profesor y el asistente en la conversación, SIN degradar la calidad ni romper la coherencia del método 6-pasos (Bloom → Objetivo → Indicadores → Actividad Evaluación → Momentos → Coherencia).

CONTEXTO CURRICULAR: ${asignatura} · ${nivelCurricular}

═══════════════════════════════════════════════════════════════════
CLASE ACTUAL (base de partida — incluye artefactos pedagógicos)
═══════════════════════════════════════════════════════════════════
${formatClaseActual(body.claseActual)}

═══════════════════════════════════════════════════════════════════
CONVERSACIÓN COMPLETA
═══════════════════════════════════════════════════════════════════
${formatChatHistory(body.chatHistory)}

═══════════════════════════════════════════════════════════════════
INSTRUCCIONES ESTRICTAS
═══════════════════════════════════════════════════════════════════
1. Lee la conversación completa y determina EXACTAMENTE qué campos el profesor quiso cambiar.
2. Aplica SOLO esos cambios. Cualquier campo NO DISCUTIDO debe devolverse IDÉNTICO al valor actual (incluyendo su redacción, estructura, HTML y nivel de detalle). No "refresques" ni reescribas texto que nadie pidió cambiar.
3. PRESERVA ARTEFACTOS: si el análisis Bloom, los indicadores de evaluación o la actividad de evaluación formativa NO fueron discutidos, devuélvelos idénticos.
4. COHERENCIA CURRICULAR: si el cambio solicitado afectaría la alineación (ej: objetivo "analizar" pero el profesor pide una actividad de solo "recordar"), aplica el ajuste MÍNIMO manteniendo la alineación y explica en "resumen_cambios" qué ajuste hiciste para preservar el nivel Bloom.
5. TRES DIMENSIONES: si el cambio toca los indicadores, asegúrate de que se sigan cubriendo las tres dimensiones (saber / saber hacer / ser). Si el profesor pide eliminar un indicador que dejaría una dimensión sin cubrir, AGREGA uno alternativo de esa misma dimensión y avisa en resumen_cambios.
6. RIQUEZA: al reescribir un campo (ej: nuevo desarrolloDetallado), mantén el mismo nivel de detalle del método 6-pasos: tiempos en minutos, estrategias activas nombradas (Kagan, ABP, rutinas de pensamiento visible, etc.), roles del docente y del estudiante, integración explícita de la evaluación formativa. NO entregues párrafos cortos genéricos.
7. No inventes cambios que el profesor no haya pedido ni insinuado.
8. No escribas explicaciones dentro de los campos de la clase. Solo contenido didáctico limpio.
9. HTML simple en inicioDetallado/desarrolloDetallado/cierreDetallado/adecuacion/actividadEvaluacion: <p>, <ul>, <ol>, <li>, <b>, <br/>. Nada de markdown (##, **), ni <h1>-<h6>, ni <div>, ni estilos inline.
10. "objetivo" es TEXTO PLANO, sin HTML. Debe conservar estructura habilidad + contenido + actitud.
11. Devuelves la versión RICA en inicioDetallado/desarrolloDetallado/cierreDetallado. La versión SIMPLE narrativa (inicio/desarrollo/cierre) la produce un segundo agente después — tú NO la generas.
12. "resumen_cambios" es un mensaje BREVE y CONVERSACIONAL para el profesor (máx 2-3 oraciones). Ejemplo: "¡Listo! Reescribí el inicio detallado para que sea más breve y agregué una evaluación diagnóstica con paletas. Mantengo el nivel 'analizar' del Bloom y todos los indicadores siguen cubriendo las 3 dimensiones."

═══════════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA (SOLO JSON PURO — sin texto adicional, sin markdown, sin fences)
═══════════════════════════════════════════════════════════════════
{
  "resumen_cambios": "Explicación breve de qué cambió y qué quedó igual.",
  "analisisBloom": { "categoria": "", "nivelGeneral": "BAJO|MEDIO|ALTO", "justificacion": "" },
  "objetivo": "",
  "indicadoresEvaluacion": [ { "dimension": "saber|saber_hacer|ser", "texto": "" } ],
  "actividadEvaluacion": "",
  "inicioDetallado": "",
  "desarrolloDetallado": "",
  "cierreDetallado": "",
  "materiales": [],
  "tics": [],
  "adecuacion": ""
}

IMPORTANTE: responde ÚNICAMENTE con el JSON anterior. Nada de texto fuera del JSON.`
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 4: DESTILAR SIMPLE
// Segunda pasada tras crear_inicial o aplicar_cambios. Toma la versión RICA
// (inicioDetallado/desarrolloDetallado/cierreDetallado) y la convierte a
// formato narrativo sintético estilo DOCX oficial de Freddy Figueroa —
// párrafos fluidos, sin etiquetas MBE, sin tiempos en minutos, sin nombres
// de estrategias. El resultado alimenta el tab Desarrollo y el Word descargado.
// ═══════════════════════════════════════════════════════════════════════════
function buildDestilarSimplePrompt(body: LessonRequestBody): string {
  const asignatura = cleanText(body.asignatura) || "la asignatura"
  const nivelCurricular = cleanText(body.nivelCurricular) || "no especificado"
  const duracionMin = typeof body.duracionMinutos === "number" && body.duracionMinutos > 0
    ? body.duracionMinutos
    : 90
  const clase = body.claseActual || {}
  const objetivo = clipText(htmlToPlainText(clase.objetivo), 500) || "(sin objetivo)"
  const inicioDet = clipText(htmlToPlainText(clase.inicioDetallado || clase.inicio), 2000)
  const desarrolloDet = clipText(htmlToPlainText(clase.desarrolloDetallado || clase.desarrollo), 2500)
  const cierreDet = clipText(htmlToPlainText(clase.cierreDetallado || clase.cierre), 1500)

  return `Actúa como un REDACTOR PEDAGÓGICO que transforma planificaciones didácticas detalladas en el formato narrativo sintético usado por el profesor Freddy Figueroa en sus planificaciones oficiales. El resultado de esta destilación irá al leccionario y al documento Word descargable, por eso debe sonar natural, fluido y profesional — como un profesor experimentado explicando su clase a un colega.

═══════════════════════════════════════════════════════════════════
CONTEXTO
═══════════════════════════════════════════════════════════════════
• Asignatura: ${asignatura} | Nivel curricular: ${nivelCurricular}
• Duración total de la clase: ${duracionMin} minutos
• Objetivo de la clase: ${objetivo}

═══════════════════════════════════════════════════════════════════
INICIO — VERSIÓN DETALLADA (entrada)
═══════════════════════════════════════════════════════════════════
${inicioDet || "(sin inicio detallado)"}

═══════════════════════════════════════════════════════════════════
DESARROLLO — VERSIÓN DETALLADA (entrada)
═══════════════════════════════════════════════════════════════════
${desarrolloDet || "(sin desarrollo detallado)"}

═══════════════════════════════════════════════════════════════════
CIERRE — VERSIÓN DETALLADA (entrada)
═══════════════════════════════════════════════════════════════════
${cierreDet || "(sin cierre detallado)"}

═══════════════════════════════════════════════════════════════════
TAREA — DESTILAR A FORMATO NARRATIVO SIMPLE
═══════════════════════════════════════════════════════════════════

ELIMINA (no deben aparecer en la versión simple):
• Referencias explícitas al MBE (4.1, 4.2, 9.2), a la Taxonomía de Bloom, a DUA o PIE — esos metadatos ya quedaron en la versión detallada.
• Tiempos en minutos explícitos (nada de "(15 min)", "~20 min", etc.). La duración queda implícita en la cadencia del relato.
• Nombres de estrategias pedagógicas (no digas "aprendizaje cooperativo Kagan", "think-pair-share", "ABP", "rutina 3-2-1", "modelaje", "scaffolding"). Describe la ACCIÓN concreta en su lugar (ej: en vez de "Kagan parafraseo por turnos", di "en tríos, cada uno le explica al compañero con sus palabras…").
• Etiquetas tipo "Docente:", "Estudiante:", "Rol del docente:" — narra en prosa fluida.
• Listas con viñetas largas o numeradas — prefiere párrafos corridos.
• Negritas excesivas. Usa <b> solo si resalta un concepto central.
• Palabras como "paso 1", "paso 2", "actividad 1" — el texto fluye sin numeraciones.

CONSERVA (esencia pedagógica intacta):
• El objetivo de aprendizaje subyacente.
• Las actividades concretas que hará el profesor y los estudiantes (qué se hace realmente).
• Los recursos clave (materiales, TICs, soporte visual).
• La secuencia lógica: gancho → trabajo → cierre.
• El tono cálido y profesional del profesor experimentado.

ESTILO DE REDACCIÓN:
• Frases claras y directas, tercera persona o impersonal ("los estudiantes escuchan…", "se presenta…").
• Voz activa cuando sea posible.
• Español chileno natural, sin tecnicismos excesivos.
• Cada momento se lee como un párrafo (o dos) corrido, autocontenido.

LONGITUD OBJETIVO:
• inicio: 1-2 párrafos cortos (~60-100 palabras en total).
• desarrollo: 2-3 párrafos (~120-180 palabras en total).
• cierre: 1 párrafo corto (~50-80 palabras).

═══════════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA (SOLO JSON PURO — sin texto adicional, sin markdown, sin fences)
═══════════════════════════════════════════════════════════════════
{
  "inicio": "<p>Al iniciar la clase, se presenta a los estudiantes un breve fragmento sonoro que despierta su curiosidad y se les invita a compartir qué emociones les provoca. A partir de esa conversación inicial, el docente revisa qué saben previamente sobre los elementos del lenguaje musical y presenta el propósito del aprendizaje, invitándolos a convertirse en 'detectives del sonido'.</p>",
  "desarrollo": "<p>El docente escucha junto al curso un fragmento musical y les muestra, pensando en voz alta, cómo identificar pulso, acento, tempo y dinámica. Luego, organizados en pequeños grupos, los estudiantes se explican entre ellos cada uno de estos elementos con sus propias palabras mientras el docente acompaña a quienes necesitan más apoyo.</p><p>En la actividad central, los grupos escuchan tres fragmentos musicales contrastantes y completan una ficha identificando los elementos presentes, su propósito expresivo y la emoción que transmiten. Después exponen al curso y reciben retroalimentación de sus compañeros mediante una rúbrica breve. El docente circula entre los grupos, monitoreando el avance y apoyando cuando detecta dificultades.</p>",
  "cierre": "<p>Al finalizar, los estudiantes anotan en sus cuadernos tres elementos del lenguaje musical que aprendieron hoy, dos piezas donde los identificaron y una pregunta que les quedó abierta. Escriben también en un post-it qué elemento comprendieron mejor y cuál les resultó más difícil. El docente destaca los logros observados y anticipa que la próxima clase crearán sus propios patrones rítmicos aplicando lo aprendido.</p>"
}

IMPORTANTE: responde ÚNICAMENTE con el JSON anterior completado. Sin texto fuera. Solo <p> y <br/> como etiquetas HTML permitidas.`
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 5: ESTRUCTURAR NOTEBOOKLM
// Recibe texto pedagógico generado por NotebookLM (ancla fuentes oficiales
// Mineduc/textos escolares) y lo estructura al schema GeneratedLesson.
// IMPORTANTE: NO genera contenido nuevo; solo RE-ESTRUCTURA lo que NotebookLM
// ya produjo. El valor añadido de la IA aquí es el parsing y la normalización
// al formato de EduPanel, preservando fielmente la información.
// Según `tipoContenido`, rellena solo las secciones correspondientes.
// ═══════════════════════════════════════════════════════════════════════════
function buildEstructurarNotebookLmPrompt(body: LessonRequestBody): string {
  const asignatura = cleanText(body.asignatura) || "la asignatura"
  const nivelCurricular = cleanText(body.nivelCurricular) || "no especificado"
  const tipoContenido: NotebookLmContentType =
    (body.tipoContenido as NotebookLmContentType) || "clase_completa"
  const texto = cleanText(body.textoNotebookLm) || "(sin texto)"

  // Instrucciones por tipo — qué campos rellenar y cuáles dejar undefined
  const instruccionesPorTipo: Record<NotebookLmContentType, string> = {
    clase_completa:
      "Rellena TODOS los campos aplicables: analisisBloom, objetivo, indicadoresEvaluacion, actividadEvaluacion, inicioDetallado, desarrolloDetallado, cierreDetallado, materiales, tics, adecuacion. Si alguna sección no aparece en el texto de NotebookLM, déjala como cadena vacía \"\" o arreglo vacío []. No inventes.",
    rubrica:
      "Rellena SOLO actividadEvaluacion (con la rúbrica en HTML estructurada) e indicadoresEvaluacion (derivados de la rúbrica, cubriendo saber/saber_hacer/ser cuando estén presentes). Deja todos los demás campos como cadena vacía o arreglo vacío.",
    analisis_bloom:
      "Rellena SOLO analisisBloom (categoria + nivelGeneral + justificacion). Deja todos los demás campos como cadena vacía o arreglo vacío.",
    indicadores:
      "Rellena SOLO indicadoresEvaluacion con los indicadores presentes en el texto. Deja todos los demás campos como cadena vacía o arreglo vacío.",
    evaluacion:
      "Rellena SOLO actividadEvaluacion con la descripción de la actividad formativa. Deja todos los demás campos como cadena vacía o arreglo vacío.",
    otro:
      "Analiza el texto y rellena los campos que razonablemente correspondan al contenido. Si es ambiguo, prefiere ser conservador y dejar campos vacíos antes que inventar.",
  }

  return `Eres un ESTRUCTURADOR de contenido pedagógico. Recibirás un texto generado por NotebookLM (una herramienta de Google que ancla respuestas en fuentes oficiales como bases curriculares Mineduc y textos escolares chilenos). Tu ÚNICA tarea es convertir ese texto al schema JSON GeneratedLesson de EduPanel.

═══════════════════════════════════════════════════════════════════
REGLA DE ORO — NO INVENTES
═══════════════════════════════════════════════════════════════════
• NO generes contenido pedagógico nuevo. NO añadas información que NO esté en el texto de NotebookLM.
• Si el texto no menciona la actividad de evaluación, deja ese campo como cadena vacía. NO inventes una.
• Si el texto no tiene análisis Bloom explícito, NO lo deduzcas: deja analisisBloom como null o con categoria:"" y justificacion:"".
• Preserva fielmente el contenido: reformula SOLO lo necesario para encajar en el schema HTML permitido (<p>, <ul>, <ol>, <li>, <b>, <br/>).
• Si el texto de NotebookLM usa markdown (##, **, listas con -), conviértelo a HTML simple.

═══════════════════════════════════════════════════════════════════
CONTEXTO DE LA CLASE (referencia, no para generar contenido)
═══════════════════════════════════════════════════════════════════
• Asignatura: ${asignatura}
• Nivel curricular: ${nivelCurricular}
• Objetivos de Aprendizaje asociados:
${formatOAs(body.oas)}

• Unidad:
${formatUnitContext(body.unidad)}

═══════════════════════════════════════════════════════════════════
TIPO DE CONTENIDO DECLARADO POR EL PROFESOR: ${tipoContenido}
═══════════════════════════════════════════════════════════════════
${instruccionesPorTipo[tipoContenido]}

═══════════════════════════════════════════════════════════════════
FORMATO GUIADO (modo opcional)
═══════════════════════════════════════════════════════════════════
Si el TEXTO DE NOTEBOOKLM usa etiquetas delimitadoras tipo [INICIO]...[/INICIO],
[DESARROLLO]...[/DESARROLLO], [CIERRE]...[/CIERRE], [EVALUACION]...[/EVALUACION],
[RUBRICA]...[/RUBRICA], [BLOOM]...[/BLOOM], [INDICADORES]...[/INDICADORES],
[OBJETIVO]...[/OBJETIVO], [MATERIALES]...[/MATERIALES], [TICS]...[/TICS],
[ADECUACION]...[/ADECUACION], entonces:
• Trátalas como la fuente autoritaria para ese campo.
• NO mezcles contenido de una etiqueta con otra.
• Elimina las etiquetas en el JSON final (solo usa su contenido).
• Si una sección no está delimitada, intenta inferirla del contexto sin inventar.

═══════════════════════════════════════════════════════════════════
TEXTO DE NOTEBOOKLM (fuente de verdad — tu trabajo es estructurar esto)
═══════════════════════════════════════════════════════════════════
${texto}

═══════════════════════════════════════════════════════════════════
REGLAS DE MAPEO
═══════════════════════════════════════════════════════════════════
1. "objetivo" es TEXTO PLANO sin HTML. Si NotebookLM entregó un objetivo explícito con estructura "habilidad + contenido + actitud", úsalo tal cual. Si no entregó objetivo, deja "".
2. "analisisBloom" → objeto con categoria (recordar/comprender/aplicar/analizar/evaluar/crear), nivelGeneral (BAJO|MEDIO|ALTO) y justificacion. Solo si NotebookLM lo mencionó.
3. "indicadoresEvaluacion" → arreglo de { dimension: "saber"|"saber_hacer"|"ser", texto }. Infiere la dimensión del VERBO del indicador:
   • "saber" (conceptual): define, identifica, reconoce, distingue, enumera.
   • "saber_hacer" (procedimental): aplica, resuelve, interpreta, construye, compara, explica con ejemplos.
   • "ser" (actitudinal): participa, respeta, colabora, persiste, valora, demuestra disposición.
4. "actividadEvaluacion" → HTML con <p>, <ul>, <li>, <b>. Si NotebookLM entregó una rúbrica en tabla/markdown, conviértela a HTML (puedes usar <ul> con cada criterio-nivel).
5. "inicioDetallado"/"desarrolloDetallado"/"cierreDetallado" → HTML con <p>, <ul>, <ol>, <li>, <b>. Preserva la estructura del texto.
6. "inicio"/"desarrollo"/"cierre" (versión SIMPLE narrativa) → déjalos como "" en este modo. Los generará el segundo agente (destilar_simple) en una llamada posterior.
7. "materiales" → arreglo de strings cortos (1 ítem = 1 idea).
8. "tics" → arreglo de strings cortos (herramientas digitales).
9. "adecuacion" → HTML. Si NotebookLM no dio adecuaciones DUA/PIE, deja "".
10. NO uses markdown (##, **, -), NO uses <h1>-<h6>, NO uses <div>, NO uses estilos inline.

═══════════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA (SOLO JSON PURO — sin texto adicional, sin markdown, sin fences ${"```"})
═══════════════════════════════════════════════════════════════════
{
  "resumen_cambios": "Breve mensaje para el profesor indicando qué secciones se rellenaron desde NotebookLM y cuáles quedaron vacías.",
  "analisisBloom": { "categoria": "", "nivelGeneral": "BAJO|MEDIO|ALTO", "justificacion": "" },
  "objetivo": "",
  "indicadoresEvaluacion": [ { "dimension": "saber|saber_hacer|ser", "texto": "" } ],
  "actividadEvaluacion": "",
  "inicioDetallado": "",
  "desarrolloDetallado": "",
  "cierreDetallado": "",
  "inicio": "",
  "desarrollo": "",
  "cierre": "",
  "materiales": [],
  "tics": [],
  "adecuacion": ""
}

IMPORTANTE: responde ÚNICAMENTE con el JSON anterior. Nada de texto fuera del JSON.`
}

// ─── Punto de entrada principal ───────────────────────────────────────────────

export function buildCopilotPrompt(body: LessonRequestBody, mode: CopilotMode): string {
  if (mode === "crear_inicial") return buildCrearInicialPrompt(body)
  if (mode === "aplicar_cambios") return buildAplicarCambiosPrompt(body)
  if (mode === "destilar_simple") return buildDestilarSimplePrompt(body)
  if (mode === "estructurar_notebook_lm") return buildEstructurarNotebookLmPrompt(body)
  return buildChatPrompt(body)
}
