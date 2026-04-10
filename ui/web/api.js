/* ══════════════════════════════════════════
   api.js — camada de comunicação com o backend
   CORREÇÕES:
   - Upload real de arquivo (base64 via /panel/upload)
   - Web Contacts API para acessar agenda do dispositivo
   - Modo correto sempre passado nas chamadas
══════════════════════════════════════════ */

// ── auth ──────────────────────────────────
function getToken() {
    return localStorage.getItem("wa_token") || "";
}
function setToken(token) {
    localStorage.setItem("wa_token", token);
}
function clearToken() {
    localStorage.removeItem("wa_token");
    localStorage.removeItem("wa_email");
}
function isLoggedIn() {
    return !!getToken();
}

// ── request base ──────────────────────────
async function api(method, path, body = null, isAdmin = false) {
    const headers = { "Content-Type": "application/json" };

    if (isAdmin) {
        headers["x-admin-key"] = localStorage.getItem("wa_admin_key") || "";
    } else {
        const token = getToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    try {
        const r = await fetch(`${CONFIG.API_URL}${path}`, opts);

        if (r.status === 401) {
            clearToken();
            showLogin();
            return null;
        }

        if (!r.ok) {
            const err = await r.json().catch(() => ({ detail: r.statusText }));
            toast(err.detail || "Erro desconhecido", "error");
            return null;
        }

        const text = await r.text();
        return text ? JSON.parse(text) : { ok: true };

    } catch (e) {
        toast("Sem conexão com o servidor", "error");
        return null;
    }
}

const GET    = (path)        => api("GET",    path);
const POST   = (path, body)  => api("POST",   path, body);
const PATCH  = (path, body)  => api("PATCH",  path, body);
const PUT    = (path, body)  => api("PUT",    path, body);
const DELETE = (path)        => api("DELETE", path);

// ── login ─────────────────────────────────
async function doLogin(email, secret) {
    const r = await POST("/auth/token", { email, secret_key: secret });
    if (!r) return false;
    setToken(r.access_token);
    localStorage.setItem("wa_email", email);
    return true;
}

function logout() {
    clearToken();
    window.location.href = "login.html";
}

/* ══════════════════════════════════════════
   UPLOAD DE ARQUIVO — envia ao backend e
   recebe de volta o data URI (base64).
   O data URI é salvo em file_path da task.
══════════════════════════════════════════ */
async function uploadArquivo(file) {
    const form = new FormData();
    form.append("file", file);

    const token = getToken();
    try {
        const r = await fetch(`${CONFIG.API_URL}/panel/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        });

        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.detail || `Erro no upload: ${r.status}`);
        }

        const data = await r.json();
        return data;  // { ok, file_path (data URI), filename, mime, size }

    } catch (e) {
        toast(`Falha no upload: ${e.message}`, "error");
        return null;
    }
}

/* ══════════════════════════════════════════
   FILE PICKER com upload automático
   Retorna Promise<{ dataUri, filename } | null>
══════════════════════════════════════════ */
function openFilePicker(callback) {
    if (!document.getElementById("_fileInput")) {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.id = "_fileInput";
        inp.style.display = "none";
        document.body.appendChild(inp);
    }

    const inp = document.getElementById("_fileInput");
    inp.value = "";
    inp.onchange = async () => {
        const file = inp.files[0];
        if (!file) return;

        toast("Enviando arquivo...", "info");
        const result = await uploadArquivo(file);

        if (!result || !result.ok) {
            toast("Falha ao enviar arquivo", "error");
            return;
        }

        toast(`✅ ${result.filename} pronto (${Math.round(result.size / 1024)}KB)`, "success");
        callback({
            file_path: result.file_path,   // data URI — salvar no banco
            filename: result.filename,
            mime: result.mime,
        });
    };
    inp.click();
}

/* ══════════════════════════════════════════
   WEB CONTACTS API
   Acessa a agenda do dispositivo no Chrome Android / Edge.
   Fallback: importação por CSV.
══════════════════════════════════════════ */
async function abrirAgendaDispositivo() {
    // Verifica suporte
    if (!("contacts" in navigator && "ContactsManager" in window)) {
        return null;  // não suportado — o chamador trata o fallback
    }

    try {
        const props = ["name", "tel"];
        const opts  = { multiple: true };
        const contatos = await navigator.contacts.select(props, opts);

        if (!contatos || contatos.length === 0) return [];

        return contatos.map(c => ({
            name:  (c.name && c.name[0]) || "",
            phone: (c.tel  && c.tel[0])  || "",
        })).filter(c => c.name && c.phone);

    } catch (e) {
        if (e.name === "SecurityError") {
            toast("Permissão negada para acessar contatos", "error");
        }
        return null;
    }
}

/* ══════════════════════════════════════════
   IMPORTAR CONTATOS DA AGENDA DO DISPOSITIVO
   Tenta Web Contacts API → se não suportado, abre seletor CSV
══════════════════════════════════════════ */
async function importarContatosDispositivo() {
    const contatos = await abrirAgendaDispositivo();

    if (contatos === null) {
        // Não suportado — fallback para CSV
        toast("Seu navegador não suporta acesso à agenda. Use Importar CSV.", "info");
        document.getElementById("_csvInput") && document.getElementById("_csvInput").click();
        return;
    }

    if (contatos.length === 0) {
        toast("Nenhum contato selecionado", "info");
        return;
    }

    // Salva cada contato via API
    let ok = 0, fail = 0;
    for (const c of contatos) {
        const r = await POST("/panel/my-contacts", { name: c.name, phone: c.phone });
        if (r) ok++; else fail++;
    }

    toast(`${ok} contato(s) importado(s)${fail ? `, ${fail} falhou` : ""}`, ok > 0 ? "success" : "error");

    if (typeof loadMyContacts === "function") loadMyContacts();
}

/* ══════════════════════════════════════════
   IMPORTAR CSV — corrigido para múltiplos formatos
   (Google Contacts, Android, iPhone, simples nome;numero)
══════════════════════════════════════════ */
async function importContacts(input) {
    const file = input.files[0];
    if (!file) return;

    const form = new FormData();
    form.append("file", file);
    const token = getToken();

    toast("Importando contatos...", "info");

    const r = await fetch(`${CONFIG.API_URL}/panel/my-contacts/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });

    const data = await r.json().catch(() => ({}));

    if (data.ok) {
        toast(`✅ ${data.imported} contatos importados (${data.skipped} ignorados)`, "success");
        if (typeof loadMyContacts === "function") loadMyContacts();
    } else {
        toast("Erro ao importar CSV", "error");
    }

    input.value = "";
}

/* ══════════════════════════════════════════
   Substitutos diretos do pywebview.api.*
══════════════════════════════════════════ */

async function apiGetExecucoes() {
    const r = await GET("/panel/stats");
    return { count: r ? r.completed : 0 };
}

async function apiListarAgendamentos() {
    const tasks = await GET("/panel/tasks");
    if (!tasks) return { agendamentos: [] };

    const singles = [];
    const batches = {};

    for (const t of tasks) {
        const dt = formatDatetime(t.scheduled_time);
        t.scheduled_time_fmt = dt;

        if (t.batch_id) {
            if (!batches[t.batch_id]) {
                batches[t.batch_id] = {
                    batch_id: t.batch_id, itens: [],
                    scheduled_time: dt, status: t.status,
                };
            }
            batches[t.batch_id].itens.push(t);
            const prio = ["running", "failed", "pending", "cancelled", "completed"];
            if (prio.indexOf(t.status) < prio.indexOf(batches[t.batch_id].status)) {
                batches[t.batch_id].status = t.status;
                batches[t.batch_id].scheduled_time = dt;
            }
        } else {
            singles.push(t);
        }
    }

    const result = [];
    for (const t of singles) {
        result.push({
            id: t.id, task_name: t.task_name,
            target: t.target, mode: t.mode,
            scheduled_time: t.scheduled_time_fmt,
            status: t.status, batch_id: null,
        });
    }
    for (const [bid, b] of Object.entries(batches)) {
        const targets = b.itens.slice(0, 3).map(i => i.target).join(", ");
        const extra   = b.itens.length > 3 ? ` +${b.itens.length - 3}` : "";
        result.push({
            id: null, batch_id: bid,
            target: `Lote: ${targets}${extra}`,
            mode: "lote", is_lote: true,
            count: b.itens.length,
            itens: b.itens,
            scheduled_time: b.scheduled_time,
            status: b.status,
        });
    }

    result.sort((a, b) => b.scheduled_time.localeCompare(a.scheduled_time));
    return { agendamentos: result };
}

async function apiObterAgendamento(taskId) {
    const t = await GET("/panel/tasks");
    if (!t) return { error: "Não encontrado" };
    const task = t.find(x => x.id === taskId);
    if (!task) return { error: "Não encontrado" };

    const isoUtc = task.scheduled_time.endsWith("Z") ? task.scheduled_time : task.scheduled_time + "Z";
    const dt = new Date(isoUtc);
    task.date_str = `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
    task.time_str = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    return { agendamento: task };
}

async function apiAgendar(dados) {
    const dt = parseDateTime(dados.date_str, dados.time_str, dados.daily);
    if (!dt) return { error: "Data/hora inválida" };

    // Validação extra no frontend antes de chamar API
    if (dados.mode !== "text" && !dados.file_path) {
        return { error: "Selecione um arquivo antes de agendar" };
    }

    const r = await POST("/panel/tasks", {
        target:           dados.target,
        mode:             dados.mode,
        message:          dados.message || null,
        file_path:        dados.file_path || null,   // data URI ou null
        scheduled_time:   dt.toISOString(),
        is_daily:         dados.daily || false,
        include_weekends: dados.include_weekends !== false,
    });
    return r ? { ok: true } : { error: "Falha ao agendar" };
}

async function apiEditarAgendamento(dados) {
    const dt = parseDateTime(dados.date_str, dados.time_str, dados.daily);
    if (!dt) return { error: "Data/hora inválida" };

    const r = await PUT(`/panel/tasks/${dados.task_id}`, {
        target:           dados.target,
        mode:             dados.mode,
        message:          dados.message || null,
        file_path:        dados.file_path || null,
        scheduled_time:   dt.toISOString(),
        is_daily:         dados.daily || false,
        include_weekends: dados.include_weekends !== false,
    });
    return r ? { ok: true } : { error: "Falha ao editar" };
}

async function apiExcluirAgendamento(taskId) {
    const r = await DELETE(`/panel/tasks/${taskId}`);
    return r ? { ok: true } : { error: "Falha ao excluir" };
}

async function apiEnviarAgora(dados) {
    // Validação de modo vs arquivo
    if (dados.mode !== "text" && !dados.file_path) {
        toast("Selecione um arquivo antes de enviar", "error");
        return { error: "Arquivo obrigatório" };
    }
    if (dados.mode === "text" && !dados.message) {
        toast("Escreva uma mensagem antes de enviar", "error");
        return { error: "Mensagem obrigatória" };
    }

    import_datetime_now = new Date();
    const r = await POST("/panel/send-now", {
        target:    dados.target,
        mode:      dados.mode,
        message:   dados.message || null,
        file_path: dados.file_path || null,
    });

    if (!r) return { error: "Falha ao enviar" };

    setTimeout(() => {
        if (window.__onEnvioResult) {
            window.__onEnvioResult({ ok: true });
        }
    }, 500);

    return { ok: true, msg: r.message || "Enviando..." };
}

async function apiReenviarAgendamento(taskId) {
    const r = await PATCH(`/panel/tasks/${taskId}/status`, { status: "pending" });
    return r ? { ok: true } : { error: "Falha ao reenviar" };
}

async function apiAgendarLote(dados) {
    const dt = parseDateTime(dados.date_str, dados.time_str, dados.daily);
    if (!dt) return { error: "Data/hora inválida" };

    const batchId = `batch_${Date.now()}`;
    const promises = dados.itens.map(item =>
        POST("/panel/tasks", {
            target:           item.target,
            mode:             item.mode,
            message:          item.message || null,
            file_path:        item.file_path || null,   // já é data URI
            scheduled_time:   dt.toISOString(),
            is_daily:         dados.daily || false,
            include_weekends: dados.include_weekends !== false,
            batch_id:         batchId,
        })
    );

    const results = await Promise.all(promises);
    const okCount = results.filter(Boolean).length;
    return okCount > 0
        ? { ok: true, count: okCount, batch_id: batchId }
        : { error: "Falha ao agendar lote" };
}

async function apiEnviarLote(dados) {
    const batchId = `batch_${Date.now()}`;
    const promises = dados.itens.map(item =>
        POST("/panel/tasks", {
            target:         item.target,
            mode:           item.mode,
            message:        item.message || null,
            file_path:      item.file_path || null,
            scheduled_time: new Date().toISOString(),
            is_daily:       false,
            batch_id:       batchId,
        })
    );

    const results = await Promise.all(promises);
    const total   = dados.itens.length;
    const okCount = results.filter(Boolean).length;

    setTimeout(() => {
        if (window.__onLoteResult) {
            window.__onLoteResult({ ok: okCount === total, ok_count: okCount, total });
        }
    }, 2000);

    toast(`${okCount} tasks criadas! Executando em breve.`, "info");
    return { ok: true };
}

// Mantido para compatibilidade — não é mais usado ativamente
async function apiSelecionarArquivo() {
    return { paths: [], joined: "" };
}

// ── helpers de data ───────────────────────
function pad(n) { return String(n).padStart(2, "0"); }

function formatDatetime(iso) {
    if (!iso) return "";
    const isoUtc = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
    const d = new Date(isoUtc);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDateTime(dateStr, timeStr, isDaily) {
    try {
        if (isDaily) {
            const [h, m] = timeStr.split(":").map(Number);
            const d = new Date();
            d.setHours(h, m, 0, 0);
            return d;
        }
        const [day, month, year] = dateStr.split("/").map(Number);
        const [h, m] = timeStr.split(":").map(Number);
        return new Date(year, month - 1, day, h, m, 0);
    } catch {
        return null;
    }
}