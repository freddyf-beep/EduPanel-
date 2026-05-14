import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { MainLayout } from "@/components/edu-panel"
import { ErrorBoundary } from "@/components/edu-panel/error-boundary"
import { EvaluacionesShell } from "@/components/edu-panel/evaluaciones/evaluaciones-shell"

export default function EvaluacionesPage() {
  return (
    <MainLayout>
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
