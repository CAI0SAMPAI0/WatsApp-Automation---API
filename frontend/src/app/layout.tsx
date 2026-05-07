import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { AuthGuard } from '@/components/AuthGuard'

export const metadata: Metadata = {
  title: "Taty's English — Painel",
  description: 'Painel de envio de mensagens WhatsApp',
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