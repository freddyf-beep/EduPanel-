import { MainLayout } from "@/components/edu-panel"
import { LibroClasesContent } from "@/components/edu-panel/libro-clases/libro-clases-content"
import { ErrorBoundary } from "@/components/edu-panel/error-boundary"

export default function LibroClasesPage() {
  return (
    <MainLayout>
      <ErrorBoundary sectionName="Libro de Clases">
        <LibroClasesContent />
      </ErrorBoundary>
    </MainLayout>
  )
}
