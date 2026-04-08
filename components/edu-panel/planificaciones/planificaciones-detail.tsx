"use client"

import { useState } from "react"
import { PlanificacionesContent } from "./planificaciones-content"
import { PlanificacionesMatriz } from "./planificaciones-matriz"
import { cn } from "@/lib/utils"

export function PlanificacionesDetail({ curso }: { curso: string }) {
  const [activeTab, setActiveTab] = useState<"unidades" | "matriz">("unidades")

  return (
    <div className="flex flex-col min-h-screen">
      {/* Pestañas de control general (fuera del Header del contenido interno para no romper su layout) */}
      <div className="px-10 pt-6 border-b border-border bg-background sticky top-0 z-10">
        <div className="flex gap-6 max-w-[1320px] mx-auto">
          <button
            onClick={() => setActiveTab("unidades")}
            className={cn(
              "px-2 py-3 text-[14px] font-bold border-b-[3px] transition-colors",
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
              "px-2 py-3 text-[14px] font-bold border-b-[3px] transition-colors",
              activeTab === "matriz" 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            Matriz Curricular
          </button>
        </div>
      </div>

      <div className="flex-1 px-10 py-8 bg-slate-50">
        {activeTab === "unidades" ? (
          <PlanificacionesContent cursoParam={curso} />
        ) : (
          <PlanificacionesMatriz cursoParam={curso} />
        )}
      </div>
    </div>
  )
}
