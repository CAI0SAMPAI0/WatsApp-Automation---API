import { WASocket } from 'baileys'
import { supabase } from '../supabase/client'
import { sendMessage } from './sender'
import { SendType } from '../types'

const processing = new Set<string>() // IDs em andamento

export const startScheduler = (sock: WASocket): void => {
    console.log('Agendador iniciado...')

    setInterval(async () => {
        const now = new Date().toISOString()

        const { data, error } = await supabase
            .from('scheduled_messages')
            .select('*')
            .eq('sent', false)
            .lte('scheduled_at', now)

        if (error) {
            console.error('Erro ao buscar mensagens agendadas:', error.message)
            return
        }

        if (!data || data.length === 0) return

        for (const msg of data) {
            if (processing.has(msg.id)) continue // já está sendo processada
            processing.add(msg.id)

            try {
                await sendMessage(sock, {
                    contact_jid: msg.contact_jid,
                    send_type: msg.send_type as SendType,
                    message: msg.message,
                    file_urls: msg.files ?? [],
                    scheduled_at: new Date(msg.scheduled_at)
                })

                await supabase
                    .from('scheduled_messages')
                    .update({ sent: true })
                    .eq('id', msg.id)

                console.log(`Mensagem ${msg.id} enviada e marcada como sent.`)
            } catch (err) {
                console.error(`Falha ao enviar mensagem ${msg.id}:`, err)
            } finally {
                processing.delete(msg.id)
            }
        }
    }, 5000)
}