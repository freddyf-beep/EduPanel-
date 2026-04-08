/**
 * seed-curriculo.mjs
 *
 * Sube las bases curriculares públicas a Firestore.
 * Uso:  node scripts/seed-curriculo.mjs
 *
 * Ruta Firestore:
 *   curriculo/{docId}/unidades/{unidadId}
 *     /objetivos_aprendizaje/{oaId}
 *     /actividades_sugeridas/{actId}
 *     /ejemplos_evaluacion/{evalId}
 */

import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { initializeApp, getApps } from "firebase/app"
import { getFirestore, doc, setDoc, collection } from "firebase/firestore"

// ─── Config Firebase (mismos valores que lib/firebase.ts) ────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyAPZ0knktdl2TINlaVhBi8-o8o7o9DFVCc",
  authDomain:        "edupanel-bf5cb.firebaseapp.com",
  projectId:         "edupanel-bf5cb",
  storageBucket:     "edupanel-bf5cb.firebasestorage.app",
  messagingSenderId: "1091516333641",
  appId:             "1:1091516333641:web:0753278efac24ad4394998",
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const db = getFirestore(app)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDocId(asignatura, nivel) {
  return (asignatura + "_" + nivel)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

// ─── Leer el JSON ─────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const jsonPath   = join(__dirname, "..", "4tobasico.JSON")
const datos      = JSON.parse(readFileSync(jsonPath, "utf-8"))

console.log(`\n📚 Iniciando seed de ${datos.length} unidades...\n`)

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  for (const entrada of datos) {
    const { nivel, asignatura, unidad } = entrada
    const docId    = buildDocId(asignatura, nivel)      // "musica_4to_basico"
    const unidadId = `unidad_${unidad.numero_unidad}`   // "unidad_1", "unidad_2", ...

    // ── 1. Doc raíz del curriculo (metadata de nivel/asignatura) ─────────────
    const rootRef = doc(db, "curriculo", docId)
    await setDoc(rootRef, {
      asignatura,
      nivel,
      descripcion: `Bases Curriculares Mineduc – ${asignatura} ${nivel}`,
      updatedAt: new Date().toISOString(),
    }, { merge: true })
    console.log(`  ✅ curriculo/${docId} (root)`)

    // ── 2. Documento de la unidad (campos base, sin subcolecciones) ──────────
    const unidadRef = doc(db, "curriculo", docId, "unidades", unidadId)

    // Normalizar adecuaciones_dua: el JSON puede tener objeto o string
    const adecuaciones_dua =
      typeof unidad.adecuaciones_dua === "object" && unidad.adecuaciones_dua !== null
        ? unidad.adecuaciones_dua.estrategias_neurodiversidad ?? JSON.stringify(unidad.adecuaciones_dua)
        : (unidad.adecuaciones_dua ?? "")

    await setDoc(unidadRef, {
      numero_unidad:       unidad.numero_unidad,
      nombre_unidad:       unidad.nombre_unidad,
      proposito:           unidad.proposito,
      palabras_clave:      unidad.palabras_clave      ?? [],
      conocimientos:       unidad.conocimientos       ?? [],
      habilidades:         unidad.habilidades         ?? [],
      actitudes:           unidad.actitudes           ?? [],
      conocimientos_previos: unidad.conocimientos_previos ?? [],
      adecuaciones_dua,
    })
    console.log(`  ✅ curriculo/${docId}/unidades/${unidadId}`)

    // ── 3. Subcolección: objetivos_aprendizaje ───────────────────────────────
    for (const oa of (unidad.objetivos_aprendizaje ?? [])) {
      const oaId  = `oa_${oa.numero}`
      const oaRef = doc(db, "curriculo", docId, "unidades", unidadId, "objetivos_aprendizaje", oaId)
      await setDoc(oaRef, {
        tipo:        oa.tipo ?? "OA",
        numero:      oa.numero,
        descripcion: oa.descripcion,
        indicadores: oa.indicadores ?? [],
      })
      console.log(`       ├─ objetivos_aprendizaje/${oaId}`)
    }

    // ── 4. Subcolección: actividades_sugeridas ───────────────────────────────
    for (let i = 0; i < (unidad.actividades_sugeridas ?? []).length; i++) {
      const act   = unidad.actividades_sugeridas[i]
      const actId = `act_${i + 1}_${normalizarTexto(act.nombre).slice(0, 30)}`
      const actRef = doc(db, "curriculo", docId, "unidades", unidadId, "actividades_sugeridas", actId)
      await setDoc(actRef, {
        nombre:       act.nombre,
        oas_asociados: act.oas_asociados ?? [],
        descripcion:  act.descripcion,
        orden:        i + 1,
      })
      console.log(`       ├─ actividades_sugeridas/${actId}`)
    }

    // ── 5. Subcolección: ejemplos_evaluacion ─────────────────────────────────
    for (let i = 0; i < (unidad.ejemplos_evaluacion ?? []).length; i++) {
      const ev   = unidad.ejemplos_evaluacion[i]
      const evId = `eval_${i + 1}_${normalizarTexto(ev.titulo).slice(0, 30)}`
      const evRef = doc(db, "curriculo", docId, "unidades", unidadId, "ejemplos_evaluacion", evId)

      // Aplanar criterios_evaluacion (puede tener distintas claves según la unidad)
      const criteriosCombinados = []
      if (ev.criterios_evaluacion) {
        for (const val of Object.values(ev.criterios_evaluacion)) {
          if (Array.isArray(val)) criteriosCombinados.push(...val)
        }
      }

      await setDoc(evRef, {
        titulo:               ev.titulo,
        oas_evaluados:        ev.oas_evaluados ?? [],
        actividad_evaluacion: ev.actividad_evaluacion,
        criterios_proceso:    criteriosCombinados,
        criterios_presentacion: [],
        orden:                i + 1,
      })
      console.log(`       └─ ejemplos_evaluacion/${evId}`)
    }

    console.log()
  }

  console.log("🎉 ¡Seed completado con éxito!")
  console.log(`   Datos en: curriculo/${buildDocId("Música", "4to Básico")}/unidades/`)
  process.exit(0)
}

seed().catch(err => {
  console.error("❌ Error en el seed:", err)
  process.exit(1)
})
