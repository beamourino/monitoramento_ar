require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CHANNEL_ID = process.env.THINGSPEAK_CHANNEL_ID || '3577130';
const READ_KEY = process.env.THINGSPEAK_READ_KEY;

const NIVEIS_MAP = {
  0: 'BOA',
  1: 'MODERADA',
  2: 'RUIM'
};

function parseNumber(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str === '') return null;
  const num = Number(str);
  return Number.isNaN(num) ? null : num;
}

function normalizeFeed(feed) {
  const eco2 = parseNumber(feed.field1);
  const tvoc = parseNumber(feed.field2);
  const mq135 = parseNumber(feed.field3);
  const alertaRaw = parseNumber(feed.field4);
  const alerta = alertaRaw !== null ? Math.round(alertaRaw) : null;

  const rawNivel = parseNumber(feed.field5);
  let nivel = null;
  let nivelNome = null;

  if (rawNivel !== null) {
    if (rawNivel < 0 || rawNivel > 2) {
      nivel = 2;
      nivelNome = 'RUIM';
    } else {
      nivel = Math.round(rawNivel);
      nivelNome = NIVEIS_MAP[nivel] || 'RUIM';
    }
  }

  return {
    timestamp: feed.created_at || null,
    eco2: eco2 !== null ? Math.round(eco2) : null,
    tvoc: tvoc !== null ? Math.round(tvoc) : null,
    mq135,
    alerta,
    nivel,
    nivelNome
  };
}

async function fetchThingSpeakReadings() {
  const url = new URL(`https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json`);
  url.searchParams.set('results', '30');
  if (READ_KEY && READ_KEY !== 'SUA_READ_API_KEY') {
    url.searchParams.set('api_key', READ_KEY);
  }

  let response;
  try {
    response = await fetch(url.toString(), {
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(10000) : undefined
    });
  } catch (err) {
    console.error(`[ThingSpeak] Falha na comunicação com o canal ${CHANNEL_ID}: ${err.message}`);
    throw new Error('Falha na comunicação com o serviço ThingSpeak');
  }

  if (!response.ok) {
    console.error(`[ThingSpeak] Resposta HTTP ${response.status} do canal ${CHANNEL_ID}`);
    throw new Error(`ThingSpeak respondeu com status ${response.status}`);
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.feeds)) {
    console.error(`[ThingSpeak] Formato de dados inválido retornado para o canal ${CHANNEL_ID}`);
    throw new Error('Formato de resposta inválido retornado pelo ThingSpeak');
  }

  return data.feeds;
}

// Servir arquivos estáticos do frontend (/web)
app.use(express.static(path.join(__dirname, '../web')));

// Rota de verificação de integridade
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Proxy para leituras do ThingSpeak com normalização
app.get('/api/readings', async (req, res) => {
  try {
    const feeds = await fetchThingSpeakReadings();
    const history = feeds.map(normalizeFeed);
    history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const latest = history.length > 0 ? history[history.length - 1] : null;

    const payload = {
      updatedAt: new Date().toISOString(),
      cached: false,
      latest,
      history
    };

    res.json(payload);
  } catch (err) {
    res.status(502).json({ error: 'Erro ao consultar o serviço ThingSpeak' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

module.exports = { app, normalizeFeed, parseNumber };
