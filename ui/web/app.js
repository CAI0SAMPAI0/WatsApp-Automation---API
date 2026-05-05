// ui/web/app.js - Ponto de entrada com auto-configuração do Backend

let currentMode = 'text';
let isDailyOn = false;

async function initApp() {
    // 1. Tenta pegar a configuração do backend (lê o .env do servidor)
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        
        // Salva as chaves do .env no localStorage para uso do api.js
        localStorage.setItem('sp_apiUrl', config.apiUrl);
        localStorage.setItem('sp_apiKey', config.apiKey);
        localStorage.setItem('sp_baileysUrl', config.baileysUrl);
        localStorage.setItem('sp_baileysKey', config.baileysKey);
        
        console.log("Configuração automática aplicada do .env");
    } catch (e) {
        console.warn("Não foi possível carregar a configuração automática. Verifique se o backend está rodando.");
    }

    initInputs();
    updateApiWarning();
    checkStatus();
    updateCount();
    
    // Polling de status
    setInterval(checkStatus, 30000);
    setInterval(updateCount, 15000);
}

// ── CONFIGURAÇÕES (AGORA AUTOMÁTICAS) ────────────────────────────────────────

function openConfig() {
    toast("As configurações agora são automáticas via .env do servidor.", "info");
    // Se quiser manter o modal para ver as chaves:
    // document.getElementById('cfgApiUrl').value = localStorage.getItem('sp_apiUrl');
    // openModal('modalConfig');
}

function saveConfig() {
    // Desativado pois o .env manda em tudo agora
    toast("Configuração manual desativada. Use o arquivo .env do servidor.", "info");
}

function updateApiWarning() {
    const warn = document.getElementById('apiWarning');
    if (warn) warn.style.display = localStorage.getItem('sp_apiUrl') ? 'none' : 'flex';
}

// ── AUXILIARES DE ENVIO ──────────────────────────────────────────────────────

function setMode(el, mode) {
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    currentMode = mode;
    document.getElementById('msgCard').style.display = mode === 'file' ? 'none' : '';
    document.getElementById('fileCard').style.display = mode === 'text' ? 'none' : '';
}

function toggleDaily() {
    isDailyOn = !isDailyOn;
    document.getElementById('dailyToggle').classList.toggle('on', isDailyOn);
}

async function handleEnviar() {
    const target = document.getElementById('target').value.trim();
    const message = document.getElementById('message').value.trim();
    const btn = document.getElementById('btnEnviar');
    
    if (!target) return toast("Informe o contato", "error");

    setLoading(btn, true);
    try {
        await API.createTask({
            target, 
            mode: currentMode, 
            message, 
            scheduled_time: new Date().toISOString(),
        });
        toast('Mensagem enviada para fila!', 'success');
        updateCount();
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
    } finally { setLoading(btn, false); }
}

async function checkStatus() {
    try {
        await API.health();
        const dot = document.getElementById('statusDot');
        const lbl = document.getElementById('statusLabel');
        if (dot) dot.className = 'status-dot on';
        if (lbl) lbl.textContent = 'Sistema Online';
    } catch {
        const dot = document.getElementById('statusDot');
        const lbl = document.getElementById('statusLabel');
        if (dot) dot.className = 'status-dot off';
        if (lbl) lbl.textContent = 'API Offline';
    }
}

async function updateCount() {
    try {
        const data = await API.getTasks();
        const n = (data.tasks || []).filter(t => t.status === 'completed').length;
        const el = document.getElementById('execCount');
        if (el) el.textContent = n;
    } catch { }
}
