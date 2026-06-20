FROM node:22-slim

# Instalar dependências necessárias para criptografia/openssl
RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Definir porta exigida pelo Hugging Face Spaces (sempre 7860)
EXPOSE 7860
ENV PORT=7860

# Comando de inicialização
CMD ["node", "--max-old-space-size=150", "--gc-interval=100", "dist/index.js"]
