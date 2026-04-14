"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { PlanificacionesContent } from "./planificaciones-content"
import { PlanificacionesMatriz } from "./planificaciones-matriz"
import { cn } from "@/lib/utils"

export function PlanificacionesDetail({ curso }: { curso: string }) {
  const [activeTab, setActiveTab] = useState<"unidades" | "matriz">("unidades")

  return (
    <div className="flex min-h-screen flex-col">
      {/* Pestañas de control general (fuera del Header del contenido interno para no romper su layout) */}
      <div className="sticky top-[58px] z-10 border-b border-border bg-background px-4 pt-3 sm:px-5 lg:px-10 lg:pt-6">
        <div className="mx-auto flex max-w-[1320px] items-end gap-4 overflow-x-auto scrollbar-none sm:gap-6">
          {/* Back link */}
          <Link
            href="/planificaciones"
            className="mb-[3px] flex items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Mis cursos</span>
          </Link>
          <div className="h-4 w-px bg-border mb-[3px] flex-shrink-0" />
          <button
            onClick={() => setActiveTab("unidades")}
            className={cn(
              "whitespace-nowrap px-2 py-3 text-[14px] font-bold border-b-[3px] transition-colors",
              activeTab === "unidades"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            Mis Unidades
          </button>
          <button
            onClick={() => setActiveTab("matriz")}
            className={cn(
              "whitespace-nowrap px-2 py-3 text-[14px] font-bold border-b-[3px] transition-colors",
              activeTab === "matriz"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            Matriz Curricular
          </button>
        </div>
      </div>

      <div className="flex-1 bg-background px-4 py-4 sm:px-5 sm:py-5 lg:px-10 lg:py-8">
        {activeTab === "unidades" ? (
          <PlanificacionesContent cursoParam={curso} />
        ) : (
          <PlanificacionesMatriz cursoParam={curso} />
        )}
      </div>
    </div>
  )
}
