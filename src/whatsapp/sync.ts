import { WASocket } from "baileys";
import { supabase } from "../supabase/client";

export const syncContacts = async (sock: WASocket, userId: string): Promise<void> => {
    console.log('Sincronizando contatos e grupos...')

    try {
        // Busca todos os grupos que o usuário participa
        const groupsData = await sock.groupFetchAllParticipating()
        const groupsArray = Object.values(groupsData)

        if (groupsArray.length === 0) {
            console.log('Nenhum grupo encontrado.')
            return
        }

        // Mapeia apenas as colunas que existem na tabela 'groups' do Supabase
        const groupsToSave = groupsArray.map((group) => ({
            jid: group.id,
            subject: group.subject, // No Supabase é 'subject', não 'name'
            user_id: userId
            // Adicione 'creation' ou 'owner' aqui se essas colunas existirem no seu banco
        }))

        // Insere na tabela 'groups' (não 'contacts')
        const { error } = await supabase
            .from('groups')
            .upsert(groupsToSave, { onConflict: 'jid, user_id' })

        if (error) {
            console.error('Erro ao salvar grupos:', error.message)
        } else {
            console.log(`${groupsToSave.length} grupos salvos na tabela 'groups'.`)
        }
    } catch (err) {
        console.error('Erro crítico ao sincronizar grupos:', err)
    }

    console.log('Grupos sincronizados! Contatos individuais virão pelo evento contacts.set')
}

export const syncIndividualContacts = async (
    contacts: { id: string; name?: string; notify?: string }[],
    userId: string
): Promise<void> => {
    // Filtra apenas contatos individuais (que terminam em @s.whatsapp.net e não têm @g.us)
    const formatted = contacts
        .filter((c) => c.id.endsWith('@s.whatsapp.net') && !c.id.includes('@g.us'))
        .map((c) => ({
            jid: c.id,
            name: c.name ?? c.notify ?? c.id,
            is_group: false,
            user_id: userId
        }))

    if (formatted.length === 0) return

    const { error } = await supabase
        .from('contacts')
        .upsert(formatted, { onConflict: 'jid, user_id' })

    if (error) console.error('Erro ao salvar contatos:', error.message)
    else console.log(`${formatted.length} contatos individuais salvos.`)
}