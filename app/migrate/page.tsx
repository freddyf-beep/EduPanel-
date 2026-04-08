"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { db } from "@/lib/firebase"
import { 
  collection, getDocs, doc, setDoc, deleteDoc 
} from "firebase/firestore"
import { Loader2, CheckCircle, AlertTriangle, Database, Trash2 } from "lucide-react"

// Niveles para generar data genérica
const NIVELES = [
  "1ro Básico", "2do Básico", "3ro Básico", 
  "4to Básico", 
  "5to Básico", "6to Básico", "7mo Básico", "8vo Básico"
]

export default function MigratePage() {
  const { user, loading: authLoading } = useAuth()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [done, setDone] = useState(false)

  const log = (msg: string) => setProgress(p => [...p, msg])

  const handleResetAndInitCurriculum = async () => {
    if (!user) return
    if (!confirm("¿Estás seguro? Esto borrará el currículo GENERAL (base de datos compartida) y lo reemplazará con la data de 4to básico y genéricos. Tus datos privados no se tocarán.")) return

    setRunning(true)
    setProgress([])
    log("🚀 Iniciando proceso de limpieza y carga...")

    try {
      // 1. Limpiar colección 'curriculo' (solo música por ahora para ser seguros)
      log("🧹 Limpiando colección 'curriculo'...")
      const curSnap = await getDocs(collection(db, "curriculo"))
      for (const d of curSnap.docs) {
        if (d.id.startsWith("musica_")) {
          // Limpiar subcolecciones (unidades -> objetivos...)
          const unitsSnap = await getDocs(collection(db, "curriculo", d.id, "unidades"))
          for (const u of unitsSnap.docs) {
             const oaSnap = await getDocs(collection(db, "curriculo", d.id, "unidades", u.id, "objetivos_aprendizaje"))
             for (const oa of oaSnap.docs) await deleteDoc(oa.ref)
             const actSnap = await getDocs(collection(db, "curriculo", d.id, "unidades", u.id, "actividades_sugeridas"))
             for (const act of actSnap.docs) await deleteDoc(act.ref)
             const evalSnap = await getDocs(collection(db, "curriculo", d.id, "unidades", u.id, "ejemplos_evaluacion"))
             for (const ev of evalSnap.docs) await deleteDoc(ev.ref)
             await deleteDoc(u.ref)
          }
          await deleteDoc(d.ref)
        }
      }
      log("✅ Currículo global limpiado.")

      // 1.5 Limpiar colecciones privadas del usuario
      log("🧹 Limpiando planificaciones antiguas del usuario...")
      const baseUserRef = doc(db, "users", user.uid)
      const colectionsToClear = [
        "planificaciones", "planificaciones_curso", "ver_unidad",
        "cronograma_unidad", "cronogramas", "actividades_clase", "anotaciones"
      ]
      
      for (const colName of colectionsToClear) {
        log(`   - Limpiando ${colName}...`)
        try {
          const colSnap = await getDocs(collection(baseUserRef, colName))
          let count = 0
          for (const docSnap of colSnap.docs) {
             await deleteDoc(docSnap.ref)
             count++
          }
          log(`     ✅ ${count} documentos eliminados en ${colName}.`)
        } catch (err: any) {
          log(`     ⚠️ Error limpiando ${colName}: ${err.message}`)
        }
      }
      log("✅ Planificaciones y datos curriculares del usuario limpiados.")

      // 2. Cargar datos reales desde JSON
      const nivelesReales = [
        { id: "1ro_basico", name: "1ro Básico" },
        { id: "3ro_basico", name: "3ro Básico" },
        { id: "4to_basico", name: "4to Básico" }
      ]

      for (const nivelData of nivelesReales) {
        log(`📂 Cargando ${nivelData.name} de referencia...`)
        try {
          const cb = Date.now()
          const [res1, res2] = await Promise.all([
            fetch(`/musica_${nivelData.id}_unidades_1_2.json?v=${cb}`),
            fetch(`/musica_${nivelData.id}_unidades_3_4.json?v=${cb}`)
          ])
          
          if (!res1.ok || !res2.ok) {
            log(`⚠️ No se encontraron los JSON de ${nivelData.name}, se saltará.`)
            continue
          }
          
          const data1_2 = await res1.json()
          const data3_4 = await res2.json()
          const arrData = [...data1_2, ...data3_4]

          const docId = `musica_${nivelData.id}`
          await setDoc(doc(db, "curriculo", docId), { ready: true })

          for (const item of arrData) {
            const u = item.unidad
            if (!u) continue
            const uId = `unidad_${u.numero_unidad}`
            
            log(`✍️ Guardando Unidad ${u.numero_unidad} - ${nivelData.name}...`)
            
            await setDoc(doc(db, "curriculo", docId, "unidades", uId), {
              numero_unidad: u.numero_unidad,
              nombre_unidad: u.nombre_unidad,
              proposito: u.proposito || "",
              conocimientos_previos: u.conocimientos_previos || [],
              palabras_clave: u.palabras_clave || [],
              conocimientos: u.conocimientos || [],
              habilidades: u.habilidades || [],
              actitudes: u.actitudes || [],
              adecuaciones_dua: u.adecuaciones_dua?.estrategias_neurodiversidad || ""
            })

            if (u.objetivos_aprendizaje) {
              for (const oa of u.objetivos_aprendizaje) {
                await setDoc(doc(db, "curriculo", docId, "unidades", uId, "objetivos_aprendizaje", `oa_${oa.numero}`), oa)
              }
            }
            
            if (u.actividades_sugeridas) {
              let actIndex = 1
              for (const act of u.actividades_sugeridas) {
                await setDoc(doc(db, "curriculo", docId, "unidades", uId, "actividades_sugeridas", `act_${actIndex}`), act)
                actIndex++
              }
            }
            
            if (u.ejemplos_evaluacion) {
              let evIndex = 1
              for (const ev of u.ejemplos_evaluacion) {
                await setDoc(doc(db, "curriculo", docId, "unidades", uId, "ejemplos_evaluacion", `ev_${evIndex}`), ev)
                evIndex++
              }
            }
          }
          log(`✅ ${nivelData.name} cargado correctamente con datos reales.`)
        } catch (e: any) {
          log(`🛑 ERROR CRÍTICO en ${nivelData.name}: ${e.message}`)
        }
      }

      // 3. Generar Genéricos
      log("🧪 Generando datos genéricos para otros niveles...")
      for (const nivel of NIVELES) {
        const idGenerico = nivel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_")
        if (["1ro_basico", "3ro_basico", "4to_basico"].includes(idGenerico)) continue
        
        const docId = ("musica_" + nivel)
          .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")

        // Asegurar que el documento padre existe
        await setDoc(doc(db, "curriculo", docId), { ready: true })

        for (let i = 1; i <= 4; i++) {
          const uId = `unidad_${i}`
          await setDoc(doc(db, "curriculo", docId, "unidades", uId), {
            numero_unidad: i,
            nombre_unidad: `Unidad ${i} de ${nivel}`,
            proposito: `Este año se verá este contenido en la unidad ${i} del curso ${nivel}`,
            conocimientos_previos: [], palabras_clave: [], conocimientos: [], habilidades: [], actitudes: [], adecuaciones_dua: ""
          })

          for (let j = 1; j <= 2; j++) {
            await setDoc(doc(db, "curriculo", docId, "unidades", uId, "objetivos_aprendizaje", `oa_${j}`), {
              tipo: "OA", numero: j,
              descripcion: `OA${j}: Este es el objetivo ${j} del curso ${nivel}`,
              indicadores: [`Indicador genérico ${j}.1`, `Indicador genérico ${j}.2`]
            })
          }
        }
      }

      log("🎊 Proceso completado exitosamente.")
      setDone(true)
    } catch (e: any) {
      log(`❌ Error: ${e.message}`)
      console.error(e)
    } finally {
      setRunning(false)
    }
  }

  if (authLoading) return <div className="p-8">Cargando...</div>

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6 border-b pb-4">
          <Database className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Base de Datos: Limpieza e Inicio</h1>
            <p className="text-sm text-muted-foreground">Reordenar currículo general y cargar referencias</p>
          </div>
        </div>

        <div className="mb-6 space-y-4 text-sm text-slate-600">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r-md mx-6">
              <div className="flex">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mr-3 flex-shrink-0" />
                <div className="text-sm text-yellow-800">
                  <p className="font-bold mb-1">ATENCIÓN: PROCESO CRÍTICO</p>
                  <p>Esto borrará la data general de Música del sistema para reordenarla por tema y nivel correctamente.</p>
                </div>
              </div>
            </div>
            
            <ul className="text-sm space-y-3 mb-8 px-8 text-muted-foreground list-disc marker:text-border">
              <li>Borra `curriculo/` (música).</li>
              <li>Carga datos reales para **1ro, 3ro y 4to Básico**.</li>
              <li>Crea datos genéricos para los **niveles restantes**.</li>
              <li className="text-green-600 font-semibold marker:text-green-500">Tus datos privados (perfil, horario, asistencia) están protegidos.</li>
            </ul>
        </div>

        {progress.length > 0 && (
          <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-[11px] mb-6 h-64 overflow-y-auto space-y-1">
            {progress.map((msg, i) => <div key={i}>{msg}</div>)}
          </div>
        )}

        {done ? (
          <div className="flex flex-col items-center justify-center py-4 text-green-600">
            <CheckCircle className="w-12 h-12 mb-2" />
            <p className="font-bold text-center">¡Currículo reiniciado y cargado!</p>
            <p className="text-sm text-center mb-4">Ya puedes volver a tus planificaciones.</p>
            <a href="/" className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-pink-600 transition">
              Volver a Inicio
            </a>
          </div>
        ) : (
          <button 
            id="btn-migrate"
            onClick={handleResetAndInitCurriculum}
            disabled={running}
            className="w-full py-4 bg-primary hover:bg-pink-600 text-white font-bold rounded-xl transition flex justify-center items-center gap-2 disabled:opacity-50 shadow-lg"
          >
            {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
            {running ? "Procesando..." : "Reiniciar Currículo General"}
          </button>
        )}
      </div>
    </div>
  )
}
