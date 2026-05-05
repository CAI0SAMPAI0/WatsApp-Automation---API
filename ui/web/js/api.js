// js/api.js - Comunicação com Backend via Caminhos Relativos (Zero Config)

async function api(path, method = 'GET', body = null) {
    const userId = localStorage.getItem('sp_userId');
    // Se não houver apiUrl salva, usa caminho relativo (funciona local e no railway)
    const apiUrl = (localStorage.getItem('sp_apiUrl') || '').trim().replace(/\/$/, ''); 
    const apiKey = (localStorage.getItem('sp_apiKey') || '').trim();

    if (!path.startsWith('/auth') && !userId) {
        throw new Error("Usuário não autenticado");
    }

    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'x-user-id': userId || '', 
            'x-session-id': userId || '' 
        },
    };

    if (body) opts.body = JSON.stringify(body);

    try {
        // Se apiUrl estiver vazia, fetch('/auth/login') funcionará perfeitamente
        const finalUrl = apiUrl ? (apiUrl + path) : path;
        const response = await fetch(finalUrl, opts);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `Erro HTTP ${response.status}`);
        }
        return data;
    } catch (err) {
        console.error("Erro na API:", err);
        throw err;
    }
}

const API = {
    async health() { return api('/health'); },
    async getTasks() { return api('/tasks'); },
    async createTask(task) { return api('/tasks', 'POST', task); },
    async deleteTask(id) { return api(`/tasks/${id}`, 'DELETE'); },
    async getZapStatus() { return api('/status'); },
    async zapLogout() { return api('/logout', 'DELETE'); }
};
