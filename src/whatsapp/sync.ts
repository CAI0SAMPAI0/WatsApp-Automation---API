import { WASocket } from "@whiskeysockets/baileys";
import { supabase } from "../supabase/client.js";

export const syncContacts = async (sock: WASocket, userId: string): Promise<void> => {
    console.log('Sincronizando apenas GRUPOS...')

    try {
        // Busca apenas os grupos que o usuário participa
        const chats = await sock.groupFetchAllParticipating()
        
        const groups = Object.values(chats).map((group) => ({
            user_id: userId,
            jid: group.id,
            subject: group.subject,
            creation: group.creation ? new Date(group.creation * 1000).toISOString() : null,
            owner: group.owner || null
        }))

        if (groups.length === 0) {
            console.log('Nenhum grupo encontrado.')
            return
        }

        // Salva na tabela 'groups' (não em 'contacts')
        const { error } = await supabase
            .from('groups')
            .upsert(groups, { onConflict: 'jid, user_id' })

        if (error) {
            console.error('Erro ao salvar grupos:', error.message)
        } else {
            console.log(`${groups.length} grupos salvos com sucesso na tabela 'groups'.`)
        }
    } catch (err) {
        console.error('Erro fatal na sincronização de grupos:', err)
    }
}

// Função vazia pois não vamos mais salvar contatos individuais
export const syncIndividualContacts = async () => {
    // Não faz nada
}