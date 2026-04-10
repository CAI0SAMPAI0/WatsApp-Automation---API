/* ══════════════════════════════════════════     
   CONFIG
══════════════════════════════════════════ */
const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
const API_BASE_URL = isLocal ? 'http://localhost:8000' : 'https://sua-url-no-railway.railway.app'; // Atualize após o deploy

/* ══════════════════════════════════════════
   THEME
══════════════════════════════════════════ */
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  document.getElementById('themeBtn').textContent = isLight ? '🌞' : '🌙';
  localStorage.setItem('sp_theme', isLight ? 'light' : 'dark');
}
function loadTheme() {
  if (localStorage.getItem('sp_theme') === 'light') {
    document.body.classList.add('light');
    document.getElementById('themeBtn').textContent = '🌞';
  }
}

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
var filePath        = null; // Agora será uma URL ou identificador de arquivo no backend
var editFilePath    = null;
var editTaskId      = null;
var currentMode     = 'text';
var wkResolve       = null;
var isDailyOn       = false;
var loteItems       = [];
var isLoteDailyOn   = false;
var calTargetId     = null;
var calYear         = 0;
var calMonth        = 0;

/* ══════════════════════════════════════════
   POLLING
══════════════════════════════════════════ */
var _pollingPaused = false;

function _anyModalOpen() {
  return !!document.querySelector('.modal-overlay.open');
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', init);
function init() {
  loadTheme();
  setDateDefault();
  setupTabs();
  setupModes();
  setupTimeInput('timeInput');
  setupTimeInput('editTime');
  setupTimeInput('loteTimeInput');
  setupTimeInput('editLoteTime');
  setupEditModeWatch();
  setupCardDelegation();
  
  loadCards();
  
  setInterval(() => {
    if (!_pollingPaused && !_anyModalOpen()) {
      loadCards();
    }
  }, 5000);
}

/* ── delegação de cliques nos cards ── */
function setupCardDelegation() {
  document.getElementById('cardList').addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const action  = btn.dataset.action;
    const id      = parseInt(btn.dataset.id);
    const target  = btn.dataset.target || '';
    if (action === 'edit')        openEdit(id);
    if (action === 'delete')      handleDelete(id, target);
  });
}

/* ══════════════════════════════════════════
   TABS
══════════════════════════════════════════ */
function setupTabs() {
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('panel-' + t.dataset.tab).classList.add('active');
    });
  });
}
function switchSubTab(tab) {
  document.getElementById('stab-simples').classList.toggle('active', tab === 'simples');
  document.getElementById('stab-lote').classList.toggle('active', tab === 'lote');
  document.getElementById('form-simples').style.display = tab === 'simples' ? 'flex' : 'none';
  document.getElementById('form-lote').style.display    = tab === 'lote'    ? 'flex' : 'none';
}

/* ══════════════════════════════════════════
   UTILS
══════════════════════════════════════════ */
function pad(n) { return String(n).padStart(2, '0'); }

function setDateDefault() {
  const d   = new Date();
  const m2  = d.getMinutes() + 2 > 59 ? d.getMinutes() : d.getMinutes() + 2;
  const today = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
  const hm    = `${pad(d.getHours())}:${pad(m2)}`;
  ['dateInput','loteDateInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
  const ti = document.getElementById('timeInput');
  if (ti) ti.value = hm;
}

function setupTimeInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    let v = el.value.replace(/\D/g,'').slice(0,4);
    if (v.length > 2) v = v.slice(0,2)+':'+v.slice(2);
    el.value = v;
  });
}

function maskDate(el) {
  let v = el.value.replace(/\D/g,'').slice(0,8);
  if (v.length > 4) v = v.slice(0,2)+'/'+v.slice(2,4)+'/'+v.slice(4);
  else if (v.length > 2) v = v.slice(0,2)+'/'+v.slice(2);
  el.value = v;
}

function updateFileLabel(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ══════════════════════════════════════════
   CALENDÁRIO POPUP
══════════════════════════════════════════ */
function openCal(inputId) {
  calTargetId = inputId;
  const el    = document.getElementById(inputId);
  const popup = document.getElementById('calPopup');
  const parts  = (el.value||'').split('/');
  const today  = new Date();
  calYear  = (parts[2]&&parts[2].length===4) ? parseInt(parts[2]) : today.getFullYear();
  calMonth = parts[1] ? parseInt(parts[1])-1 : today.getMonth();
  renderCal();
  const wrap  = el.closest('.date-wrap') || el;
  const rect  = wrap.getBoundingClientRect();
  popup.style.top  = (rect.bottom + 6) + 'px';
  popup.style.left = Math.min(rect.left, window.innerWidth - 248) + 'px';
  popup.classList.add('open');
  setTimeout(() => document.addEventListener('click', closeCal, { once: true }), 60);
}

function closeCal() {
  document.getElementById('calPopup').classList.remove('open');
  calTargetId = null;
}

function calMove(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCal();
  event.stopPropagation();
}

function renderCal() {
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('calTitle').textContent = `${months[calMonth]} ${calYear}`;
  const today   = new Date();
  const lastDay = new Date(calYear, calMonth+1, 0).getDate();
  const startWd = new Date(calYear, calMonth, 1).getDay();
  const prevLast= new Date(calYear, calMonth, 0).getDate();
  const el       = calTargetId ? document.getElementById(calTargetId) : null;
  const selParts = el ? el.value.split('/') : [];
  const selD = +selParts[0], selM = +selParts[1], selY = +selParts[2];
  let html = '';
  for (let i = startWd-1; i >= 0; i--) html += `<div class="cal-day other-month">${prevLast-i}</div>`;
  for (let d = 1; d <= lastDay; d++) {
    const dt = new Date(calYear, calMonth, d);
    const todayDt = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isToday = dt.getTime() === todayDt.getTime();
    const isSel   = d===selD && (calMonth+1)===selM && calYear===selY;
    const isPast  = dt < todayDt;
    let cls = 'cal-day' + (isToday?' today':'') + (isSel?' selected':'') + (isPast?' disabled':'');
    const click = isPast ? '' : `onclick="pickCalDay(${d});event.stopPropagation();"`;
    html += `<div class="${cls}" ${click}>${d}</div>`;
  }
  document.getElementById('calDays').innerHTML = html;
}

function pickCalDay(d) {
  if (!calTargetId) return;
  document.getElementById(calTargetId).value = `${pad(d)}/${pad(calMonth+1)}/${calYear}`;
  closeCal();
}

/* ══════════════════════════════════════════
   TOGGLES
══════════════════════════════════════════ */
function toggleDaily() {
  isDailyOn = !isDailyOn;
  document.getElementById('dailyToggleUI').classList.toggle('on', isDailyOn);
}

/* ══════════════════════════════════════════
   MODE PILLS
══════════════════════════════════════════ */
function setupModes() {
  document.querySelectorAll('.mode-pill').forEach(p => {
    p.addEventListener('click', () => {
      document.querySelectorAll('.mode-pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      currentMode = p.dataset.mode;
      applyMode(currentMode);
    });
  });
}
function applyMode(mode) {
  const msgField = document.getElementById('msg-field');
  const fileArea = document.getElementById('fileArea');
  if (mode === 'text') {
    msgField.style.display = '';
    fileArea.classList.add('disabled');
  } else {
    msgField.style.display = '';
    fileArea.classList.remove('disabled');
  }
}

/* ══════════════════════════════════════════
   API CALLS
══════════════════════════════════════════ */
async function loadCards() {
  try {
    const response = await fetch(`${API_BASE_URL}/tasks`);
    const tasks = await response.json();
    renderTasks(tasks);
    document.getElementById('execCount').textContent = tasks.filter(t => t.status === 'completed').length;
  } catch (e) {
    console.error("Error loading tasks", e);
  }
}

function renderTasks(tasks) {
  const container = document.getElementById('cardList');
  if (!tasks.length) {
    container.innerHTML = '<div class="no-items"><span class="ico">📭</span>Nenhum agendamento ainda</div>';
    return;
  }
  container.innerHTML = tasks.map(t => `
    <div class="card" data-id="${t.id}">
      <div class="card-top">
        <div>
          <div class="card-target">📱 ${esc(t.target)}</div>
          <div class="card-date">📅 ${new Date(t.created_at).toLocaleString()} &nbsp;·&nbsp; ${t.mode}</div>
        </div>
        <span class="card-badge badge-${t.status}">${t.status}</span>
      </div>
      <div class="card-actions">
        <button class="card-btn card-btn-del" data-action="delete" data-id="${t.id}" data-target="${esc(t.target)}">🗑 Excluir</button>
      </div>
    </div>
  `).join('');
}

async function handleAgendar() {
  const target  = document.getElementById('target').value.trim();
  const message = document.getElementById('message').value.trim();
  const timeStr = document.getElementById('timeInput').value.trim();
  const dateVal = document.getElementById('dateInput').value;
  
  const scheduledDate = isDailyOn ? null : parseDateTime(dateVal, timeStr);
  
  const payload = {
    target,
    mode: currentMode,
    message,
    scheduled_at: scheduledDate ? toLocalISOString(scheduledDate) : null
  };

  try {
    const response = await fetch(`${API_BASE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      toast('Agendado com sucesso!', 'success');
      resetForm();
      loadCards();
    } else {
      toast('Erro ao agendar', 'error');
    }
  } catch (e) {
    toast('Erro de conexão', 'error');
  }
}

async function handleEnviarAgora() {
  const target  = document.getElementById('target').value.trim();
  const message = document.getElementById('message').value.trim();
  
  // Define a data para 1 minuto no futuro para garantir que o Agent local a veja e execute
  const now = new Date();
  const inOneMinute = new Date(now.getTime() + 60000);
  
  const payload = {
    target,
    mode: currentMode,
    message,
    scheduled_at: toLocalISOString(inOneMinute)
  };

  try {
    const response = await fetch(`${API_BASE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      toast('Tarefa enviada!', 'success');
      resetForm();
      loadCards();
    }
  } catch (e) {
    toast('Erro de conexão', 'error');
  }
}

async function handleDelete(id, target) {
  if (!confirm(`Excluir agendamento para ${target}?`)) return;
  // Implementar DELETE no backend se necessário, ou apenas mudar status para 'cancelled'
  toast('Funcionalidade de exclusão em breve', 'info');
}

function toLocalISOString(date) {
  const tzo = -date.getTimezoneOffset(),
      dif = tzo >= 0 ? '+' : '-',
      pad = function(num) {
          return (num < 10 ? '0' : '') + num;
      };

  return date.getFullYear() +
      '-' + pad(date.getMonth() + 1) +
      '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) +
      ':' + pad(date.getMinutes()) +
      ':' + pad(date.getSeconds()) +
      dif + pad(Math.floor(Math.abs(tzo) / 60)) +
      ':' + pad(Math.abs(tzo) % 60);
}

function parseDateTime(dateStr, timeStr) {
  const [d, m, y] = dateStr.split('/');
  const [h, min] = timeStr.split(':');
  return new Date(y, m - 1, d, h, min);
}

function toast(msg, type='info') {
  const c  = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className=`toast ${type}`; el.textContent=msg; c.appendChild(el);
  setTimeout(()=>{ el.classList.add('fade-out'); setTimeout(()=>el.remove(),320); },3500);
}

function resetForm() {
  document.getElementById('target').value  = '';
  document.getElementById('message').value = '';
  setDateDefault();
}

function setupEditModeWatch() {}
