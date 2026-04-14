import { MainLayout } from "@/components/edu-panel"
import { CalificacionesContent } from "@/components/edu-panel/calificaciones/calificaciones-content"
import { ErrorBoundary } from "@/components/edu-panel/error-boundary"

export default function CalificacionesPage() {
  return (
    <MainLayout>
      <ErrorBoundary sectionName="Calificaciones">
        <CalificacionesContent />
      </ErrorBoundary>
    </MainLayout>
  )
}
