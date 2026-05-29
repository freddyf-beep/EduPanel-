import { MainLayout } from "@/components/edu-panel"
import { ActividadesContentV2 } from "@/components/edu-panel/actividades-v2/actividades-content-v2"
import { ErrorBoundary } from "@/components/edu-panel/error-boundary"

export default function ActividadesPageV2() {
  return (
    <MainLayout noPadding>
      <ErrorBoundary sectionName="Actividades v2">
        <ActividadesContentV2 />
      </ErrorBoundary>
    </MainLayout>
  )
}
