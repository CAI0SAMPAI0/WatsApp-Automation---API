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
var filePath = null;
var editFilePath = null;
var editTaskId = null;
var currentMode = 'text';
var wkResolve = null;
var cardStates = {};
var isDailyOn = false;
var isEditDailyOn = false;
var loteItems = [];
var isLoteDailyOn = false;
var loteFileModalIdx = null;
var calTargetId = null;
var calYear = 0;
var calMonth = 0;
var _pollingPaused = false;

function _anyModalOpen() {
  return !!document.querySelector('.modal-overlay.open');
}
function pausePolling() { _pollingPaused = true; }
function resumePolling() { _pollingPaused = false; loadCards(true); }

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', init);

function init() {
  // redireciona para login se não autenticado
  if (!isLoggedIn()) { window.location.href = 'login.html'; return; }

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
  setupFileInput();       // input file do browser (substitui selecionar_arquivo)
  refreshCount();
  loadCards(true);
  loadMyContacts();

  setInterval(() => {
    if (!_pollingPaused && !_anyModalOpen()) {
      loadCards();
      refreshCount();
    }
  }, 5000);   // 5s — mais frequente que o pywebview porque é web
}

/* ══════════════════════════════════════════
   AUTOCOMPLETE
══════════════════════════════════════════ */
var _acTimer = null;
var _acVisible = false;

function setupAutocomplete(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  // cria dropdown
  const drop = document.createElement('div');
  drop.id = inputId + '_ac';
  drop.className = 'ac-dropdown';
  input.parentNode.style.position = 'relative';
  input.parentNode.appendChild(drop);

  input.addEventListener('input', () => {
    clearTimeout(_acTimer);
    const q = input.value.trim();
    if (q.length < 1) { hideAc(drop); return; }
    _acTimer = setTimeout(() => fetchAc(q, input, drop), 300);
  });

  input.addEventListener('keydown', e => {
    if (!_acVisible) return;
    const items = drop.querySelectorAll('.ac-item');
    const active = drop.querySelector('.ac-item.active');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = active ? active.nextElementSibling : items[0];
      if (next) { active?.classList.remove('active'); next.classList.add('active'); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = active ? active.previousElementSibling : items[items.length - 1];
      if (prev) { active?.classList.remove('active'); prev.classList.add('active'); }
    } else if (e.key === 'Enter' && active) {
      e.preventDefault();
      input.value = active.dataset.label;
      input.dataset.resolvedValue = active.dataset.value;
      hideAc(drop);
    } else if (e.key === 'Escape') {
      hideAc(drop);
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => hideAc(drop), 150);
  });
}

async function fetchAc(q, input, drop) {
  const token = getToken();
  try {
    const r = await fetch(`${CONFIG.API_URL}/panel/contacts?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await r.json();
    renderAc(data, input, drop);
  } catch (e) { }
}

function renderAc(items, input, drop) {
  if (!items.length) { hideAc(drop); return; }
  drop.innerHTML = items.map(it => `
    <div class="ac-item" data-value="${esc(it.value)}" data-label="${esc(it.label)}">
      <span class="ac-tipo">${it.tipo === 'grupo' ? '👥' : '👤'}</span>
      <span class="ac-label">${esc(it.label)}</span>
    </div>
  `).join('');
  drop.querySelectorAll('.ac-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      input.value = el.dataset.label;
      input.dataset.resolvedValue = el.dataset.value;
      hideAc(drop);
    });
  });
  drop.style.display = 'block';
  _acVisible = true;
}

function hideAc(drop) {
  drop.style.display = 'none';
  _acVisible = false;
}

// ── logout ────────────────────────────────
function logout() {
  clearToken();
  window.location.href = 'login.html';
}

/* ══════════════════════════════════════════
   FILE INPUT (substitui pywebview dialog)
   Um <input type="file"> oculto no HTML
══════════════════════════════════════════ */
function setupFileInput() {
  // cria input file oculto se não existir
  if (!document.getElementById('_fileInput')) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.id = '_fileInput'; inp.multiple = true;
    inp.style.display = 'none';
    document.body.appendChild(inp);
  }
}

setupAutocomplete('target');

function openFilePicker(callback) {
  const inp = document.getElementById('_fileInput');
  inp.value = '';
  inp.onchange = () => {
    const files = Array.from(inp.files);
    if (!files.length) return;
    // no browser não temos o path real — usamos o nome
    const names = files.map(f => f.name).join(', ');
    const joined = files.map(f => f.name).join('\n');
    callback({ paths: files.map(f => f.name), joined, files });
  };
  inp.click();
}

/* ══════════════════════════════════════════
   DELEGAÇÃO DE CLIQUES NOS CARDS
══════════════════════════════════════════ */
function setupCardDelegation() {
  document.getElementById('cardList').addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id);
    const target = btn.dataset.target || '';
    const batchId = btn.dataset.batch || '';
    if (action === 'edit') openEdit(id);
    if (action === 'delete') handleDelete(id, target);
    if (action === 'retry') handleReenviar(id);
    if (action === 'edit-lote') openEditLote(batchId);
    if (action === 'delete-lote') handleDeleteLote(batchId, target);
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
  document.getElementById('form-lote').style.display = tab === 'lote' ? 'flex' : 'none';
}

/* ══════════════════════════════════════════
   UTILS
══════════════════════════════════════════ */
function pad(n) { return String(n).padStart(2, '0'); }

function setDateDefault() {
  const d = new Date();
  const m2 = d.getMinutes() + 2 > 59 ? d.getMinutes() : d.getMinutes() + 2;
  const today = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const hm = `${pad(d.getHours())}:${pad(m2)}`;
  ['dateInput', 'loteDateInput'].forEach(id => {
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
    let v = el.value.replace(/\D/g, '').slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + ':' + v.slice(2);
    el.value = v;
  });
}

function maskDate(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 4) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
  else if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
  el.value = v;
}

function updateFileLabel(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ══════════════════════════════════════════
   CALENDÁRIO POPUP
══════════════════════════════════════════ */
function openCal(inputId) {
  calTargetId = inputId;
  const el = document.getElementById(inputId);
  const popup = document.getElementById('calPopup');
  const parts = (el.value || '').split('/');
  const today = new Date();
  calYear = (parts[2] && parts[2].length === 4) ? parseInt(parts[2]) : today.getFullYear();
  calMonth = parts[1] ? parseInt(parts[1]) - 1 : today.getMonth();
  renderCal();
  const wrap = el.closest('.date-wrap') || el;
  const rect = wrap.getBoundingClientRect();
  const popH = 270;
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceAbove >= popH || spaceAbove > spaceBelow) {
    popup.style.top = Math.max(8, rect.top - popH - 6) + 'px';
  } else {
    popup.style.top = (rect.bottom + 6) + 'px';
  }
  popup.style.left = Math.min(rect.left, window.innerWidth - 248) + 'px';
  popup.classList.add('open');
  setTimeout(() => document.addEventListener('click', closeCal, { once: true }), 60);
}
function closeCal() { document.getElementById('calPopup').classList.remove('open'); calTargetId = null; }
function calMove(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCal(); event.stopPropagation();
}
function renderCal() {
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  document.getElementById('calTitle').textContent = `${months[calMonth]} ${calYear}`;
  const today = new Date();
  const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
  const startWd = new Date(calYear, calMonth, 1).getDay();
  const prevLast = new Date(calYear, calMonth, 0).getDate();
  const el = calTargetId ? document.getElementById(calTargetId) : null;
  const selParts = el ? el.value.split('/') : [];
  const selD = +selParts[0], selM = +selParts[1], selY = +selParts[2];
  let html = '';
  for (let i = startWd - 1; i >= 0; i--)
    html += `<div class="cal-day other-month">${prevLast - i}</div>`;
  for (let d = 1; d <= lastDay; d++) {
    const dt = new Date(calYear, calMonth, d);
    const todayDt = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isToday = dt.getTime() === todayDt.getTime();
    const isSel = d === selD && (calMonth + 1) === selM && calYear === selY;
    const isPast = dt < todayDt;
    let cls = 'cal-day' + (isToday ? ' today' : '') + (isSel ? ' selected' : '') + (isPast ? ' disabled' : '');
    const click = isPast ? '' : `onclick="pickCalDay(${d});event.stopPropagation();"`;
    html += `<div class="${cls}" ${click}>${d}</div>`;
  }
  const total = startWd + lastDay;
  const rem = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= rem; d++)
    html += `<div class="cal-day other-month">${d}</div>`;
  document.getElementById('calDays').innerHTML = html;
}
function pickCalDay(d) {
  if (!calTargetId) return;
  document.getElementById(calTargetId).value = `${pad(d)}/${pad(calMonth + 1)}/${calYear}`;
  closeCal();
}

/* ══════════════════════════════════════════
   TOGGLES
══════════════════════════════════════════ */
function toggleDaily() {
  isDailyOn = !isDailyOn;
  document.getElementById('dailyToggleUI').classList.toggle('on', isDailyOn);
  const di = document.getElementById('dateInput');
  di.disabled = isDailyOn; di.style.opacity = isDailyOn ? '.4' : '1';
  const btn = di.closest('.date-wrap')?.querySelector('.cal-btn');
  if (btn) btn.disabled = isDailyOn;
}
function toggleEditDaily() {
  isEditDailyOn = !isEditDailyOn;
  document.getElementById('editDailyToggleUI').classList.toggle('on', isEditDailyOn);
  const di = document.getElementById('editDate');
  di.disabled = isEditDailyOn; di.style.opacity = isEditDailyOn ? '.4' : '1';
}
function resetEditDaily() {
  isEditDailyOn = false;
  const ui = document.getElementById('editDailyToggleUI');
  if (ui) ui.classList.remove('on');
  const di = document.getElementById('editDate');
  if (di) { di.disabled = false; di.style.opacity = '1'; }
}
function toggleLoteDaily() {
  isLoteDailyOn = !isLoteDailyOn;
  document.getElementById('loteDailyUI').classList.toggle('on', isLoteDailyOn);
  const di = document.getElementById('loteDateInput');
  di.disabled = isLoteDailyOn; di.style.opacity = isLoteDailyOn ? '.4' : '1';
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
  document.getElementById('fileArea').addEventListener('click', () => {
    if (!document.getElementById('fileArea').classList.contains('disabled')) handleSelectFile();
  });
}
function applyMode(mode) {
  const msgField = document.getElementById('msg-field');
  const fileArea = document.getElementById('fileArea');
  if (mode === 'text') {
    msgField.style.display = '';
    fileArea.classList.add('disabled');
    filePath = null;
    updateFileLabel('fileLabel', 'Nenhum arquivo selecionado');
  } else if (mode === 'file') {
    msgField.style.display = 'none';
    fileArea.classList.remove('disabled');
  } else {
    msgField.style.display = '';
    fileArea.classList.remove('disabled');
  }
}

/* ══════════════════════════════════════════
   FILE SELECT (browser)
══════════════════════════════════════════ */
function handleSelectFile() {
  openFilePicker(r => {
    if (r.paths.length) {
      filePath = r.joined;
      updateFileLabel('fileLabel', r.paths.join(', '));
    }
  });
}
function handleEditFile() {
  openFilePicker(r => {
    if (r.paths.length) {
      editFilePath = r.joined;
      updateFileLabel('editFileLabel', r.paths.join(', '));
    }
  });
}

/* ══════════════════════════════════════════
   ENVIO SIMPLES — ENVIAR AGORA
══════════════════════════════════════════ */
async function handleEnviarAgora() {
  const input = document.getElementById('target');
  const target = input.dataset.resolvedValue || input.value.trim();
  const message = document.getElementById('message').value.trim();
  if (!validateFields(target, currentMode, message, filePath)) return;
  const btn = document.getElementById('btnEnviar');
  setLoading(btn, true);
  const r = await apiEnviarAgora({ target, mode: currentMode, message, file_path: filePath });
  setLoading(btn, false);
  if (r && r.ok) { refreshCount(); resetForm(); }
}

window.__onEnvioResult = function (payload) {
  setLoading(document.getElementById('btnEnviar'), false);
  if (payload.ok) { refreshCount(); toast('Task enviada ao agente!', 'success'); resetForm(); }
  else toast('Erro: ' + (payload.error || 'desconhecido'), 'error');
};

/* ══════════════════════════════════════════
   ENVIO SIMPLES — AGENDAR
══════════════════════════════════════════ */
async function handleAgendar() {
  const target = document.getElementById('target').value.trim();
  const message = document.getElementById('message').value.trim();
  const timeStr = document.getElementById('timeInput').value.trim();
  const dateVal = document.getElementById('dateInput').value;
  if (!validateFields(target, currentMode, message, filePath)) return;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr)) { toast('Hora inválida. Use HH:MM', 'error'); return; }
  let inclWk = true;
  if (isDailyOn) { inclWk = await askWeekends(); if (inclWk === null) return; }
  const btn = document.getElementById('btnAgendar');
  setLoading(btn, true);
  const r = await apiAgendar({
    target, mode: currentMode, message, file_path: filePath,
    date_str: isDailyOn ? '' : dateVal,
    time_str: timeStr, daily: isDailyOn, include_weekends: inclWk,
  });
  setLoading(btn, false);
  if (r && r.ok) { toast('Agendado!', 'success'); resetForm(); loadCards(true); }
}

/* ══════════════════════════════════════════
   LOTE
══════════════════════════════════════════ */
function previewLoteCards() {
  const targets = document.getElementById('loteTargets').value
    .split(',').map(t => t.trim()).filter(Boolean);
  loteItems = loteItems.filter(i => targets.includes(i.target));
  targets.forEach(t => {
    if (!loteItems.find(i => i.target === t))
      loteItems.push({ target: t, mode: 'text', message: '', filePath: null });
  });
  renderLoteCards();
}
function buildLoteCards() {
  previewLoteCards();
  if (!loteItems.length) { toast('Digite ao menos um destinatário', 'error'); return; }
  document.getElementById('loteBtns').style.display = 'flex';
}
function renderLoteCards() {
  const c = document.getElementById('loteCards');
  if (!loteItems.length) { c.innerHTML = ''; return; }
  c.innerHTML = loteItems.map((item, i) => `
<div class="lote-card">
  <div class="lote-card-header">
    <span class="lote-card-num">${i + 1}</span>
    <span class="lote-card-target">${esc(item.target)}</span>
    <button class="lote-card-remove" onclick="removeLoteItem(${i})">✕</button>
  </div>
  <div class="lote-card-body">
    <div class="lote-mode-pills">
      <div class="lote-pill ${item.mode === 'text' ? 'active' : ''}"      onclick="setLoteMode(${i},'text')">Texto</div>
      <div class="lote-pill ${item.mode === 'file' ? 'active' : ''}"      onclick="setLoteMode(${i},'file')">Arquivo</div>
      <div class="lote-pill ${item.mode === 'file_text' ? 'active' : ''}" onclick="setLoteMode(${i},'file_text')">Arq+Texto</div>
    </div>
    ${item.mode !== 'file' ? `<textarea class="lote-textarea" placeholder="Mensagem para ${esc(item.target)}..."
      oninput="loteItems[${i}].message=this.value">${esc(item.message)}</textarea>` : ''}
    ${item.mode !== 'text' ? `<div class="lote-file-row" onclick="openLoteFileModal(${i})">
      <span class="lote-file-icon">📎</span>
      <span class="lote-file-name">${item.filePath ? item.filePath.split('\\').pop().split('\n')[0] : 'Selecionar arquivo'}</span>
    </div>`: ''}
  </div>
</div>`).join('');
}
function removeLoteItem(i) { loteItems.splice(i, 1); renderLoteCards(); if (!loteItems.length) document.getElementById('loteBtns').style.display = 'none'; }
function setLoteMode(i, mode) { loteItems[i].mode = mode; if (mode === 'file') loteItems[i].message = ''; renderLoteCards(); }

function openLoteFileModal(i) {
  loteFileModalIdx = i;
  const item = loteItems[i];
  document.getElementById('modalLoteFileTitle').textContent = `Arquivo — ${item.target}`;
  document.getElementById('modalLoteFileContent').textContent = item.filePath ? `Atual: ${item.filePath}` : 'Nenhum arquivo selecionado';
  document.getElementById('modalLoteFile').classList.add('open');
}
function closeLoteFileModal() { document.getElementById('modalLoteFile').classList.remove('open'); loteFileModalIdx = null; }
function pickLoteFile() {
  openFilePicker(r => {
    if (r.paths.length && loteFileModalIdx !== null) {
      loteItems[loteFileModalIdx].filePath = r.joined;
      closeLoteFileModal(); renderLoteCards();
    }
  });
}
function clearLoteFile() { if (loteFileModalIdx !== null) loteItems[loteFileModalIdx].filePath = null; closeLoteFileModal(); renderLoteCards(); }

function validateLote() {
  for (let i = 0; i < loteItems.length; i++) {
    const item = loteItems[i];
    if (!item.target) { toast(`Item ${i + 1}: destinatário vazio`, 'error'); return false; }
    if (item.mode === 'text' && !item.message.trim()) { toast(`"${item.target}": escreva uma mensagem`, 'error'); return false; }
    if (item.mode === 'file' && !item.filePath) { toast(`"${item.target}": selecione um arquivo`, 'error'); return false; }
    if (item.mode === 'file_text' && (!item.filePath || !item.message.trim())) { toast(`"${item.target}": arquivo e mensagem obrigatórios`, 'error'); return false; }
  }
  return true;
}

async function handleEnviarLote() {
  if (!validateLote()) return;
  const btn = document.getElementById('btnEnviarLote');
  setLoading(btn, true);
  toast(`Enviando ${loteItems.length} task(s) ao agente...`, 'info');
  const r = await apiEnviarLote({ itens: loteItems });
  setLoading(btn, false);
}

window.__onLoteResult = function (payload) {
  refreshCount();
  if (payload.ok) { toast(`Lote criado: ${payload.total} task(s) enviadas ao agente!`, 'success'); resetLote(); }
  else toast(`Lote parcial: ${payload.ok_count}/${payload.total}.`, 'error');
  loadCards(true);
};

function handleAgendarLote() {
  if (!validateLote()) return;
  document.getElementById('loteBtns').style.display = 'none';
  const dt = document.getElementById('loteDt');
  dt.style.display = 'flex'; dt.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function cancelLoteAgendar() {
  document.getElementById('loteDt').style.display = 'none';
  document.getElementById('loteBtns').style.display = 'flex';
}
async function confirmarAgendarLote() {
  const timeStr = document.getElementById('loteTimeInput').value.trim();
  const dateVal = document.getElementById('loteDateInput').value;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr)) { toast('Hora inválida', 'error'); return; }
  let inclWk = true;
  if (isLoteDailyOn) { inclWk = await askWeekends(); if (inclWk === null) return; }
  const btn = document.getElementById('btnConfirmarLote');
  setLoading(btn, true);
  const r = await apiAgendarLote({
    itens: loteItems, date_str: isLoteDailyOn ? '' : dateVal,
    time_str: timeStr, daily: isLoteDailyOn, include_weekends: inclWk,
  });
  setLoading(btn, false);
  if (r && r.ok) { toast(`Lote agendado: ${r.count} task(s)!`, 'success'); resetLote(); loadCards(true); }
}
function resetLote() {
  loteItems = [];
  document.getElementById('loteTargets').value = '';
  document.getElementById('loteCards').innerHTML = '';
  document.getElementById('loteBtns').style.display = 'none';
  document.getElementById('loteDt').style.display = 'none';
  isLoteDailyOn = false;
  const ui = document.getElementById('loteDailyUI');
  if (ui) ui.classList.remove('on');
}

/* ══════════════════════════════════════════
   WEEKEND MODAL
══════════════════════════════════════════ */
function askWeekends() {
  return new Promise(res => { wkResolve = res; document.getElementById('modalWk').classList.add('open'); });
}
function resolveWk(v) { document.getElementById('modalWk').classList.remove('open'); if (wkResolve) { wkResolve(v); wkResolve = null; } }

/* ══════════════════════════════════════════
   CARDS DE AGENDAMENTOS
══════════════════════════════════════════ */
async function loadCards(force) {
  try {
    const r = await apiListarAgendamentos();
    const list = r.agendamentos || [];
    requestAnimationFrame(() => _applyCardDiff(list, force));
  } catch (e) { }
}

function _applyCardDiff(list, force) {
  const container = document.getElementById('cardList');
  if (!list.length) {
    if (!container.querySelector('.no-items')) {
      container.innerHTML = '<div class="no-items"><span class="ico">📭</span>Nenhum agendamento ainda</div>';
      container.dataset.lastKey = '';
    }
    return;
  }
  const ni = container.querySelector('.no-items');
  if (ni) ni.remove();
  const newKey = list.map(a => { const k = a.batch_id || String(a.id); return k + ':' + a.status; }).join('|');
  if (!force && container.dataset.lastKey === newKey) return;
  container.dataset.lastKey = newKey;
  const existingCards = new Map();
  container.querySelectorAll('[data-card-key]').forEach(el => existingCards.set(el.dataset.cardKey, el));
  const toInsert = [], toUpdate = [];
  const newKeys = new Set(list.map(a => String(a.batch_id || a.id)));
  list.forEach((a, idx) => {
    const key = String(a.batch_id || a.id);
    const el = existingCards.get(key);
    if (!el) toInsert.push({ idx, a, key });
    else toUpdate.push({ el, a });
  });
  existingCards.forEach((el, k) => { if (!newKeys.has(k)) el.remove(); });
  if (toInsert.length) {
    const snapshot = [...container.children].filter(c => !c.classList.contains('no-items'));
    toInsert.forEach(({ idx, a, key }) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = a.is_lote ? renderLoteCard(a) : renderCard(a);
      const newEl = tmp.firstElementChild;
      newEl.dataset.cardKey = key;
      const ref = snapshot[idx] || null;
      if (ref) container.insertBefore(newEl, ref);
      else container.appendChild(newEl);
    });
  }
  toUpdate.forEach(({ el, a }) => {
    const badge = el.querySelector('.card-badge-status');
    if (badge) {
      const nc = 'card-badge card-badge-status ' + statusBadgeClass(a.status);
      const nl = statusLabel(a.status);
      if (badge.className !== nc) badge.className = nc;
      if (badge.textContent !== nl) badge.textContent = nl;
    }
    const running = a.status === 'running';
    el.querySelectorAll('[data-action="edit"],[data-action="edit-lote"],[data-action="delete"],[data-action="delete-lote"]')
      .forEach(b => { if (b.disabled !== running) b.disabled = running; });
    const rb = el.querySelector('[data-action="retry"]');
    if (rb) { const show = a.status === 'failed' ? 'inline-flex' : 'none'; if (rb.style.display !== show) rb.style.display = show; }
  });
}

function renderCard(a) {
  const running = a.status === 'running';
  const failed = a.status === 'failed';
  return `<div class="card" data-id="${a.id}" data-target="${esc(a.target)}">
  <div class="card-top">
    <div>
      <div class="card-target">📱 ${esc(a.target)}</div>
      <div class="card-date">📅 ${esc(a.scheduled_time)} &nbsp;·&nbsp; ${modeLabel(a.mode)}</div>
    </div>
    <span class="card-badge card-badge-status ${statusBadgeClass(a.status)}">${statusLabel(a.status)}</span>
  </div>
  <div class="card-actions">
    <button class="card-btn card-btn-edit"  ${running ? 'disabled' : ''} data-action="edit"   data-id="${a.id}">✏ Editar</button>
    <button class="card-btn card-btn-retry" style="display:${failed ? 'inline-flex' : 'none'}" data-action="retry"  data-id="${a.id}">🔁 Reenviar</button>
    <button class="card-btn card-btn-del"   ${running ? 'disabled' : ''} data-action="delete" data-id="${a.id}" data-target="${esc(a.target)}">🗑 Excluir</button>
  </div>
</div>`;
}

function renderLoteCard(a) {
  const running = a.status === 'running';
  const itensHtml = (a.itens || []).map(item => `
    <div class="lote-item-row">
      <span class="lote-item-target">📱 ${esc(item.target)}</span>
      <span class="lote-item-mode">${modeLabel(item.mode)}</span>
      <span class="card-badge ${statusBadgeClass(item.status)}" style="font-size:9px">${statusLabel(item.status)}</span>
    </div>`).join('');
  return `<div class="card card-lote" data-batch="${esc(a.batch_id)}">
  <div class="card-top" onclick="toggleLoteCard(this)" style="cursor:pointer">
    <div>
      <div class="card-target">📦 ${esc(a.target)}</div>
      <div class="card-date">📅 ${esc(a.scheduled_time)} &nbsp;·&nbsp; ${a.count} destinatário(s)</div>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <span class="card-badge card-badge-status ${statusBadgeClass(a.status)}">${statusLabel(a.status)}</span>
      <span class="lote-chevron">▾</span>
    </div>
  </div>
  <div class="lote-items-body" style="display:none">${itensHtml}</div>
  <div class="card-actions">
    <button class="card-btn card-btn-edit"  ${running ? 'disabled' : ''} data-action="edit-lote"   data-batch="${esc(a.batch_id)}">✏ Editar lote</button>
    <button class="card-btn card-btn-del"   ${running ? 'disabled' : ''} data-action="delete-lote" data-batch="${esc(a.batch_id)}" data-target="${esc(a.target)}">🗑 Excluir lote</button>
  </div>
</div>`;
}

function toggleLoteCard(headerEl) {
  const body = headerEl.nextElementSibling;
  const chevron = headerEl.querySelector('.lote-chevron');
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  if (chevron) chevron.textContent = open ? '▴' : '▾';
}

function statusBadgeClass(s) { return { pending: 'badge-pending', running: 'badge-running', completed: 'badge-completed', failed: 'badge-failed', cancelled: 'badge-cancelled' }[s] || 'badge-pending'; }
function statusLabel(s) { return { pending: 'Pending', running: 'Sending', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' }[s] || s.toUpperCase(); }
function modeLabel(m) { return { text: 'Texto', file: 'Arquivo', file_text: 'Arq+Texto' }[m] || m; }

/* ══════════════════════════════════════════
   AÇÕES DOS CARDS
══════════════════════════════════════════ */
async function handleReenviar(id) {
  const r = await apiReenviarAgendamento(id);
  if (r && r.ok) { toast('Reenvio agendado!', 'info'); loadCards(true); }
}

async function handleDelete(id, target) {
  if (!confirm(`Excluir agendamento de "${target}"?`)) return;
  const r = await apiExcluirAgendamento(id);
  if (r && r.ok) { toast('Agendamento excluído', 'info'); loadCards(true); }
}

/* ══════════════════════════════════════════
   EDIT MODAL
══════════════════════════════════════════ */
async function openEdit(id) {
  pausePolling();
  const r = await apiObterAgendamento(id);
  if (!r || r.error) { resumePolling(); toast(r?.error || 'Erro', 'error'); return; }
  const a = r.agendamento;
  editTaskId = id; editFilePath = a.file_path || null;
  document.getElementById('editTarget').value = a.target || '';
  document.getElementById('editMessage').value = a.message || '';
  document.getElementById('editTime').value = a.time_str || '';
  document.getElementById('editDate').value = a.date_str || '';
  setCustomSelectValue('editModeSelect', a.mode || 'text');
  applyEditMode(a.mode || 'text');
  resetEditDaily();
  updateFileLabel('editFileLabel', editFilePath ? editFilePath : '—');
  document.getElementById('modalEdit').classList.add('open');
}
function setupEditModeWatch() { document.getElementById('editMode').addEventListener('change', e => applyEditMode(e.target.value)); }
function applyEditMode(mode) {
  document.getElementById('editMsgField').style.display = mode === 'file' ? 'none' : '';
  document.getElementById('editFileArea').style.display = mode === 'text' ? 'none' : '';
}
function closeEditModal() { document.getElementById('modalEdit').classList.remove('open'); resumePolling(); }

async function handleSalvarEdit() {
  const isDaily = isEditDailyOn;
  let inclWk = true;
  if (isDaily) { inclWk = await askWeekends(); if (inclWk === null) return; }
  const btn = document.getElementById('btnSalvarEdit');
  setLoading(btn, true);
  const r = await apiEditarAgendamento({
    task_id: editTaskId,
    target: document.getElementById('editTarget').value.trim(),
    mode: document.getElementById('editMode').value,
    message: document.getElementById('editMessage').value.trim(),
    file_path: editFilePath,
    date_str: document.getElementById('editDate').value.trim(),
    time_str: document.getElementById('editTime').value.trim(),
    daily: isDaily, include_weekends: inclWk,
  });
  setLoading(btn, false);
  if (r && r.ok) { toast('Agendamento atualizado!', 'success'); closeEditModal(); loadCards(true); }
}

/* ══════════════════════════════════════════
   CUSTOM SELECT
══════════════════════════════════════════ */
function toggleCustomSelect(id) {
  const el = document.getElementById(id);
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
  if (!isOpen) {
    el.classList.add('open');
    setTimeout(() => document.addEventListener('click', function handler(e) {
      if (!el.contains(e.target)) { el.classList.remove('open'); document.removeEventListener('click', handler); }
    }), 10);
  }
}
function pickCustomSelect(selectId, value, label) {
  const el = document.getElementById(selectId);
  el.querySelector('.cs-label').textContent = label;
  el.querySelectorAll('.cs-option').forEach(o => o.classList.toggle('active', o.dataset.value === value));
  el.classList.remove('open');
  const inputId = selectId.replace('Select', '');
  const input = document.getElementById(inputId);
  if (input) { input.value = value; input.dispatchEvent(new Event('change')); }
}
function setCustomSelectValue(selectId, value) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const opt = el.querySelector(`.cs-option[data-value="${value}"]`);
  if (opt) {
    el.querySelector('.cs-label').textContent = opt.textContent.trim();
    el.querySelectorAll('.cs-option').forEach(o => o.classList.toggle('active', o.dataset.value === value));
  }
  const input = document.getElementById(selectId.replace('Select', ''));
  if (input) input.value = value;
}

/* ══════════════════════════════════════════
   EXEC COUNT
══════════════════════════════════════════ */
async function refreshCount() {
  const r = await apiGetExecucoes();
  document.getElementById('execCount').textContent = r.count || 0;
}

/* ══════════════════════════════════════════
   EDIT LOTE
══════════════════════════════════════════ */
var editLoteBatchId = null, editLoteItens = [], isEditLoteDailyOn = false;

async function openEditLote(batchId) {
  pausePolling();
  const tasks = await GET("/panel/tasks");
  if (!tasks) { resumePolling(); return; }
  const itens = tasks.filter(t => t.batch_id === batchId);
  if (!itens.length) { resumePolling(); toast('Lote não encontrado', 'error'); return; }

  editLoteBatchId = batchId;
  editLoteItens = itens.map(t => ({
    target: t.target, mode: t.mode,
    message: t.message || '', file_path: t.file_path || null,
    id: t.id,
  }));

  const dt = new Date(itens[0].scheduled_time);
  document.getElementById('editLoteDate').value = `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  document.getElementById('editLoteTime').value = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  isEditLoteDailyOn = false;
  document.getElementById('editLoteDailyUI').classList.remove('on');
  renderEditLoteItens();
  document.getElementById('modalEditLote').classList.add('open');
}

function renderEditLoteItens() {
  const c = document.getElementById('editLoteItens');
  c.innerHTML = editLoteItens.map((item, i) => `
<div class="lote-card" style="margin-bottom:10px">
  <div class="lote-card-header">
    <span class="lote-card-num">${i + 1}</span>
    <span class="lote-card-target">${esc(item.target)}</span>
  </div>
  <div class="lote-card-body">
    <div class="lote-mode-pills">
      <div class="lote-pill ${item.mode === 'text' ? 'active' : ''}"      onclick="setEditLoteMode(${i},'text')">Texto</div>
      <div class="lote-pill ${item.mode === 'file' ? 'active' : ''}"      onclick="setEditLoteMode(${i},'file')">Arquivo</div>
      <div class="lote-pill ${item.mode === 'file_text' ? 'active' : ''}" onclick="setEditLoteMode(${i},'file_text')">Arq+Texto</div>
    </div>
    ${item.mode !== 'file' ? `<textarea class="lote-textarea" oninput="editLoteItens[${i}].message=this.value">${esc(item.message || '')}</textarea>` : ''}
    ${item.mode !== 'text' ? `<div class="lote-file-row" onclick="pickEditLoteFile(${i})">
      <span class="lote-file-icon">📎</span>
      <span>${item.file_path || 'Selecionar arquivo'}</span>
    </div>`: ''}
  </div>
</div>`).join('');
}

function setEditLoteMode(i, mode) { editLoteItens[i].mode = mode; if (mode === 'file') editLoteItens[i].message = ''; renderEditLoteItens(); }
function pickEditLoteFile(i) { openFilePicker(r => { if (r.paths.length) { editLoteItens[i].file_path = r.joined; renderEditLoteItens(); } }); }
function toggleEditLoteDaily() {
  isEditLoteDailyOn = !isEditLoteDailyOn;
  document.getElementById('editLoteDailyUI').classList.toggle('on', isEditLoteDailyOn);
  const di = document.getElementById('editLoteDate');
  di.disabled = isEditLoteDailyOn; di.style.opacity = isEditLoteDailyOn ? '.4' : '1';
}
function closeEditLoteModal() { document.getElementById('modalEditLote').classList.remove('open'); editLoteBatchId = null; editLoteItens = []; resumePolling(); }

async function handleSalvarEditLote() {
  const timeStr = document.getElementById('editLoteTime').value.trim();
  const dateVal = document.getElementById('editLoteDate').value.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr)) { toast('Hora inválida', 'error'); return; }
  let inclWk = true;
  if (isEditLoteDailyOn) { inclWk = await askWeekends(); if (inclWk === null) return; }

  const dt = parseDateTime(dateVal, timeStr, isEditLoteDailyOn);
  const btn = document.getElementById('btnSalvarEditLote');
  setLoading(btn, true);

  // atualiza cada task do lote
  const promises = editLoteItens.map(item =>
    PUT(`/panel/tasks/${item.id}`, {
      target: item.target, mode: item.mode,
      message: item.message || null, file_path: item.file_path || null,
      scheduled_time: dt.toISOString(),
      is_daily: isEditLoteDailyOn, include_weekends: inclWk,
    })
  );
  const results = await Promise.all(promises);
  setLoading(btn, false);

  if (results.some(Boolean)) { toast('Lote atualizado!', 'success'); closeEditLoteModal(); loadCards(true); }
  else toast('Falha ao atualizar lote', 'error');
}

async function handleDeleteLote(batchId, target) {
  if (!confirm(`Excluir lote "${target}"?`)) return;
  const tasks = await GET("/panel/tasks");
  if (!tasks) return;
  const ids = tasks.filter(t => t.batch_id === batchId).map(t => t.id);
  await Promise.all(ids.map(id => DELETE(`/panel/tasks/${id}`)));
  toast(`Lote excluído (${ids.length} itens)`, 'info');
  loadCards(true);
}

/* ══════════════════════════════════════════
   VALIDATION + RESET + HELPERS
══════════════════════════════════════════ */
function validateFields(target, mode, message, fp) {
  if (!target) { toast('Informe o contato', 'error'); return false; }
  if (mode === 'text' && !message) { toast('Escreva uma mensagem', 'error'); return false; }
  if (mode === 'file' && !fp) { toast('Selecione um arquivo', 'error'); return false; }
  if (mode === 'file_text' && (!fp || !message)) { toast('Arquivo e mensagem obrigatórios', 'error'); return false; }
  return true;
}

function resetForm() {
  document.getElementById('target').value = '';
  document.getElementById('message').value = '';
  filePath = null;
  updateFileLabel('fileLabel', 'Nenhum arquivo selecionado');
  document.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-mode="text"]').classList.add('active');
  currentMode = 'text'; applyMode('text'); setDateDefault();
  isDailyOn = false;
  document.getElementById('dailyToggleUI').classList.remove('on');
  const di = document.getElementById('dateInput');
  di.disabled = false; di.style.opacity = '1';
}

function setLoading(btn, on) { if (btn) { btn.disabled = on; btn.classList.toggle('loading', on); } }

function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg; c.appendChild(el);
  setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 320); }, 3500);
}

async function importContacts(input) {
  const file = input.files[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  const token = getToken();
  const r = await fetch(`${CONFIG.API_URL}/panel/my-contacts/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await r.json();
  if (data.ok) toast(`${data.imported} contatos importados!`, "success");
  else toast("Erro ao importar", "error");
  input.value = "";
}

/* ══════════════════════════════════════════
   CONTATOS
══════════════════════════════════════════ */
var _allContacts = [];

async function loadMyContacts() {
  const data = await GET("/panel/my-contacts");
  _allContacts = data || [];
  renderContacts(_allContacts);
}

function filterContacts(q) {
  const q_norm = q.toLowerCase().trim();
  const filtered = q_norm
    ? _allContacts.filter(c => c.name.toLowerCase().includes(q_norm) || c.phone.includes(q_norm))
    : _allContacts;
  renderContacts(filtered);
}

function renderContacts(list) {
  const el = document.getElementById('contactList');
  if (!list.length) {
    el.innerHTML = '<div class="no-items"><span class="ico">👥</span>Nenhum contato cadastrado</div>';
    return;
  }
  el.innerHTML = list.map(c => `
    <div class="card" style="display:flex;align-items:center;gap:10px;padding:12px 14px">
      <div style="flex:1">
        <div class="card-target">👤 ${esc(c.name)}</div>
        <div class="card-date">📱 ${esc(c.phone)}</div>
      </div>
      <button class="card-btn card-btn-edit" onclick="openEditContact(${c.id},'${esc(c.name)}','${esc(c.phone)}')">✏</button>
      <button class="card-btn card-btn-del" onclick="deleteContact(${c.id},'${esc(c.name)}')">🗑</button>
    </div>
  `).join('');
}

function openAddContact() {
  document.getElementById('contactModalTitle').textContent = 'Adicionar contato';
  document.getElementById('contactName').value = '';
  document.getElementById('contactPhone').value = '';
  document.getElementById('contactId').value = '';
  document.getElementById('modalContact').classList.add('open');
}

function openEditContact(id, name, phone) {
  document.getElementById('contactModalTitle').textContent = 'Editar contato';
  document.getElementById('contactName').value = name;
  document.getElementById('contactPhone').value = phone;
  document.getElementById('contactId').value = id;
  document.getElementById('modalContact').classList.add('open');
}

function closeContactModal() {
  document.getElementById('modalContact').classList.remove('open');
}

async function saveContact() {
  const id    = document.getElementById('contactId').value;
  const name  = document.getElementById('contactName').value.trim();
  const phone = document.getElementById('contactPhone').value.trim();
  if (!name || !phone) { toast('Preencha nome e número', 'error'); return; }
  const btn = document.getElementById('btnSaveContact');
  setLoading(btn, true);
  let r;
  if (id) {
    r = await PUT(`/panel/my-contacts/${id}`, { name, phone });
  } else {
    r = await POST('/panel/my-contacts', { name, phone });
  }
  setLoading(btn, false);
  if (r) { toast('Contato salvo!', 'success'); closeContactModal(); loadMyContacts(); }
}

async function deleteContact(id, name) {
  if (!confirm(`Excluir contato "${name}"?`)) return;
  const r = await DELETE(`/panel/my-contacts/${id}`);
  if (r) { toast('Contato excluído', 'info'); loadMyContacts(); }
}

async function importContacts(input) {
  const file = input.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  const token = getToken();
  const r = await fetch(`${CONFIG.API_URL}/panel/my-contacts/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await r.json();
  if (data.ok) { toast(`${data.imported} contatos importados!`, 'success'); loadMyContacts(); }
  else toast('Erro ao importar', 'error');
  input.value = '';
}