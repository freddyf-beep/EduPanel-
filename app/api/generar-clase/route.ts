import { NextResponse } from "next/server"
import {
  buildCopilotPrompt,
  cleanText,
  coerceGeneratedLesson,
  getProviderMeta,
  parseJsonResponse,
  resolveMode,
  type AIProvider,
  type LessonRequestBody,
} from "@/lib/ai/copilot"

async function readJsonOrText(response: Response) {
  const rawText = await response.text()

  try {
    return { rawText, json: JSON.parse(rawText) as Record<string, any> }
  } catch {
    return { rawText, json: null }
  }
}

function extractGeminiText(data: Record<string, any> | null): string {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ""

  return parts
    .map((part) => cleanText(part?.text))
    .filter(Boolean)
    .join("\n")
}

function extractOpenAIText(data: Record<string, any> | null): string {
  const direct = cleanText(data?.choices?.[0]?.message?.content)
  if (direct) return direct

  const outputText = Array.isArray(data?.output)
    ? data.output
        .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
        .map((chunk: any) => cleanText(chunk?.text))
        .filter(Boolean)
        .join("\n")
    : ""

  return outputText
}

function extractAnthropicText(data: Record<string, any> | null): string {
  if (!Array.isArray(data?.content)) return ""

  return data.content
    .map((chunk: any) => cleanText(chunk?.text))
    .filter(Boolean)
    .join("\n")
}

function isAnthropicModelError(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes("model") || normalized.includes("not_found_error")
}

function buildAnthropicModelCandidates(model: string) {
  return Array.from(new Set([
    model,
    "claude-sonnet-4-20250514",
    "claude-3-7-sonnet-latest",
    "claude-3-5-sonnet-latest",
  ].filter(Boolean)))
}

async function callGemini(body: LessonRequestBody, prompt: string, expectsJson: boolean) {
  const model = cleanText(body.customModel) || getProviderMeta("gemini").defaultModel
  const token = cleanText(body.customToken) || process.env.GEMINI_API_KEY

  if (!token) {
    throw new Error("Falta configurar la API key de Gemini en el servidor o en los ajustes del copiloto.")
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: expectsJson ? 0.45 : 0.4,
          ...(expectsJson ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  )

  const { rawText, json } = await readJsonOrText(response)
  if (!response.ok) {
    const message = cleanText(json?.error?.message) || rawText || "Gemini no pudo responder."
    throw new Error(message)
  }

  return extractGeminiText(json) || rawText
}

async function callOpenAI(body: LessonRequestBody, prompt: string, expectsJson: boolean) {
  const token = cleanText(body.customToken)
  if (!token) {
    throw new Error("Debes ingresar tu token personal de OpenAI para usar este proveedor.")
  }

  const model = cleanText(body.customModel) || getProviderMeta("openai").defaultModel
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      temperature: expectsJson ? 0.45 : 0.4,
      messages: [{ role: "user", content: prompt }],
      ...(expectsJson ? { response_format: { type: "json_object" } } : {}),
    }),
  })

  const { rawText, json } = await readJsonOrText(response)
  if (!response.ok) {
    const message = cleanText(json?.error?.message) || rawText || "OpenAI no pudo responder."
    throw new Error(message)
  }

  return extractOpenAIText(json) || rawText
}

async function callAnthropic(body: LessonRequestBody, prompt: string) {
  const token = cleanText(body.customToken)
  if (!token) {
    throw new Error("Debes ingresar tu token personal de Anthropic para usar este proveedor.")
  }

  const requestedModel = cleanText(body.customModel) || getProviderMeta("anthropic").defaultModel
  const modelCandidates = buildAnthropicModelCandidates(requestedModel)
  let lastMessage = ""

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index]
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": token,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    const { rawText, json } = await readJsonOrText(response)
    if (response.ok) {
      return extractAnthropicText(json) || rawText
    }

    const message = cleanText(json?.error?.message) || rawText || "Anthropic no pudo responder."
    lastMessage = message

    const canRetryWithAnotherModel =
      index < modelCandidates.length - 1 &&
      isAnthropicModelError(message)

    if (!canRetryWithAnotherModel) {
      throw new Error(message)
    }
  }

  throw new Error(lastMessage || "Anthropic no pudo responder.")
}

async function callCompatible(body: LessonRequestBody, prompt: string, expectsJson: boolean) {
  const token = cleanText(body.customToken)
  if (!token) {
    throw new Error("Debes ingresar un token para usar un endpoint compatible.")
  }

  const endpoint = cleanText(body.customEndpoint)
  if (!endpoint) {
    throw new Error("Debes indicar la URL base del endpoint compatible.")
  }

  const model = cleanText(body.customModel) || getProviderMeta("compatible").defaultModel
  const base = endpoint.replace(/\/+$/, "")
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      temperature: expectsJson ? 0.45 : 0.4,
      messages: [{ role: "user", content: prompt }],
      ...(expectsJson ? { response_format: { type: "json_object" } } : {}),
    }),
  })

  const { rawText, json } = await readJsonOrText(response)
  if (!response.ok) {
    const message = cleanText(json?.error?.message) || rawText || "El endpoint compatible no pudo responder."
    throw new Error(message)
  }

  return extractOpenAIText(json) || rawText
}

async function generateText(provider: AIProvider, body: LessonRequestBody, prompt: string, expectsJson: boolean) {
  if (provider === "openai") return callOpenAI(body, prompt, expectsJson)
  if (provider === "anthropic") return callAnthropic(body, prompt)
  if (provider === "compatible") return callCompatible(body, prompt, expectsJson)
  return callGemini(body, prompt, expectsJson)
}

function normalizeProviderError(provider: AIProvider, message: string) {
  const normalized = cleanText(message).toLowerCase()

  if (provider === "anthropic" && normalized.includes("credit balance is too low")) {
    return "Tu API key de Anthropic fue aceptada, pero ese workspace no tiene créditos suficientes para usar la API. Revisa Plans & Billing en Anthropic y carga saldo."
  }

  if (provider === "anthropic" && normalized.includes("invalid x-api-key")) {
    return "La API key de Anthropic no es válida o fue revocada. Pega una key activa del workspace correcto."
  }

  if (provider === "gemini" && normalized.includes("api key not valid")) {
    return "La API key de Gemini configurada en el servidor no es válida. Debes reemplazar GEMINI_API_KEY en .env.local por una key activa de Google AI Studio y reiniciar el servidor."
  }

  if (provider === "gemini" && normalized.includes("permission denied")) {
    return "Gemini rechazó la solicitud por permisos. Revisa que la API key pertenezca al proyecto correcto y tenga acceso a la API/modelo que estás usando."
  }

  return message
}

export async function POST(req: Request) {
  let provider: AIProvider = "gemini"

  try {
    const body = (await req.json()) as LessonRequestBody
    const mode = resolveMode(body.modo)
    provider = (cleanText(body.modelProvider) || "gemini") as AIProvider
    const prompt = buildCopilotPrompt(body, mode)
    const expectsJson = mode !== "chat"

    const rawText = await generateText(provider, body, prompt, expectsJson)

    if (mode === "chat") {
      return NextResponse.json({
        respuestaChat: cleanText(rawText) || "No pude generar una respuesta util esta vez.",
        promptUsado: prompt,
      })
    }

    const parsed = parseJsonResponse(rawText || "{}")
    const lesson = coerceGeneratedLesson(parsed)

    return NextResponse.json({
      ...lesson,
      promptUsado: prompt,
      explicacionCambios: typeof parsed.explicacion_cambios === "string" ? cleanText(parsed.explicacion_cambios) : undefined,
    })
  } catch (error) {
    console.error("Error generando o refinando clase con IA:", error)

    const rawMessage = error instanceof Error
      ? error.message
      : "Error interno del servidor generativo"
    const message = normalizeProviderError(provider, rawMessage)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
