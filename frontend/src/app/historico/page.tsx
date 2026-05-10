'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ContactSearch } from '@/components/ContactSearch'
import { SchedulePicker } from '@/components/SchedulePicker'

interface Message {
    id: string
    contact_jid: string
    message?: string
    files?: { name: string; type: string; url: string }[]
    send_type: string
    scheduled_at: string
    sent: boolean
    created_at: string
    batch_id?: string
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
    const [editingMsg, setEditingMsg] = useState<Message | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }

        let query = supabase
            .from('scheduled_messages')
            .select('*')
            .eq('user_id', user.id)
            .order('scheduled_at', { ascending: false })
            .limit(50)

        if (filter === 'sent') query = query.eq('sent', true)
        if (filter === 'pending') query = query.eq('sent', false)

        const { data } = await query
        setMessages(data ?? [])
        setLoading(false)
    }, [filter])

    useEffect(() => { load() }, [load])

    const updateMessage = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingMsg) return
        await supabase.from('scheduled_messages').update({
            message: editingMsg.message,
            scheduled_at: editingMsg.scheduled_at,
        }).eq('id', editingMsg.id)
        setEditingMsg(null)
        load()
    }

    const deleteMessage = async (id: string, batch_id?: string) => {
        if (!confirm('Deseja remover esta mensagem?')) return
        if (batch_id) {
            await supabase.from('scheduled_messages').delete().eq('batch_id', batch_id)
        } else {
            await supabase.from('scheduled_messages').delete().eq('id', id)
        }
        load()
    }

    const formatDate = (iso: string) => {
        const date = new Date(iso);
        const offset = -3;
        date.setHours(date.getHours() + offset);
        
        return date.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }

    return (
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '16px' }}>
            <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 style={{ fontSize: '30px', color: 'var(--purple-dark)', marginBottom: '4px' }}>Histórico</h1>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {(['all', 'sent', 'pending'] as const).map((f) => (
                        <button key={f} onClick={() => setFilter(f)} style={{
                            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                            background: filter === f ? 'var(--purple)' : 'var(--surface)',
                            color: filter === f ? '#fff' : 'var(--text-muted)',
                            border: `1px solid ${filter === f ? 'var(--purple)' : 'var(--border)'}`,
                        }}>
                            {{ all: 'Todos', sent: 'Enviados', pending: 'Agendados' }[f]}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {messages.map((msg) => {
                    const status = getStatus(msg)
                    const isEditable = !msg.sent && new Date(msg.scheduled_at) > new Date()
                    return (
                        <div key={msg.id} style={{
                            background: 'var(--surface)', border: '1px solid var(--border)',
                            borderRadius: '12px', padding: '16px', boxShadow: 'var(--shadow)',
                            borderLeft: `4px solid ${status.border}`,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', gap: '8px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatDate(msg.scheduled_at)}</span>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: status.color }}>{status.label}</span>
                            </div>
                            <p style={{ fontSize: '14px', marginBottom: '10px' }}>{msg.message}</p>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => deleteMessage(msg.id, msg.batch_id)} style={{
                                    padding: '6px 12px', fontSize: '12px', borderRadius: '6px',
                                    background: 'var(--danger-dim)', color: 'var(--danger)', border: 'none', cursor: 'pointer'
                                }}>Remover {msg.batch_id ? 'Lote' : ''}</button>
                                {isEditable && (
                                    <button onClick={() => setEditingMsg(msg)} style={{
                                        padding: '6px 12px', fontSize: '12px', borderRadius: '6px',
                                        background: 'var(--purple-dim)', color: 'var(--purple)', border: 'none', cursor: 'pointer'
                                    }}>Editar</button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {editingMsg && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                }}>
                    <form onSubmit={updateMessage} style={{
                        background: 'var(--surface)', padding: '24px', borderRadius: '16px',
                        width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '12px'
                    }}>
                        <h2 style={{ fontSize: '18px' }}>Editar Mensagem</h2>
                        <textarea value={editingMsg.message || ''} onChange={e => setEditingMsg({...editingMsg, message: e.target.value})}
                            style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', minHeight: '100px' }} />
                        <SchedulePicker value={new Date(editingMsg.scheduled_at)} onChange={d => setEditingMsg({...editingMsg, scheduled_at: d.toISOString()})} />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                            <button type="submit" style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--purple)', color: '#fff', border: 'none' }}>Salvar</button>
                            <button type="button" onClick={() => setEditingMsg(null)} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>Cancelar</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    )
}