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

export interface ScheduledMessage {
    id: string
    contact_jid: string
    message?: string
    file_url?: string
    file_type?: string
    send_type: SendType
    scheduled_at: string
    sent: boolean
    created_at: string
}