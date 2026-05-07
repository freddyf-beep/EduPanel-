import { NextResponse } from "next/server"
import { buildCopilotPrompt, resolveMode, type LessonRequestBody } from "@/lib/ai/copilot"
import { verifyAllowedUser } from "@/lib/auth/verify-token"

const RATE_LIMIT_PER_MINUTE = 10
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(uid: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(uid)
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(uid, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (bucket.count >= RATE_LIMIT_PER_MINUTE) return false
  bucket.count += 1
  return true
}

export async function POST(req: Request) {
  const allowed = await verifyAllowedUser(req)
  if (!allowed.ok) return allowed.response

  if (!checkRateLimit(allowed.auth.uid)) {
    return NextResponse.json({ error: "Demasiadas vistas previas. Intenta nuevamente en un minuto." }, { status: 429 })
  }

  const body = await req.json().catch(() => null) as { lessonRequestBody?: LessonRequestBody; mode?: string } | null
  if (!body?.lessonRequestBody) {
    return NextResponse.json({ error: "Falta lessonRequestBody." }, { status: 400 })
  }

  const mode = resolveMode(body.mode)
  const prompt = buildCopilotPrompt(body.lessonRequestBody, mode)
  return NextResponse.json({ prompt: `// Prompt v2 — EduPanel\n\n${prompt}` })
}
