'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
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
    const scheduled = new Date(msg.scheduled_at)
    if (scheduled <= new Date()) return { label: '⟳ Enviando...', color: 'var(--warning)', bg: '#fff8ec', border: 'var(--warning)' }
    return { label: '⏳ Agendado', color: 'var(--purple)', bg: 'var(--purple-dim)', border: 'var(--purple-light)' }
}

const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
    })

export default function HistoricoPage() {
    const [messages, setMessages] = useState<Message[]>([])
    const [filter, setFilter] = useState<'all' | 'sent' | 'pending'>('all')
    const [loading, setLoading] = useState(true)
    const [editingMsg, setEditingMsg] = useState<Message | null>(null)
    const [editMessage, setEditMessage] = useState('')
    const [editDate, setEditDate] = useState<Date>(new Date())
    const [saving, setSaving] = useState(false)
    const userIdRef = useRef<string | null>(null)

    const load = useCallback(async (userId?: string) => {
        const uid = userId ?? userIdRef.current
        if (!uid) return
        setLoading(true)

        let query = supabase
            .from('scheduled_messages')
            .select('*')
            .eq('user_id', uid)
            .order('scheduled_at', { ascending: false })
            .limit(100)

        if (filter === 'sent') query = query.eq('sent', true)
        if (filter === 'pending') query = query.eq('sent', false)

        const { data } = await query
        setMessages(data ?? [])
        setLoading(false)
    }, [filter])

    useEffect(() => {
        let channel: ReturnType<typeof supabase.channel> | null = null

        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            userIdRef.current = user.id
            await load(user.id)

            // Realtime subscription
            channel = supabase
                .channel('scheduled_messages_changes')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'scheduled_messages',
                        filter: `user_id=eq.${user.id}`,
                    },
                    () => { load(user.id) }
                )
                .subscribe()
        }

        init()
        return () => { channel && supabase.removeChannel(channel) }
    }, [load])

    const openEdit = (msg: Message) => {
        setEditingMsg(msg)
        setEditMessage(msg.message || '')
        setEditDate(new Date(msg.scheduled_at))
    }

    const closeEdit = () => {
        setEditingMsg(null)
        setEditMessage('')
        setEditDate(new Date())
    }

    const updateMessage = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingMsg) return
        setSaving(true)
        try {
            const updates: Record<string, unknown> = {
                scheduled_at: editDate.toISOString(),
            }
            // Só atualiza texto se a mensagem tem texto
            if (editingMsg.send_type !== 'file') {
                updates.message = editMessage
            }
            // Se era enviado, marca como não enviado para reenviar
            if (editingMsg.sent) {
                updates.sent = false
            }

            const { error } = await supabase
                .from('scheduled_messages')
                .update(updates)
                .eq('id', editingMsg.id)

            if (error) throw error
            closeEdit()
        } catch (err: unknown) {
            alert('Erro ao salvar: ' + (err as Error).message)
        } finally {
            setSaving(false)
        }
    }

    const deleteMessage = async (id: string, batch_id?: string) => {
        if (!confirm('Deseja remover esta mensagem?')) return
        try {
            if (batch_id) {
                await supabase.from('scheduled_messages').delete().eq('batch_id', batch_id)
            } else {
                await supabase.from('scheduled_messages').delete().eq('id', id)
            }
        } catch (err: unknown) {
            alert('Erro ao remover: ' + (err as Error).message)
        }
    }

    return (
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '16px' }}>
            <div style={{
                marginBottom: '28px', display: 'flex', alignItems: 'flex-end',
                justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px',
            }}>
                <div>
                    <h1 style={{ fontSize: '30px', color: 'var(--purple-dark)', marginBottom: '4px' }}>
                        Histórico
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        {messages.length} mensagem(ns) • atualização em tempo real
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {(['all', 'sent', 'pending'] as const).map((f) => (
                        <button key={f} onClick={() => setFilter(f)} style={{
                            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
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
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                    Carregando...
                </p>
            ) : messages.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                    Nenhuma mensagem encontrada.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {messages.map((msg) => {
                        const status = getStatus(msg)
                        return (
                            <div key={msg.id} style={{
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                borderRadius: '12px', padding: '16px', boxShadow: 'var(--shadow)',
                                borderLeft: `4px solid ${status.border}`,
                            }}>
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    marginBottom: '8px', gap: '8px', flexWrap: 'wrap',
                                }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        📅 {formatDate(msg.scheduled_at)}
                                    </span>
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: status.color }}>
                                        {status.label}
                                    </span>
                                </div>

                                {msg.message && (
                                    <p style={{
                                        fontSize: '14px', color: 'var(--text)',
                                        marginBottom: '10px', lineHeight: 1.5,
                                    }}>
                                        {msg.message}
                                    </p>
                                )}

                                {msg.files && msg.files.length > 0 && (
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                                        📎 {msg.files.length} arquivo(s)
                                    </p>
                                )}

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {/* Editar disponível para qualquer mensagem */}
                                    <button
                                        onClick={() => openEdit(msg)}
                                        style={{
                                            padding: '6px 14px', fontSize: '12px', borderRadius: '6px',
                                            cursor: 'pointer', background: 'var(--purple-dim)',
                                            color: 'var(--purple)', border: '1px solid var(--purple-light)',
                                            fontWeight: 600,
                                        }}
                                    >
                                        ✏️ Editar{msg.sent ? ' & Reenviar' : ''}
                                    </button>

                                    <button
                                        onClick={() => deleteMessage(msg.id, msg.batch_id)}
                                        style={{
                                            padding: '6px 14px', fontSize: '12px', borderRadius: '6px',
                                            cursor: 'pointer', background: '#fff0f0',
                                            color: 'var(--danger)', border: '1px solid var(--danger)',
                                            fontWeight: 600,
                                        }}
                                    >
                                        🗑️ Remover{msg.batch_id ? ' lote' : ''}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modal de edição */}
            {editingMsg && (
                <div
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.55)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        padding: '16px', zIndex: 1000,
                    }}
                    onClick={(e) => { if (e.target === e.currentTarget) closeEdit() }}
                >
                    <form
                        onSubmit={updateMessage}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'var(--surface)', padding: '28px',
                            borderRadius: '16px', width: '100%', maxWidth: '480px',
                            display: 'flex', flexDirection: 'column', gap: '16px',
                            boxShadow: 'var(--shadow-lg)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '18px', color: 'var(--purple-dark)' }}>
                                    Editar agendamento
                                </h2>
                                {editingMsg.sent && (
                                    <p style={{ fontSize: '12px', color: 'var(--warning)', marginTop: '4px' }}>
                                        ⚠️ Será marcada como não enviada e reenviada no horário escolhido
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={closeEdit}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: '20px', color: 'var(--text-muted)', lineHeight: 1,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        {editingMsg.send_type !== 'file' && (
                            <div>
                                <label style={labelStyle}>Mensagem</label>
                                <textarea
                                    value={editMessage}
                                    onChange={e => setEditMessage(e.target.value)}
                                    rows={4}
                                    style={{
                                        width: '100%', padding: '10px 14px', borderRadius: '10px',
                                        border: '1px solid var(--border)', background: 'var(--surface-2)',
                                        color: 'var(--text)', fontSize: '14px',
                                        resize: 'vertical', outline: 'none',
                                    }}
                                />
                            </div>
                        )}

                        <div>
                            <label style={labelStyle}>Data e hora</label>
                            <SchedulePicker value={editDate} onChange={setEditDate} />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                            <button
                                type="submit"
                                disabled={saving}
                                style={{
                                    flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
                                    background: saving ? 'var(--purple-light)' : 'var(--purple)',
                                    color: '#fff', fontWeight: 700, fontSize: '14px',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {saving ? 'Salvando...' : editingMsg.sent ? 'Salvar & Reenviar' : 'Salvar'}
                            </button>
                            <button
                                type="button"
                                onClick={closeEdit}
                                style={{
                                    flex: 1, padding: '12px', borderRadius: '8px',
                                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                                    color: 'var(--text-muted)', fontWeight: 600,
                                    fontSize: '14px', cursor: 'pointer',
                                }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    )
}

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 600,
    color: 'var(--text-muted)', marginBottom: '6px',
    textTransform: 'uppercase', letterSpacing: '0.06em',
}