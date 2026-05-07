'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!email || !password) return setError('Preencha email e senha')
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou senha incorretos')
      setLoading(false)
    } else {
      router.replace('/enviar')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '20px', padding: '48px 40px', width: '100%', maxWidth: '420px',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Image src="/tati_logo.png" alt="Taty's English" width={72} height={72}
            style={{ borderRadius: '50%', border: '3px solid var(--purple-light)', marginBottom: '12px' }} />
          <h1 style={{
            fontFamily: 'Playfair Display, serif', fontSize: '24px',
            color: 'var(--purple-dark)', marginBottom: '4px',
          }}>
            Study Practices
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Painel de mensagens
          </p>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="seu@email.com"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>

          {error && (
            <p style={{
              fontSize: '13px', color: 'var(--danger)',
              background: '#fff0f0', border: '1px solid var(--danger)',
              borderRadius: '8px', padding: '10px 14px',
            }}>
              ⚠️ {error}
            </p>
          )}

          <button onClick={handleLogin} disabled={loading} style={{
            marginTop: '8px',
            background: loading ? 'var(--purple-light)' : 'var(--purple)',
            color: '#fff', fontWeight: 700, fontSize: '15px',
            padding: '14px', borderRadius: '10px', border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : 'var(--shadow)',
            transition: 'all 0.2s', width: '100%',
          }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Sessão válida por 90 dias
        </p>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: 'var(--text-muted)', marginBottom: '6px',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: '10px', padding: '12px 16px', color: 'var(--text)',
  fontSize: '14px', outline: 'none',
  boxShadow: '0 1px 4px rgba(124,92,191,0.06)',
  transition: 'border-color 0.2s',
}