import { supabase } from '../supabase/client.js'
import { sendMessage } from './sender.js'
import { SendType } from '../types/index.js'
import * as SessionManager from '../whatsapp/sessionManager.js'

const processingIds = new Set<string>()

export const startScheduler = (): void => {
    console.log('Agendador iniciado...')

    setInterval(async () => {
        const now = new Date()
        const nowISO = now.toISOString()

        const { data, error } = await supabase
            .from('scheduled_messages')
            .select('*')
            .eq('sent', false)
            .lte('scheduled_at', nowISO)

        if (error) {
            console.error('Erro ao buscar mensagens agendadas:', error.message)
            return
        }

        if (!data || data.length === 0) return

        console.log(`[Scheduler] ${data.length} mensagem(ns) para processar | now=${nowISO}`)

        for (const msg of data) {
            if (processingIds.has(msg.id)) continue

            const scheduledAt = new Date(msg.scheduled_at)
            const diffSeconds = Math.round((now.getTime() - scheduledAt.getTime()) / 1000)

            console.log(`[Scheduler] msg=${msg.id} | scheduled_at(raw)=${msg.scheduled_at} | scheduled_at(parsed)=${scheduledAt.toISOString()} | atrasada ${diffSeconds}s`)

            const isConnected = SessionManager.isConnected(msg.user_id)
            const sock = SessionManager.getUserSession(msg.user_id)

            if (!sock || !isConnected) {
                console.warn(`[Scheduler] Sessão indisponível para ${msg.user_id}, pulando msg ${msg.id}`)
                continue
            }

            processingIds.add(msg.id)

                ; (async () => {
                    try {
                        await sendMessage(sock, {
                            contact_jid: msg.contact_jid,
                            send_type: msg.send_type as SendType,
                            message: msg.message,
                            file_urls: msg.files ?? [],
                            scheduled_at: scheduledAt
                        })

                        const { error: updateError } = await supabase
                            .from('scheduled_messages')
                            .update({ sent: true })
                            .eq('id', msg.id)

                        if (updateError) {
                            console.error(`[Scheduler] Erro ao marcar msg ${msg.id} como enviada:`, updateError.message)
                        } else {
                            console.log(`[Scheduler] ✅ Mensagem ${msg.id} enviada com sucesso (${diffSeconds}s de atraso)`)
                        }
                    } catch (err) {
                        console.error(`[Scheduler] ❌ Falha ao enviar msg ${msg.id}:`, err)
                    } finally {
                        processingIds.delete(msg.id)
                    }
                })()
        }
    }, 5000)
}