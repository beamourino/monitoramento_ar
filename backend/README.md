# Backend - Proxy de Monitoramento da Qualidade do Ar

Servidor em Node.js com Express que atua como proxy entre o ThingSpeak e o frontend da aplicação, fornecendo normalização de dados, controle de cache em memória, CORS e entrega de arquivos estáticos.

---

## 🚀 Requisitos

- **Node.js**: v18.0.0 ou superior (inclui suporte nativo a `fetch`)
- **npm**: v9.0.0 ou superior

---

## 📦 Instalação

1. Navegue até o diretório do backend:
   ```bash
   cd backend
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

---

## ⚙️ Configuração (.env)

Crie o arquivo `.env` no diretório `/backend` tomando como base o arquivo `.env.example`:

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais:

```env
THINGSPEAK_CHANNEL_ID=3577130
THINGSPEAK_READ_KEY=SUA_READ_API_KEY
PORT=3000
```

> **Atenção de Segurança:** O arquivo `.env` contém credenciais e está listado no `.gitignore`. Nunca envie sua API Key para repositórios públicos. A chave nunca é exposta em respostas HTTP nem em logs do servidor.

---

## ▶️ Execução

Para iniciar o servidor:

```bash
npm start
```

Ou diretamente com o Node:

```bash
node server.js
```

O servidor iniciará por padrão em `http://localhost:3000`.

---

## 🔌 Rotas da API

### 1. `GET /health`
Verifica a disponibilidade do servidor backend.

**Resposta de sucesso (HTTP 200):**
```json
{
  "status": "ok"
}
```

---

### 2. `GET /api/readings`
Consulta as últimas 30 leituras do canal configurado no ThingSpeak, normaliza os valores conforme o contrato (`/docs/API_CONTRACT.md`) e retorna os dados estruturados.

**Recursos:**
- **Cache em memória:** As leituras ficam armazenadas em cache por 20 segundos para evitar exceder o rate limit do ThingSpeak. O campo `cached` indica se os dados vieram do cache (`true`) ou de uma consulta recente (`false`).
- **CORS:** Liberado para permitir consumo direto pelo frontend.
- **Tratamento de Erros:** Em caso de indisponibilidade ou falha do ThingSpeak, a API retorna status `HTTP 502` com `{ "error": "..." }`.

**Exemplo de Resposta (HTTP 200):**
```json
{
  "updatedAt": "2026-11-17T17:00:00.000Z",
  "cached": false,
  "latest": {
    "timestamp": "2026-11-17T16:59:40Z",
    "eco2": 450,
    "tvoc": 12,
    "mq135": 0.041,
    "alerta": 0,
    "nivel": 0,
    "nivelNome": "BOA"
  },
  "history": [
    {
      "timestamp": "2026-11-17T16:49:40Z",
      "eco2": 430,
      "tvoc": 10,
      "mq135": 0.038,
      "alerta": 0,
      "nivel": 0,
      "nivelNome": "BOA"
    },
    {
      "timestamp": "2026-11-17T16:59:40Z",
      "eco2": 450,
      "tvoc": 12,
      "mq135": 0.041,
      "alerta": 0,
      "nivel": 0,
      "nivelNome": "BOA"
    }
  ]
}
```

---

### 3. `GET /` (Frontend Estático)
O servidor entrega automaticamente os arquivos da pasta `/web` na raiz `/`, permitindo subir todo o sistema (backend e interface web) com um único comando `npm start`.
