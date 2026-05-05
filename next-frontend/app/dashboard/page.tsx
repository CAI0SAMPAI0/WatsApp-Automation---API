"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import QRCode from "react-qr-code";

export default function DashboardPage() {
  const [qr, setQr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [form, setForm] = useState({ targetJid: "", message: "", scheduledAt: "" });

  useEffect(() => {
    loadMessages();
    const interval = setInterval(checkStatus, 5000);
    checkStatus();
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const res = await apiRequest("/wa/status");
      setConnected(res.connected);
      if (res.connected) setQr(null);
    } catch (e) {}
  };

  const loadMessages = async () => {
    try {
      const res = await apiRequest("/messages");
      setMessages(res.messages || []);
    } catch (e) {}
  };

  const connectWa = () => {
    setQr(null);
    const token = localStorage.getItem("token");
    const ws = new WebSocket(`ws://localhost:3333/wa/connect?token=${token}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("WS Event:", data.type);
      if (data.type === "qr") setQr(data.qr);
      if (data.type === "connected") {
        setConnected(true);
        setQr(null);
        ws.close();
      }
      if (data.type === "error") alert(data.message);
    };

    ws.onerror = () => alert("Erro na conexão com o servidor.");
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/messages/schedule", {
        method: "POST",
        body: JSON.stringify({ ...form, mode: "text" }),
      });
      loadMessages();
      setForm({ targetJid: "", message: "", scheduledAt: "" });
      alert("Agendado com sucesso!");
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={{ backgroundColor: '#09090b', minHeight: '100vh', color: '#fafafa', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid #27272a', paddingBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Automação Nova</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#18181b', padding: '8px 16px', borderRadius: '20px', border: '1px solid #27272a' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: connected ? '#10b981' : '#f43f5e' }}></div>
            <span style={{ fontSize: '14px' }}>{connected ? "Conectado" : "Desconectado"}</span>
          </div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
          
          <section>
            {!connected && (
              <div style={{ background: '#18181b', padding: '24px', borderRadius: '12px', border: '1px solid #27272a', marginBottom: '20px' }}>
                <h2 style={{ marginBottom: '16px' }}>Conectar WhatsApp</h2>
                <button onClick={connectWa} style={{ width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '20px' }}>
                  {qr ? "Novo QR Code" : "Gerar QR Code"}
                </button>
                {qr && (
                  <div style={{ background: 'white', padding: '20px', borderRadius: '12px', display: 'flex', justifyContent: 'center' }}>
                    <QRCode value={qr} size={200} />
                  </div>
                )}
              </div>
            )}

            <div style={{ background: '#18181b', padding: '24px', borderRadius: '12px', border: '1px solid #27272a' }}>
              <h2 style={{ marginBottom: '20px' }}>Agendar Mensagem</h2>
              <form onSubmit={handleSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <input 
                  placeholder="Número (JID)" 
                  value={form.targetJid} 
                  onChange={e => setForm({...form, targetJid: e.target.value})}
                  style={{ background: '#27272a', border: 'none', padding: '12px', borderRadius: '8px', color: 'white' }}
                  required
                />
                <textarea 
                  placeholder="Mensagem" 
                  value={form.message} 
                  onChange={e => setForm({...form, message: e.target.value})}
                  style={{ background: '#27272a', border: 'none', padding: '12px', borderRadius: '8px', color: 'white', height: '100px' }}
                  required
                />
                <input 
                  type="datetime-local" 
                  value={form.scheduledAt} 
                  onChange={e => setForm({...form, scheduledAt: e.target.value})}
                  style={{ background: '#27272a', border: 'none', padding: '12px', borderRadius: '8px', color: 'white', colorScheme: 'dark' }}
                  required
                />
                <button type="submit" style={{ padding: '12px', background: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                  Confirmar Agendamento
                </button>
              </form>
            </div>
          </section>

          <section style={{ background: '#18181b', padding: '24px', borderRadius: '12px', border: '1px solid #27272a', maxHeight: '700px', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '20px' }}>Histórico</h2>
            {messages.map(m => (
              <div key={m.id} style={{ borderBottom: '1px solid #27272a', padding: '15px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}>
                  <span style={{ color: '#60a5fa' }}>{m.targetJid}</span>
                  <span style={{ textTransform: 'uppercase', fontWeight: 'bold', color: m.status === 'sent' ? '#10b981' : '#fbbf24' }}>{m.status}</span>
                </div>
                <p style={{ fontSize: '14px', margin: '5px 0' }}>{m.message}</p>
                <p style={{ fontSize: '10px', color: '#71717a' }}>{new Date(m.scheduledAtTz).toLocaleString()}</p>
              </div>
            ))}
          </section>

        </div>
      </div>
    </div>
  );
}
