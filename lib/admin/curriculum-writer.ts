/**
 * Logica compartida para escribir curriculum en Firestore (server-side).
 * Basada en la ruta /migrate pero extraida para reutilizar desde API admin.
 *
 * Soporta 4 formatos de JSON:
 *  - Format 1: arreglo de objetos { unidad: {...} }
 *  - Format 2: { unidad: [...] }
 *  - Format 3: { unidades: [...] }
 *  - Format 4 (parvularia): { niveles: [...] } - cada nivel se trata como unidad
 */

import type { Firestore } from "firebase-admin/firestore"

export type ParsedUnit = { unidad: any }

export interface NormalizeResult {
  unidades: ParsedUnit[]
  isParvularia: boolean
  totalUnidades: number
}

export function normalizeCurriculumJson(fileData: any, forceParvularia = false): NormalizeResult {
  // Parvularia tiene una estructura especial: niveles -> unidades
  if (forceParvularia || (fileData?.niveles && Array.isArray(fileData.niveles))) {
    const niveles = fileData.niveles || []
    const unidades: ParsedUnit[] = niveles.map((nivel: any, index: number) => ({
      unidad: {
        numero_unidad: index + 1,
        nombre_unidad: nivel.nombre_nivel || `Nivel ${index + 1}`,
        proposito: fileData.introduccion || "",
        conocimientos_previos: [],
        palabras_clave: [],
        conocimientos: [],
        habilidades: [],
        actitudes: [],
        adecuaciones_dua: "",
        objetivos_aprendizaje: (nivel.objetivos_aprendizaje_transversales || []).map((oa: any) => ({
          tipo: "OAT",
          numero: oa.numero,
          descripcion: oa.descripcion,
          indicadores: oa.indicadores || [],
        })),
      },
    }))
    return { unidades, isParvularia: true, totalUnidades: unidades.length }
  }

  let arr: ParsedUnit[] = []
  if (Array.isArray(fileData)) {
    arr = fileData as ParsedUnit[]
  } else if (fileData?.unidad && Array.isArray(fileData.unidad)) {
    arr = fileData.unidad.map((u: any) => ({ unidad: u }))
  } else if (fileData?.unidades && Array.isArray(fileData.unidades)) {
    arr = fileData.unidades.map((u: any) => ({ unidad: u }))
  } else if (fileData?.unidad && !Array.isArray(fileData.unidad)) {
    arr = [{ unidad: fileData.unidad }]
  }

  return { unidades: arr, isParvularia: false, totalUnidades: arr.length }
}

export interface WriteResult {
  docId: string
  unidadesEscritas: number
  oasEscritos: number
  actividadesEscritas: number
  evaluacionesEscritas: number
  advertencias: string[]
}

/**
 * Escribe un JSON de curriculum a Firestore bajo curriculo/{docId}.
 * Primero elimina subcolecciones viejas de la unidad si existen.
 */
export async function writeCurriculumToFirestore(
  db: Firestore,
  docId: string,
  asignatura: string,
  nivel: string,
  fileData: any,
  forceParvularia = false,
): Promise<WriteResult> {
  const { unidades, isParvularia } = normalizeCurriculumJson(fileData, forceParvularia)

  const result: WriteResult = {
    docId,
    unidadesEscritas: 0,
    oasEscritos: 0,
    actividadesEscritas: 0,
    evaluacionesEscritas: 0,
    advertencias: [],
  }

  if (unidades.length === 0) {
    result.advertencias.push("No se encontraron unidades en el JSON.")
  }

  // Marcar doc raíz con metadata
  await db.collection("curriculo").doc(docId).set(
    {
      ready: true,
      asignatura,
      nivel,
      esParvularia: isParvularia,
      actualizadoEn: new Date(),
    },
    { merge: true },
  )

  for (const item of unidades) {
    const u = item.unidad
    if (!u || !u.numero_unidad) {
      result.advertencias.push(`Unidad sin "numero_unidad" - saltada.`)
      continue
    }

    const uId = `unidad_${u.numero_unidad}`
    const unidadRef = db.collection("curriculo").doc(docId).collection("unidades").doc(uId)

    await unidadRef.set({
      numero_unidad: u.numero_unidad,
      nombre_unidad: u.nombre_unidad || `Unidad ${u.numero_unidad}`,
      proposito: u.proposito || "",
      conocimientos_previos: u.conocimientos_previos || [],
      palabras_clave: u.palabras_clave || [],
      conocimientos: u.conocimientos || [],
      habilidades: u.habilidades || [],
      actitudes: u.actitudes || [],
      adecuaciones_dua:
        typeof u.adecuaciones_dua === "string"
          ? u.adecuaciones_dua
          : u.adecuaciones_dua?.estrategias_neurodiversidad || "",
    })
    result.unidadesEscritas++

    // OAs
    if (Array.isArray(u.objetivos_aprendizaje)) {
      for (const oa of u.objetivos_aprendizaje) {
        if (oa?.numero === undefined || oa?.numero === null) continue
        await unidadRef.collection("objetivos_aprendizaje").doc(`oa_${oa.numero}`).set(oa)
        result.oasEscritos++
      }
    }

    // Actividades sugeridas
    if (Array.isArray(u.actividades_sugeridas)) {
      let idx = 1
      for (const act of u.actividades_sugeridas) {
        await unidadRef.collection("actividades_sugeridas").doc(`act_${idx}`).set(act)
        result.actividadesEscritas++
        idx++
      }
    }

    // Evaluaciones (soporta nombres viejos y nuevos)
    const evaluacionesArray = u.ejemplos_evaluacion || u.evaluaciones || []
    if (Array.isArray(evaluacionesArray) && evaluacionesArray.length > 0) {
      let idx = 1
      for (const ev of evaluacionesArray) {
        await unidadRef.collection("ejemplos_evaluacion").doc(`ev_${idx}`).set(ev)
        result.evaluacionesEscritas++
        idx++
      }
    }
  }

  return result
}

/**
 * Elimina una asignatura/nivel completa con todas sus subcolecciones.
 */
export async function deleteCurriculumDoc(db: Firestore, docId: string): Promise<void> {
  const docRef = db.collection("curriculo").doc(docId)
  // Firebase Admin SDK soporta recursiveDelete a nivel de Firestore
  await db.recursiveDelete(docRef)
}
