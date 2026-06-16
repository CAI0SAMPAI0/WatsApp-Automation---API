import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log('Fetching schemas/tables from Supabase...');
    
    // Let's try to query some typical user/profile tables or get the list of tables
    // Common tables: users, profiles, accounts, custom_users, clients
    // Let's first query auth.users if we have service_role key, or public tables
    try {
        const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers();
        if (authErr) {
            console.error('Error listing auth users:', authErr.message);
        } else {
            console.log('Auth Users count:', authUsers?.users?.length);
            console.log('Auth Users samples:');
            authUsers?.users?.forEach(u => {
                console.log(`ID: ${u.id} | Email: ${u.email} | Metadata:`, u.user_metadata);
            });
        }
    } catch (err) {
        console.error('Error listing auth users:', err);
    }

    try {
        // Let's try querying a profile table if it exists
        const { data: profiles, error: profErr } = await supabase.from('profiles').select('*').limit(5);
        if (profErr) {
            console.log('profiles table query failed:', profErr.message);
        } else {
            console.log('profiles table sample:', profiles);
        }
    } catch (err) {
        console.error(err);
    }

    try {
        // Let's try querying a users table in public schema
        const { data: users, error: userErr } = await supabase.from('users').select('*').limit(5);
        if (userErr) {
            console.log('users table query failed:', userErr.message);
        } else {
            console.log('users table sample:', users);
        }
    } catch (err) {
        console.error(err);
    }
}

inspect();
