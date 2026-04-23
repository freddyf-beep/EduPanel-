import { NextRequest, NextResponse } from "next/server"
import mammoth from "mammoth"
import JSZip from "jszip"
import { parsearTextoRubrica } from "@/app/api/parse-rubrica/route"
import { normalizeKeyPart } from "@/lib/shared"
import type { RubricaTemplate, EvaluacionRubrica, GrupoEvaluacion, EstudianteEvaluacion } from "@/lib/rubricas"

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function extraerNumeroGrupo(path: string): number {
  const m = path.match(/Grupo\s+(\d+)/i)
  return m ? parseInt(m[1]) : 1
}

function nombreEstudianteDeArchivo(path: string): string {
  // "Grupo 1/Listos/Abigail Godoy.docx" → "Abigail Godoy"
  const parts = path.split("/")
  const filename = parts[parts.length - 1]
  return filename.replace(/\.docx$/i, "").trim()
}

// ─── POST /api/import-rubrica ─────────────────────────────────────────────────
// Body: multipart/form-data { file: .zip }
// Retorna: { rubrica: RubricaTemplate, evaluacion: EvaluacionRubrica, estudiantes: [] }

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No se envió ningún archivo" }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const zip = await JSZip.loadAsync(buffer)

    // Agrupar archivos .docx por número de grupo
    const gruposMap = new Map<number, { path: string; nombreAlumno: string }[]>()

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !path.toLowerCase().endsWith(".docx")) continue
      const numGrupo = extraerNumeroGrupo(path)
      if (!gruposMap.has(numGrupo)) gruposMap.set(numGrupo, [])
      gruposMap.get(numGrupo)!.push({
        path,
        nombreAlumno: nombreEstudianteDeArchivo(path),
      })
    }

    if (gruposMap.size === 0) {
      return NextResponse.json({ error: "No se encontraron archivos .docx en el ZIP" }, { status: 422 })
    }

    // Leer primer DOCX para obtener la plantilla de la rúbrica
    const [firstGrupoNum] = Array.from(gruposMap.keys()).sort()
    const firstFile = gruposMap.get(firstGrupoNum)![0]
    const firstBuf = await zip.files[firstFile.path].async("nodebuffer")
    const { value: firstTexto } = await mammoth.extractRawText({ buffer: firstBuf })
    const { meta, metadatosCurriculares, partes, usaPonderaciones } = parsearTextoRubrica(firstTexto)

    if (partes.length === 0) {
      return NextResponse.json({
        error: "No se encontraron criterios en los documentos. Revisa el formato del Word."
      }, { status: 422 })
    }

    // puntajeMaximo considera ponderaciones: Σ(4 × ponderacion_i)
    const puntajeMaximo = partes.reduce(
      (acc, p) => acc + p.criterios.reduce((s, c) => s + 4 * (c.ponderacion ?? 1), 0),
      0
    )
    const rubricaId = `rubrica_${normalizeKeyPart(meta.asignatura)}_${uid()}`

    const rubrica: RubricaTemplate = {
      id: rubricaId,
      nombre: meta.nombre || `Rúbrica ${meta.unidad}`,
      asignatura: meta.asignatura,
      curso: meta.nivel,
      unidadNombre: meta.unidad,
       metadatosCurriculares,
       gruposConfig: Array.from(gruposMap.keys()).sort((a, b) => a - b).map((numGrupo, index) => ({
         id: `grupo_${numGrupo}`,
         nombre: `Grupo ${numGrupo}`,
         orden: index + 1,
       })),
      partes,
      puntajeMaximo,
      ...(usaPonderaciones && { usaPonderaciones: true }),
    }

    // Construir criterio ID map para los puntajes
    // (el parser usa IDs generados con uid(), necesitamos mapear posición → id)
    const criteriosById: { parteIdx: number; criterioIdx: number; id: string }[] = []
    partes.forEach((parte, pi) => {
      parte.criterios.forEach((criterio, ci) => {
        criteriosById.push({ parteIdx: pi, criterioIdx: ci, id: criterio.id })
      })
    })

    // Procesar todos los grupos
    const grupos: GrupoEvaluacion[] = []
    const estudiantesParaCrear: { id: string; nombre: string }[] = []

    for (const numGrupo of Array.from(gruposMap.keys()).sort()) {
      const archivos = gruposMap.get(numGrupo)!
      const estudiantesGrupo: EstudianteEvaluacion[] = []

      for (const { path, nombreAlumno } of archivos) {
        const buf = await zip.files[path].async("nodebuffer")
        const { value: texto } = await mammoth.extractRawText({ buffer: buf })
        const parsed = parsearTextoRubrica(texto)

        // Los criterios del alumno tienen sus propios IDs generados — necesitamos mapear
        // por posición (parte N, criterio M) a los IDs de la rubrica template
        const puntajesFinales: Record<string, number> = {}
        parsed.partes.forEach((parte, pi) => {
          parte.criterios.forEach((crit, ci) => {
            const templateId = criteriosById.find(
              c => c.parteIdx === pi && c.criterioIdx === ci
            )?.id
            if (templateId) {
              const puntaje = parsed.puntajesPorCriterio[crit.id]
              if (puntaje !== undefined) puntajesFinales[templateId] = puntaje
            }
          })
        })

        const estudianteId = `est_${normalizeKeyPart(nombreAlumno)}`
        const criteriosTotal = partes.reduce((a, p) => a + p.criterios.length, 0)
        // puntaje ponderado: Σ(nivelObtenido × ponderacion_i)
        const puntaje = partes.reduce((total, parte) =>
          total + parte.criterios.reduce((s, c) => {
            const pts = puntajesFinales[c.id] ?? 0
            return s + pts * (c.ponderacion ?? 1)
          }, 0), 0
        )
        const nota = Math.round(Math.min(7, Math.max(1, 1 + (6 * puntaje) / puntajeMaximo)) * 10) / 10

        estudiantesGrupo.push({
          estudianteId,
          nombre: parsed.meta.alumno || nombreAlumno,
          hasPie: false,
          puntajes: puntajesFinales,
          observaciones: parsed.observaciones,
          nota,
          completado: Object.keys(puntajesFinales).length === criteriosTotal,
        })

        estudiantesParaCrear.push({ id: estudianteId, nombre: parsed.meta.alumno || nombreAlumno })
      }

      grupos.push({
        id: `grupo_${numGrupo}`,
        nombre: `Grupo ${numGrupo}`,
        estudiantes: estudiantesGrupo,
      })
    }

    const evaluacion: EvaluacionRubrica = {
      id: `eval_${rubricaId}`,
      rubricaId,
      rubricaNombre: rubrica.nombre,
      asignatura: rubrica.asignatura,
      curso: rubrica.curso,
      grupos,
      puntajeMaximo,
    }

    return NextResponse.json({
      rubrica,
      evaluacion,
      // Lista de estudiantes para sincronizar con lib/estudiantes.ts
      estudiantesDetectados: estudiantesParaCrear,
    })
  } catch (err) {
    console.error("[import-rubrica]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al procesar el ZIP" },
      { status: 500 }
    )
  }
}
