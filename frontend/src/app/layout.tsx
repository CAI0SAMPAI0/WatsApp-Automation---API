import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { AuthGuard } from '@/components/AuthGuard'

export const metadata: Metadata = {
  title: "Study Practices",
  description: 'Painel de envio de mensagens WhatsApp',
  icons: {
    icon: '/tati_logo.png',
    apple: '/tati_logo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthGuard>
          <Navbar />
          <main style={{ maxWidth: '900px', margin: '0 auto', padding: '36px 24px' }}>
            {children}
          </main>
        </AuthGuard>
      </body>
    </html>
  )
}
