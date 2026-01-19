/**
 * EProductSnippet Relay Server — Minimal
 * 
 * Простейший relay для localhost:
 * - POST /push   — Extension отправляет данные
 * - GET  /pull   — Plugin получает данные
 * - GET  /health — проверка
 * 
 * Без авторизации, один пользователь.
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3847;

// === Очередь данных ===
let dataQueue = [];
let lastPushTimestamp = null;  // Время последнего push от Extension
const MAX_QUEUE = 20;

// === Middleware ===
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

// === Routes ===

/**
 * POST /push — Extension отправляет данные
 */
app.post('/push', (req, res) => {
  const { payload, meta } = req.body;
  
  if (!payload) {
    return res.status(400).json({ error: 'Missing payload' });
  }
  
  // Обновляем timestamp последнего push
  lastPushTimestamp = new Date().toISOString();
  
  dataQueue.push({
    payload,
    meta: meta || {},
    pushedAt: lastPushTimestamp
  });
  
  // Ограничиваем очередь
  while (dataQueue.length > MAX_QUEUE) {
    dataQueue.shift();
  }
  
  console.log(`📥 Push: ${payload.items?.length || 0} items, queue: ${dataQueue.length}`);
  
  res.json({
    success: true,
    queueSize: dataQueue.length
  });
});

/**
 * GET /pull — Plugin получает данные
 */
app.get('/pull', (req, res) => {
  if (dataQueue.length === 0) {
    return res.json({
      hasData: false,
      queueSize: 0
    });
  }
  
  const entry = dataQueue.shift();
  
  console.log(`📤 Pull: ${entry.payload?.items?.length || 0} items, remaining: ${dataQueue.length}`);
  
  res.json({
    hasData: true,
    payload: entry.payload,
    meta: entry.meta,
    pushedAt: entry.pushedAt,
    remainingQueue: dataQueue.length
  });
});

/**
 * GET /status — Статус очереди
 */
app.get('/status', (req, res) => {
  res.json({
    queueSize: dataQueue.length,
    hasData: dataQueue.length > 0
  });
});

/**
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    queueSize: dataQueue.length,
    lastPushAt: lastPushTimestamp  // Время последнего push от Extension
  });
});

// === Start ===
app.listen(PORT, () => {
  console.log(`\n🚀 Relay Server — http://localhost:${PORT}`);
  console.log(`   POST /push  — send data from extension`);
  console.log(`   GET  /pull  — receive data in plugin\n`);
});
