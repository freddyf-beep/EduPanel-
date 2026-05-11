import { MainLayout } from "@/components/edu-panel"
import { DashboardV2Shell } from "@/components/edu-panel/dashboard/dashboard-v2-shell"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export default function DashboardPage() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="p-10 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
        <DashboardV2Shell />
      </Suspense>
    </MainLayout>
  )
}
