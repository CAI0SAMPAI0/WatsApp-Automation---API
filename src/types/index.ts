export type ContactType = 'individual' | 'group'
export type SendType = 'text' | 'file' | 'both'

export interface Contact {
    id: string
    name: string
    jid: string
    type: ContactType
    user_id: string
    created_at: string
}

export interface MessageFile {
    url: string
    type: string
    name: string
}

export interface MessagePayload {
    contact_jid: string
    send_type: SendType
    message?: string
    file_urls?: MessageFile[]
    scheduled_at: Date
}

export interface ScheduledMessage {
    id: string
    contact_jid: string
    message?: string
    files?: MessageFile[]
    send_type: SendType
    scheduled_at: string
    sent: boolean
    created_at: string
}