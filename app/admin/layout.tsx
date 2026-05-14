import { AdminLayout } from "@/components/edu-panel/admin-layout"

export const metadata = {
  title: 'Admin - EduPanel',
}

export default function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AdminLayout>
      {children}
    </AdminLayout>
  )
}
