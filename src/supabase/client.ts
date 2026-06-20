import {createClient} from '@supabase/supabase-js'
import WebSocket from 'ws'

// Polyfill WebSocket para ambientes Node.js < 22 (como a versão antiga do Node na Railway)
if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = WebSocket as any
}

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_KEY!

if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL e SUPABASE_KEY precisam estar no .env')
}

export const supabase = createClient(supabaseUrl, supabaseKey)