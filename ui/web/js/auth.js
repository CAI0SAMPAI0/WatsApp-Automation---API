// js/auth.js - Gerenciamento de Autenticação via Flask (Proxy Supabase) - Caminhos Relativos

let isSignUpMode = false;

// Função para gerar Hash SHA-256 da senha (Segurança ponta-a-ponta)
async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    const title = document.getElementById('auth-title');
    const btnLabel = document.getElementById('btn-auth-label');
    const confirmField = document.getElementById('confirm-password-field');
    const switchText = document.getElementById('auth-switch-text');

    if (isSignUpMode) {
        title.textContent = "Criar Nova Conta";
        btnLabel.textContent = "Registrar e Entrar";
        confirmField.style.display = 'block';
        switchText.innerHTML = `Já tem uma conta? <a href="javascript:void(0)" onclick="toggleAuthMode()" style="color: var(--accent);">Fazer Login</a>`;
    } else {
        title.textContent = "Acesso Restrito";
        btnLabel.textContent = "Entrar";
        confirmField.style.display = 'none';
        switchText.innerHTML = `Não tem uma conta? <a href="javascript:void(0)" onclick="toggleAuthMode()" style="color: var(--accent);">Criar Conta</a>`;
    }
}

async function handleAuth() {
    const email = document.getElementById('login-email').value;
    const passwordRaw = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-auth');
    const errorEl = document.getElementById('login-error');
    
    // Caminho relativo (o Flask é o servidor agora)
    const apiUrl = (localStorage.getItem('sp_apiUrl') || '').trim().replace(/\/$/, ''); 

    if (!email || !passwordRaw) {
        errorEl.textContent = "Preencha todos os campos.";
        errorEl.style.display = 'block';
        return;
    }

    setLoading(btn, true);
    errorEl.style.display = 'none';

    try {
        const password = await hashPassword(passwordRaw);
        const endpoint = isSignUpMode ? '/auth/signup' : '/auth/login';
        
        const payload = { email, password };
        if (isSignUpMode) {
            const confirmRaw = document.getElementById('confirm-password').value;
            if (passwordRaw !== confirmRaw) throw new Error("As senhas não coincidem.");
        }

        const finalUrl = apiUrl ? (apiUrl + endpoint) : endpoint;
        const res = await fetch(finalUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro na autenticação.");

        // Salva a sessão e entra
        localStorage.setItem('sp_userId', data.user_id);
        localStorage.setItem('sp_token', data.access_token);
        
        toast(isSignUpMode ? "Conta criada! Bem-vindo." : "Bem-vindo de volta!", "success");
        checkSession();
        
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    } finally {
        setLoading(btn, false);
    }
}

function checkSession() {
    const userId = localStorage.getItem('sp_userId');
    if (userId) {
        document.getElementById('login-overlay').classList.remove('open');
        document.getElementById('app').style.display = 'flex';
        // Chama o initApp do app.js
        if (typeof initApp === 'function') initApp();
    } else {
        document.getElementById('login-overlay').classList.add('open');
        document.getElementById('app').style.display = 'none';
        // Mesmo sem sessão, tenta pegar a config automática do .env
        fetchAutoConfig();
    }
}

async function fetchAutoConfig() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        localStorage.setItem('sp_apiUrl', config.apiUrl);
        localStorage.setItem('sp_apiKey', config.apiKey);
        localStorage.setItem('sp_baileysUrl', config.baileysUrl);
        localStorage.setItem('sp_baileysKey', config.baileysKey);
    } catch (e) { console.warn("Auto-config aguardando conexão com backend..."); }
}

function handleLogout() {
    localStorage.removeItem('sp_userId');
    localStorage.removeItem('sp_token');
    location.reload();
}

window.addEventListener('DOMContentLoaded', checkSession);
