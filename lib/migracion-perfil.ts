/**
 * migracion-perfil.ts
 *
 * Detecta y migra datos de la estructura ANTIGUA de Firestore a la NUEVA,
 * sin borrar los datos originales. Es seguro ejecutarlo varias veces.
 *
 * RUTAS ANTIGUAS (v1 / pre-perfil-v2):
 *   users/{uid}/perfil         → documento único con datos del perfil
 *   users/{uid}/colegio        → documento único con datos del colegio
 *   users/{uid}/horario        → documento único con array de clases
 *   users/{uid}/nivel_mapping  → documento único con mapping de curso→nivel
 *   users/{uid}/preferencias   → documento único con asignaturasHabilitadas
 *
 * RUTAS NUEVAS (v2 actual):
 *   users/{uid}/perfil_info/main         → perfil profesional
 *   users/{uid}/perfil_info/colegio      → info del colegio
 *   users/{uid}/perfil_info/preferencias → preferencias (asignaturas, banner)
 *   users/{uid}/configuracion/horario    → horario semanal
 *   users/{uid}/configuracion/nivel_mapping → mapping cursos
 *   users/{uid}/estudiantes/{cursoId}    → alumnos del curso
 *
 * NOTA sobre estudiantes: el ID de curso en v1 usaba .toLowerCase().replace(/[^a-z0-9]/g, "_")
 * El nuevo usa normalizeKeyPart (sin acentos). La migración intenta ambos.
 */

import { db, auth } from "@/lib/firebase"
import {
  doc, getDoc, setDoc, getDocs, collection, serverTimestamp,
} from "firebase/firestore"
import { buildCursoId } from "@/lib/shared"

function getUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

export interface MigracionResultado {
  ok: boolean
  items: MigracionItem[]
  errores: string[]
}

export interface MigracionItem {
  label: string
  estado: "migrado" | "ya_existe" | "no_encontrado" | "error"
  detalle?: string
}

// ── Helpers de ID legado ──────────────────────────────────────────────────────

function legacyCursoId(curso: string): string {
  return curso.toLowerCase().replace(/[^a-z0-9]/g, "_")
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function migrarDatosPerfil(): Promise<MigracionResultado> {
  const uid = getUid()
  const items: MigracionItem[] = []
  const errores: string[] = []

  // ── 1. Perfil profesional ──────────────────────────────────────────────────
  try {
    const nuevoSnap = await getDoc(doc(db, "users", uid, "perfil_info", "main"))
    if (nuevoSnap.exists() && Object.keys(nuevoSnap.data() || {}).some(k => k !== "updatedAt")) {
      items.push({ label: "Perfil profesional", estado: "ya_existe" })
    } else {
      // Intentar desde ruta antigua
      const viejoSnap = await getDoc(doc(db, "users", uid, "perfil"))
      if (viejoSnap.exists()) {
        await setDoc(doc(db, "users", uid, "perfil_info", "main"), {
          ...viejoSnap.data(),
          updatedAt: serverTimestamp(),
        })
        items.push({ label: "Perfil profesional", estado: "migrado", detalle: "Desde users/{uid}/perfil" })
      } else {
        items.push({ label: "Perfil profesional", estado: "no_encontrado" })
      }
    }
  } catch (err: any) {
    items.push({ label: "Perfil profesional", estado: "error", detalle: err.message })
    errores.push(err.message)
  }

  // ── 2. Info del colegio ────────────────────────────────────────────────────
  try {
    const nuevoSnap = await getDoc(doc(db, "users", uid, "perfil_info", "colegio"))
    if (nuevoSnap.exists() && Object.keys(nuevoSnap.data() || {}).some(k => k !== "updatedAt")) {
      items.push({ label: "Info del colegio", estado: "ya_existe" })
    } else {
      // Ruta antigua: users/{uid}/colegio (documento raíz, no subcolección)
      const viejoSnap = await getDoc(doc(db, "users", uid, "colegio"))
      if (viejoSnap.exists()) {
        await setDoc(doc(db, "users", uid, "perfil_info", "colegio"), {
          ...viejoSnap.data(),
          updatedAt: serverTimestamp(),
        })
        items.push({ label: "Info del colegio", estado: "migrado", detalle: "Desde users/{uid}/colegio" })
      } else {
        items.push({ label: "Info del colegio", estado: "no_encontrado" })
      }
    }
  } catch (err: any) {
    items.push({ label: "Info del colegio", estado: "error", detalle: err.message })
    errores.push(err.message)
  }

  // ── 3. Preferencias ────────────────────────────────────────────────────────
  try {
    const nuevoSnap = await getDoc(doc(db, "users", uid, "perfil_info", "preferencias"))
    if (nuevoSnap.exists() && Object.keys(nuevoSnap.data() || {}).some(k => k !== "updatedAt")) {
      items.push({ label: "Preferencias", estado: "ya_existe" })
    } else {
      const viejoSnap = await getDoc(doc(db, "users", uid, "preferencias"))
      if (viejoSnap.exists()) {
        await setDoc(doc(db, "users", uid, "perfil_info", "preferencias"), {
          ...viejoSnap.data(),
          updatedAt: serverTimestamp(),
        })
        items.push({ label: "Preferencias", estado: "migrado", detalle: "Desde users/{uid}/preferencias" })
      } else {
        items.push({ label: "Preferencias", estado: "no_encontrado" })
      }
    }
  } catch (err: any) {
    items.push({ label: "Preferencias", estado: "error", detalle: err.message })
    errores.push(err.message)
  }

  // ── 4. Horario semanal ─────────────────────────────────────────────────────
  try {
    const nuevoSnap = await getDoc(doc(db, "users", uid, "configuracion", "horario"))
    if (nuevoSnap.exists() && (nuevoSnap.data()?.clases || []).length > 0) {
      items.push({ label: "Horario semanal", estado: "ya_existe" })
    } else {
      // Ruta antigua: users/{uid}/horario (doc único, campo "clases" o raíz)
      const viejoSnap = await getDoc(doc(db, "users", uid, "horario"))
      if (viejoSnap.exists()) {
        const data = viejoSnap.data()
        // Algunos formatos antiguos guardaban el array directamente en "clases",
        // otros lo guardaban en "horario" o en la raíz del doc.
        const clases = data?.clases || data?.horario || []
        await setDoc(doc(db, "users", uid, "configuracion", "horario"), {
          clases,
          updatedAt: serverTimestamp(),
        })
        items.push({ label: "Horario semanal", estado: "migrado", detalle: `${clases.length} bloques desde users/{uid}/horario` })
      } else {
        items.push({ label: "Horario semanal", estado: "no_encontrado" })
      }
    }
  } catch (err: any) {
    items.push({ label: "Horario semanal", estado: "error", detalle: err.message })
    errores.push(err.message)
  }

  // ── 5. Nivel mapping ───────────────────────────────────────────────────────
  try {
    const nuevoSnap = await getDoc(doc(db, "users", uid, "configuracion", "nivel_mapping"))
    if (nuevoSnap.exists() && Object.keys(nuevoSnap.data()?.mapping || {}).length > 0) {
      items.push({ label: "Niveles por curso", estado: "ya_existe" })
    } else {
      const viejoSnap = await getDoc(doc(db, "users", uid, "nivel_mapping"))
      if (viejoSnap.exists()) {
        const data = viejoSnap.data()
        // El campo puede ser "mapping" (ya normalizado) o la raíz directamente
        const mapping = data?.mapping ?? data
        await setDoc(doc(db, "users", uid, "configuracion", "nivel_mapping"), { mapping })
        items.push({ label: "Niveles por curso", estado: "migrado", detalle: `${Object.keys(mapping).length} cursos desde users/{uid}/nivel_mapping` })
      } else {
        items.push({ label: "Niveles por curso", estado: "no_encontrado" })
      }
    }
  } catch (err: any) {
    items.push({ label: "Niveles por curso", estado: "error", detalle: err.message })
    errores.push(err.message)
  }

  // ── 6. Estudiantes por curso ───────────────────────────────────────────────
  // Intentamos leer la subcolección antigua "cursos_estudiantes" o "estudiantes_lista"
  // y también la subcolección "estudiantes" pero con IDs en formato legado.
  try {
    const estudiantesNuevos = await getDocs(collection(db, "users", uid, "estudiantes"))
    const cursosConDatos = new Set(estudiantesNuevos.docs.map(d => d.id))

    // Subcolecciones candidatas de la ruta antigua
    const subcolAntiguas = ["cursos_estudiantes", "estudiantes_lista", "alumnos"]
    let encontradoAlguno = false

    for (const subCol of subcolAntiguas) {
      try {
        const viejosSnap = await getDocs(collection(db, "users", uid, subCol))
        if (viejosSnap.empty) continue

        encontradoAlguno = true
        for (const viejoDoc of viejosSnap.docs) {
          const cursoRaw = viejoDoc.id
          const cursoIdNuevo = buildCursoId(cursoRaw)

          if (cursosConDatos.has(cursoIdNuevo)) {
            items.push({ label: `Estudiantes: ${cursoRaw}`, estado: "ya_existe" })
            continue
          }

          const data = viejoDoc.data()
          const alumnos = data?.alumnos || data?.estudiantes || []

          await setDoc(doc(db, "users", uid, "estudiantes", cursoIdNuevo), {
            alumnos,
          })
          items.push({
            label: `Estudiantes: ${cursoRaw}`,
            estado: "migrado",
            detalle: `${alumnos.length} estudiantes desde ${subCol}/${cursoRaw}`,
          })
          cursosConDatos.add(cursoIdNuevo)
        }
      } catch {
        // subcolección no existe, continuar
      }
    }

    // También revisar si hay docs en "estudiantes" con ID en formato legado (sin normalizar acentos)
    for (const snap of estudiantesNuevos.docs) {
      const legacyId = snap.id
      const newId = buildCursoId(legacyId.replace(/_/g, " "))
      if (legacyId !== newId && !cursosConDatos.has(newId)) {
        try {
          const data = snap.data()
          const alumnos = data?.alumnos || []
          await setDoc(doc(db, "users", uid, "estudiantes", newId), { alumnos })
          items.push({
            label: `Estudiantes (normalización): ${legacyId} → ${newId}`,
            estado: "migrado",
            detalle: `${alumnos.length} estudiantes`,
          })
          cursosConDatos.add(newId)
        } catch (err: any) {
          items.push({ label: `Estudiantes: ${legacyId}`, estado: "error", detalle: err.message })
        }
      }
    }

    if (!encontradoAlguno && estudiantesNuevos.empty) {
      items.push({ label: "Estudiantes", estado: "no_encontrado" })
    }
  } catch (err: any) {
    items.push({ label: "Estudiantes (general)", estado: "error", detalle: err.message })
    errores.push(err.message)
  }

  return {
    ok: errores.length === 0,
    items,
    errores,
  }
}

/** Detecta si hay datos en las rutas antiguas sin migrar. */
export async function detectarDatosLegado(): Promise<{
  tienePerfilViejo: boolean
  tieneColegioViejo: boolean
  tieneHorarioViejo: boolean
  tieneMappingViejo: boolean
  cursosSinMigrar: string[]
}> {
  const uid = getUid()

  const [perfilViejo, colegioViejo, horarioViejo, mappingViejo] = await Promise.all([
    getDoc(doc(db, "users", uid, "perfil")).catch(() => null),
    getDoc(doc(db, "users", uid, "colegio")).catch(() => null),
    getDoc(doc(db, "users", uid, "horario")).catch(() => null),
    getDoc(doc(db, "users", uid, "nivel_mapping")).catch(() => null),
  ])

  // Cursos en ruta antigua
  const cursosSinMigrar: string[] = []
  for (const subCol of ["cursos_estudiantes", "estudiantes_lista", "alumnos"]) {
    try {
      const snap = await getDocs(collection(db, "users", uid, subCol))
      snap.docs.forEach(d => {
        if (!cursosSinMigrar.includes(d.id)) cursosSinMigrar.push(d.id)
      })
    } catch { /* subcolección no existe */ }
  }

  return {
    tienePerfilViejo: !!perfilViejo?.exists(),
    tieneColegioViejo: !!colegioViejo?.exists(),
    tieneHorarioViejo: !!horarioViejo?.exists() && (horarioViejo.data()?.clases || []).length > 0,
    tieneMappingViejo: !!mappingViejo?.exists(),
    cursosSinMigrar,
  }
}
