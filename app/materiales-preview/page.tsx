import { MainLayout } from "@/components/edu-panel"
import { Suspense } from "react"
import { MaterialesPreviewShell } from "@/components/edu-panel/materiales-didacticos/materiales-preview-shell"
import { ErrorBoundary } from "@/components/edu-panel/error-boundary"

export default function MaterialesPreviewPage() {
  return (
    <MainLayout>
      <ErrorBoundary sectionName="Materiales Didácticos">
        <Suspense fallback={
          <div className="flex items-center justify-center h-40 text-muted-foreground text-[14px]">
            Cargando editor...
          </div>
        }>
          <MaterialesPreviewShell />
        </Suspense>
      </ErrorBoundary>
    </MainLayout>
  )
}
