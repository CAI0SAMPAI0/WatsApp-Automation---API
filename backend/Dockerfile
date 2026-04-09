# 1. Usa uma imagem oficial do Python
FROM python:3.11-slim

# 2. Define o diretório de trabalho dentro do container
WORKDIR /app

# 3. Copia o arquivo de dependências (se você tiver um)
# Se não tiver requirements.txt, pode comentar essa linha
COPY requirements.txt .

# 4. Instala as dependências
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copia o restante do código do seu backend para o container
COPY . .

# 6. Comando para iniciar o servidor FastAPI
# Ajuste "main:app" para o nome do seu arquivo principal e da sua instância FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]