import { NextRequest, NextResponse } from "next/server"
import mammoth from "mammoth"
import JSZip from "jszip"
import { parsearTextoListaCotejo } from "@/app/api/parse-lista-cotejo/route"
import { normalizeKeyPart } from "@/lib/shared"
import {
  calcularNotaLista,
  calcularPuntajeMaximoLista,
  type EstudianteListaCotejo,
  type GrupoListaCotejo,
  type ListaCotejoEvaluacion,
  type ListaCotejoTemplate,
} from "@/lib/listas-cotejo"
import { verifyAllowedUser } from "@/lib/auth/verify-token"

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function extraerNumeroGrupo(path: string): number {
  const match = path.match(/Grupo\s+(\d+)/i)
  return match ? parseInt(match[1], 10) : 1
}

function nombreEstudianteDeArchivo(path: string): string {
  const parts = path.split("/")
  const filename = parts[parts.length - 1] || "Estudiante"
  return filename.replace(/\.docx$/i, "").replace(/^lista_cotejo_/i, "").trim() || "Estudiante"
}

function extraerAlumnoDesdeTexto(texto: string, fallback: string): string {
  const match = texto.match(/(?:Estudiante|Alumno|Nombre):\s*(.+)/i)
  return match?.[1]?.trim() || fallback
}

function crearEstudiante(nombre: string, lista: ListaCotejoTemplate): EstudianteListaCotejo {
  return {
    estudianteId: `est_${normalizeKeyPart(nombre)}`,
    nombre,
    hasPie: /\bPIE\b/i.test(nombre),
    respuestas: {},
    observaciones: "",
    puntaje: 0,
    porcentaje: 0,
    nota: calcularNotaLista(0, lista.puntajeMaximo, /\bPIE\b/i.test(nombre) ? 0.5 : 0.6),
    completado: false,
  }
}

export async function POST(req: NextRequest) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No se envio ningun archivo" }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const zip = await JSZip.loadAsync(buffer)
    const gruposMap = new Map<number, { path: string; nombreAlumno: string }[]>()

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !path.toLowerCase().endsWith(".docx")) continue
      const grupo = extraerNumeroGrupo(path)
      if (!gruposMap.has(grupo)) gruposMap.set(grupo, [])
      gruposMap.get(grupo)!.push({ path, nombreAlumno: nombreEstudianteDeArchivo(path) })
    }

    if (gruposMap.size === 0) {
      return NextResponse.json({ error: "No se encontraron archivos .docx en el ZIP" }, { status: 422 })
    }

    const firstGroup = Array.from(gruposMap.keys()).sort((a, b) => a - b)[0]
    const firstFile = gruposMap.get(firstGroup)![0]
    const firstBuffer = await zip.files[firstFile.path].async("nodebuffer")
    const { value: firstText } = await mammoth.extractRawText({ buffer: firstBuffer })
    const parsed = parsearTextoListaCotejo(firstText)

    if (parsed.secciones.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron indicadores de lista de cotejo en los documentos." },
        { status: 422 }
      )
    }

    const listaId = `lista_${normalizeKeyPart(parsed.meta.asignatura)}_${uid()}`
    const lista: ListaCotejoTemplate = {
      id: listaId,
      nombre: parsed.meta.nombre || `Lista de cotejo ${parsed.meta.unidad}`.trim(),
      asignatura: parsed.meta.asignatura,
      curso: parsed.meta.curso,
      unidadNombre: parsed.meta.unidad,
      metadatosCurriculares: parsed.metadatosCurriculares,
      secciones: parsed.secciones,
      puntajePorSi: parsed.puntajePorSi,
      puntajeMaximo: calcularPuntajeMaximoLista(parsed.secciones, parsed.puntajePorSi),
      instruccionesMetodologicas: parsed.instruccionesMetodologicas,
      escalaDicotomica: parsed.escalaDicotomica,
      nombreEstablecimiento: parsed.nombreEstablecimiento,
      rbd: parsed.rbd,
      docenteNombre: parsed.docenteNombre,
    }

    const grupos: GrupoListaCotejo[] = []
    const estudiantesDetectados: Array<{ id: string; nombre: string }> = []

    for (const grupoNum of Array.from(gruposMap.keys()).sort((a, b) => a - b)) {
      const archivos = gruposMap.get(grupoNum)!
      const estudiantes: EstudianteListaCotejo[] = []
      for (const { path, nombreAlumno } of archivos) {
        const docBuffer = await zip.files[path].async("nodebuffer")
        const { value: texto } = await mammoth.extractRawText({ buffer: docBuffer })
        const nombre = extraerAlumnoDesdeTexto(texto, nombreAlumno)
        const estudiante = crearEstudiante(nombre, lista)
        estudiantes.push(estudiante)
        estudiantesDetectados.push({ id: estudiante.estudianteId, nombre: estudiante.nombre })
      }
      grupos.push({
        id: `grupo_${grupoNum}`,
        nombre: `Grupo ${grupoNum}`,
        estudiantes,
      })
    }

    const evaluacion: ListaCotejoEvaluacion = {
      id: `eval_${listaId}`,
      listaId,
      listaNombre: lista.nombre,
      asignatura: lista.asignatura,
      curso: lista.curso,
      grupos,
      puntajeMaximo: lista.puntajeMaximo,
    }

    return NextResponse.json({ lista, evaluacion, estudiantesDetectados })
  } catch (err) {
    console.error("[import-lista-cotejo]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al procesar el ZIP" },
      { status: 500 }
    )
  }
}
