'use client'

import { useState } from 'react'
import { ContactSearch } from '@/components/ContactSearch'
import { SchedulePicker, toLocalISOString, isScheduleValid } from '@/components/SchedulePicker'
import { supabase } from '@/lib/supabase'
import { Contact, SendType, MessageFile } from '@/types'
import { uploadFile, getFileType } from '@/lib/uploadUtils'

const nowPlus2 = () => {
    const d = new Date()
    d.setSeconds(0, 0)
    d.setMinutes(d.getMinutes() + 2)
    return d
}

export default function EnviarPage() {
    const [contact, setContact] = useState<Contact | null>(null)
    const [sendType, setSendType] = useState<SendType>('text')
    const [message, setMessage] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [scheduledAt, setScheduledAt] = useState<Date>(nowPlus2)
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    /*const getFileType = (file: File): string => {
        const mime = file.type
        const ext = file.name.split('.').pop()?.toLowerCase()
        if (mime.startsWith('image/')) return 'image'
        if (mime.startsWith('audio/')) return 'audio'
        if (mime.startsWith('video/')) return 'video'
        if (mime.includes('pdf')) return 'pdf'
        if (ext === 'pptx' || ext === 'ppt') return 'pptx'
        if (ext === 'docx' || ext === 'doc') return 'docx'
        if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
        return 'document'
    }

    const uploadFile = async (file: File): Promise<MessageFile> => {
        const path = `uploads/${Date.now()}-${file.name}`
        const { error } = await supabase.storage.from('message-files')
            .upload(path, file, { contentType: file.type })
        if (error) throw new Error('Erro ao fazer upload: ' + error.message)
        const { data: urlData } = supabase.storage.from('message-files').getPublicUrl(path)
        return { url: urlData.publicUrl, type: getFileType(file), name: file.name }
    }*/

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(e.target.files ?? [])
        if (selected.length > 0) {
            setFiles(prev => [...prev, ...selected])
        }
        e.target.value = ''
    }

    const handleSubmit = async () => {
        if (!contact) return alert('Selecione um contato')
        if (sendType === 'text' && !message) return alert('Digite uma mensagem')
        if (sendType === 'file' && files.length === 0) return alert('Selecione um arquivo')
        if (sendType === 'both' && (!message || files.length === 0)) return alert('Preencha mensagem e arquivo')
        if (!isScheduleValid(scheduledAt)) return alert('O horário deve ser pelo menos 1 minuto no futuro')

        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Usuário não autenticado')

            let uploadedFiles: MessageFile[] = []
            if (sendType !== 'text' && files.length > 0)
                uploadedFiles = await Promise.all(files.map(uploadFile))

            const { error } = await supabase.from('scheduled_messages').insert({
                contact_jid: contact.jid,
                message: sendType !== 'file' ? message : undefined,
                files: uploadedFiles.length > 0 ? uploadedFiles : null,
                send_type: sendType,
                scheduled_at: toLocalISOString(scheduledAt),
                sent: false,
                user_id: user.id,
            })
            if (error) throw error

            setSuccess(true)
            setContact(null)
            setMessage('')
            setFiles([])
            setScheduledAt(nowPlus2())
            setTimeout(() => setSuccess(false), 4000)
        } catch (err: unknown) {
            alert('Erro: ' + (err as Error).message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '32px', color: 'var(--purple-dark)', marginBottom: '4px' }}>
                    Enviar mensagem
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    Envie para um contato ou grupo específico
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <Field label="Destinatário">
                    <ContactSearch selected={contact} onSelect={setContact} />
                </Field>

                <Field label="Tipo de envio">
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {(['text', 'file', 'both'] as SendType[]).map((t) => (
                            <button key={t} onClick={() => setSendType(t)} style={{
                                padding: '9px 20px', borderRadius: '8px', cursor: 'pointer',
                                fontWeight: 600, fontSize: '13px', transition: 'all 0.2s',
                                background: sendType === t ? 'var(--purple)' : 'var(--surface-2)',
                                color: sendType === t ? '#fff' : 'var(--text-muted)',
                                border: `1px solid ${sendType === t ? 'var(--purple)' : 'var(--border)'}`,
                            }}>
                                {{ text: '💬 Texto', file: '📎 Arquivo', both: '✉️ Ambos' }[t]}
                            </button>
                        ))}
                    </div>
                </Field>

                {(sendType === 'text' || sendType === 'both') && (
                    <Field label="Mensagem">
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            rows={4}
                            placeholder="Digite sua mensagem..."
                            style={{ ...inputStyle, width: '100%', resize: 'none' }}
                        />
                    </Field>
                )}

                {(sendType === 'file' || sendType === 'both') && (
                    <Field label={`Arquivos${files.length > 0 ? ` (${files.length})` : ''}`}>
                        <label style={{
                            display: 'block', border: '2px dashed var(--purple-light)',
                            borderRadius: '10px', padding: '20px', textAlign: 'center',
                            cursor: 'pointer', background: 'var(--purple-dim)',
                        }}>
                            <input
                                key={files.length}
                                type="file"
                                multiple
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                            <p style={{ color: 'var(--purple)', fontWeight: 600, fontSize: '14px' }}>
                                Clique para selecionar arquivos
                            </p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                                Imagens, PDFs, vídeos, documentos...
                            </p>
                        </label>
                        {files.length > 0 && (
                            <ul style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {files.map((f, i) => (
                                    <li key={`${f.name}-${i}`} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: 'var(--surface)', border: '1px solid var(--border)',
                                        borderRadius: '8px', padding: '8px 14px', fontSize: '13px',
                                    }}>
                                        <span style={{ color: 'var(--purple-dark)' }}>📄 {f.name}</span>
                                        <button
                                            onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                                            style={{
                                                color: 'var(--danger)', background: 'none',
                                                border: 'none', cursor: 'pointer', fontSize: '12px',
                                            }}
                                        >
                                            remover
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Field>
                )}

                <Field label="Quando enviar">
                    <SchedulePicker value={scheduledAt} onChange={setScheduledAt} />
                </Field>

                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    style={{
                        background: loading ? 'var(--purple-light)' : 'var(--purple)',
                        color: '#fff', fontWeight: 700, fontSize: '15px',
                        padding: '14px 24px', borderRadius: '10px', border: 'none',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        boxShadow: loading ? 'none' : 'var(--shadow)',
                        transition: 'all 0.2s', width: '100%',
                    }}
                >
                    {loading ? 'Agendando...' : 'Agendar envio'}
                </button>

                {success && (
                    <div style={{
                        background: '#f0faf5', border: '1px solid var(--success)',
                        borderRadius: '10px', padding: '14px 18px',
                        color: 'var(--success)', fontWeight: 600, fontSize: '14px',
                    }}>
                        ✓ Mensagem agendada com sucesso!
                    </div>
                )}
            </div>
        </div>
    )
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
        <label style={{
            display: 'block', fontSize: '12px', fontWeight: 600,
            color: 'var(--text-muted)', marginBottom: '8px',
            textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
            {label}
        </label>
        {children}
    </div>
)

const inputStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '10px', padding: '11px 16px', color: 'var(--text)',
    fontSize: '14px', outline: 'none',
    boxShadow: '0 1px 4px rgba(123,94,167,0.06)',
}