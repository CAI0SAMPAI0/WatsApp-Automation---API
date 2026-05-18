'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function CadastroPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCadastro = async () => {
    if (!username || !password) return setError('Preencha todos os campos')
    if (username.length < 3) return setError('Username deve ter pelo menos 3 caracteres')
    if (password.length < 6) return setError('Senha deve ter pelo menos 6 caracteres')
    if (password !== confirm) return setError('As senhas não coincidem')

    setLoading(true)
    setError('')

    const email = `${username.trim().toLowerCase()}@taty.local`

    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('username', username.trim().toLowerCase())
      .single()

    if (existing) {
      setError('Este username já está em uso')
      setLoading(false)
      return
    }

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })

    if (signUpError || !data.user) {
      setError('Erro ao criar conta: ' + signUpError?.message)
      setLoading(false)
      return
    }

    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({ id: data.user.id, username: username.trim().toLowerCase() })

    if (profileError) {
      setError('Erro ao salvar perfil: ' + profileError.message)
      setLoading(false)
      return
    }

    router.replace('/conectar')
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
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Image src="/tati_logo.png" alt="Taty's English" width={72} height={72}
            style={{ borderRadius: '50%', border: '3px solid var(--purple-light)', marginBottom: '12px' }} />
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', color: 'var(--purple-dark)', marginBottom: '4px' }}>
            Criar conta
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Taty's English — Painel</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Username</label>
            <input type="text" value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCadastro()}
              placeholder="ex: tati"
              style={{ ...inputStyle, width: '100%' }} />
          </div>

          <div>
            <label style={labelStyle}>Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCadastro()}
                placeholder="••••••••"
                style={{ ...inputStyle, width: '100%', paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={eyeBtnStyle}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Confirmar senha</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCadastro()}
                placeholder="••••••••"
                style={{ ...inputStyle, width: '100%', paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(p => !p)}
                style={eyeBtnStyle}
                aria-label={showConfirm ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showConfirm ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          {error && (
            <p style={{
              fontSize: '13px', color: 'var(--danger)',
              background: '#fff0f0', border: '1px solid var(--danger)',
              borderRadius: '8px', padding: '10px 14px',
            }}>⚠️ {error}</p>
          )}

          <button onClick={handleCadastro} disabled={loading} style={{
            marginTop: '8px',
            background: loading ? 'var(--purple-light)' : 'var(--purple)',
            color: '#fff', fontWeight: 700, fontSize: '15px',
            padding: '14px', borderRadius: '10px', border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : 'var(--shadow)',
            transition: 'all 0.2s', width: '100%',
          }}>
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>

          <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
            Já tem conta?{' '}
            <Link href="/login" style={{ color: 'var(--purple)', fontWeight: 600 }}>
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

// Ícone olho aberto
const Eye = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

// Ícone olho fechado
const EyeOff = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

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
}

const eyeBtnStyle: React.CSSProperties = {
  position: 'absolute', right: '12px', top: '50%',
  transform: 'translateY(-50%)',
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '4px', color: 'var(--text-muted)',
  display: 'flex', alignItems: 'center',
}