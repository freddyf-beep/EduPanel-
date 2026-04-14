import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import 'react-quill-new/dist/quill.snow.css'
import { AuthProvider } from '@/components/auth/auth-context'
import { Toaster } from '@/components/ui/toaster'
import { VersionNotifier } from '@/components/edu-panel/version-notifier'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'EduPanel',
  description: 'Plataforma de planificación educativa para profesores',
  icons: { icon: '/icon.svg' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${plusJakarta.variable} font-sans antialiased`} suppressHydrationWarning>
        {/* Script anti-flash: aplica color y dark mode en <html> ANTES de pintar nada */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var c = localStorage.getItem('edu-color') || 'pink';
            var d = localStorage.getItem('edu-dark') === 'true';
            document.documentElement.setAttribute('data-color', c);
            document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light');
          } catch(e) {}
        `}} />
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster />
        <VersionNotifier />
      </body>
    </html>
  )
}
