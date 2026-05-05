"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem("token", res.token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 font-sans">
      <form onSubmit={handleLogin} className="w-full max-w-md space-y-6 rounded-2xl bg-zinc-900 p-8 shadow-2xl border border-zinc-800">
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-2xl shadow-lg shadow-blue-900/20">A</div>
          <h2 className="text-2xl font-bold text-zinc-100">Automação Nova</h2>
          <p className="text-zinc-500 text-sm">Entre com suas credenciais para continuar</p>
        </div>
        
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-3 rounded-xl text-sm text-center">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider ml-1">Usuário</label>
            <input
              type="text"
              placeholder="Digite seu usuário..."
              className="w-full rounded-xl bg-zinc-800 border-none p-3 text-zinc-100 placeholder:text-zinc-600 focus:ring-2 focus:ring-blue-600 transition-all"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider ml-1">Senha</label>
            <input
              type="password"
              placeholder="••••••••••"
              className="w-full rounded-xl bg-zinc-800 border-none p-3 text-zinc-100 placeholder:text-zinc-600 focus:ring-2 focus:ring-blue-600 transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <button 
          type="submit" 
          className="w-full rounded-xl bg-blue-600 p-3 text-white font-bold transition-all hover:bg-blue-500 hover:scale-[1.02] active:scale-95 shadow-lg shadow-blue-900/20"
        >
          Acessar Sistema
        </button>
      </form>
    </div>
  );
}
