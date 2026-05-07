import { MainLayout } from "@/components/edu-panel"
import { PlanificacionesV2Shell } from "@/components/edu-panel/planificaciones/planificaciones-v2-shell"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

// Rediseño UX en pruebas. La ruta /planificaciones original sigue intacta como respaldo.
export default function PlanificacionesV2Page() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="p-10"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>}>
        <PlanificacionesV2Shell />
      </Suspense>
    </MainLayout>
  )
}
