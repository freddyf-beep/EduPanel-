"use client"

import { useState, useEffect } from "react"
import { Toaster as OriginalToaster } from "@/components/ui/toaster"

export function Toaster() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return <OriginalToaster />
}
