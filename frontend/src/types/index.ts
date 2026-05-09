export type ContactType = 'individual' | 'group'
export type SendType = 'text' | 'file' | 'both'

export interface Contact {
    id: string
    name: string
    jid: string
    type: ContactType
    created_at: string
}

export interface MessageFile {
    url: string
    type: string
    name: string
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