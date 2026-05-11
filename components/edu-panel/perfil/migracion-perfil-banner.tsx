"use client"

/**
 * MigracionPerfilBanner
 *
 * Componente que detecta si el usuario tiene datos en rutas ANTIGUAS de
 * Firestore y ofrece un botón para migrarlos a las rutas NUEVAS del perfil v2.
 *
 * Se muestra solo si hay datos detectados en las rutas antiguas.
 * No borra nada: solo copia de viejo → nuevo.
 */

import { useEffect, useState } from "react"
import { Loader2, Database, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { migrarDatosPerfil, detectarDatosLegado, type MigracionResultado, type MigracionItem } from "@/lib/migracion-perfil"

type MigracionEstado = "idle" | "detectando" | "pendiente" | "migrando" | "ok" | "error" | "limpio"

export function MigracionPerfilBanner({ onDone }: { onDone?: () => void }) {
  const [estado, setEstado] = useState<MigracionEstado>("detectando")
  const [resultado, setResultado] = useState<MigracionResultado | null>(null)
  const [expandido, setExpandido] = useState(false)

  useEffect(() => {
    let cancelled = false
    detectarDatosLegado()
      .then(det => {
        if (cancelled) return
        const hayAlgo =
          det.tienePerfilViejo ||
          det.tieneColegioViejo ||
          det.tieneHorarioViejo ||
          det.tieneMappingViejo ||
          det.cursosSinMigrar.length > 0
        setEstado(hayAlgo ? "pendiente" : "limpio")
      })
      .catch(() => {
        if (!cancelled) setEstado("limpio") // Si falla la detección, no molestar al usuario
      })
    return () => { cancelled = true }
  }, [])

  const handleMigrar = async () => {
    setEstado("migrando")
    setResultado(null)
    try {
      const res = await migrarDatosPerfil()
      setResultado(res)
      setEstado(res.ok ? "ok" : "error")
      if (res.ok) onDone?.()
    } catch (err: any) {
      setResultado({
        ok: false,
        items: [],
        errores: [err.message || "Error desconocido"],
      })
      setEstado("error")
    }
  }

  // No mostrar nada mientras detecta o si ya está limpio
  if (estado === "detectando" || estado === "limpio" || estado === "idle") return null

  return (
    <div
      className={cn(
        "mb-5 overflow-hidden rounded-[14px] border shadow-sm transition-all",
        estado === "ok"
          ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
          : estado === "error"
            ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
            : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
      )}
    >
      {/* Cabecera siempre visible */}
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4">
        {/* Icono de estado */}
        <div className={cn(
          "grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl",
          estado === "ok"
            ? "bg-green-100 text-green-600 dark:bg-green-900/50"
            : estado === "error"
              ? "bg-red-100 text-red-600 dark:bg-red-900/50"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/50"
        )}>
          {estado === "migrando" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : estado === "ok" ? (
            <CheckCircle className="h-5 w-5" />
          ) : estado === "error" ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <Database className="h-5 w-5" />
          )}
        </div>

        {/* Texto */}
        <div className="min-w-0 flex-1">
          <p className={cn(
            "text-[13.5px] font-bold",
            estado === "ok" ? "text-green-800 dark:text-green-200"
              : estado === "error" ? "text-red-800 dark:text-red-200"
                : "text-amber-900 dark:text-amber-100"
          )}>
            {estado === "pendiente" && "⚠️ Tus datos antiguos aún no fueron migrados"}
            {estado === "migrando" && "Migrando tus datos..."}
            {estado === "ok" && "✅ Migración completada"}
            {estado === "error" && "❌ Hubo errores en la migración"}
          </p>
          <p className={cn(
            "mt-0.5 text-[12px]",
            estado === "ok" ? "text-green-700 dark:text-green-300"
              : estado === "error" ? "text-red-700 dark:text-red-300"
                : "text-amber-800 dark:text-amber-200"
          )}>
            {estado === "pendiente" &&
              "Detectamos información en el sistema anterior (horario, perfil, colegio). Esta acción los copia a la nueva estructura — sin borrar nada."}
            {estado === "migrando" &&
              "Esto puede tomar unos segundos. No cierres esta página."}
            {estado === "ok" &&
              "Tus datos fueron copiados a la nueva estructura. Recarga la página para ver todo actualizado."}
            {estado === "error" &&
              "Algunos datos no pudieron migrarse. Revisa el detalle y vuelve a intentar."}
          </p>
        </div>

        {/* Acciones */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {(estado === "ok" || estado === "error") && resultado && (
            <button
              type="button"
              onClick={() => setExpandido(v => !v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
                estado === "ok"
                  ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-200"
                  : "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-200"
              )}
            >
              Ver detalle {expandido ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}

          {estado === "pendiente" && (
            <button
              type="button"
              onClick={handleMigrar}
              className="inline-flex items-center gap-2 rounded-[10px] bg-amber-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-amber-700 active:scale-95"
            >
              <Database className="h-4 w-4" />
              Migrar mis datos
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          {estado === "error" && (
            <button
              type="button"
              onClick={handleMigrar}
              className="inline-flex items-center gap-2 rounded-[10px] bg-red-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-red-700"
            >
              <Loader2 className="h-4 w-4" />
              Reintentar
            </button>
          )}

          {estado === "ok" && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-[10px] bg-green-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700"
            >
              Recargar página
            </button>
          )}
        </div>
      </div>

      {/* Detalle colapsable */}
      {expandido && resultado && (
        <div className="border-t border-current/10 px-4 pb-4 pt-3">
          <div className="space-y-1.5">
            {resultado.items.map((item, i) => (
              <MigracionItemRow key={i} item={item} />
            ))}
          </div>
          {resultado.errores.length > 0 && (
            <div className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-[11.5px] text-red-800 dark:bg-red-900/30 dark:text-red-200">
              <strong>Errores:</strong>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {resultado.errores.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MigracionItemRow({ item }: { item: MigracionItem }) {
  const icon = {
    migrado: "✅",
    ya_existe: "🔵",
    no_encontrado: "⚪",
    error: "❌",
  }[item.estado]

  const color = {
    migrado: "text-green-700 dark:text-green-300",
    ya_existe: "text-blue-700 dark:text-blue-300",
    no_encontrado: "text-slate-500 dark:text-slate-400",
    error: "text-red-700 dark:text-red-300",
  }[item.estado]

  return (
    <div className={cn("flex items-start gap-2 text-[12px]", color)}>
      <span className="mt-px flex-shrink-0">{icon}</span>
      <span>
        <span className="font-semibold">{item.label}</span>
        {item.detalle && <span className="ml-1 opacity-75">— {item.detalle}</span>}
      </span>
    </div>
  )
}
