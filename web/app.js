'use strict';

const API_BASE_URL = '/api/readings';
const THINGSPEAK_BASE_URL = 'https://api.thingspeak.com/channels';
const POLL_INTERVAL_MS = 20000;
const REQUEST_TIMEOUT_MS = 10000;

const thingSpeakConfig = window.THINGSPEAK_CONFIG || {};
const THINGSPEAK_CHANNEL_ID = thingSpeakConfig.channelId || '3577130';
const THINGSPEAK_READ_API_KEY = thingSpeakConfig.readApiKey || 'SUA_READ_API_KEY';
const THINGSPEAK_RESULTS = Number(thingSpeakConfig.results) || 30;

const NIVEIS = Object.freeze({
  0: { nome: 'BOA' },
  1: { nome: 'MODERADA' },
  2: { nome: 'RUIM' },
});

const elements = {};
const state = {
  history: [],
  latest: null,
  updatedAt: null,
  isRefreshing: false,
  chart: null,
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheElements();
  setupTabs();
  state.chart = createChart();
  refreshData();
  window.setInterval(refreshData, POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshData();
    }
  });
}

function cacheElements() {
  elements.connectionPill = document.getElementById('connection-pill');
  elements.connectionText = document.getElementById('connection-text');
  elements.connectionSource = document.getElementById('connection-source');
  elements.lastUpdate = document.getElementById('last-update');
  elements.statusWarning = document.getElementById('status-warning');
  elements.eco2 = document.getElementById('eco2-value');
  elements.tvoc = document.getElementById('tvoc-value');
  elements.mq135 = document.getElementById('mq135-value');
  elements.statusGeralBadge = document.getElementById('status-geral-badge');
  elements.statusGeralDetail = document.getElementById('status-geral-detail');
  elements.alertaBadge = document.getElementById('alerta-badge');
  elements.alertaDetail = document.getElementById('alerta-detail');
  elements.airChart = document.getElementById('air-chart');
  elements.chartEmpty = document.getElementById('chart-empty');
  elements.historyBody = document.getElementById('history-body');
  elements.historyCount = document.getElementById('history-count');
  elements.alertBanner = document.getElementById('alert-banner');
  elements.alertBannerTitle = document.getElementById('alert-banner-title');
  elements.alertBannerDetails = document.getElementById('alert-banner-details');
  elements.alertBannerBadge = document.getElementById('alert-banner-badge');
  elements.alertList = document.getElementById('alert-list');
  elements.tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  elements.panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
}

function setupTabs() {
  elements.tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        return;
      }
      event.preventDefault();
      let targetIndex = index;
      if (event.key === 'ArrowRight') {
        targetIndex = (index + 1) % elements.tabs.length;
      } else if (event.key === 'ArrowLeft') {
        targetIndex = (index - 1 + elements.tabs.length) % elements.tabs.length;
      } else if (event.key === 'Home') {
        targetIndex = 0;
      } else if (event.key === 'End') {
        targetIndex = elements.tabs.length - 1;
      }
      const target = elements.tabs[targetIndex];
      selectTab(target);
      target.focus();
    });
  });
}

function selectTab(tab) {
  elements.tabs.forEach((item) => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
  });
  elements.panels.forEach((panel) => {
    panel.hidden = panel.id !== tab.getAttribute('aria-controls');
  });
}

async function refreshData() {
  if (state.isRefreshing) {
    return;
  }
  state.isRefreshing = true;

  try {
    let payload;
    try {
      payload = await fetchJson(buildBackendUrl(), { cache: 'no-store' });
      setConnection('online', 'backend /api/readings');
      clearWarning();
    } catch (backendError) {
      try {
        payload = await fetchThingSpeak();
        setConnection('fallback', 'ThingSpeak');
        showWarning('Backend indisponível. Exibindo dados diretos do ThingSpeak.');
      } catch (fallbackError) {
        setConnection('error');
        showWarning('Não foi possível atualizar os dados. Exibindo a última leitura recebida.');
        return;
      }
    }
    applyPayload(payload);
  } finally {
    state.isRefreshing = false;
  }
}

function buildBackendUrl() {
  const separator = API_BASE_URL.includes('?') ? '&' : '?';
  return `${API_BASE_URL}${separator}_=${Date.now()}`;
}

function fetchThingSpeak() {
  const url = new URL(`${THINGSPEAK_BASE_URL}/${encodeURIComponent(THINGSPEAK_CHANNEL_ID)}/feeds.json`);
  url.searchParams.set('api_key', THINGSPEAK_READ_API_KEY);
  url.searchParams.set('results', String(THINGSPEAK_RESULTS));
  return fetchJson(url.toString(), { cache: 'no-store' }).then((data) => {
    if (!data || !Array.isArray(data.feeds)) {
      throw new Error('Resposta inválida do ThingSpeak');
    }
    const history = data.feeds.map(normalizeReading).filter(Boolean);
    return normalizePayload({
      updatedAt: new Date().toISOString(),
      cached: false,
      latest: history[history.length - 1] || null,
      history,
    });
  });
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function applyPayload(payload) {
  const normalized = normalizePayload(payload);
  state.history = normalized.history;
  state.latest = normalized.latest;
  state.updatedAt = normalized.updatedAt;
  renderAll();
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Resposta inválida da API');
  }
  const history = (Array.isArray(payload.history) ? payload.history : [])
    .map(normalizeReading)
    .filter(Boolean)
    .sort((a, b) => toTime(a.timestamp) - toTime(b.timestamp));
  const latest = normalizeReading(payload.latest) || history[history.length - 1] || null;
  if (!latest && history.length === 0) {
    throw new Error('Nenhuma leitura disponível');
  }
  const updatedAt = isValidDate(payload.updatedAt)
    ? payload.updatedAt
    : (latest && latest.timestamp) || new Date().toISOString();
  return {
    updatedAt,
    cached: Boolean(payload.cached),
    latest,
    history: history.length ? history : [latest],
  };
}

function normalizeReading(reading) {
  if (!reading || typeof reading !== 'object') {
    return null;
  }
  const alerta = toAlert(reading.alerta ?? reading.field4, toNivel(reading.nivel ?? reading.field5, reading.alerta ?? reading.field4));
  const nivel = toNivel(reading.nivel ?? reading.field5, alerta);
  const normalized = {
    timestamp: reading.timestamp || reading.created_at || null,
    eco2: toNumber(reading.eco2 ?? reading.field1),
    tvoc: toNumber(reading.tvoc ?? reading.field2),
    mq135: toNumber(reading.mq135 ?? reading.field3),
    alerta,
    nivel,
    nivelNome: NIVEIS[nivel].nome,
  };
  const hasData = normalized.timestamp || normalized.eco2 !== null || normalized.tvoc !== null || normalized.mq135 !== null;
  return hasData ? normalized : null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toAlert(value, nivel) {
  const number = toNumber(value);
  if (number !== null) {
    return number === 1 ? 1 : 0;
  }
  return nivel >= 1 ? 1 : 0;
}

function toNivel(value, alerta) {
  const number = toNumber(value);
  if (number !== null && number >= 0 && number <= 2) {
    return Math.round(number);
  }
  return toAlert(alerta, 0) === 1 ? 1 : 0;
}

function isValidDate(value) {
  if (!value) {
    return false;
  }
  return !Number.isNaN(new Date(value).getTime());
}

function toTime(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatNumber(value, digits) {
  const number = toNumber(value);
  if (number === null) {
    return '---';
  }
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function setConnection(status, sourceLabel) {
  const labels = {
    loading: 'Conectando...',
    online: 'Online',
    fallback: 'Fallback',
    error: 'Erro',
  };
  elements.connectionPill.dataset.status = status;
  elements.connectionText.textContent = labels[status] || status;
  elements.connectionSource.textContent = sourceLabel ? `Fonte: ${sourceLabel}` : '';
}

function showWarning(message) {
  elements.statusWarning.textContent = message;
  elements.statusWarning.hidden = false;
}

function clearWarning() {
  elements.statusWarning.textContent = '';
  elements.statusWarning.hidden = true;
}

function renderAll() {
  renderConnectionMeta();
  renderMetricValues();
  renderStatusBadges();
  renderChart();
  renderHistory();
  renderAlerts();
}

function renderConnectionMeta() {
  if (!state.updatedAt) {
    return;
  }
  elements.lastUpdate.textContent = formatDateTime(state.updatedAt);
  elements.lastUpdate.dateTime = state.updatedAt;
}

function renderMetricValues() {
  elements.eco2.textContent = formatNumber(state.latest && state.latest.eco2, 0);
  elements.tvoc.textContent = formatNumber(state.latest && state.latest.tvoc, 0);
  elements.mq135.textContent = formatNumber(state.latest && state.latest.mq135, 3);
}

function createChart() {
  if (typeof Chart === 'undefined' || !elements.airChart) {
    return null;
  }
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.font.family = 'Inter, system-ui, -apple-system, sans-serif';
  return new Chart(elements.airChart.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'eCO2',
          data: [],
          yAxisID: 'yECO2',
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.15)',
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#0f172a',
          pointBorderWidth: 2,
          pointRadius: 2.5,
          pointHoverRadius: 5,
          borderWidth: 2,
          tension: 0.35,
          spanGaps: false,
        },
        {
          label: 'TVOC',
          data: [],
          yAxisID: 'yTVOC',
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167, 139, 250, 0.15)',
          pointBackgroundColor: '#a78bfa',
          pointBorderColor: '#0f172a',
          pointBorderWidth: 2,
          pointRadius: 2.5,
          pointHoverRadius: 5,
          borderWidth: 2,
          tension: 0.35,
          spanGaps: false,
        },
        {
          label: 'MQ135 (delta)',
          data: [],
          yAxisID: 'yMQ135',
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251, 191, 36, 0.15)',
          pointBackgroundColor: '#fbbf24',
          pointBorderColor: '#0f172a',
          pointBorderWidth: 2,
          pointRadius: 2.5,
          pointHoverRadius: 5,
          borderWidth: 2,
          tension: 0.35,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      animation: {
        duration: 350,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          borderColor: 'rgba(148, 163, 184, 0.25)',
          borderWidth: 1,
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          padding: 12,
          callbacks: {
            label: (context) => formatChartTooltip(context),
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(148, 163, 184, 0.08)',
          },
          border: {
            display: false,
          },
          ticks: {
            color: '#94a3b8',
            maxTicksLimit: 8,
          },
        },
        yECO2: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          grace: '10%',
          title: {
            display: true,
            text: 'eCO2 (ppm)',
            color: '#38bdf8',
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.08)',
          },
          border: {
            display: false,
          },
          ticks: {
            color: '#38bdf8',
            maxTicksLimit: 6,
          },
        },
        yTVOC: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          grace: '10%',
          title: {
            display: true,
            text: 'TVOC (ppb)',
            color: '#a78bfa',
          },
          grid: {
            drawOnChartArea: false,
          },
          border: {
            display: false,
          },
          ticks: {
            color: '#a78bfa',
            maxTicksLimit: 6,
          },
        },
        yMQ135: {
          type: 'linear',
          position: 'right',
          display: false,
          beginAtZero: true,
          grace: '20%',
          grid: {
            drawOnChartArea: false,
          },
          border: {
            display: false,
          },
          ticks: {
            display: false,
          },
        },
      },
    },
  });
}

function formatChartTooltip(context) {
  const units = ['ppm', 'ppb', 'V'];
  const digits = [0, 0, 3];
  const index = context.datasetIndex;
  const value = formatNumber(context.parsed.y, digits[index] || 0);
  return ` ${context.dataset.label}: ${value} ${units[index] || ''}`;
}

function renderChart() {
  const history = state.history.slice(-30);
  if (elements.chartEmpty) {
    elements.chartEmpty.hidden = history.length > 0 && Boolean(state.chart);
  }
  if (!state.chart) {
    return;
  }
  state.chart.data.labels = history.map((reading) => formatTime(reading.timestamp));
  state.chart.data.datasets[0].data = history.map((reading) => reading.eco2);
  state.chart.data.datasets[1].data = history.map((reading) => reading.tvoc);
  state.chart.data.datasets[2].data = history.map((reading) => reading.mq135);
  state.chart.update('none');
}

function renderStatusBadges() {
  const latest = state.latest;
  if (!latest) {
    setLevelBadge(elements.statusGeralBadge, 0, '--');
    setAlertBadge(elements.alertaBadge, 0, '--');
    elements.statusGeralDetail.textContent = 'Aguardando primeira leitura';
    elements.alertaDetail.textContent = 'Aguardando primeira leitura';
    return;
  }
  setLevelBadge(elements.statusGeralBadge, latest.nivel, latest.nivelNome);
  setAlertBadge(elements.alertaBadge, latest.alerta);
  elements.statusGeralDetail.textContent = `Nível ${latest.nivel} · ${latest.nivelNome}`;
  elements.alertaDetail.textContent = latest.alerta === 1
    ? `Disparado às ${formatDateTime(latest.timestamp)}`
    : 'Nenhum alerta ativo na última leitura';
}

function setLevelBadge(element, nivel, label) {
  element.className = 'level-badge';
  element.dataset.level = String(nivel);
  element.textContent = label || NIVEIS[nivel].nome;
}

function setAlertBadge(element, alerta, label) {
  element.className = 'alert-badge';
  element.dataset.alert = String(alerta === 1 ? 1 : 0);
  element.textContent = label || (alerta === 1 ? 'ALERTA ATIVO' : 'NORMAL');
}

function createLevelBadge(nivel, nome) {
  const badge = document.createElement('span');
  setLevelBadge(badge, nivel, nome);
  return badge;
}

function createAlertBadge(alerta) {
  const badge = document.createElement('span');
  setAlertBadge(badge, alerta);
  return badge;
}

function createTextCell(text) {
  const cell = document.createElement('td');
  cell.textContent = text;
  return cell;
}

function renderHistory() {
  const history = state.history.slice(-30).reverse();
  elements.historyBody.replaceChildren();
  elements.historyCount.textContent = `${history.length} leitura${history.length === 1 ? '' : 's'}`;
  if (!history.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'empty-row';
    cell.textContent = 'Nenhuma leitura disponível.';
    row.appendChild(cell);
    elements.historyBody.appendChild(row);
    return;
  }
  history.forEach((reading) => {
    const row = document.createElement('tr');
    row.appendChild(createTextCell(formatDateTime(reading.timestamp)));
    row.appendChild(createTextCell(formatNumber(reading.eco2, 0)));
    row.appendChild(createTextCell(formatNumber(reading.tvoc, 0)));
    row.appendChild(createTextCell(formatNumber(reading.mq135, 3)));
    const levelCell = document.createElement('td');
    levelCell.appendChild(createLevelBadge(reading.nivel, reading.nivelNome));
    row.appendChild(levelCell);
    const alertCell = document.createElement('td');
    alertCell.appendChild(createAlertBadge(reading.alerta));
    row.appendChild(alertCell);
    elements.historyBody.appendChild(row);
  });
}

function isAlert(reading) {
  return Boolean(reading && (reading.alerta === 1 || reading.nivel >= 1));
}

function renderAlerts() {
  const recentAlerts = state.history.filter(isAlert);
  const latest = state.latest;
  const active = isAlert(latest);
  const level = active ? latest.nivel : 0;
  elements.alertBanner.dataset.level = String(level);
  if (active) {
    elements.alertBannerTitle.textContent = level === 2
      ? 'Alerta crítico: qualidade do ar RUIM'
      : 'Atenção: qualidade do ar MODERADA';
    elements.alertBannerDetails.textContent = `Disparado às ${formatDateTime(latest.timestamp)} · eCO2 ${formatNumber(latest.eco2, 0)} ppm · TVOC ${formatNumber(latest.tvoc, 0)} ppb · MQ135 ${formatNumber(latest.mq135, 3)} V · field4=${latest.alerta}, field5=${latest.nivel}.`;
    setLevelBadge(elements.alertBannerBadge, level, latest.nivelNome);
  } else {
    elements.alertBannerTitle.textContent = 'Sem alertas';
    elements.alertBannerDetails.textContent = recentAlerts.length
      ? `Nenhum alerta ativo na última leitura. ${recentAlerts.length} alerta(s) registrado(s) nas últimas 30 medições.`
      : 'Todas as leituras recentes estão dentro do nível BOA.';
    setLevelBadge(elements.alertBannerBadge, 0, 'BOA');
  }
  renderAlertList(recentAlerts);
}

function renderAlertList(alerts) {
  elements.alertList.replaceChildren();
  if (!alerts.length) {
    const item = document.createElement('li');
    item.className = 'alert-empty';
    item.textContent = 'Nenhum alerta nas últimas 30 leituras.';
    elements.alertList.appendChild(item);
    return;
  }
  alerts.slice().reverse().forEach((reading) => {
    const item = document.createElement('li');
    item.className = 'alert-item';
    const time = document.createElement('div');
    time.className = 'alert-item-time';
    time.textContent = formatDateTime(reading.timestamp);
    const content = document.createElement('div');
    const values = document.createElement('p');
    values.className = 'alert-item-values';
    values.textContent = `eCO2 ${formatNumber(reading.eco2, 0)} ppm · TVOC ${formatNumber(reading.tvoc, 0)} ppb · MQ135 ${formatNumber(reading.mq135, 3)} V · field4=${reading.alerta}, field5=${reading.nivel}`;
    content.appendChild(values);
    item.appendChild(time);
    item.appendChild(content);
    item.appendChild(createLevelBadge(reading.nivel, reading.nivelNome));
    elements.alertList.appendChild(item);
  });
}
