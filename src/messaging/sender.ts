import { WASocket } from '@whiskeysockets/baileys'
import { MessagePayload, SendType, MessageFile } from '../types/index.js'

export const sendMessage = async (
    sock: WASocket,
    payload: MessagePayload
): Promise<void> => {
    const { contact_jid, send_type, message, file_urls } = payload

    console.log('Payload recebido:', JSON.stringify(payload, null, 2))

    try {
        if (send_type === 'text') {
            if (!message) throw new Error('Mensagem não informada')
            await sock.sendMessage(contact_jid, { text: message })
            console.log(`Texto enviado para ${contact_jid}`)
        }

        if (send_type === 'both') {
            if (!message) throw new Error('Mensagem não informada')
            if (!file_urls?.length) throw new Error('Arquivos não informados')

            // Primeira imagem com legenda
            await sendFile(sock, contact_jid, file_urls[0], message)

            // Restante sem legenda, com delay entre cada uma
            for (const file of file_urls.slice(1)) {
                await new Promise(resolve => setTimeout(resolve, 1500)) // delay anti rate-limit
                await sendFile(sock, contact_jid, file)
            }
        }

        // Faz o mesmo para 'file'
        if (send_type === 'file') {
            if (!file_urls?.length) throw new Error('Arquivos não informados')
            for (const file of file_urls) {
                await new Promise(resolve => setTimeout(resolve, 1500))
                await sendFile(sock, contact_jid, file)
            }
        }

    } catch (err) {
        console.error(`Erro ao enviar para ${contact_jid}:`, err)
        throw err
    }
}

const sendFile = async (
    sock: WASocket,
    jid: string,
    file: MessageFile,
    caption?: string
): Promise<void> => {
    const response = await fetch(file.url)
    const buffer = Buffer.from(await response.arrayBuffer())
    const mimetype = getMimeType(file.type, file.url)

    console.log(`Enviando: ${file.name} (${mimetype})`)

    if (file.type === 'image') {
        await sock.sendMessage(jid, { image: buffer, caption })
    } else if (file.type === 'audio') {
        await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg' })
    } else if (file.type === 'video') {
        await sock.sendMessage(jid, { video: buffer, caption, mimetype: 'video/mp4' })
    } else {
        await sock.sendMessage(jid, {
            document: buffer,
            mimetype,
            fileName: file.name,
            caption
        })
    }
}

const getMimeType = (file_type: string, file_url?: string): string => {
    if (file_url) {
        const ext = file_url.split('.').pop()?.toLowerCase().split('?')[0]
        const extMimes: Record<string, string> = {
            pdf: 'application/pdf',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            ppt: 'application/vnd.ms-powerpoint',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            doc: 'application/msword',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            xls: 'application/vnd.ms-excel',
            mp4: 'video/mp4',
            mp3: 'audio/mpeg',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
        }
        if (ext && extMimes[ext]) return extMimes[ext]
    }
    const mimes: Record<string, string> = {
        pdf: 'application/pdf',
        word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        video: 'video/mp4',
    }
    return mimes[file_type] ?? 'application/octet-stream'
}