import { MainLayout } from "@/components/edu-panel"
import { Suspense } from "react"
import { RubricasShell } from "@/components/edu-panel/rubricas/rubricas-shell"
import { ErrorBoundary } from "@/components/edu-panel/error-boundary"

export default function RubricasPage() {
  return (
    <MainLayout>
      <ErrorBoundary sectionName="Rúbricas">
        <Suspense fallback={
          <div className="flex items-center justify-center h-40 text-muted-foreground text-[14px]">
            Cargando rúbricas...
          </div>
        }>
          <RubricasShell />
        </Suspense>
      </ErrorBoundary>
    </MainLayout>
  )
}
