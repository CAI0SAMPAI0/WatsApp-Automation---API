# 🤖 Automação WhatsApp — Bot Multi-Funcional

<div align="center">

[![Python](https://img.shields.io/badge/Python-3.8+-blue?logo=python&logoColor=white)](https://www.python.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Browser%20Automation-45ba4b?logo=playwright&logoColor=white)](https://playwright.dev/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**Sistema desktop completo de automação para WhatsApp com interface gráfica HTML/CSS/JS, backend Python/Playwright e instalador próprio.**

</div>

---

## 🎯 Sobre o Projeto

Sistema desktop de automação para WhatsApp desenvolvido com:
- **Playwright** (Python) para controle automatizado do browser
- **HTML/CSS/JavaScript** para interface gráfica moderna
- **Python** para backend e lógica de negócio
- **SQLite** para persistência de dados
- **Instalador próprio** para distribuição fácil

---

## 🔧 Problema que Resolve

### Desafios de Comunicação em Massa

**Para Empresas e Profissionais:**
- ❌ Envio manual demorado (horas copiando/colando)
- ❌ Impossível personalizar em escala
- ❌ Perda de leads por demora em responder
- ❌ Trabalho repetitivo sem rastreamento

### Solução Automatizada

✅ **Envio em Massa** - 100+ mensagens em minutos  
✅ **Personalização** - Variáveis dinâmicas `{nome}`, `{empresa}`  
✅ **Auto-responder** - Bot responde fora do horário  
✅ **Interface Gráfica** - App desktop profissional  
✅ **Instalador Próprio** - Distribuição sem Python  
✅ **Analytics** - Dashboard com gráficos Chart.js  

---

## ⚡ Funcionalidades

### 📤 Envio em Massa
- Importação CSV/Excel
- Mensagens personalizadas com variáveis
- Anexos (imagens, PDFs, vídeos)
- Delay anti-ban inteligente
- Retry automático

### 🤖 Respostas Automáticas
- Regras por palavras-chave
- Mensagens de ausência
- Templates rápidos

### 🖥️ Interface Gráfica (HTML/CSS/JS)
- Dashboard interativo
- Editor WYSIWYG
- Drag & drop de arquivos
- Tema dark/light
- Gráficos Chart.js

### 📊 Analytics
- Estatísticas em tempo real
- Taxa de entrega
- Histórico SQLite
- Export PDF/CSV

### 📦 Instalador
- Setup .exe para Windows
- One-click install
- Auto-update

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| **Automação** | Playwright (Python) |
| **Backend** | Python 3.8+ |
| **Frontend** | HTML5 + CSS3 + JS |
| **Gráficos** | Chart.js |
| **Database** | SQLite |
| **Comunicação** | WebSockets |
| **Instalador** | PyInstaller + Inno Setup |

---

## 📁 Estrutura

```
Automacao_WA/
├── app/
│   ├── frontend/          # HTML/CSS/JS
│   │   ├── index.html
│   │   ├── css/
│   │   └── js/
│   ├── backend/           # Python
│   │   ├── main.py
│   │   ├── automation/
│   │   │   └── playwright_bot.py
│   │   └── database/
│   │       └── db_manager.py
│   └── data/
│       └── whatsapp.db    # SQLite
├── installer/
│   ├── build_exe.py       # PyInstaller
│   └── setup.iss          # Inno Setup
└── requirements.txt
```

---

## 🚀 Instalação

### Via Instalador (Usuário)

```bash
# Baixe: WhatsAppAutomacao_Setup.exe
# Execute e siga o wizard
```

### Via Python (Desenvolvedor)

```bash
git clone https://github.com/CAI0SAMPAI0/Automacao_WA.git
cd Automacao_WA
pip install -r requirements.txt
playwright install chromium
python app/backend/main.py
```

---

## 📖 Uso

1. **Iniciar aplicação** → Interface abre em `http://localhost:5000`
2. **Login WhatsApp** → Escanear QR Code
3. **Importar contatos** → CSV/Excel
4. **Criar mensagem** com variáveis `{nome}`, `{empresa}`
5. **Configurar delay** (5-15s recomendado)
6. **Enviar** e monitorar dashboard

---

## ⚠️ Avisos Importantes

### Termos WhatsApp

> ⚡ **ATENÇÃO**: WhatsApp **não permite** automação não oficial. Riscos:
> - Banimento de conta
> - Bloqueio de número
> - Restrições de envio

**Recomendações:**
- Use contas secundárias
- Delays ≥10s
- Limite <100 msgs/dia
- Obtenha consentimento (LGPD)

### Alternativa Oficial

Para uso comercial: **WhatsApp Business API** oficial
- [business.whatsapp.com](https://business.whatsapp.com/)

---

## 💼 Casos de Uso

- **E-commerce**: Carrinho abandonado
- **Consultórios**: Lembretes de consulta
- **Vendas**: Follow-up de leads
- **Marketing**: Campanhas segmentadas
- **Professores**: Envio de atividades

---

## 🗺️ Roadmap

- [ ] Suporte para grupos
- [ ] Integração CRM (Pipedrive, HubSpot)
- [ ] Dashboard web multi-usuário
- [ ] Migração para WhatsApp Business API

---

## 📄 Licença

MIT © 2025 - Uso educacional e pessoal

---

## 👨‍💻 Autor

**Caio Sampaio** - [@CAI0SAMPAI0](https://github.com/CAI0SAMPAI0)

---

<div align="center">

**⚠️ Use com responsabilidade e ética!**

Made in Brazil

</div>
