// js/ui.js - Gerenciamento de Interface (DOM) atualizado para QR Code correto

const pageTitles = {
    'envio-simples': 'Envio Simples',
    'envio-lote': 'Envio em Lote',
    'agendamentos': 'Agendamentos',
    'historico': 'Histórico',
    'conexao': 'Conectar WhatsApp',
};

function goto(panel, el) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const panelEl = document.getElementById('panel-' + panel);
    if (panelEl) panelEl.classList.add('active');
    
    if (el) el.classList.add('active');
    
    document.getElementById('pageTitle').textContent = pageTitles[panel] || panel;
    
    if (panel === 'agendamentos') loadTasks();
    if (panel === 'historico') loadHistory();
    if (panel === 'conexao') updateZapQRCode();
}

async function updateZapQRCode() {
    const container = document.getElementById('qr-container');
    const userId = localStorage.getItem('sp_userId');
    // CORREÇÃO: Usa a URL da Baileys-API vinda do .env
    const baileysUrl = localStorage.getItem('sp_baileysUrl');

    if (!baileysUrl) {
        container.innerHTML = '<p style="color:#333;">URL da Baileys-API não encontrada no .env.</p>';
        return;
    }

    // O QR Code vem da Baileys API passando o sessionId (user_id)
    const qrUrl = `${baileysUrl}/qrcode?sessionId=${userId}`;
    
    container.innerHTML = `
        <div style="text-align:center; width: 100%;">
            <p style="color:#333; margin-bottom:15px; font-weight:500;">Aponte o WhatsApp para o QR Code abaixo:</p>
            <div style="background: white; padding: 20px; border-radius: 12px; display: inline-block; box-shadow: 0 8px 24px rgba(0,0,0,0.15); line-height: 0;">
                <iframe src="${qrUrl}" style="width: 400px; height: 500px; border:none; border-radius: 8px; overflow: hidden;" scrolling="no"></iframe>
            </div>
            <p style="color:#666; font-size:12px; margin-top:20px;">O QR Code é único para sua conta. Se não carregar, clique abaixo:</p>
            <button class="btn btn-ghost" onclick="updateZapQRCode()" style="margin-top:10px">↺ Atualizar QR Code</button>
        </div>
    `;
}

function toast(msg, type = 'info') {
    const c = document.getElementById('toasts');
    if (!c) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 320);
    }, 3500);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function setLoading(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    btn.classList.toggle('loading', on);
}

function initInputs() {
    const d = new Date();
    const today = d.toISOString().split('T')[0];
    
    // Incrementa 5 minutos e deixa o objeto Date calcular a virada de hora corretamente
    d.setMinutes(d.getMinutes() + 5);
    
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    
    const dInput = document.getElementById('dateInput');
    const tInput = document.getElementById('timeInput');
    if (dInput) dInput.value = today;
    if (tInput) tInput.value = `${hours}:${mins}`;
}
