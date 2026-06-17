"use client"

import { useEffect, useState } from "react"
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
  const [claimLoading, setClaimLoading] = useState(true)
  const [claimAdmin, setClaimAdmin] = useState(false)
  const [claimUid, setClaimUid] = useState<string | null>(null)

  const emailAdmin = !!user && isAdminEmail(user.email)
  const claimResolved = !user || emailAdmin || claimUid === user.uid
  const isAdmin = !!user && (emailAdmin || (claimUid === user.uid && claimAdmin))

  useEffect(() => {
    let cancelled = false

    async function loadClaims() {
      if (loading || !user) {
        setClaimAdmin(false)
        setClaimUid(null)
        setClaimLoading(false)
        return
      }

      if (emailAdmin) {
        setClaimAdmin(true)
        setClaimUid(user.uid)
        setClaimLoading(false)
        return
      }

      setClaimAdmin(false)
      setClaimUid(null)
      setClaimLoading(true)
      try {
        const tokenResult = await user.getIdTokenResult()
        if (!cancelled) {
          setClaimAdmin(tokenResult.claims.admin === true)
          setClaimUid(user.uid)
        }
      } catch (error) {
        console.warn("[useAdminGuard] no se pudieron leer custom claims", error)
        if (!cancelled) {
          setClaimAdmin(false)
          setClaimUid(user.uid)
        }
      } finally {
        if (!cancelled) setClaimLoading(false)
      }
    }

    void loadClaims()
    return () => {
      cancelled = true
    }
  }, [emailAdmin, loading, user])

  useEffect(() => {
    if (loading || claimLoading || !claimResolved) return
    if (!user || !isAdmin) {
      router.replace("/")
    }
  }, [user, loading, claimLoading, claimResolved, isAdmin, router])

  return {
    isReady: !loading && !claimLoading && claimResolved,
    isAdmin,
    user,
    loading: loading || claimLoading,
  }
}
