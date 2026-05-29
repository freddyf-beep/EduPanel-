"use client"

import { useState, useEffect, useCallback } from "react"
import { FichaLecturaEditor } from "./ficha-lectura-editor"
import { FichaLecturaMusical, type FichaLecturaMusicaData } from "./ficha-lectura-musical"
import { FichaLecturaImprimible } from "./ficha-lectura-imprimible"
import { Eye, Pencil, Printer, Save, Loader2, CheckCircle2, Settings2 } from "lucide-react"
import { cargarInfoColegio, type InfoColegio } from "@/lib/perfil"
import { auth } from "@/lib/firebase"
import { db } from "@/lib/firebase"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"

type Vista = "editor" | "preview" | "imprimir"

const fichaInicial: FichaLecturaMusicaData = {
  cancion: "Canción de Navidad",
  artista: "31 Minutos",
  secciones: [
    {
      nombre: "Intro",
      bloques: [
        { tipo: "partitura", imagenSrc: "", alt: "Partitura intro - compases 1 a 4" },
        { tipo: "letra", lineas: [
          "Una bicicleta le pedí a Papa Noel",
          "Pero el me trajo una peineta y un mantel",
        ]},
      ],
    },
    {
      nombre: "Estrofa",
      bloques: [
        { tipo: "partitura", imagenSrc: "", alt: "Partitura estrofa - compases 5 a 8" },
        { tipo: "letra", lineas: [
          "Como cada año le escribí a Santa Claus",
          "Una bella carta y la metí en un buzón",
          "Pero descubrí que esa carta no leyó",
          "Porque el me trajo lo primero que encontró",
        ]},
      ],
    },
  ],
}

// ── Persistencia en Firestore ────────────────────────────────────────────────

const FICHA_DOC_ID = "ficha-lectura-preview"

function getUid(): string | null {
  return auth?.currentUser?.uid ?? null
}

async function guardarFicha(ficha: FichaLecturaMusicaData): Promise<void> {
  const uid = getUid()
  if (!uid) return
  await setDoc(doc(db, "users", uid, "materiales_didacticos", FICHA_DOC_ID), {
    ...ficha,
    updatedAt: serverTimestamp(),
  })
}

async function cargarFicha(): Promise<FichaLecturaMusicaData | null> {
  const uid = getUid()
  if (!uid) return null
  const snap = await getDoc(doc(db, "users", uid, "materiales_didacticos", FICHA_DOC_ID))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    cancion: data.cancion ?? "",
    artista: data.artista ?? "",
    secciones: data.secciones ?? [],
  }
}

// ── Componente ───────────────────────────────────────────────────────────────

export function MaterialesPreviewShell() {
  const [vista, setVista] = useState<Vista>("editor")
  const [ficha, setFicha] = useState<FichaLecturaMusicaData>(fichaInicial)
  const [infoColegio, setInfoColegio] = useState<InfoColegio | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [hayCambios, setHayCambios] = useState(false)

  // Cargar datos al montar
  useEffect(() => {
    const cargar = async () => {
      try {
        const [fichaGuardada, colegio] = await Promise.all([
          cargarFicha(),
          cargarInfoColegio(),
        ])
        if (fichaGuardada) setFicha(fichaGuardada)
        if (colegio) setInfoColegio(colegio)
      } catch {
        // Si falla, usamos los datos iniciales
      } finally {
        setCargando(false)
      }
    }
    // Esperar a que auth esté listo Y el usuario esté autenticado
    const unsubscribe = auth?.onAuthStateChanged((user) => {
      if (user) {
        cargar()
      } else {
        setCargando(false)
      }
    })
    return () => unsubscribe?.()
  }, [])
  // Marcar cambios
  const handleChange = useCallback((nuevaFicha: FichaLecturaMusicaData) => {
    setFicha(nuevaFicha)
    setHayCambios(true)
    setGuardadoOk(false)
  }, [])

  // Guardar
  const handleGuardar = async () => {
    setGuardando(true)
    try {
      await guardarFicha(ficha)
      setHayCambios(false)
      setGuardadoOk(true)
      setTimeout(() => setGuardadoOk(false), 2500)
    } catch (e) {
      console.error("Error al guardar ficha:", e)
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground text-[13px]">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
      </div>
    )
  }

  if (vista === "imprimir") {
    return (
      <FichaLecturaImprimible
        ficha={ficha}
        onVolver={() => setVista("preview")}
        infoColegio={infoColegio}
        profesorNombre={auth?.currentUser?.displayName ?? ""}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Barra superior: tabs + guardado */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tabs de navegación */}
        <div className="flex items-center gap-1 bg-muted/30 rounded-[12px] p-1">
          <button
            onClick={() => setVista("editor")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${
              vista === "editor"
                ? "bg-card border border-border text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            Editor
          </button>
          <button
            onClick={() => setVista("preview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${
              vista === "preview"
                ? "bg-card border border-border text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Vista previa
          </button>
          <button
            onClick={() => setVista("imprimir")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${
              (vista as string) === "imprimir"
                ? "bg-card border border-border text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Indicador de cambios + botón guardar */}
        {hayCambios && !guardadoOk && (
          <span className="text-[11px] text-amber-600 font-medium">
            Cambios sin guardar
          </span>
        )}
        {guardadoOk && (
          <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Guardado
          </span>
        )}
        <button
          onClick={handleGuardar}
          disabled={guardando || !hayCambios}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium bg-primary text-primary-foreground rounded-[10px] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Guardar
        </button>
      </div>

      {/* Contenido */}
      {vista === "editor" && (
        <FichaLecturaEditor ficha={ficha} onChange={handleChange} />
      )}
      {vista === "preview" && (
        <FichaLecturaMusical ficha={ficha} />
      )}
    </div>
  )
}
