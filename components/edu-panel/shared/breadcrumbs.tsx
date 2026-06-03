"use client"

import Link from "next/link"
import { ChevronRight, Home } from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { cn } from "@/lib/utils"

export interface Crumb {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items: Crumb[]
  className?: string
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const { asignatura } = useActiveSubject()

  const withSubject = (href: string) => {
    if (asignatura && href.startsWith("/")) {
      const sep = href.includes("?") ? "&" : "?"
      return `${href}${sep}asignatura=${encodeURIComponent(asignatura)}`
    }
    return href
  }

  return (
    <nav
      aria-label="Ruta de navegación"
      className={cn(
        "flex flex-wrap items-center gap-1 text-[12px] text-muted-foreground",
        className
      )}
    >
      <Link
        href={withSubject("/")}
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
        title="Inicio"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 opacity-50" />
            {item.href && !isLast ? (
              <Link
                href={withSubject(item.href)}
                className="rounded-md px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span className="rounded-md px-1 py-0.5 font-semibold text-foreground">
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
