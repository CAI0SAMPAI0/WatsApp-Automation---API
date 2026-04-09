/* ══════════════════════════════════════════
   api.js — camada de comunicação com o backend
   Substitui todas as chamadas pywebview.api.*
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

        // token expirado → redireciona para login
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

        // DELETE retorna 200 com body vazio às vezes
        const text = await r.text();
        return text ? JSON.parse(text) : { ok: true };

    } catch (e) {
        toast("Sem conexão com o servidor", "error");
        return null;
    }
}

// ── atalhos ───────────────────────────────
const GET = (path) => api("GET", path);
const POST = (path, body) => api("POST", path, body);
const PATCH = (path, body) => api("PATCH", path, body);
const PUT = (path, body) => api("PUT", path, body);
const DELETE = (path) => api("DELETE", path);

// ── login ─────────────────────────────────
async function doLogin(email, secret) {
    const r = await POST("/auth/token", { email, secret_key: secret });
    if (!r) return false;
    setToken(r.access_token);
    localStorage.setItem("wa_email", email);
    return true;
}

/* ══════════════════════════════════════════
   Substitutos diretos do pywebview.api.*
   Mantém a mesma assinatura que o app.js usa
══════════════════════════════════════════ */

// contadores
async function apiGetExecucoes() {
    const r = await GET("/panel/stats");
    return { count: r ? r.completed : 0 };
}

// agendamentos
async function apiListarAgendamentos() {
    const tasks = await GET("/panel/tasks");
    if (!tasks) return { agendamentos: [] };

    // agrupa lotes (batch_id) — mesma lógica do main_window.py
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
        const extra = b.itens.length > 3 ? ` +${b.itens.length - 3}` : "";
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
    const t = await GET(`/panel/tasks`);
    if (!t) return { error: "Não encontrado" };
    const task = t.find(x => x.id === taskId);
    if (!task) return { error: "Não encontrado" };

    const dt = new Date(task.scheduled_time);
    task.date_str = `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
    task.time_str = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    return { agendamento: task };
}

async function apiAgendar(dados) {
    const dt = parseDateTime(dados.date_str, dados.time_str, dados.daily);
    if (!dt) return { error: "Data/hora inválida" };

    const r = await POST("/panel/tasks", {
        target: dados.target,
        mode: dados.mode,
        message: dados.message || null,
        file_path: dados.file_path || null,
        scheduled_time: dt.toISOString(),
        is_daily: dados.daily || false,
        include_weekends: dados.include_weekends !== false,
    });
    return r ? { ok: true } : { error: "Falha ao agendar" };
}

async function apiEditarAgendamento(dados) {
    const dt = parseDateTime(dados.date_str, dados.time_str, dados.daily);
    if (!dt) return { error: "Data/hora inválida" };

    const r = await PUT(`/panel/tasks/${dados.task_id}`, {
        target: dados.target,
        mode: dados.mode,
        message: dados.message || null,
        file_path: dados.file_path || null,
        scheduled_time: dt.toISOString(),
        is_daily: dados.daily || false,
        include_weekends: dados.include_weekends !== false,
    });
    return r ? { ok: true } : { error: "Falha ao editar" };
}

async function apiExcluirAgendamento(taskId) {
    const r = await DELETE(`/panel/tasks/${taskId}`);
    return r ? { ok: true } : { error: "Falha ao excluir" };
}

async function apiEnviarAgora(dados) {
    // envio imediato: cria task com scheduled_time = agora
    const r = await POST("/panel/tasks", {
        target: dados.target,
        mode: dados.mode,
        message: dados.message || null,
        file_path: dados.file_path || null,
        scheduled_time: new Date().toISOString(),
        is_daily: false,
    });
    if (!r) return { error: "Falha ao criar task" };

    // simula o callback que o pywebview usava
    // o agente vai pegar e executar no próximo ciclo (até 60s)
    setTimeout(() => {
        if (window.__onEnvioResult) {
            window.__onEnvioResult({ ok: true });
        }
    }, 2000);

    toast("Task criada! O agente vai executar em até 60s.", "info");
    return { ok: true };
}

async function apiReenviarAgendamento(taskId) {
    // reenvio: atualiza status para pending
    const r = await PATCH(`/panel/tasks/${taskId}/status`, { status: "pending" });
    return r ? { ok: true } : { error: "Falha ao reenviar" };
}

// lote
async function apiAgendarLote(dados) {
    const dt = parseDateTime(dados.date_str, dados.time_str, dados.daily);
    if (!dt) return { error: "Data/hora inválida" };

    const batchId = `batch_${Date.now()}`;
    const promises = dados.itens.map(item =>
        POST("/panel/tasks", {
            target: item.target,
            mode: item.mode,
            message: item.message || null,
            file_path: item.filePath || null,
            scheduled_time: dt.toISOString(),
            is_daily: dados.daily || false,
            include_weekends: dados.include_weekends !== false,
            batch_id: batchId,
        })
    );

    const results = await Promise.all(promises);
    const ok = results.filter(Boolean).length;
    return ok > 0
        ? { ok: true, count: ok, batch_id: batchId }
        : { error: "Falha ao agendar lote" };
}

async function apiEnviarLote(dados) {
    // cria todas as tasks com scheduled_time = agora
    const batchId = `batch_${Date.now()}`;
    const promises = dados.itens.map(item =>
        POST("/panel/tasks", {
            target: item.target,
            mode: item.mode,
            message: item.message || null,
            file_path: item.filePath || null,
            scheduled_time: new Date().toISOString(),
            is_daily: false,
            batch_id: batchId,
        })
    );

    const results = await Promise.all(promises);
    const total = dados.itens.length;
    const ok = results.filter(Boolean).length;

    setTimeout(() => {
        if (window.__onLoteResult) {
            window.__onLoteResult({ ok: ok === total, ok_count: ok, total });
        }
    }, 2000);

    toast(`${ok} tasks criadas! O agente vai executar em até 60s.`, "info");
    return { ok: true };
}

async function apiSelecionarArquivo() {
    // no browser não há file dialog nativo via API
    // retorna estrutura vazia — o input file do HTML cuida disso
    return { paths: [], joined: "" };
}

// ── helpers de data ───────────────────────
function pad(n) { return String(n).padStart(2, "0"); }

function formatDatetime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
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