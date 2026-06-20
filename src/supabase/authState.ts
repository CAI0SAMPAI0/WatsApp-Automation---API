import { proto, initAuthCreds, BufferJSON, AuthenticationCreds } from '@whiskeysockets/baileys'
import { supabase } from './client.js'

export const useSupabaseAuthState = async (userId: string) => {
    const writeData = async (data: any, filename: string) => {
        try {
            const content = JSON.stringify(data, BufferJSON.replacer)
            const { error } = await supabase
                .from('whatsapp_session_files')
                .upsert({
                    user_id: userId,
                    filename,
                    content,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id,filename'
                })

            if (error) {
                console.error(`[SupabaseAuth] Erro ao gravar ${filename} para ${userId}:`, error.message)
            }
        } catch (err) {
            console.error(`[SupabaseAuth] Falha crítica de escrita em ${filename}:`, err)
        }
    }

    const readData = async (filename: string) => {
        try {
            const { data, error } = await supabase
                .from('whatsapp_session_files')
                .select('content')
                .eq('user_id', userId)
                .eq('filename', filename)
                .maybeSingle()

            if (error) {
                console.error(`[SupabaseAuth] Erro ao ler ${filename} para ${userId}:`, error.message)
                return null
            }

            if (!data) return null
            return JSON.parse(data.content, BufferJSON.reviver)
        } catch (error) {
            console.error(`[SupabaseAuth] Falha no parse do arquivo ${filename} para ${userId}:`, error)
            return null
        }
    }

    const removeData = async (filename: string) => {
        try {
            const { error } = await supabase
                .from('whatsapp_session_files')
                .delete()
                .eq('user_id', userId)
                .eq('filename', filename)

            if (error) {
                console.error(`[SupabaseAuth] Erro ao deletar ${filename} para ${userId}:`, error.message)
            }
        } catch (err) {
            console.error(`[SupabaseAuth] Falha crítica ao deletar ${filename}:`, err)
        }
    }

    const creds: AuthenticationCreds = (await readData('creds.json')) || initAuthCreds()

    return {
        state: {
            creds,
            keys: {
                get: async (type: string, ids: string[]) => {
                    const data: { [key: string]: any } = {}
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}.json`)
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value)
                            }
                            data[id] = value
                        })
                    )
                    return data
                },
                set: async (data: any) => {
                    const tasks: Promise<void>[] = []
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id]
                            const filename = `${category}-${id}.json`
                            if (value) {
                                tasks.push(writeData(value, filename))
                            } else {
                                tasks.push(removeData(filename))
                            }
                        }
                    }
                    await Promise.all(tasks)
                }
            }
        },
        saveCreds: async () => {
            await writeData(creds, 'creds.json')
        }
    }
}
