import { MainLayout } from "@/components/edu-panel"
import { LibroClasesV2Shell } from "@/components/edu-panel/libro-clases/libro-clases-v2-shell"
import { ErrorBoundary } from "@/components/edu-panel/error-boundary"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export default function LibroClasesPage() {
  return (
    <MainLayout>
      <ErrorBoundary sectionName="Libro de Clases">
        <Suspense fallback={<div className="p-10 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
          <LibroClasesV2Shell />
        </Suspense>
      </ErrorBoundary>
    </MainLayout>
  )
}
