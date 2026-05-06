"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

export default function DashboardPage() {
  const [qr, setQr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ 
    target_name: "", 
    target_type: "contact", 
    message_text: "", 
    scheduled_at: "",
    file_urls: [] as string[]
  });

  useEffect(() => {
    loadMessages();
    const interval = setInterval(checkStatus, 5000);
    checkStatus();
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (connected) {
      loadContacts();
      loadGroups();
    }
  }, [connected]);

  const checkStatus = async () => {
    try {
      const res = await apiRequest("/whatsapp/status");
      setConnected(res.connected);
      if (res.hasQR) {
        // In my current backend, /whatsapp/qr returns the status with hasQR
        // The QR itself is served as a data URL in the whatsapp-service status
        // Let's assume the backend proxies the status which includes the QR
        // Wait, my backend /whatsapp/status returns res.json() from whatsapp-service
        const statusRes = await apiRequest("/whatsapp/status");
        if (statusRes.qr) setQr(statusRes.qr);
      } else {
        setQr(null);
      }
    } catch (e) {}
  };

  const loadMessages = async () => {
    try {
      const res = await apiRequest("/messages");
      setMessages(res || []);
    } catch (e) {}
  };

  const loadContacts = async () => {
    try {
      const res = await apiRequest("/whatsapp/contacts");
      setContacts(res || []);
    } catch (e) {}
  };

  const loadGroups = async () => {
    try {
      const res = await apiRequest("/whatsapp/groups");
      setGroups(res || []);
    } catch (e) {}
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setLoading(true);
    const files = Array.from(e.target.files);
    const urls: string[] = [];
    
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/upload/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: formData,
        });
        const data = await res.json();
        if (data.url) urls.push(data.url);
      } catch (err) {
        console.error("Upload error:", err);
      }
    }
    setForm({ ...form, file_urls: [...form.file_urls, ...urls] });
    setLoading(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = form.scheduled_at ? "/messages/schedule" : "/messages/send";
    try {
      await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(form),
      });
      loadMessages();
      setForm({ target_name: "", target_type: "contact", message_text: "", scheduled_at: "", file_urls: [] });
      alert("Sucesso!");
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <header className="flex justify-between items-center pb-6 border-b border-zinc-800">
          <h1 className="text-3xl font-bold tracking-tight">Study Practices</h1>
          <div className="flex items-center gap-3 bg-zinc-900 px-4 py-2 rounded-full border border-zinc-800 shadow-sm">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
            <span className="text-sm font-medium">{connected ? "Conectado" : "Desconectado"}</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-1 space-y-6">
            {!connected && (
              <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 shadow-xl space-y-4">
                <h2 className="text-xl font-semibold">Conexão WhatsApp</h2>
                <p className="text-zinc-500 text-sm">Escaneie o QR Code para ativar sua sessão.</p>
                {qr ? (
                  <div className="bg-white p-4 rounded-xl flex justify-center shadow-inner">
                    <img src={qr} alt="QR Code" className="w-full h-auto max-w-[200px]" />
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center bg-zinc-800 rounded-xl">
                    <span className="text-zinc-600 animate-pulse">Aguardando QR Code...</span>
                  </div>
                )}
              </div>
            )}

            <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 shadow-xl space-y-6">
              <h2 className="text-xl font-semibold">Nova Automação</h2>
              <form onSubmit={handleSend} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase ml-1">Tipo de Destinatário</label>
                  <select 
                    value={form.target_type}
                    onChange={e => setForm({...form, target_type: e.target.value})}
                    className="w-full bg-zinc-800 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                  >
                    <option value="contact">Contato</option>
                    <option value="group">Grupo</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase ml-1">Destinatário</label>
                  <input 
                    list="targets"
                    placeholder="Nome do contato ou grupo" 
                    value={form.target_name} 
                    onChange={e => setForm({...form, target_name: e.target.value})}
                    className="w-full bg-zinc-800 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                    required
                  />
                  <datalist id="targets">
                    {form.target_type === "contact" 
                      ? contacts.map(c => <option key={c.id} value={c.name || c.id} />)
                      : groups.map(g => <option key={g.id} value={g.subject} />)
                    }
                  </datalist>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase ml-1">Mensagem</label>
                  <textarea 
                    placeholder="Sua mensagem aqui..." 
                    value={form.message_text} 
                    onChange={e => setForm({...form, message_text: e.target.value})}
                    className="w-full bg-zinc-800 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-600 outline-none min-h-[100px] resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase ml-1">Arquivos</label>
                  <input 
                    type="file" 
                    multiple 
                    onChange={handleUpload}
                    className="w-full text-xs text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-600/10 file:text-blue-500 hover:file:bg-blue-600/20 transition-all cursor-pointer"
                  />
                  {loading && <p className="text-[10px] text-blue-400 animate-pulse">Enviando arquivos...</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.file_urls.map((u, i) => (
                      <div key={i} className="text-[10px] bg-zinc-800 px-2 py-1 rounded border border-zinc-700 max-w-[150px] truncate">
                        {u.split('/').pop()}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase ml-1">Agendamento (Opcional)</label>
                  <input 
                    type="datetime-local" 
                    value={form.scheduled_at} 
                    onChange={e => setForm({...form, scheduled_at: e.target.value})}
                    className="w-full bg-zinc-800 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-600 outline-none [color-scheme:dark]"
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 transition-all hover:scale-[1.02] active:scale-95 mt-4"
                >
                  {form.scheduled_at ? "Agendar Envio" : "Enviar Agora"}
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2 bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-xl overflow-hidden flex flex-col">
            <h2 className="text-xl font-semibold mb-6">Meus Agendamentos</h2>
            <div className="overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {messages.length === 0 ? (
                <div className="text-center py-20 text-zinc-600">Nenhum agendamento encontrado.</div>
              ) : messages.map(m => (
                <div key={m.id} className="bg-zinc-950/50 p-5 rounded-xl border border-zinc-800/50 hover:border-zinc-700 transition-all group">
                  <div className="flex justify-between items-start mb-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{m.target_type}</span>
                      <h3 className="text-blue-400 font-bold">{m.target_name}</h3>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter ${
                      m.status === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                      m.status === 'error' ? 'bg-rose-500/10 text-rose-500' :
                      m.status === 'executing' ? 'bg-blue-500/10 text-blue-500' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {m.status}
                    </div>
                  </div>
                  <p className="text-sm text-zinc-300 line-clamp-2 mb-3">{m.message_text}</p>
                  <div className="flex justify-between items-center text-[10px] text-zinc-500">
                    <span>{new Date(m.created_at).toLocaleString()}</span>
                    <span className="font-mono">{m.scheduled_at ? `Agendado: ${new Date(m.scheduled_at).toLocaleString()}` : 'Envio Imediato'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
      `}</style>
    </div>
  );
}
