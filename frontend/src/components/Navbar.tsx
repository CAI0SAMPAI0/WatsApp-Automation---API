'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'

const links = [
  { href: '/enviar', label: 'Enviar' },
  { href: '/enviar/lote', label: 'Envio em Lote' },
  { href: '/historico', label: 'Histórico' },
]

export const Navbar = () => {
  const path = usePathname()

  return (
    <nav style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      boxShadow: 'var(--shadow)',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      <div style={{
        maxWidth: '900px', margin: '0 auto',
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <Link href="/enviar" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <Image src="/tati_logo.png" alt="Taty's English" width={40} height={40}
            style={{ borderRadius: '50%', border: '2px solid var(--purple-light)' }} />
          <div>
            <p style={{
              fontFamily: 'Playfair Display, serif', fontWeight: 700,
              fontSize: '15px', color: 'var(--purple-dark)', lineHeight: 1.1,
            }}>Taty's English</p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              painel de mensagens
            </p>
          </div>
        </Link>

        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', alignItems: 'center' }}>
          {links.map(({ href, label }) => {
            const active = path === href || (href === '/enviar/lote' && path === '/enviar/lote')
            return (
              <Link key={href} href={href} style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px',
                fontWeight: 500, textDecoration: 'none', transition: 'all 0.2s',
                background: active ? 'var(--purple-dim)' : 'transparent',
                color: active ? 'var(--purple)' : 'var(--text-muted)',
                border: active ? '1px solid var(--purple-light)' : '1px solid transparent',
              }}>
                {label}
              </Link>
            )
          })}
          <div style={{ marginLeft: '8px' }}>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  )
}