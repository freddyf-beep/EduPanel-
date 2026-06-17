"use client"

import { ReactNode, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { cargarNivelMapping, isNivelParvularia, resolveNivel } from "@/lib/nivel-mapping"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { useActiveSubject } from "@/hooks/use-active-subject"

export function ParvulariaRouteGuard({
  children,
  label = "Cargando experiencia parvularia...",
}: {
  children: ReactNode
  label?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const [checking, setChecking] = useState(true)

  const curso = searchParams.get("curso") || ""
  const unidad = searchParams.get("unidad") || "unidad_1"
  const unitIdLocal = searchParams.get("unitIdLocal") || unidad

  useEffect(() => {
    let cancelled = false

    async function checkRoute() {
      if (!curso) {
        setChecking(false)
        return
      }

      try {
        const mapping = await cargarNivelMapping()
        if (cancelled) return
        const nivel = resolveNivel(curso, mapping, ASIGNATURA)
        if (isNivelParvularia(nivel)) {
          router.replace(buildUrl("/parvularia", withAsignatura({ curso, unidad, unitIdLocal }, ASIGNATURA)))
          return
        }
      } catch (error) {
        console.error("[parvularia-route-guard]", error)
      }

      if (!cancelled) setChecking(false)
    }

    checkRoute()
    return () => {
      cancelled = true
    }
  }, [ASIGNATURA, curso, router, unidad, unitIdLocal])

  if (checking) {
    return (
      <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </div>
    )
  }

  return <>{children}</>
}
