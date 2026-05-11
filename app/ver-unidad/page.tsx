import { VerUnidadV2Content } from "@/components/edu-panel/ver-unidad/ver-unidad-v2-content"
import { MainLayout } from "@/components/edu-panel"

// Página principal de Ver Unidad. La versión anterior está disponible en /ver-unidad-v1.
export default function VerUnidadPage() {
  return (
    <MainLayout>
      <VerUnidadV2Content />
    </MainLayout>
  )
}
