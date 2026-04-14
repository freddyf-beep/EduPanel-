import { MainLayout } from "@/components/edu-panel"
import { ActividadesContent } from "@/components/edu-panel/actividades/actividades-content"
import { ErrorBoundary } from "@/components/edu-panel/error-boundary"

export default function ActividadesPage() {
  return (
    <MainLayout noPadding>
      <ErrorBoundary sectionName="Actividades">
        <ActividadesContent />
      </ErrorBoundary>
    </MainLayout>
  )
}
