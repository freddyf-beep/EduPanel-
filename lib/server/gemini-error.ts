import { NextResponse } from "next/server"

export class GeminiApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly upstreamStatus?: number,
  ) {
    super(message)
  }
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function readGeminiMessage(rawText: string): string {
  try {
    const data = JSON.parse(rawText) as { error?: { message?: unknown; status?: unknown } }
    return cleanText(data?.error?.message) || cleanText(data?.error?.status)
  } catch {
    return cleanText(rawText)
  }
}

function isQuotaOrRateLimit(status: number, message: string): boolean {
  return (
    status === 429 ||
    /quota|rate limit|rate-limit|too many requests|resource_exhausted|exceeded/i.test(message)
  )
}

export function parseGeminiApiError(
  rawText: string,
  upstreamStatus: number,
  fallback = "Gemini no pudo completar la solicitud.",
): GeminiApiError {
  const upstreamMessage = readGeminiMessage(rawText)

  if (isQuotaOrRateLimit(upstreamStatus, upstreamMessage)) {
    return new GeminiApiError(
      "Gemini alcanzo el limite de cuota o solicitudes. Revisa cuota/modelo en Google Cloud o intenta mas tarde.",
      429,
      upstreamStatus,
    )
  }

  return new GeminiApiError(
    upstreamMessage || fallback,
    upstreamStatus >= 500 ? 502 : 500,
    upstreamStatus,
  )
}

export function aiErrorResponse(error: unknown, fallback = "Error interno del servidor") {
  if (error instanceof GeminiApiError) {
    return NextResponse.json(
      { error: error.message, upstreamStatus: error.upstreamStatus },
      { status: error.status },
    )
  }

  const message = error instanceof Error ? error.message : fallback
  const status = isQuotaOrRateLimit(500, message) ? 429 : 500
  return NextResponse.json({ error: message || fallback }, { status })
}
