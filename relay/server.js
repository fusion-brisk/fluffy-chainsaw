/**
 * Contentify Relay Server — with WebSocket
 * 
 * Relay для localhost с WebSocket поддержкой:
 * - POST /push   — Extension отправляет данные
 * - GET  /peek   — Plugin просматривает данные БЕЗ удаления
 * - GET  /pull   — Plugin получает данные (удаляет из очереди)
 * - POST /ack    — Plugin подтверждает принятие данных
 * - GET  /status — Статус очереди
 * - GET  /health — проверка
 * - WS  /        — WebSocket для instant push notifications
 * 
 * Без авторизации, один пользователь.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 3847;

// === WebSocket Server ===
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Set of active WebSocket connections
const wsClients = new Set();

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected');
  wsClients.add(ws);
  
  // Mark as alive for heartbeat
  ws.isAlive = true;
  
  // Handle pong response
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  // Handle incoming messages (for future use)
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 WS message:', data.type || 'unknown');
      
      // Handle ping from client
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (e) {
      // Ignore invalid JSON
    }
  });
  
  // Handle disconnect
  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
    wsClients.delete(ws);
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    wsClients.delete(ws);
  });
  
  // Send welcome message with current queue status
  const pendingCount = dataQueue.filter(e => !e.acknowledged).length;
  ws.send(JSON.stringify({
    type: 'connected',
    queueSize: dataQueue.length,
    pendingCount,
    timestamp: Date.now()
  }));
});

// Heartbeat to keep connections alive and detect dead clients
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      wsClients.delete(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

/**
 * Broadcast message to all connected WebSocket clients
 */
function broadcast(message) {
  const data = JSON.stringify(message);
  let sent = 0;
  
  wsClients.forEach((ws) => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(data);
      sent++;
    }
  });
  
  if (sent > 0) {
    console.log(`📡 Broadcast to ${sent} client(s): ${message.type}`);
  }
}

// === Файл для персистентного хранения ===
const DATA_FILE = path.join(__dirname, '.relay-queue.json');

// === Очередь данных ===
let dataQueue = [];
let lastPushTimestamp = null;  // Время последнего push от Extension
const MAX_QUEUE = 20;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 часа — TTL для данных

// === Загрузка очереди из файла при старте ===
function loadQueue() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const now = Date.now();
      
      // Фильтруем устаревшие записи
      dataQueue = (data.queue || []).filter(entry => {
        const pushedAt = new Date(entry.pushedAt).getTime();
        return (now - pushedAt) < MAX_AGE_MS;
      });
      
      lastPushTimestamp = data.lastPushTimestamp || null;
      
      if (dataQueue.length > 0) {
        console.log(`📂 Загружено ${dataQueue.length} записей из файла`);
      }
    }
  } catch (e) {
    console.error('⚠️ Ошибка загрузки очереди:', e.message);
    dataQueue = [];
  }
}

// === Сохранение очереди в файл ===
function saveQueue() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      queue: dataQueue,
      lastPushTimestamp,
      savedAt: new Date().toISOString()
    }, null, 2));
  } catch (e) {
    console.error('⚠️ Ошибка сохранения очереди:', e.message);
  }
}

// Загружаем очередь при старте
loadQueue();

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
  
  // Генерируем уникальный ID для записи
  const entryId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Обновляем timestamp последнего push
  lastPushTimestamp = new Date().toISOString();
  
  dataQueue.push({
    id: entryId,
    payload,
    meta: meta || {},
    pushedAt: lastPushTimestamp,
    acknowledged: false
  });
  
  // Ограничиваем очередь
  while (dataQueue.length > MAX_QUEUE) {
    dataQueue.shift();
  }
  
  // Сохраняем в файл
  saveQueue();
  
  const itemCount = payload.rawRows?.length || payload.items?.length || 0;
  console.log(`📥 Push: ${itemCount} items, queue: ${dataQueue.length}, id: ${entryId}`);
  
  // Broadcast to all WebSocket clients for instant delivery
  const query = payload.rawRows?.[0]?.['#query'] || '';
  broadcast({
    type: 'new-data',
    entryId,
    itemCount,
    query,
    timestamp: Date.now()
  });
  
  res.json({
    success: true,
    queueSize: dataQueue.length,
    entryId
  });
});

/**
 * GET /peek — Plugin просматривает данные БЕЗ удаления
 * Используется для показа диалога подтверждения
 */
app.get('/peek', (req, res) => {
  // Находим первую неподтверждённую запись
  const entry = dataQueue.find(e => !e.acknowledged);
  
  if (!entry) {
    return res.json({
      hasData: false,
      queueSize: dataQueue.length
    });
  }
  
  const itemCount = entry.payload?.rawRows?.length || entry.payload?.items?.length || 0;
  console.log(`👁️ Peek: ${itemCount} items, id: ${entry.id}`);
  
  res.json({
    hasData: true,
    entryId: entry.id,
    payload: entry.payload,
    meta: entry.meta,
    pushedAt: entry.pushedAt,
    pendingCount: dataQueue.filter(e => !e.acknowledged).length
  });
});

/**
 * GET /pull — Plugin получает данные (удаляет из очереди)
 * @deprecated Используйте /peek + /ack для безопасного получения
 */
app.get('/pull', (req, res) => {
  if (dataQueue.length === 0) {
    return res.json({
      hasData: false,
      queueSize: 0
    });
  }
  
  const entry = dataQueue.shift();
  
  // Сохраняем в файл
  saveQueue();
  
  const itemCount = entry.payload?.rawRows?.length || entry.payload?.items?.length || 0;
  console.log(`📤 Pull: ${itemCount} items, remaining: ${dataQueue.length}`);
  
  res.json({
    hasData: true,
    entryId: entry.id,
    payload: entry.payload,
    meta: entry.meta,
    pushedAt: entry.pushedAt,
    remainingQueue: dataQueue.length
  });
});

/**
 * POST /ack — Plugin подтверждает принятие данных
 * После подтверждения данные удаляются из очереди
 */
app.post('/ack', (req, res) => {
  const { entryId } = req.body;
  
  if (!entryId) {
    return res.status(400).json({ error: 'Missing entryId' });
  }
  
  const index = dataQueue.findIndex(e => e.id === entryId);
  
  if (index === -1) {
    // Запись уже удалена или не найдена — это нормально
    console.log(`✓ Ack: id ${entryId} (уже удалён или не найден)`);
    return res.json({
      success: true,
      alreadyRemoved: true,
      queueSize: dataQueue.length
    });
  }
  
  // Удаляем запись из очереди
  const removed = dataQueue.splice(index, 1)[0];
  
  // Сохраняем в файл
  saveQueue();
  
  const itemCount = removed.payload?.rawRows?.length || removed.payload?.items?.length || 0;
  console.log(`✓ Ack: ${itemCount} items confirmed, id: ${entryId}, remaining: ${dataQueue.length}`);
  
  res.json({
    success: true,
    queueSize: dataQueue.length
  });
});

/**
 * POST /reject — Plugin отклоняет данные (не удаляет, но помечает)
 * Опционально: можно использовать для статистики
 */
app.post('/reject', (req, res) => {
  const { entryId } = req.body;
  
  // Просто логируем отклонение, данные остаются в очереди
  console.log(`✗ Reject: id ${entryId} (данные остаются в очереди)`);
  
  res.json({
    success: true,
    queueSize: dataQueue.length
  });
});

/**
 * GET /status — Статус очереди
 */
app.get('/status', (req, res) => {
  const pendingCount = dataQueue.filter(e => !e.acknowledged).length;
  
  // Информация о первой записи для UI
  let firstEntry = null;
  if (dataQueue.length > 0) {
    const entry = dataQueue[0];
    const itemCount = entry.payload?.rawRows?.length || entry.payload?.items?.length || 0;
    firstEntry = {
      id: entry.id,
      itemCount,
      pushedAt: entry.pushedAt,
      query: entry.payload?.rawRows?.[0]?.['#query'] || ''
    };
  }
  
  res.json({
    queueSize: dataQueue.length,
    pendingCount,
    hasData: pendingCount > 0,
    firstEntry
  });
});

/**
 * DELETE /clear — Очистка очереди (для отладки)
 */
app.delete('/clear', (req, res) => {
  const count = dataQueue.length;
  dataQueue = [];
  saveQueue();
  
  console.log(`🗑️ Clear: удалено ${count} записей`);
  
  res.json({
    success: true,
    cleared: count
  });
});

/**
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    queueSize: dataQueue.length,
    pendingCount: dataQueue.filter(e => !e.acknowledged).length,
    lastPushAt: lastPushTimestamp
  });
});

// === Start ===
server.listen(PORT, () => {
  console.log(`\n🚀 Relay Server — http://localhost:${PORT}`);
  console.log(`   POST /push  — send data from extension`);
  console.log(`   GET  /peek  — preview data (без удаления)`);
  console.log(`   GET  /pull  — receive data (удаляет из очереди)`);
  console.log(`   POST /ack   — confirm data received`);
  console.log(`   GET  /status — queue status`);
  console.log(`   WS   /      — WebSocket for instant notifications\n`);
  
  if (dataQueue.length > 0) {
    console.log(`   📦 В очереди ${dataQueue.length} записей, ожидающих обработки\n`);
  }
});
