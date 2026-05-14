"use client"

import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface PrototypeBannerProps {
  title?: string
  children: React.ReactNode
  className?: string
}

export function PrototypeBanner({
  title = "Prototipo no operativo",
  children,
  className,
}: PrototypeBannerProps) {
  return (
    <section className={cn("rounded-[12px] border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100", className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[13px] font-extrabold">{title}</h2>
          <div className="mt-1 text-[12px] leading-relaxed opacity-90">{children}</div>
        </div>
      </div>
    </section>
  )
}
