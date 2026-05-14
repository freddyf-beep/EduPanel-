import { MainLayout } from "@/components/edu-panel"
import { LibroClasesPrototype } from "@/components/edu-panel/prototypes/libro-clases-prototype"
import { ErrorBoundary } from "@/components/edu-panel/error-boundary"

export default function LibroClasesPage() {
  return (
    <MainLayout>
      <ErrorBoundary sectionName="Libro de Clases">
        <LibroClasesPrototype />
      </ErrorBoundary>
    </MainLayout>
  )
}
