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
var filePath        = null;
var editFilePath    = null;
var editTaskId      = null;
var currentMode     = 'text';
var wkResolve       = null;
var cardStates      = {};
var isDailyOn       = false;
var isEditDailyOn   = false;
var loteItems       = [];
var isLoteDailyOn   = false;
var loteFileModalIdx = null;
var calTargetId     = null;
var calYear         = 0;
var calMonth        = 0;

/* ══════════════════════════════════════════
   CORREÇÃO BUG 1: controle de polling
   O polling é pausado quando qualquer modal está aberto.
   Isso impede que loadCards() destrua o DOM durante edição.
══════════════════════════════════════════ */
var _pollingPaused = false;

function _anyModalOpen() {
  return !!document.querySelector('.modal-overlay.open');
}

function pausePolling() {
  _pollingPaused = true;
}

function resumePolling() {
  _pollingPaused = false;
  // força refresh imediato ao fechar o modal
  loadCards(true);
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
window.addEventListener('pywebviewready', init);
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
  refreshCount();
  loadCards(true);
  // 3s é suficiente para status em tempo real e elimina o piscar do Qt WebEngine
  // que re-renderiza a cada escrita de DOM com intervalo curto
  setInterval(() => {
    if (!_pollingPaused && !_anyModalOpen()) {
      loadCards();
      refreshCount();
    }
  }, 3000);
}

/* ── delegação de cliques nos cards ── */
function setupCardDelegation() {
  document.getElementById('cardList').addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const action  = btn.dataset.action;
    const id      = parseInt(btn.dataset.id);
    const target  = btn.dataset.target || '';
    const batchId = btn.dataset.batch || '';
    if (action === 'edit')        openEdit(id);
    if (action === 'delete')      handleDelete(id, target);
    if (action === 'retry')       handleReenviar(id);
    if (action === 'edit-lote')   openEditLote(batchId);
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
  const popH  = 270;
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;

  if (spaceAbove >= popH || spaceAbove > spaceBelow) {
    popup.style.top  = Math.max(8, rect.top - popH - 6) + 'px';
  } else {
    popup.style.top  = (rect.bottom + 6) + 'px';
  }
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
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('calTitle').textContent = `${months[calMonth]} ${calYear}`;

  const today   = new Date();
  const lastDay = new Date(calYear, calMonth+1, 0).getDate();
  const startWd = new Date(calYear, calMonth, 1).getDay();
  const prevLast= new Date(calYear, calMonth, 0).getDate();

  const el       = calTargetId ? document.getElementById(calTargetId) : null;
  const selParts = el ? el.value.split('/') : [];
  const selD = +selParts[0], selM = +selParts[1], selY = +selParts[2];

  let html = '';
  for (let i = startWd-1; i >= 0; i--)
    html += `<div class="cal-day other-month">${prevLast-i}</div>`;

  for (let d = 1; d <= lastDay; d++) {
    const dt      = new Date(calYear, calMonth, d);
    const todayDt = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isToday = dt.getTime() === todayDt.getTime();
    const isSel   = d===selD && (calMonth+1)===selM && calYear===selY;
    const isPast  = dt < todayDt;
    let cls = 'cal-day' + (isToday?' today':'') + (isSel?' selected':'') + (isPast?' disabled':'');
    const click = isPast ? '' : `onclick="pickCalDay(${d});event.stopPropagation();"`;
    html += `<div class="${cls}" ${click}>${d}</div>`;
  }

  const total = startWd + lastDay;
  const rem   = total%7===0 ? 0 : 7-(total%7);
  for (let d = 1; d <= rem; d++)
    html += `<div class="cal-day other-month">${d}</div>`;

  document.getElementById('calDays').innerHTML = html;
}

function pickCalDay(d) {
  if (!calTargetId) return;
  document.getElementById(calTargetId).value =
    `${pad(d)}/${pad(calMonth+1)}/${calYear}`;
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
    updateFileLabel('fileLabel','Nenhum arquivo selecionado');
  } else if (mode === 'file') {
    msgField.style.display = 'none';
    fileArea.classList.remove('disabled');
  } else {
    msgField.style.display = '';
    fileArea.classList.remove('disabled');
  }
}

/* ══════════════════════════════════════════
   FILE SELECT
══════════════════════════════════════════ */
async function handleSelectFile() {
  const r = await pywebview.api.selecionar_arquivo();
  if (r.paths && r.paths.length) {
    filePath = r.joined;
    updateFileLabel('fileLabel', r.paths.map(p=>p.split('\\').pop()).join(', '));
  }
}
async function handleEditFile() {
  const r = await pywebview.api.selecionar_arquivo();
  if (r.paths && r.paths.length) {
    editFilePath = r.joined;
    updateFileLabel('editFileLabel', r.paths.map(p=>p.split('\\').pop()).join(', '));
  }
}

/* ══════════════════════════════════════════
   ENVIO SIMPLES — ENVIAR AGORA
══════════════════════════════════════════ */
async function handleEnviarAgora() {
  const target  = document.getElementById('target').value.trim();
  const message = document.getElementById('message').value.trim();
  if (!validateFields(target, currentMode, message, filePath)) return;
  const btn = document.getElementById('btnEnviar');
  setLoading(btn, true);
  const r = await pywebview.api.enviar_agora({ target, mode: currentMode, message, file_path: filePath });
  if (r.error) { setLoading(btn,false); toast(r.error,'error'); return; }
  toast('Enviando... aguarde.','info');
}

window.__onEnvioResult = function(payload) {
  setLoading(document.getElementById('btnEnviar'), false);
  if (payload.ok) {
    refreshCount();
    toast('Mensagem enviada com sucesso!','success');
    resetForm();
  } else {
    toast('Erro: '+(payload.error||'desconhecido'),'error');
  }
};

/* ══════════════════════════════════════════
   ENVIO SIMPLES — AGENDAR
══════════════════════════════════════════ */
async function handleAgendar() {
  const target  = document.getElementById('target').value.trim();
  const message = document.getElementById('message').value.trim();
  const timeStr = document.getElementById('timeInput').value.trim();
  const isDaily = isDailyOn;
  const dateVal = document.getElementById('dateInput').value;
  if (!validateFields(target, currentMode, message, filePath)) return;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr)) { toast('Hora inválida. Use HH:MM','error'); return; }
  let inclWk = true;
  if (isDaily) { inclWk = await askWeekends(); if(inclWk===null) return; }
  const btn = document.getElementById('btnAgendar');
  setLoading(btn, true);
  const r = await pywebview.api.agendar({
    target, mode: currentMode, message, file_path: filePath,
    date_str: isDaily ? '' : dateVal,
    time_str: timeStr, daily: isDaily, include_weekends: inclWk,
  });
  setLoading(btn, false);
  if (r.error) { toast(r.error,'error'); return; }
  toast('Agendado!','success');
  resetForm(); loadCards(true);
}

/* ══════════════════════════════════════════
   LOTE — CARDS
══════════════════════════════════════════ */
function previewLoteCards() {
  const targets = document.getElementById('loteTargets').value
    .split(',').map(t=>t.trim()).filter(Boolean);
  loteItems = loteItems.filter(i => targets.includes(i.target));
  targets.forEach(t => {
    if (!loteItems.find(i=>i.target===t))
      loteItems.push({ target:t, mode:'text', message:'', filePath:null });
  });
  renderLoteCards();
}

function buildLoteCards() {
  previewLoteCards();
  if (!loteItems.length) { toast('Digite ao menos um destinatário','error'); return; }
  document.getElementById('loteBtns').style.display = 'flex';
}

function renderLoteCards() {
  const c = document.getElementById('loteCards');
  if (!loteItems.length) { c.innerHTML=''; return; }
  c.innerHTML = loteItems.map((item,i) => `
<div class="lote-card">
  <div class="lote-card-header">
    <span class="lote-card-num">${i+1}</span>
    <span class="lote-card-target">${esc(item.target)}</span>
    <button class="lote-card-remove" onclick="removeLoteItem(${i})">✕</button>
  </div>
  <div class="lote-card-body">
    <div class="lote-mode-pills">
      <div class="lote-pill ${item.mode==='text'?'active':''}"      onclick="setLoteMode(${i},'text')">Texto</div>
      <div class="lote-pill ${item.mode==='file'?'active':''}"      onclick="setLoteMode(${i},'file')">Arquivo</div>
      <div class="lote-pill ${item.mode==='file_text'?'active':''}" onclick="setLoteMode(${i},'file_text')">Arq+Texto</div>
    </div>
    ${item.mode!=='file'?`<textarea class="lote-textarea" placeholder="Mensagem para ${esc(item.target)}..."
      oninput="loteItems[${i}].message=this.value">${esc(item.message)}</textarea>`:''}
    ${item.mode!=='text'?`<div class="lote-file-row" onclick="openLoteFileModal(${i})">
      <span class="lote-file-icon">📎</span>
      <span class="lote-file-name">${item.filePath?item.filePath.split('\\').pop().split('\n')[0]:'Selecionar arquivo'}</span>
    </div>`:''}
  </div>
</div>`).join('');
}

function removeLoteItem(i) {
  loteItems.splice(i,1);
  renderLoteCards();
  if (!loteItems.length) document.getElementById('loteBtns').style.display='none';
}
function setLoteMode(i,mode) {
  loteItems[i].mode=mode;
  if (mode==='file') loteItems[i].message='';
  renderLoteCards();
}

/* ══════════════════════════════════════════
   LOTE — ARQUIVO MODAL
══════════════════════════════════════════ */
function openLoteFileModal(i) {
  loteFileModalIdx = i;
  const item = loteItems[i];
  document.getElementById('modalLoteFileTitle').textContent = `Arquivo — ${item.target}`;
  document.getElementById('modalLoteFileContent').textContent =
    item.filePath ? `Atual: ${item.filePath.split('\\').pop()}` : 'Nenhum arquivo selecionado';
  document.getElementById('modalLoteFile').classList.add('open');
}
function closeLoteFileModal() {
  document.getElementById('modalLoteFile').classList.remove('open');
  loteFileModalIdx = null;
}
async function pickLoteFile() {
  const r = await pywebview.api.selecionar_arquivo();
  if (r.paths && r.paths.length && loteFileModalIdx !== null) {
    loteItems[loteFileModalIdx].filePath = r.joined;
    closeLoteFileModal(); renderLoteCards();
  }
}
function clearLoteFile() {
  if (loteFileModalIdx !== null) loteItems[loteFileModalIdx].filePath = null;
  closeLoteFileModal(); renderLoteCards();
}

/* ══════════════════════════════════════════
   LOTE — VALIDAÇÃO
══════════════════════════════════════════ */
function validateLote() {
  for (let i=0; i<loteItems.length; i++) {
    const item = loteItems[i];
    if (!item.target) { toast(`Item ${i+1}: destinatário vazio`,'error'); return false; }
    if (item.mode==='text'     && !item.message.trim()) { toast(`"${item.target}": escreva uma mensagem`,'error'); return false; }
    if (item.mode==='file'     && !item.filePath)        { toast(`"${item.target}": selecione um arquivo`,'error'); return false; }
    if (item.mode==='file_text'&& (!item.filePath||!item.message.trim())) { toast(`"${item.target}": arquivo e mensagem obrigatórios`,'error'); return false; }
  }
  return true;
}

/* ══════════════════════════════════════════
   LOTE — ENVIAR AGORA
══════════════════════════════════════════ */
async function handleEnviarLote() {
  if (!validateLote()) return;
  const btn = document.getElementById('btnEnviarLote');
  setLoading(btn, true);
  toast(`Enviando para ${loteItems.length} destinatário(s)...`,'info');
  const r = await pywebview.api.enviar_lote({ itens: loteItems });
  if (r.error) { setLoading(btn,false); toast(r.error,'error'); return; }
}

window.__onLoteResult = function(payload) {
  setLoading(document.getElementById('btnEnviarLote'), false);
  refreshCount();
  if (payload.ok) {
    toast(`Lote concluído: ${payload.total} enviado(s)!`,'success');
    resetLote();
  } else {
    toast(`Lote parcial: ${payload.ok_count}/${payload.total} enviados.`,'error');
  }
  loadCards(true);
};

window.__onLoteProgress = function(payload) {
  refreshCount();
  toast(`✓ Enviado para "${payload.target}" (${payload.ok_count}/${payload.total})`,'info');
};

/* ══════════════════════════════════════════
   LOTE — AGENDAR
══════════════════════════════════════════ */
function handleAgendarLote() {
  if (!validateLote()) return;
  document.getElementById('loteBtns').style.display = 'none';
  const dt = document.getElementById('loteDt');
  dt.style.display = 'flex';
  dt.scrollIntoView({ behavior:'smooth', block:'start' });
}
function cancelLoteAgendar() {
  document.getElementById('loteDt').style.display = 'none';
  document.getElementById('loteBtns').style.display = 'flex';
}
async function confirmarAgendarLote() {
  const timeStr = document.getElementById('loteTimeInput').value.trim();
  const dateVal = document.getElementById('loteDateInput').value;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr)) { toast('Hora inválida','error'); return; }
  let inclWk = true;
  if (isLoteDailyOn) { inclWk = await askWeekends(); if(inclWk===null) return; }
  const btn = document.getElementById('btnConfirmarLote');
  setLoading(btn, true);
  const r = await pywebview.api.agendar_lote({
    itens: loteItems,
    date_str: isLoteDailyOn ? '' : dateVal,
    time_str: timeStr,
    daily: isLoteDailyOn,
    include_weekends: inclWk,
  });
  setLoading(btn, false);
  if (r.error) { toast(r.error,'error'); return; }
  toast(`Lote agendado: ${r.count} tarefa(s) criada(s)!`,'success');
  resetLote(); loadCards(true);
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
  return new Promise(res => {
    wkResolve = res;
    document.getElementById('modalWk').classList.add('open');
  });
}
function resolveWk(v) {
  document.getElementById('modalWk').classList.remove('open');
  if (wkResolve) { wkResolve(v); wkResolve=null; }
}

/* ══════════════════════════════════════════
   CARDS DE AGENDAMENTOS
   CORREÇÃO BUG 1: diff cirúrgico real.
   - Nunca recria um card existente — só atualiza badge e botões via DOM cirúrgico
   - Cards são identificados por data-id ou data-batch (nunca pelo índice)
   - Reordenação só acontece se a ordem mudou de fato
══════════════════════════════════════════ */
async function loadCards(force) {
  try {
    const r    = await pywebview.api.listar_agendamentos();
    const list = r.agendamentos || [];

    // toda escrita de DOM acontece num único frame — elimina repaints parciais
    requestAnimationFrame(() => _applyCardDiff(list, force));

  } catch(e) {
    // silencioso
  }
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

  // chave cobre: existência + status + botão retry
  // NÃO inclui scheduled_time nem target — eles não mudam após criação
  const newKey = list.map(a => {
    const k = a.batch_id || String(a.id);
    return k + ':' + a.status;
  }).join('|');

  if (!force && container.dataset.lastKey === newKey) return;
  container.dataset.lastKey = newKey;

  // índice dos cards existentes
  const existingCards = new Map();
  container.querySelectorAll('[data-card-key]').forEach(el => {
    existingCards.set(el.dataset.cardKey, el);
  });

  // determina o que precisa ser feito ANTES de tocar no DOM
  const toInsert = [];   // { idx, a, key }
  const toUpdate = [];   // { existing, a }
  const newKeys  = new Set(list.map(a => String(a.batch_id || a.id)));

  list.forEach((a, idx) => {
    const key = String(a.batch_id || a.id);
    const el  = existingCards.get(key);
    if (!el) toInsert.push({ idx, a, key });
    else     toUpdate.push({ el, a });
  });

  // 1. remove os que sumiram (uma única passagem)
  existingCards.forEach((el, k) => { if (!newKeys.has(k)) el.remove(); });

  // 2. insere novos (snapshot do container APÓS remoções, ANTES das inserções)
  if (toInsert.length) {
    const snapshot = [...container.children].filter(c => !c.classList.contains('no-items'));
    toInsert.forEach(({ idx, a, key }) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = a.is_lote ? renderLoteCard(a) : renderCard(a);
      const newEl = tmp.firstElementChild;
      newEl.dataset.cardKey = key;
      const ref = snapshot[idx] || null;
      if (ref) container.insertBefore(newEl, ref);
      else     container.appendChild(newEl);
    });
  }

  // 3. atualiza apenas o que mudou nos cards existentes (sem tocar no resto do DOM)
  toUpdate.forEach(({ el, a }) => {
    // badge principal
    const badge = el.querySelector('.card-badge-status');
    if (badge) {
      const nc = 'card-badge card-badge-status ' + statusBadgeClass(a.status);
      const nl = statusLabel(a.status);
      if (badge.className   !== nc) badge.className   = nc;
      if (badge.textContent !== nl) badge.textContent = nl;
    }

    // badges dos itens do lote
    if (a.is_lote && a.itens) {
      el.querySelectorAll('.lote-item-row').forEach((row, i) => {
        const b = row.querySelector('.card-badge');
        if (!b || !a.itens[i]) return;
        const nc = 'card-badge ' + statusBadgeClass(a.itens[i].status);
        const nl = statusLabel(a.itens[i].status);
        if (b.className   !== nc) b.className   = nc;
        if (b.textContent !== nl) b.textContent = nl;
      });
    }

    // botões — só escreve se o valor mudou
    const running = a.status === 'running';
    el.querySelectorAll('[data-action="edit"],[data-action="edit-lote"],[data-action="delete"],[data-action="delete-lote"]')
      .forEach(b => { if (b.disabled !== running) b.disabled = running; });

    const rb = el.querySelector('[data-action="retry"]');
    if (rb) {
      const show = a.status === 'failed' ? 'inline-flex' : 'none';
      if (rb.style.display !== show) rb.style.display = show;
    }
  });
}

function renderCard(a) {
  const running = a.status === 'running';
  const failed  = a.status === 'failed';
  return `<div class="card" data-id="${a.id}" data-target="${esc(a.target)}">
  <div class="card-top">
    <div>
      <div class="card-target">📱 ${esc(a.target)}</div>
      <div class="card-date">📅 ${esc(a.scheduled_time)} &nbsp;·&nbsp; ${modeLabel(a.mode)}</div>
    </div>
    <span class="card-badge card-badge-status ${statusBadgeClass(a.status)}">${statusLabel(a.status)}</span>
  </div>
  <div class="card-actions">
    <button class="card-btn card-btn-edit"  ${running?'disabled':''} data-action="edit"   data-id="${a.id}">✏ Editar</button>
    <button class="card-btn card-btn-retry" style="display:${failed?'inline-flex':'none'}" data-action="retry"  data-id="${a.id}">🔁 Reenviar</button>
    <button class="card-btn card-btn-del"   ${running?'disabled':''} data-action="delete" data-id="${a.id}" data-target="${esc(a.target)}">🗑 Excluir</button>
  </div>
</div>`;
}

function renderLoteCard(a) {
  const running = a.status === 'running';
  const itensHtml = (a.itens||[]).map(item => `
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
  <div class="lote-items-body" style="display:none">
    ${itensHtml}
  </div>
  <div class="card-actions">
    <button class="card-btn card-btn-edit"  ${running?'disabled':''} data-action="edit-lote"   data-batch="${esc(a.batch_id)}">✏ Editar lote</button>
    <button class="card-btn card-btn-del"   ${running?'disabled':''} data-action="delete-lote" data-batch="${esc(a.batch_id)}" data-target="${esc(a.target)}">🗑 Excluir lote</button>
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

function statusBadgeClass(s) {
  return {pending:'badge-pending',running:'badge-running',completed:'badge-completed',failed:'badge-failed',cancelled:'badge-cancelled'}[s]||'badge-pending';
}
function statusLabel(s) {
  return {pending:'Pending',running:'Sending',completed:'Completed',failed:'Failed',cancelled:'Cancelled'}[s]||s.toUpperCase();
}
function modeLabel(m) { return {text:'Texto',file:'Arquivo',file_text:'Arq+Texto'}[m]||m; }

/* ══════════════════════════════════════════
   REENVIAR
══════════════════════════════════════════ */
async function handleReenviar(id) {
  const r = await pywebview.api.reenviar_agendamento(id);
  if (r.error) { toast(r.error,'error'); return; }
  toast('Reenvio iniciado!','info');
  loadCards(true);
}

/* ══════════════════════════════════════════
   DELETE
══════════════════════════════════════════ */
async function handleDelete(id, target) {
  if (!confirm(`Excluir agendamento de "${target}"?`)) return;
  const r = await pywebview.api.excluir_agendamento(id);
  if (r.error) { toast(r.error,'error'); return; }
  toast('Agendamento excluído','info');
  loadCards(true);
}

/* ══════════════════════════════════════════
   EDIT MODAL
   CORREÇÃO: pausePolling() ao abrir, resumePolling() ao fechar
══════════════════════════════════════════ */
async function openEdit(id) {
  pausePolling();   // CORREÇÃO: suspende o polling enquanto modal está aberto
  const r = await pywebview.api.obter_agendamento(id);
  if (r.error) { resumePolling(); toast(r.error,'error'); return; }
  const a = r.agendamento;
  editTaskId=id; editFilePath=a.file_path||null;
  document.getElementById('editTarget').value  = a.target||'';
  document.getElementById('editMessage').value = a.message||'';
  document.getElementById('editTime').value    = a.time_str||'';
  document.getElementById('editDate').value    = a.date_str||'';
  setCustomSelectValue('editModeSelect', a.mode||'text');
  applyEditMode(a.mode||'text');
  resetEditDaily();
  updateFileLabel('editFileLabel', editFilePath ? editFilePath.split('\n').length+' arquivo(s)' : '—');
  document.getElementById('modalEdit').classList.add('open');
}
function setupEditModeWatch() {
  document.getElementById('editMode').addEventListener('change', e=>applyEditMode(e.target.value));
}
function applyEditMode(mode) {
  document.getElementById('editMsgField').style.display  = mode==='file'?'none':'';
  document.getElementById('editFileArea').style.display  = mode==='text'?'none':'';
}
function closeEditModal() {
  document.getElementById('modalEdit').classList.remove('open');
  resumePolling();  // CORREÇÃO: retoma polling e força refresh
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
  const inputId = selectId.replace('Select','');
  const input   = document.getElementById(inputId);
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
  const input = document.getElementById(selectId.replace('Select',''));
  if (input) input.value = value;
}

async function handleSalvarEdit() {
  const isDaily = isEditDailyOn;
  let inclWk = true;
  if (isDaily) { inclWk = await askWeekends(); if(inclWk===null) return; }
  const btn = document.getElementById('btnSalvarEdit');
  setLoading(btn, true);
  const r = await pywebview.api.editar_agendamento({
    task_id:  editTaskId,
    target:   document.getElementById('editTarget').value.trim(),
    mode:     document.getElementById('editMode').value,
    message:  document.getElementById('editMessage').value.trim(),
    file_path: editFilePath,
    date_str:  document.getElementById('editDate').value.trim(),
    time_str:  document.getElementById('editTime').value.trim(),
    daily: isDaily, include_weekends: inclWk,
  });
  setLoading(btn, false);
  if (r.error) { toast(r.error,'error'); return; }
  toast('Agendamento atualizado!','success');
  closeEditModal();   // já chama resumePolling()
  loadCards(true);
}

/* ══════════════════════════════════════════
   EXEC COUNT
══════════════════════════════════════════ */
async function refreshCount() {
  const r = await pywebview.api.get_execucoes();
  document.getElementById('execCount').textContent = r.count||0;
}

/* ══════════════════════════════════════════
   VALIDATION
══════════════════════════════════════════ */
function validateFields(target, mode, message, fp) {
  if (!target)                                { toast('Informe o contato','error');                           return false; }
  if (mode==='text'      && !message)         { toast('Escreva uma mensagem','error');                        return false; }
  if (mode==='file'      && !fp)              { toast('Selecione um arquivo','error');                        return false; }
  if (mode==='file_text' && (!fp||!message))  { toast('Arquivo e mensagem obrigatórios','error');             return false; }
  return true;
}

/* ══════════════════════════════════════════
   RESET FORM
══════════════════════════════════════════ */
function resetForm() {
  document.getElementById('target').value  = '';
  document.getElementById('message').value = '';
  filePath = null;
  updateFileLabel('fileLabel','Nenhum arquivo selecionado');
  document.querySelectorAll('.mode-pill').forEach(p=>p.classList.remove('active'));
  document.querySelector('[data-mode="text"]').classList.add('active');
  currentMode='text'; applyMode('text'); setDateDefault();
  isDailyOn = false;
  document.getElementById('dailyToggleUI').classList.remove('on');
  const di = document.getElementById('dateInput');
  di.disabled=false; di.style.opacity='1';
}

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function setLoading(btn, on) { if(btn){ btn.disabled=on; btn.classList.toggle('loading',on); } }

function toast(msg, type='info') {
  const c  = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className=`toast ${type}`; el.textContent=msg; c.appendChild(el);
  setTimeout(()=>{ el.classList.add('fade-out'); setTimeout(()=>el.remove(),320); },3500);
}

/* ══════════════════════════════════════════
   EDITAR / EXCLUIR LOTE
   CORREÇÃO: pausePolling() ao abrir, resumePolling() ao fechar
══════════════════════════════════════════ */
var editLoteBatchId  = null;
var editLoteItens    = [];
var isEditLoteDailyOn = false;

async function openEditLote(batchId) {
  pausePolling();   // CORREÇÃO
  const r = await pywebview.api.obter_lote(batchId);
  if (r.error) { resumePolling(); toast(r.error, 'error'); return; }
  editLoteBatchId = batchId;
  editLoteItens   = r.itens;

  document.getElementById('editLoteDate').value = r.date_str || '';
  document.getElementById('editLoteTime').value = r.time_str || '';
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
    <span class="lote-card-num">${i+1}</span>
    <span class="lote-card-target">${esc(item.target)}</span>
  </div>
  <div class="lote-card-body">
    <div class="lote-mode-pills">
      <div class="lote-pill ${item.mode==='text'?'active':''}"      onclick="setEditLoteMode(${i},'text')">Texto</div>
      <div class="lote-pill ${item.mode==='file'?'active':''}"      onclick="setEditLoteMode(${i},'file')">Arquivo</div>
      <div class="lote-pill ${item.mode==='file_text'?'active':''}" onclick="setEditLoteMode(${i},'file_text')">Arq+Texto</div>
    </div>
    ${item.mode!=='file'?`<textarea class="lote-textarea" placeholder="Mensagem..."
      oninput="editLoteItens[${i}].message=this.value">${esc(item.message||'')}</textarea>`:''}
    ${item.mode!=='text'?`<div class="lote-file-row" onclick="pickEditLoteFile(${i})">
      <span class="lote-file-icon">📎</span>
      <span class="lote-file-name">${item.file_path?item.file_path.split('\\').pop():'Selecionar arquivo'}</span>
    </div>`:''}
  </div>
</div>`).join('');
}

function setEditLoteMode(i, mode) {
  editLoteItens[i].mode = mode;
  if (mode === 'file') editLoteItens[i].message = '';
  renderEditLoteItens();
}

async function pickEditLoteFile(i) {
  const r = await pywebview.api.selecionar_arquivo();
  if (r.paths && r.paths.length) {
    editLoteItens[i].file_path = r.joined;
    renderEditLoteItens();
  }
}

function toggleEditLoteDaily() {
  isEditLoteDailyOn = !isEditLoteDailyOn;
  document.getElementById('editLoteDailyUI').classList.toggle('on', isEditLoteDailyOn);
  const di = document.getElementById('editLoteDate');
  di.disabled = isEditLoteDailyOn; di.style.opacity = isEditLoteDailyOn ? '.4' : '1';
}

function closeEditLoteModal() {
  document.getElementById('modalEditLote').classList.remove('open');
  editLoteBatchId = null; editLoteItens = [];
  resumePolling();   // CORREÇÃO
}

async function handleSalvarEditLote() {
  const timeStr = document.getElementById('editLoteTime').value.trim();
  const dateVal = document.getElementById('editLoteDate').value.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr)) { toast('Hora inválida','error'); return; }
  let inclWk = true;
  if (isEditLoteDailyOn) { inclWk = await askWeekends(); if(inclWk===null) return; }
  const btn = document.getElementById('btnSalvarEditLote');
  setLoading(btn, true);
  const r = await pywebview.api.editar_lote({
    batch_id: editLoteBatchId,
    itens:    editLoteItens,
    date_str: dateVal,
    time_str: timeStr,
    daily:    isEditLoteDailyOn,
    include_weekends: inclWk,
  });
  setLoading(btn, false);
  if (r.error) { toast(r.error,'error'); return; }
  toast('Lote atualizado!','success');
  closeEditLoteModal();   // já chama resumePolling()
  loadCards(true);
}

async function handleDeleteLote(batchId, target) {
  if (!confirm(`Excluir lote "${target}"?`)) return;
  const r = await pywebview.api.excluir_lote(batchId);
  if (r.error) { toast(r.error,'error'); return; }
  toast(`Lote excluído (${r.count} itens)`,'info');
  loadCards(true);
}