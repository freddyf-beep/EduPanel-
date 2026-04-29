import { getDocs, query, where } from "firebase/firestore"
import { userCol, type Observacion360, type Observaciones360Doc } from "@/lib/curriculo"

export interface ResumenObservacionesEstudiante {
  total: number
  ultimaFecha: string
  ultimoExtracto: string
}

function latestObservacion(items: Observacion360[]): Observacion360 | null {
  if (!items.length) return null
  return [...items].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
}

export async function contarObservacionesPorEstudiante(
  asignatura: string,
  curso: string,
): Promise<Record<string, ResumenObservacionesEstudiante>> {
  const q = query(
    userCol("observaciones_360"),
    where("asignatura", "==", asignatura),
    where("curso", "==", curso),
  )
  const snap = await getDocs(q)
  const result: Record<string, ResumenObservacionesEstudiante> = {}

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as Observaciones360Doc
    const observaciones = data.observaciones || []
    if (!data.estudianteId || observaciones.length === 0) return

    const ultima = latestObservacion(observaciones)
    const texto = ultima?.texto?.trim() || ""
    result[data.estudianteId] = {
      total: observaciones.length,
      ultimaFecha: ultima?.fecha || "",
      ultimoExtracto: texto.length > 80 ? `${texto.slice(0, 77)}...` : texto,
    }
  })

  return result
}
