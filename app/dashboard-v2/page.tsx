import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { MainLayout } from "@/components/edu-panel"
import { DashboardV2Shell } from "@/components/edu-panel/dashboard/dashboard-v2-shell"

export default function DashboardV2Page() {
  return (
    <MainLayout>
      <Suspense
        fallback={
          <div className="p-10 grid place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <DashboardV2Shell />
      </Suspense>
    </MainLayout>
  )
}
