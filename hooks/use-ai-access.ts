"use client"

import { useEffect, useState } from "react"
import { doc, getDoc } from "firebase/firestore"

import { useAuth } from "@/components/auth/auth-context"
import { isAdminEmail } from "@/lib/admin-helpers"
import { db } from "@/lib/firebase"

export function useAiAccess() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [hasAiAccess, setHasAiAccess] = useState(false)
  const [accessUid, setAccessUid] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (authLoading) {
        setAccessUid(null)
        setHasAiAccess(false)
        setLoading(true)
        return
      }

      if (!user) {
        setAccessUid(null)
        setHasAiAccess(false)
        setLoading(false)
        return
      }

      setAccessUid(null)
      setHasAiAccess(false)
      setLoading(true)
      try {
        const tokenResult = await user.getIdTokenResult()
        const isAdmin = tokenResult.claims.admin === true || isAdminEmail(user.email)
        if (isAdmin) {
          if (!cancelled) {
            setHasAiAccess(true)
            setAccessUid(user.uid)
          }
          return
        }

        const snap = await getDoc(doc(db, "ai_access", user.uid))
        if (!cancelled) {
          setHasAiAccess(snap.exists() && snap.data()?.enabled === true)
          setAccessUid(user.uid)
        }
      } catch (error) {
        console.warn("[useAiAccess] no se pudo verificar acceso IA", error)
        if (!cancelled) {
          setHasAiAccess(false)
          setAccessUid(user.uid)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [authLoading, user])

  const resolvedForUser = !user || accessUid === user.uid

  return {
    hasAiAccess: !!user && resolvedForUser && hasAiAccess,
    loading: authLoading || loading || !resolvedForUser,
  }
}
