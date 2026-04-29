import { Suspense } from "react"
import { MainLayout } from "@/components/edu-panel"
import { Perfil360Content } from "@/components/edu-panel/perfil-360/perfil-360-content"

export default function Perfil360Page() {
  return (
    <MainLayout>
      <Suspense fallback={null}>
        <Perfil360Content />
      </Suspense>
    </MainLayout>
  )
}
