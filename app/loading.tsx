export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-full border-[3px] border-primary border-t-transparent animate-spin" />
        <span className="text-[13px] font-medium text-muted-foreground">Cargando…</span>
      </div>
    </div>
  )
}
