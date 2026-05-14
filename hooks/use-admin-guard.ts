"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/auth-context"
import { isAdminEmail } from "@/lib/admin-helpers"

/**
 * Hook que:
 *  - Muestra un estado "loading" mientras resolvemos la sesion
 *  - Redirige a "/" si el usuario no es admin
 *  - Retorna `isAdmin` y `isReady` para que las paginas no rendericen contenido
 *    antes de saber la respuesta
 *
 * Uso:
 *   const { isReady, isAdmin } = useAdminGuard()
 *   if (!isReady) return <Cargando />
 *   if (!isAdmin) return null  // el redirect ya se esta ejecutando
 *   return <UI real />
 */
export function useAdminGuard() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const isAdmin = !!user && isAdminEmail(user.email)

  useEffect(() => {
    if (loading) return
    if (!user || !isAdmin) {
      router.replace("/")
    }
  }, [user, loading, isAdmin, router])

  return {
    isReady: !loading,
    isAdmin,
    user,
    loading,
  }
}
