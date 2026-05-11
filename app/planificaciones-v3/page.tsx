import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { MainLayout } from "@/components/edu-panel"
import { PlanificacionesV3Shell } from "@/components/edu-panel/planificaciones/planificaciones-v3-shell"

export default function PlanificacionesV3Page() {
  return (
    <MainLayout>
      <Suspense
        fallback={
          <div className="p-10 grid place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <PlanificacionesV3Shell />
      </Suspense>
    </MainLayout>
  )
}
