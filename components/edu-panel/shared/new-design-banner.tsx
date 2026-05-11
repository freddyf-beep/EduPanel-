"use client"

import Link from "next/link"
import { Sparkles, ArrowRight } from "lucide-react"

interface NewDesignBannerProps {
  href: string
  pageName: string
  maxWidth?: string
}

export function NewDesignBanner({ href, pageName, maxWidth = "max-w-[1400px]" }: NewDesignBannerProps) {
  return (
    <div
      className={`mx-auto mb-4 flex ${maxWidth} flex-wrap items-center justify-between gap-3 rounded-[12px] border border-pink-200 bg-gradient-to-r from-pink-50 via-pink-100 to-pink-50 px-4 py-2.5 dark:border-pink-900/40 dark:from-pink-950/40 dark:via-pink-900/30 dark:to-pink-950/40`}
    >
      <span className="flex items-center gap-2 text-[12.5px] font-semibold text-pink-900 dark:text-pink-100">
        <Sparkles className="h-3.5 w-3.5" />
        Hay un <strong>nuevo diseño</strong> de {pageName} en beta. ¡Pruébalo!
      </span>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-[8px] bg-primary px-3 py-1.5 text-[11.5px] font-bold text-white hover:opacity-90"
      >
        Probar nuevo diseño <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  )
}
