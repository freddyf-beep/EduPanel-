"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  DEFAULT_ASIGNATURA,
  SUBJECT_STORAGE_KEY,
  sanitizeAsignatura,
} from "@/lib/shared"

function readStoredSubject(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(SUBJECT_STORAGE_KEY)
}

export function useActiveSubject(explicitSubject?: string | null) {
  const searchParams = useSearchParams()
  const urlSubject = explicitSubject ?? searchParams.get("asignatura")
  const [asignatura, setAsignaturaState] = useState(() =>
    sanitizeAsignatura(urlSubject ?? readStoredSubject() ?? DEFAULT_ASIGNATURA)
  )

  useEffect(() => {
    const next = sanitizeAsignatura(urlSubject ?? readStoredSubject() ?? DEFAULT_ASIGNATURA)
    setAsignaturaState((prev) => (prev === next ? prev : next))
  }, [urlSubject])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(SUBJECT_STORAGE_KEY, asignatura)
  }, [asignatura])

  const setAsignatura = (next: string) => {
    setAsignaturaState(sanitizeAsignatura(next))
  }

  return { asignatura, setAsignatura }
}
