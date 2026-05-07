import { WASocket } from "baileys";
import { supabase } from "../supabase/client";

export const syncContacts = async (sock: WASocket): Promise<void> => {
    console.log('Sincronizando contatos e grupos...')

    // Busca todos os chats (contatos + grupos)
    const chats = await sock.groupFetchAllParticipating()

    // Salva os grupos
    const groups = Object.values(chats).map((group) => ({
        name: group.subject,
        jid: group.id,
        type: 'group' as const
    }))

    if (groups.length > 0) {
        const { error } = await supabase
            .from('contacts')
            .upsert(groups, { onConflict: 'jid' })

        if (error) console.error('Erro ao salvar grupos:', error.message)
        else console.log(`${groups.length} grupos salvos.`)
    }

    // O Baileys guarda contatos no evento 'contacts.set'
    // vamos capturar no connection.ts e chamar aqui
    console.log('Grupos sincronizados! Contatos individuais virão pelo evento contacts.set')
}

export const syncIndividualContacts = async (
    contacts: { id: string; name?: string; notify?: string }[]
): Promise<void> => {
    const formatted = contacts
        .filter((c) => c.id.endsWith('@s.whatsapp.net')) // só pessoas, não grupos
        .map((c) => ({
            name: c.name ?? c.notify ?? c.id,
            jid: c.id,
            type: 'individual' as const
        }))

    if (formatted.length === 0) return

    const { error } = await supabase
        .from('contacts')
        .upsert(formatted, { onConflict: 'jid' })

    if (error) console.error('Erro ao salvar contatos:', error.message)
    else console.log(`${formatted.length} contatos individuais salvos.`)
}