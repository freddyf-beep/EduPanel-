/**
 * migracion-perfil.ts
 *
 * Detecta y migra datos de la estructura ANTIGUA de Firestore a la NUEVA,
 * sin borrar los datos originales. Es seguro ejecutarlo varias veces.
 *
 * RUTAS ANTIGUAS (v1 / pre-perfil-v2):
 *   users/{uid}/perfil/{docId}        -> datos del perfil
 *   users/{uid}/colegio/{docId}       -> datos del colegio
 *   users/{uid}/horario/{docId}       -> array de clases
 *   users/{uid}/nivel_mapping/{docId} -> mapping de curso-nivel
 *   users/{uid}/preferencias/{docId}  -> asignaturasHabilitadas
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

const METADATA_KEYS = new Set(["updatedAt", "createdAt"])
const LEGACY_DOC_PRIORITY = ["main", "config", "data", "default"]

function hasMeaningfulValue(value: any): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim().length > 0
  if (typeof value === "number") return Number.isFinite(value) && value !== 0
  if (typeof value === "boolean") return value
  if (Array.isArray(value)) return value.some(hasMeaningfulValue)
  if (typeof value === "object") {
    return Object.entries(value).some(([key, nested]) => (
      !METADATA_KEYS.has(key) && hasMeaningfulValue(nested)
    ))
  }
  return false
}

function hasMeaningfulData(data: any): boolean {
  if (!data || typeof data !== "object") return false
  return Object.entries(data).some(([key, value]) => (
    !METADATA_KEYS.has(key) && hasMeaningfulValue(value)
  ))
}

function extractAlumnosFromDoc(data: any): any[] {
  if (!data || typeof data !== "object") return []
  if (Array.isArray(data.alumnos)) return data.alumnos
  if (Array.isArray(data.estudiantes)) return data.estudiantes
  return []
}

function extractClasesFromLegacyDoc(data: any): any[] {
  if (!data || typeof data !== "object") return []
  if (Array.isArray(data.clases)) return data.clases
  if (Array.isArray(data.horario)) return data.horario
  if (Array.isArray(data.bloques)) return data.bloques
  return []
}

async function cargarDocumentoLegado(uid: string, colName: string): Promise<{ data: any; detalle: string } | null> {
  const colSnap = await getDocs(collection(db, "users", uid, colName))
  if (colSnap.empty) return null

  const orderedDocs = [
    ...LEGACY_DOC_PRIORITY
      .map((docId) => colSnap.docs.find((oldDoc) => oldDoc.id === docId))
      .filter(Boolean),
    ...colSnap.docs.filter((oldDoc) => !LEGACY_DOC_PRIORITY.includes(oldDoc.id)),
  ]

  for (const oldDoc of orderedDocs) {
    if (!oldDoc) continue
    const data = oldDoc.data()
    if (hasMeaningfulData(data)) {
      return { data, detalle: `Desde users/{uid}/${colName}/${oldDoc.id}` }
    }
  }

  return null
}

async function cargarHorarioLegado(uid: string): Promise<{ clases: any[]; detalle: string } | null> {
  const colSnap = await getDocs(collection(db, "users", uid, "horario"))
  const clases: any[] = []
  const docsConDatos: string[] = []
  colSnap.docs.forEach((oldDoc) => {
    const oldDocClases = extractClasesFromLegacyDoc(oldDoc.data())
    if (oldDocClases.length > 0) {
      clases.push(...oldDocClases)
      docsConDatos.push(oldDoc.id)
    }
  })

  if (clases.length > 0) {
    return { clases, detalle: `Desde users/{uid}/horario/{${docsConDatos.join(", ")}}` }
  }

  return null
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function migrarDatosPerfil(): Promise<MigracionResultado> {
  const uid = getUid()
  const items: MigracionItem[] = []
  const errores: string[] = []

  // ── 1. Perfil profesional ──────────────────────────────────────────────────
  try {
    const nuevoSnap = await getDoc(doc(db, "users", uid, "perfil_info", "main"))
    if (nuevoSnap.exists() && hasMeaningfulData(nuevoSnap.data())) {
      items.push({ label: "Perfil profesional", estado: "ya_existe" })
    } else {
      const viejo = await cargarDocumentoLegado(uid, "perfil")
      if (viejo) {
        await setDoc(doc(db, "users", uid, "perfil_info", "main"), {
          ...viejo.data,
          updatedAt: serverTimestamp(),
        }, { merge: true })
        items.push({ label: "Perfil profesional", estado: "migrado", detalle: viejo.detalle })
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
    if (nuevoSnap.exists() && hasMeaningfulData(nuevoSnap.data())) {
      items.push({ label: "Info del colegio", estado: "ya_existe" })
    } else {
      const viejo = await cargarDocumentoLegado(uid, "colegio")
      if (viejo) {
        await setDoc(doc(db, "users", uid, "perfil_info", "colegio"), {
          ...viejo.data,
          updatedAt: serverTimestamp(),
        }, { merge: true })
        items.push({ label: "Info del colegio", estado: "migrado", detalle: viejo.detalle })
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
    if (nuevoSnap.exists() && hasMeaningfulData(nuevoSnap.data())) {
      items.push({ label: "Preferencias", estado: "ya_existe" })
    } else {
      const viejo = await cargarDocumentoLegado(uid, "preferencias")
      if (viejo) {
        await setDoc(doc(db, "users", uid, "perfil_info", "preferencias"), {
          ...viejo.data,
          updatedAt: serverTimestamp(),
        }, { merge: true })
        items.push({ label: "Preferencias", estado: "migrado", detalle: viejo.detalle })
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
      // Ruta antigua real: users/{uid}/horario/{docId}
      const horarioLegado = await cargarHorarioLegado(uid)
      if (horarioLegado) {
        const clases = horarioLegado.clases
        await setDoc(doc(db, "users", uid, "configuracion", "horario"), {
          clases,
          updatedAt: serverTimestamp(),
        })
        items.push({ label: "Horario semanal", estado: "migrado", detalle: `${clases.length} bloques ${horarioLegado.detalle}` })
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
    if (nuevoSnap.exists() && hasMeaningfulData(nuevoSnap.data()?.mapping || {})) {
      items.push({ label: "Niveles por curso", estado: "ya_existe" })
    } else {
      const viejo = await cargarDocumentoLegado(uid, "nivel_mapping")
      if (viejo) {
        const data = viejo.data
        const mapping = data?.mapping ?? data
        await setDoc(doc(db, "users", uid, "configuracion", "nivel_mapping"), { mapping })
        items.push({ label: "Niveles por curso", estado: "migrado", detalle: `${Object.keys(mapping).length} cursos ${viejo.detalle}` })
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
    const cursosConDatos = new Set<string>()
    estudiantesNuevos.docs.forEach((snap) => {
      if (extractAlumnosFromDoc(snap.data()).length > 0) cursosConDatos.add(snap.id)
    })

    // Subcolecciones candidatas de la ruta antigua
    const subcolAntiguas = ["cursos_estudiantes", "estudiantes_lista", "alumnos"]
    let encontradoAlguno = false

    for (const subCol of subcolAntiguas) {
      try {
        const viejosSnap = await getDocs(collection(db, "users", uid, subCol))
        if (viejosSnap.empty) continue

        for (const viejoDoc of viejosSnap.docs) {
          const cursoRaw = viejoDoc.id
          const cursoIdNuevo = buildCursoId(cursoRaw)
          const data = viejoDoc.data()
          const alumnos = extractAlumnosFromDoc(data)
          if (alumnos.length === 0) continue

          encontradoAlguno = true

          if (cursosConDatos.has(cursoIdNuevo)) {
            items.push({ label: `Estudiantes: ${cursoRaw}`, estado: "ya_existe" })
            continue
          }

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
          const alumnos = extractAlumnosFromDoc(snap.data())
          if (alumnos.length === 0) continue
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

  const [
    perfilViejo,
    colegioViejo,
    horarioViejo,
    mappingViejo,
    perfilNuevo,
    colegioNuevo,
    horarioNuevo,
    mappingNuevo,
    estudiantesNuevos,
  ] = await Promise.all([
    cargarDocumentoLegado(uid, "perfil").catch(() => null),
    cargarDocumentoLegado(uid, "colegio").catch(() => null),
    cargarHorarioLegado(uid).catch(() => null),
    cargarDocumentoLegado(uid, "nivel_mapping").catch(() => null),
    getDoc(doc(db, "users", uid, "perfil_info", "main")).catch(() => null),
    getDoc(doc(db, "users", uid, "perfil_info", "colegio")).catch(() => null),
    getDoc(doc(db, "users", uid, "configuracion", "horario")).catch(() => null),
    getDoc(doc(db, "users", uid, "configuracion", "nivel_mapping")).catch(() => null),
    getDocs(collection(db, "users", uid, "estudiantes")).catch(() => null),
  ])

  const perfilNuevoData = perfilNuevo?.exists() ? perfilNuevo.data() : null
  const colegioNuevoData = colegioNuevo?.exists() ? colegioNuevo.data() : null
  const horarioNuevoClases = horarioNuevo?.exists()
    ? extractClasesFromLegacyDoc(horarioNuevo.data())
    : []
  const mappingNuevoData = mappingNuevo?.exists()
    ? (mappingNuevo.data()?.mapping || {})
    : {}

  const cursosConDatos = new Set<string>()
  estudiantesNuevos?.docs.forEach((snap) => {
    if (extractAlumnosFromDoc(snap.data()).length > 0) cursosConDatos.add(snap.id)
  })

  const cursosSinMigrar: string[] = []
  for (const subCol of ["cursos_estudiantes", "estudiantes_lista", "alumnos"]) {
    try {
      const snap = await getDocs(collection(db, "users", uid, subCol))
      snap.docs.forEach(d => {
        const alumnos = extractAlumnosFromDoc(d.data())
        const cursoIdNuevo = buildCursoId(d.id)
        if (alumnos.length > 0 && !cursosConDatos.has(cursoIdNuevo) && !cursosSinMigrar.includes(d.id)) {
          cursosSinMigrar.push(d.id)
        }
      })
    } catch { /* subcolección no existe */ }
  }

  estudiantesNuevos?.docs.forEach((snap) => {
    const alumnos = extractAlumnosFromDoc(snap.data())
    if (alumnos.length === 0) return

    const legacyId = snap.id
    const newId = buildCursoId(legacyId.replace(/_/g, " "))
    if (legacyId !== newId && !cursosConDatos.has(newId) && !cursosSinMigrar.includes(legacyId)) {
      cursosSinMigrar.push(legacyId)
    }
  })

  return {
    tienePerfilViejo: !!perfilViejo && !hasMeaningfulData(perfilNuevoData),
    tieneColegioViejo: !!colegioViejo && !hasMeaningfulData(colegioNuevoData),
    tieneHorarioViejo: !!horarioViejo?.clases.length && horarioNuevoClases.length === 0,
    tieneMappingViejo: !!mappingViejo && !hasMeaningfulData(mappingNuevoData),
    cursosSinMigrar,
  }
}
