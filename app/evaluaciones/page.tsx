import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { MainLayout } from "@/components/edu-panel"
import { ErrorBoundary } from "@/components/edu-panel/error-boundary"
import { EvaluacionesShell } from "@/components/edu-panel/evaluaciones/evaluaciones-shell"
import { Breadcrumbs } from "@/components/edu-panel/shared/breadcrumbs"

export default function EvaluacionesPage() {
  return (
    <MainLayout>
      <div className="mx-auto max-w-[1500px] px-3 pt-3 sm:px-5">
        <Breadcrumbs items={[{ label: "Evaluaciones" }]} />
      </div>
      <ErrorBoundary sectionName="Evaluaciones">
        <Suspense
          fallback={
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          }
        >
          <EvaluacionesShell />
        </Suspense>
      </ErrorBoundary>
    </MainLayout>
  )
}
