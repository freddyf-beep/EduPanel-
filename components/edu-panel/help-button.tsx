"use client"

import Link from "next/link"
import { HelpCircle } from "lucide-react"

export function HelpButton() {
  return (
    <Link href="/soporte" className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground shadow-[0_4px_20px_rgba(240,62,110,0.35)] transition-all hover:scale-[1.04] hover:shadow-[0_6px_28px_rgba(240,62,110,0.45)]">
      <HelpCircle className="h-4 w-4" />
      ¿Necesitas ayuda?
    </Link>
  )
}
