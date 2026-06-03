import { MainLayout } from "@/components/edu-panel"
import { PlanificacionesShell } from "@/components/edu-panel/planificaciones/planificaciones-shell"
import { Breadcrumbs } from "@/components/edu-panel/shared/breadcrumbs"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export default function PlanificacionesPage() {
  return (
    <MainLayout>
      <div className="mx-auto max-w-[1500px] px-3 py-3 sm:px-5">
        <Breadcrumbs items={[{ label: "Planificaciones" }]} />
      </div>
      <Suspense fallback={<div className="p-10"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>}>
        <PlanificacionesShell />
      </Suspense>
    </MainLayout>
  )
}
