'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Message {
    id: string
    contact_jid: string
    message?: string
    files?: { name: string; type: string; url: string }[]
    send_type: string
    scheduled_at: string
    sent: boolean
    created_at: string
}

const getStatus = (msg: Message) => {
    if (msg.sent) return { label: '✓ Enviado', color: 'var(--success)', bg: '#f0faf5', border: 'var(--success)' }
    const now = new Date()
    const scheduled = new Date(msg.scheduled_at)
    if (scheduled <= now) return { label: '⟳ Enviando...', color: 'var(--warning)', bg: '#fff8ec', border: 'var(--warning)' }
    return { label: '⏳ Agendado', color: 'var(--purple)', bg: 'var(--purple-dim)', border: 'var(--purple-light)' }
}

export default function HistoricoPage() {
    const [messages, setMessages] = useState<Message[]>([])
    const [filter, setFilter] = useState<'all' | 'sent' | 'pending'>('all')
    const [loading, setLoading] = useState(true)

    const load = async () => {
        setLoading(true)

        // Pega o usuário logado
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }

        let query = supabase
            .from('scheduled_messages')
            .select('*')
            .eq('user_id', user.id) // <-- só mensagens do usuário logado
            .order('scheduled_at', { ascending: false })
            .limit(50)

        if (filter === 'sent') query = query.eq('sent', true)
        if (filter === 'pending') query = query.eq('sent', false)

        const { data } = await query
        setMessages(data ?? [])
        setLoading(false)
    }

    useEffect(() => { load() }, [filter])

    useEffect(() => {
        const interval = setInterval(load, 10000)
        return () => clearInterval(interval)
    }, [filter])

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })

    return (
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 style={{ fontSize: '30px', color: 'var(--purple-dark)', marginBottom: '4px' }}>Histórico</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Mensagens enviadas e agendadas</p>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {(['all', 'sent', 'pending'] as const).map((f) => (
                        <button key={f} onClick={() => setFilter(f)} style={{
                            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                            fontWeight: 600, fontSize: '13px', transition: 'all 0.2s',
                            background: filter === f ? 'var(--purple)' : 'var(--surface)',
                            color: filter === f ? '#fff' : 'var(--text-muted)',
                            border: `1px solid ${filter === f ? 'var(--purple)' : 'var(--border)'}`,
                        }}>
                            {{ all: 'Todos', sent: 'Enviados', pending: 'Agendados' }[f]}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                    <p style={{ fontSize: '24px', marginBottom: '8px' }}>⟳</p>
                    <p>Carregando...</p>
                </div>
            ) : messages.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '60px 20px',
                    border: '2px dashed var(--border)', borderRadius: '16px', color: 'var(--text-muted)',
                }}>
                    <p style={{ fontSize: '36px', marginBottom: '8px' }}>📭</p>
                    <p style={{ fontWeight: 600 }}>Nenhuma mensagem encontrada</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {messages.map((msg) => {
                        const status = getStatus(msg)
                        return (
                            <div key={msg.id} style={{
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                borderRadius: '12px', padding: '16px 20px',
                                boxShadow: 'var(--shadow)',
                                borderLeft: `4px solid ${status.border}`,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: 700,
                                            background: msg.contact_jid.endsWith('@g.us') ? 'var(--teal)' : 'var(--purple-light)',
                                            color: msg.contact_jid.endsWith('@g.us') ? '#fff' : 'var(--purple-dark)',
                                        }}>
                                            {msg.contact_jid.endsWith('@g.us') ? 'Grupo' : 'Contato'}
                                        </span>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                            {msg.contact_jid.split('@')[0]}
                                        </span>
                                    </div>
                                    <span style={{
                                        fontSize: '12px', padding: '4px 12px', borderRadius: '20px', fontWeight: 600,
                                        background: status.bg, color: status.color,
                                        border: `1px solid ${status.border}`,
                                    }}>
                                        {status.label}
                                    </span>
                                </div>

                                {msg.message && (
                                    <p style={{
                                        fontSize: '14px', color: 'var(--text)', marginBottom: '10px',
                                        background: 'var(--surface-2)', borderRadius: '8px', padding: '10px 14px',
                                        lineHeight: 1.6, borderLeft: '3px solid var(--purple-light)',
                                    }}>
                                        {msg.message}
                                    </p>
                                )}

                                {msg.files && msg.files.length > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                        {msg.files.map((f, i) => (
                                            <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{
                                                fontSize: '12px', padding: '4px 12px', borderRadius: '6px',
                                                background: 'var(--purple-dim)', color: 'var(--purple)',
                                                border: '1px solid var(--purple-light)', textDecoration: 'none', fontWeight: 500,
                                            }}>
                                                📄 {f.name}
                                            </a>
                                        ))}
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        🗓 {formatDate(msg.scheduled_at)}
                                    </p>
                                    <span style={{
                                        fontSize: '11px', color: 'var(--text-muted)', padding: '2px 8px',
                                        borderRadius: '6px', background: 'var(--surface-2)',
                                    }}>
                                        {{ text: '💬 Texto', file: '📎 Arquivo', both: '✉️ Ambos' }[msg.send_type as 'text' | 'file' | 'both'] ?? msg.send_type}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}