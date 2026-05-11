import { MainLayout } from "@/components/edu-panel"
import { CalificacionesV2Shell } from "@/components/edu-panel/calificaciones/calificaciones-v2-shell"
import { ErrorBoundary } from "@/components/edu-panel/error-boundary"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export default function CalificacionesPage() {
  return (
    <MainLayout>
      <ErrorBoundary sectionName="Calificaciones">
        <Suspense fallback={<div className="p-10 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
          <CalificacionesV2Shell />
        </Suspense>
      </ErrorBoundary>
    </MainLayout>
  )
}
