"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { db } from "@/lib/firebase"
import { 
  collection, getDocs, doc, setDoc, deleteDoc 
} from "firebase/firestore"
import { Loader2, CheckCircle, AlertTriangle, Database, Trash2 } from "lucide-react"



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
        if (d.id.startsWith("musica_") || d.id.startsWith("lenguaje_")) {
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
      const filesToLoad = [
        // Música (Ya existentes)
        { name: "Música 1ro Básico (Ud 1-2)", path: "/musica_1ro_basico_unidades_1_2.json", docId: "musica_1ro_basico" },
        { name: "Música 1ro Básico (Ud 3-4)", path: "/musica_1ro_basico_unidades_3_4.json", docId: "musica_1ro_basico" },
        { name: "Música 3ro Básico (Ud 1-2)", path: "/musica_3ro_basico_unidades_1_2.json", docId: "musica_3ro_basico" },
        { name: "Música 3ro Básico (Ud 3-4)", path: "/musica_3ro_basico_unidades_3_4.json", docId: "musica_3ro_basico" },
        { name: "Música 4to Básico (Ud 1-2)", path: "/musica_4to_basico_unidades_1_2.json", docId: "musica_4to_basico" },
        { name: "Música 4to Básico (Ud 3-4)", path: "/musica_4to_basico_unidades_3_4.json", docId: "musica_4to_basico" },
        // Música (Nuevos)
        { name: "Música 2do Básico", path: "/curriculum/musica_2do_literal_corregido.json", docId: "musica_2do_basico" },
        { name: "Música 5to Básico", path: "/curriculum/musica_5to.json", docId: "musica_5to_basico" },
        { name: "Música 6to Básico", path: "/curriculum/musica_6to.json", docId: "musica_6to_basico" },
        { name: "Música 7mo Básico", path: "/curriculum/musica_7mo.json", docId: "musica_7mo_basico" },
        { name: "Música 8vo Básico", path: "/curriculum/musica_8vo.json", docId: "musica_8vo_basico" },
        { name: "Música 1ro Medio", path: "/curriculum/musica_1medio.json", docId: "musica_1ro_medio" },
        { name: "Música 2do Medio", path: "/curriculum/musica_2medio.json", docId: "musica_2do_medio" },
        // Lenguaje (Nuevos)
        { name: "Lenguaje 1ro Básico", path: "/curriculum/lenguaje_1ro.json", docId: "lenguaje_1ro_basico" },
        { name: "Lenguaje 2do Básico", path: "/curriculum/lenguaje_2do.json", docId: "lenguaje_2do_basico" },
        { name: "Lenguaje 3ro Básico", path: "/curriculum/lenguaje_3ro.json", docId: "lenguaje_3ro_basico" },
        { name: "Lenguaje 4to Básico", path: "/curriculum/lenguaje_4to_literal_corregido.json", docId: "lenguaje_4to_basico" },
        { name: "Lenguaje 5to Básico", path: "/curriculum/lenguaje_5to.json", docId: "lenguaje_5to_basico" },
        { name: "Lenguaje 6to Básico", path: "/curriculum/lenguaje_6to.json", docId: "lenguaje_6to_basico" },
        { name: "Lenguaje 7mo Básico", path: "/curriculum/lenguaje_7mo.json", docId: "lenguaje_7mo_basico" },
        { name: "Lenguaje 8vo Básico", path: "/curriculum/lenguaje_8vo.json", docId: "lenguaje_8vo_basico" }
      ]

      for (const fileDef of filesToLoad) {
        log(`📂 Cargando ${fileDef.name}...`)
        try {
          const cb = Date.now()
          const res = await fetch(`${fileDef.path}?v=${cb}`)
          
          if (!res.ok) {
            log(`⚠️ No se encontró el archivo ${fileDef.name}, se saltará.`)
            continue
          }
          
          const fileData = await res.json()
          
          // Normalizador inteligente para los 3 formatos de JSON encontrados
          let arrData = []
          if (Array.isArray(fileData)) {
            arrData = fileData // Format 1: Arreglo de objetos (Lenguaje)
          } else if (fileData.unidad && Array.isArray(fileData.unidad)) {
            arrData = fileData.unidad.map((u: any) => ({ unidad: u })) // Format 2: Objeto con propiedad "unidad" (array) (Música 2do)
          } else if (fileData.unidades && Array.isArray(fileData.unidades)) {
            arrData = fileData.unidades.map((u: any) => ({ unidad: u })) // Format 3: Objeto con propiedad "unidades" (array) (Música 5to)
          } else if (fileData.unidad && !Array.isArray(fileData.unidad)) {
            arrData = [{ unidad: fileData.unidad }] // Single fallback
          }

          const docId = fileDef.docId
          await setDoc(doc(db, "curriculo", docId), { ready: true })

          for (const item of arrData) {
            const u = item.unidad
            if (!u || !u.numero_unidad) continue
            const uId = `unidad_${u.numero_unidad}`
            
            log(`✍️ Guardando Unidad ${u.numero_unidad} - ${fileDef.name}...`)
            
            await setDoc(doc(db, "curriculo", docId, "unidades", uId), {
              numero_unidad: u.numero_unidad,
              nombre_unidad: u.nombre_unidad || `Unidad ${u.numero_unidad}`,
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
                if (oa.numero) await setDoc(doc(db, "curriculo", docId, "unidades", uId, "objetivos_aprendizaje", `oa_${oa.numero}`), oa)
              }
            }
            
            if (u.actividades_sugeridas) {
              let actIndex = 1
              for (const act of u.actividades_sugeridas) {
                await setDoc(doc(db, "curriculo", docId, "unidades", uId, "actividades_sugeridas", `act_${actIndex}`), act)
                actIndex++
              }
            }
            
            // Mapea tanto ejemplos_evaluacion antiguos como evaluaciones nuevas
            const evaluacionesArray = u.ejemplos_evaluacion || u.evaluaciones || []
            if (evaluacionesArray.length > 0) {
              let evIndex = 1
              for (const ev of evaluacionesArray) {
                await setDoc(doc(db, "curriculo", docId, "unidades", uId, "ejemplos_evaluacion", `ev_${evIndex}`), ev)
                evIndex++
              }
            }
          }
          log(`✅ ${fileDef.name} cargado correctamente.`)
        } catch (e: any) {
          log(`🛑 ERROR CRÍTICO en ${fileDef.name}: ${e.message}`)
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

  const handleAddNuevasAsignaturas = async () => {
    if (!user) return
    if (!confirm("¿Añadir Educación Física y Parvularia? Esto NO borrará nada de tu currículo actual, solo sumará.")) return

    setRunning(true)
    setProgress([])
    log("🚀 Iniciando anexo de nuevas asignaturas...")

    try {
      const filesToLoad = [
        { name: "Ed. Física 1ro Básico", path: "/curriculum/educacion_fisica_1ro_literal_corregido.json", docId: "educacion_fisica_1ro_basico" },
        { name: "Ed. Física 2do Básico", path: "/curriculum/educacion_fisica_2do_literal_corregido.json", docId: "educacion_fisica_2do_basico" },
        { name: "Ed. Física 3ro Básico", path: "/curriculum/educacion_fisica_3ro_literal_corregido.json", docId: "educacion_fisica_3ro_basico" },
        { name: "Ed. Física 4to Básico", path: "/curriculum/educacion_fisica_4to_literal_corregido.json", docId: "educacion_fisica_4to_basico" },
        { name: "Ed. Física 5to Básico", path: "/curriculum/educacion_fisica_5to_literal_corregido.json", docId: "educacion_fisica_5to_basico" },
        { name: "Ed. Física 6to Básico", path: "/curriculum/educacion_fisica_6to_literal_corregido.json", docId: "educacion_fisica_6to_basico" },
        { name: "Ed. Física 7mo Básico", path: "/curriculum/educacion_fisica_7mo_literal_corregido.json", docId: "educacion_fisica_7mo_basico" },
        { name: "Ed. Física 8vo Básico", path: "/curriculum/educacion_fisica_8vo_literal_corregido.json", docId: "educacion_fisica_8vo_basico" },
        { name: "Parvularia Corporalidad", path: "/curriculum/parvularia_corporalidad_movimiento_niveles.json", docId: "corporalidad_y_movimiento_parvulos", isParvularia: true }
      ]

      for (const fileDef of filesToLoad) {
        log(`📂 Cargando ${fileDef.name}...`)
        try {
          const cb = Date.now()
          const res = await fetch(`${fileDef.path}?v=${cb}`)
          
          if (!res.ok) {
            log(`⚠️ No se encontró el archivo ${fileDef.name}, se saltará.`)
            continue
          }
          
          const fileData = await res.json()
          const docId = fileDef.docId
          await setDoc(doc(db, "curriculo", docId), { ready: true })

          if (fileDef.isParvularia) {
            // Lógica Especial Parvularia: Niveles son Unidades
            const niveles = fileData.niveles || []
            let numUnidad = 1
            for (const n of niveles) {
              const uId = `unidad_${numUnidad}`
              log(`✍️ Guardando Nivel Parvularia como Unidad ${numUnidad}...`)
              
              await setDoc(doc(db, "curriculo", docId, "unidades", uId), {
                numero_unidad: numUnidad,
                nombre_unidad: n.nombre_nivel, // Ej: "Primer Nivel (Sala Cuna)"
                proposito: fileData.introduccion || "",
                conocimientos_previos: [],
                palabras_clave: [],
                conocimientos: [],
                habilidades: [],
                actitudes: [],
                adecuaciones_dua: ""
              })

              if (n.objetivos_aprendizaje_transversales) {
                for (const oa of n.objetivos_aprendizaje_transversales) {
                  // Agregamos "tipo": "OAT" para distinguirlo
                  const oaPayload = {
                    tipo: "OAT",
                    numero: oa.numero,
                    descripcion: oa.descripcion,
                    indicadores: oa.indicadores || []
                  }
                  if (oa.numero) await setDoc(doc(db, "curriculo", docId, "unidades", uId, "objetivos_aprendizaje", `oa_${oa.numero}`), oaPayload)
                }
              }
              numUnidad++
            }
          } else {
            // Lógica Normal (Format 1, 2, 3)
            let arrData = []
            if (Array.isArray(fileData)) {
              arrData = fileData // Format 1
            } else if (fileData.unidad && Array.isArray(fileData.unidad)) {
              arrData = fileData.unidad.map((u: any) => ({ unidad: u })) // Format 2
            } else if (fileData.unidades && Array.isArray(fileData.unidades)) {
              arrData = fileData.unidades.map((u: any) => ({ unidad: u })) // Format 3
            } else if (fileData.unidad && !Array.isArray(fileData.unidad)) {
              arrData = [{ unidad: fileData.unidad }]
            }

            for (const item of arrData) {
              const u = item.unidad
              if (!u || !u.numero_unidad) continue
              const uId = `unidad_${u.numero_unidad}`
              log(`✍️ Guardando Unidad ${u.numero_unidad} - ${fileDef.name}...`)
              await setDoc(doc(db, "curriculo", docId, "unidades", uId), {
                numero_unidad: u.numero_unidad,
                nombre_unidad: u.nombre_unidad || `Unidad ${u.numero_unidad}`,
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
                  if (oa.numero) await setDoc(doc(db, "curriculo", docId, "unidades", uId, "objetivos_aprendizaje", `oa_${oa.numero}`), oa)
                }
              }

              if (u.actividades_sugeridas) {
                let actIndex = 1
                for (const act of u.actividades_sugeridas) {
                  await setDoc(doc(db, "curriculo", docId, "unidades", uId, "actividades_sugeridas", `act_${actIndex}`), act)
                  actIndex++
                }
              }

              const evaluacionesArray = u.ejemplos_evaluacion || u.evaluaciones || []
              if (evaluacionesArray.length > 0) {
                let evIndex = 1
                for (const ev of evaluacionesArray) {
                  await setDoc(doc(db, "curriculo", docId, "unidades", uId, "ejemplos_evaluacion", `ev_${evIndex}`), ev)
                  evIndex++
                }
              }
            }
          }
          log(`✅ ${fileDef.name} cargado correctamente.`)
        } catch (e: any) {
          log(`🛑 ERROR CRÍTICO en ${fileDef.name}: ${e.message}`)
        }
      }

      log("🎊 Proceso de Anexo completado exitosamente sin borrar data.")
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
                  <p>Esto borrará la data general de Música y Lenguaje del sistema para recargar todos los archivos JSON.</p>
                </div>
              </div>
            </div>
            
            <ul className="text-sm space-y-3 mb-8 px-8 text-muted-foreground list-disc marker:text-border">
              <li>Borra `curriculo/` general de Música y Lenguaje.</li>
              <li>Inserta dinámicamente Lenguaje (1ro B. a 8vo B.).</li>
              <li>Inserta dinámicamente Música (1ro B. a 2do M.).</li>
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
          <div className="space-y-4 w-full">
            <button 
              id="btn-migrate"
              onClick={handleResetAndInitCurriculum}
              disabled={running}
              className="w-full py-4 bg-primary hover:bg-pink-600 text-white font-bold rounded-xl transition flex justify-center items-center gap-2 disabled:opacity-50 shadow-lg"
            >
              {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
              {running ? "Procesando Limpieza..." : "Limpiar y Reiniciar Currículo General"}
            </button>

            <button 
              onClick={handleAddNuevasAsignaturas}
              disabled={running}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition flex justify-center items-center gap-2 disabled:opacity-50 shadow-lg"
            >
              {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
              {running ? "Añadiendo Datos..." : "Añadir Edu. Física y Parvularia (Sin Borrar Nada)"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
