'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)

  const isPublic = pathname === '/login'

  useEffect(() => {
    if (isPublic) { setChecking(false); return }

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) router.replace('/login')
      else setChecking(false)
    }
    check()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isPublic && (event === 'SIGNED_OUT' || !session)) router.replace('/login')
    })

    return () => subscription.unsubscribe()
  }, [router, isPublic])

  if (checking && !isPublic) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <p style={{ fontSize: '24px', marginBottom: '8px' }}>⟳</p>
        <p style={{ fontSize: '14px' }}>Verificando sessão...</p>
      </div>
    </div>
  )

  return <>{children}</>
}