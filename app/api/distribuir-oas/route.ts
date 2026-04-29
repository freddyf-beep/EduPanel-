import { NextResponse } from "next/server"

interface OaInput {
  id: string
  numero?: number
  descripcion: string
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function parseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("Respuesta IA invalida.")
    return JSON.parse(match[0])
  }
}

function normalizeDistribution(raw: unknown, totalClases: number, validIds: Set<string>) {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.distribucion)
      ? (raw as any).distribucion
      : []

  return source
    .map((item: any) => ({
      clase: Number(item?.clase),
      oaIds: Array.isArray(item?.oaIds) ? item.oaIds.filter((id: unknown) => validIds.has(String(id))) : [],
    }))
    .filter((item: { clase: number; oaIds: string[] }) =>
      Number.isInteger(item.clase) && item.clase >= 1 && item.clase <= totalClases
    )
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const oas = Array.isArray(body.oas) ? body.oas as OaInput[] : []
    const totalClases = Number(body.totalClases)
    const asignatura = cleanText(body.asignatura) || "Asignatura"
    const curso = cleanText(body.curso) || "Curso"
    const token = cleanText(process.env.GEMINI_API_KEY)

    if (!token) {
      return NextResponse.json({ error: "Falta GEMINI_API_KEY." }, { status: 503 })
    }
    if (!Number.isInteger(totalClases) || totalClases < 1 || oas.length === 0) {
      return NextResponse.json({ error: "Datos insuficientes." }, { status: 400 })
    }

    const prompt = `Eres planificador curricular chileno. Distribuye estos OAs de ${asignatura} (${curso}) en ${totalClases} clases respetando progresion cognitiva recordar -> comprender -> aplicar -> analizar. Reserva la ultima clase para cierre/evaluacion si hay mas de 2 clases. Devuelve solo JSON con esta forma: {"distribucion":[{"clase":1,"oaIds":["OA1"]}]}.

OAs:
${oas.map((oa) => `- ${oa.id}${oa.numero ? ` (OA ${oa.numero})` : ""}: ${oa.descripcion}`).join("\n")}`

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + encodeURIComponent(token),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.35, responseMimeType: "application/json" },
        }),
      },
    )

    const data = await response.json()
    if (!response.ok) {
      return NextResponse.json({ error: cleanText(data?.error?.message) || "Gemini no pudo distribuir los OAs." }, { status: 500 })
    }

    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map((part: any) => cleanText(part?.text))
      .filter(Boolean)
      .join("\n")
    const parsed = parseJson(text || "{}")
    const validIds = new Set(oas.map((oa) => oa.id))
    const distribucion = normalizeDistribution(parsed, totalClases, validIds)

    if (!distribucion.length) {
      return NextResponse.json({ error: "La IA no devolvio una distribucion valida." }, { status: 422 })
    }

    return NextResponse.json({ distribucion })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno." },
      { status: 500 },
    )
  }
}
