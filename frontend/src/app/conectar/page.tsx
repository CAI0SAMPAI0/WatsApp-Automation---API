'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import QRCodeLib from 'qrcode'
import { supabase } from '@/lib/supabase'

const BOT_URL = process.env.NEXT_PUBLIC_BOT_URL || 'http://localhost:3001'

export default function ConectarPage() {
    const router = useRouter()
    const [qrImage, setQrImage] = useState<string | null>(null)
    const [connected, setConnected] = useState(false)
    const [loading, setLoading] = useState(true)
    const [userId, setUserId] = useState<string | null>(null)

    const check = useCallback(async () => {
        if (!userId) {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setUserId(user.id)
                await fetch(`${BOT_URL}/connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user.id })
                })
            }
            return
        }

        try {
            const res = await fetch(`${BOT_URL}/status?user_id=${userId}`)
            const data = await res.json()

            if (data.connected) {
                setConnected(true)
                setTimeout(() => router.replace('/enviar'), 2000)
                return
            }

            if (data.hasQR) {
                const qrRes = await fetch(`${BOT_URL}/qr?user_id=${userId}`)
                const qrData = await qrRes.json()
                if (qrData.qr) {
                    const img = await QRCodeLib.toDataURL(qrData.qr, { width: 280 })
                    setQrImage(img)
                }
            }
        } catch {
        }
        setLoading(false)
    }, [router, userId])

    useEffect(() => {
        check()
        const interval = setInterval(check, 3000)
        return () => clearInterval(interval)
    }, [check])

    return (
        <div style={{
            minHeight: '80vh', display: 'flex', alignItems: 'center',
            justifyContent: 'center',
        }}>
            <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '20px', padding: '48px 40px', maxWidth: '420px',
                width: '100%', textAlign: 'center', boxShadow: 'var(--shadow-lg)',
            }}>
                <Image src="/tati_logo.png" alt="Logo" width={56} height={56}
                    style={{
                        borderRadius: '50%', marginBottom: '20px',
                        border: '2px solid var(--purple-light)'
                    }} />

                {connected ? (
                    <>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                        <h2 style={{ color: 'var(--purple-dark)', marginBottom: '8px' }}>
                            WhatsApp conectado!
                        </h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                            Redirecionando para o painel...
                        </p>
                    </>
                ) : qrImage ? (
                    <>
                        <h2 style={{ color: 'var(--purple-dark)', marginBottom: '8px' }}>
                            Conectar WhatsApp
                        </h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
                            Abra o WhatsApp → Menu → Dispositivos conectados → Conectar dispositivo
                        </p>
                        <img src={qrImage} alt="QR Code"
                            style={{
                                borderRadius: '12px', border: '4px solid var(--purple-light)',
                                width: '240px', height: '240px'
                            }} />
                        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '16px' }}>
                            Atualizando automaticamente...
                        </p>
                    </>
                ) : (
                    <>
                        <h2 style={{ color: 'var(--purple-dark)', marginBottom: '8px' }}>
                            Aguardando bot...
                        </h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                            {loading ? 'Verificando conexão...' : 'Bot offline. Inicie o bot e aguarde.'}
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}