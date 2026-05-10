'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { supabase } from '@/lib/supabase'

const links = [
  { href: '/enviar', label: 'Enviar' },
  { href: '/enviar/lote', label: 'Envio em Lote' },
  { href: '/historico', label: 'Histórico' },
  { href: '/conectar', label: 'Conectar' },
]

export const Navbar = () => {
  const path = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

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
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
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

        {/* Mobile Hamburger */}
        <button onClick={() => setIsOpen(!isOpen)} style={{
          display: 'block', background: 'transparent', border: 'none',
          fontSize: '24px', cursor: 'pointer', '@media (min-width: 768px)': { display: 'none' }
        } as React.CSSProperties}>
          ☰
        </button>

        <div style={{
          display: isOpen ? 'flex' : 'none', flexDirection: 'column', position: 'absolute',
          top: '64px', left: 0, width: '100%', background: 'var(--surface)',
          padding: '16px', gap: '8px', borderBottom: '1px solid var(--border)',
          '@media (min-width: 768px)': { display: 'flex', flexDirection: 'row', position: 'static', width: 'auto', padding: 0, border: 'none', alignItems: 'center' }
        } as React.CSSProperties}>
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
          <button onClick={handleLogout} style={{
            padding: '8px 14px', borderRadius: '8px', fontSize: '13px',
            fontWeight: 500, textDecoration: 'none', transition: 'all 0.2s',
            background: 'var(--danger-dim)', color: 'var(--danger)',
            border: '1px solid var(--danger-light)', cursor: 'pointer'
          }}>
            Sair
          </button>
          <div style={{ marginLeft: '8px' }}>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  )
}