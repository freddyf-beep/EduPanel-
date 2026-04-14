import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-pink-light grid place-items-center">
        <span className="text-3xl">📚</span>
      </div>
      <div>
        <h1 className="text-[28px] font-extrabold mb-2">Página no encontrada</h1>
        <p className="text-[14px] text-muted-foreground">La página que buscas no existe o fue movida.</p>
      </div>
      <Link href="/" className="bg-primary text-white font-bold text-[13px] rounded-full px-6 py-3 hover:bg-pink-dark transition-colors">
        Volver al inicio
      </Link>
    </div>
  )
}
