import { MainLayout } from "@/components/edu-panel"
import { PlanificacionesShell } from "@/components/edu-panel/planificaciones/planificaciones-shell"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export default function PlanificacionesPage() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="p-10"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>}>
        <PlanificacionesShell />
      </Suspense>
    </MainLayout>
  )
}
