import { supabase } from '../supabase/client.js'
import { sendMessage } from './sender.js'
import { SendType } from '../types/index.js'
import * as SessionManager from '../whatsapp/sessionManager.js'

const processingIds = new Set<string>()

const parseScheduledAt = (raw: string): Date => {
    const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(raw)
    return new Date(hasTimezone ? raw : raw + 'Z')
}

export const processScheduledMessages = async (): Promise<void> => {
    const now = new Date()
    const nowISO = now.toISOString()

    const { data, error } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('sent', false)
        .lte('scheduled_at', nowISO)

    if (error) {
        console.error('Erro ao buscar mensagens agendadas para processamento:', error.message)
        return
    }

    if (!data || data.length === 0) return

    console.log(`[Scheduler] ${data.length} mensagem(ns) para processar | now=${nowISO}`)

    for (const msg of data) {
        if (processingIds.has(msg.id)) continue

        processingIds.add(msg.id)

        try {
            console.log(`[Scheduler] Processando msg ${msg.id} para usuário ${msg.user_id}`)
            
            // Obtém ou restaura a sessão do WhatsApp antes de enviar
            const sock = await SessionManager.getOrRestoreSession(msg.user_id)
            
            const scheduledAt = parseScheduledAt(msg.scheduled_at)
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
                console.log(`[Scheduler] ✅ Mensagem ${msg.id} enviada com sucesso`)
            }
        } catch (err: any) {
            console.error(`[Scheduler] ❌ Falha ao processar/enviar msg ${msg.id}:`, err.message || err)
        } finally {
            processingIds.delete(msg.id)
        }
    }
}

export const startScheduler = (): void => {
    const intervalMs = process.env.SCHEDULER_INTERVAL_MS 
        ? parseInt(process.env.SCHEDULER_INTERVAL_MS, 10) 
        : 10000

    console.log(`[Scheduler] Iniciando scheduler interno com intervalo de ${intervalMs / 1000}s...`)

    setInterval(async () => {
        try {
            await processScheduledMessages()
        } catch (err) {
            console.error('[Scheduler] Erro no loop de verificação do scheduler interno:', err)
        }
    }, intervalMs)
}