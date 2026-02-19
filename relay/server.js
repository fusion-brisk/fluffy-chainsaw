/**
 * Contentify Relay Server — with WebSocket
 * 
 * Relay для localhost с WebSocket поддержкой:
 * - POST /push    — Extension отправляет данные
 * - GET  /peek    — Plugin просматривает данные БЕЗ удаления
 * - GET  /pull    — Plugin получает данные (удаляет из очереди)
 * - POST /ack     — Plugin подтверждает принятие данных
 * - GET  /status  — Статус очереди
 * - POST /result  — Plugin отправляет экспорт Figma фрейма
 * - GET  /result  — Отдаёт экспортированное изображение результата
 * - POST /reimport — Повторная очередь последнего импорта
 * - GET  /comparison — Статус screenshot vs result для сравнения
 * - GET  /health  — проверка
 * - WS  /         — WebSocket для instant push notifications
 * 
 * Без авторизации, один пользователь.
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs');
const fsPromises = require('fs').promises;
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

// === Сохранение очереди в файл (async + debounce + atomic) ===
let saveQueueTimer = null;
let isSaving = false;

async function saveQueueAsync() {
  if (isSaving) return;
  isSaving = true;
  
  try {
    const tmpFile = DATA_FILE + '.tmp';
    const data = JSON.stringify({
      queue: dataQueue,
      lastPushTimestamp,
      savedAt: new Date().toISOString()
    });
    
    // Atomic write: write to temp file, then rename
    await fsPromises.writeFile(tmpFile, data, 'utf8');
    await fsPromises.rename(tmpFile, DATA_FILE);
  } catch (e) {
    console.error('⚠️ Ошибка сохранения очереди:', e.message);
  } finally {
    isSaving = false;
  }
}

// Debounced save: coalesces rapid push/ack operations into a single write
function saveQueue() {
  if (saveQueueTimer) clearTimeout(saveQueueTimer);
  saveQueueTimer = setTimeout(() => {
    saveQueueTimer = null;
    saveQueueAsync();
  }, 300);
}

// Immediate save (for shutdown)
function saveQueueImmediate() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      queue: dataQueue,
      lastPushTimestamp,
      savedAt: new Date().toISOString()
    }));
  } catch (e) {
    console.error('⚠️ Ошибка сохранения очереди:', e.message);
  }
}

// Save on shutdown
process.on('SIGINT', () => {
  saveQueueImmediate();
  process.exit(0);
});
process.on('SIGTERM', () => {
  saveQueueImmediate();
  process.exit(0);
});

// Загружаем очередь при старте
loadQueue();

// === Middleware ===
app.use(cors({ origin: '*' }));
app.use(compression({ threshold: 1024 })); // gzip responses > 1KB
app.use(express.json({ limit: '10mb' })); // Increased for full-page screenshot segments

// === Routes ===

/**
 * POST /push — Extension отправляет данные
 */
app.post('/push', (req, res) => {
  const { payload, meta } = req.body;
  
  if (!payload) {
    return res.status(400).json({ error: 'Missing payload' });
  }
  
  // Validate payload size: reject if rawRows exceeds 1MB when serialized
  const MAX_PAYLOAD_SIZE = 1 * 1024 * 1024; // 1MB
  try {
    const rawRowsSize = payload.rawRows ? JSON.stringify(payload.rawRows).length : 0;
    if (rawRowsSize > MAX_PAYLOAD_SIZE) {
      console.warn(`⚠️ Push rejected: payload too large (${(rawRowsSize / 1024 / 1024).toFixed(2)}MB)`);
      return res.status(413).json({ error: 'Payload too large', maxSizeMB: 1, actualSizeMB: +(rawRowsSize / 1024 / 1024).toFixed(2) });
    }
  } catch { /* size check failed, allow through */ }
  
  // Extract and store screenshot segments separately (don't persist in queue)
  if (payload.screenshots && payload.screenshots.length > 0) {
    const query = payload.rawRows?.[0]?.['#query'] || '';
    screenshotSegments = payload.screenshots;
    screenshotMeta = {
      ...(payload.screenshotMeta || {}),
      capturedAt: payload.capturedAt || new Date().toISOString(),
      query,
      url: payload.source?.url || '',
      count: payload.screenshots.length
    };
    const totalKB = Math.round(screenshotSegments.reduce((sum, s) => sum + s.length, 0) / 1024);
    console.log(`📸 ${screenshotSegments.length} screenshot segments stored: ${totalKB}KB, query: "${query}"`);
    delete payload.screenshots; // Don't persist in queue file
    delete payload.screenshotMeta;
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
  
  const snippetCount = payload.rawRows?.length || 0;
  const wizardCount = payload.wizards?.length || 0;
  const itemCount = snippetCount + wizardCount;
  console.log(`📥 Push: ${snippetCount} snippets + ${wizardCount} wizards (schema v${payload.schemaVersion || 1}), queue: ${dataQueue.length}, id: ${entryId}`);
  
  // Store deep copy for reimport (before broadcast, after screenshot extraction)
  try {
    lastImportPayload = JSON.parse(JSON.stringify(req.body));
  } catch { /* ignore clone errors */ }

  // Broadcast to all WebSocket clients for instant delivery
  const query = payload.rawRows?.[0]?.['#query'] || '';
  broadcast({
    type: 'new-data',
    entryId,
    itemCount,
    snippetCount,
    wizardCount,
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
  const PEEK_STALE_MS = 60000; // Auto-unblock entries peeked > 60s ago
  const now = Date.now();
  
  // Находим первую неподтверждённую запись (skip stale-peeked ones)
  const entry = dataQueue.find(e => {
    if (e.acknowledged) return false;
    // If peeked long ago, treat as stale (auto-unblock)
    if (e.lastPeekedAt && (now - e.lastPeekedAt) > PEEK_STALE_MS) {
      e.lastPeekedAt = null; // Reset to allow re-peek
    }
    return true;
  });
  
  if (!entry) {
    return res.json({
      hasData: false,
      queueSize: dataQueue.length
    });
  }
  
  // Mark when this entry was peeked
  entry.lastPeekedAt = now;
  
  const itemCount = entry.payload?.rawRows?.length || 0;
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
  
  const itemCount = entry.payload?.rawRows?.length || 0;
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
  
  const itemCount = removed.payload?.rawRows?.length || 0;
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
    const itemCount = entry.payload?.rawRows?.length || 0;
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

// === Screenshot Storage ===
// Stores full-page screenshot segments (array of data URLs)
let screenshotSegments = [];
let screenshotMeta = null;

// === Result Export Storage ===
// Stores plugin-exported Figma frame as data URL
let resultSegments = [];
let resultMeta = null;

// === Last Import Payload (for reimport) ===
let lastImportPayload = null;

/**
 * GET /screenshot — Serve full-page screenshot segments
 *
 * No params     → JSON metadata (count, dimensions, segment sizes)
 * ?index=N      → serve segment N as image/jpeg
 * ?index=all    → JSON array of all data URLs (batch fetch)
 */
app.get('/screenshot', (req, res) => {
  if (screenshotSegments.length === 0) {
    return res.status(404).json({ error: 'No screenshot available. Click the extension icon on a Yandex page.' });
  }

  const index = req.query.index;

  // ?index=all — return all data URLs as JSON array
  if (index === 'all') {
    return res.json({
      segments: screenshotSegments,
      meta: screenshotMeta
    });
  }

  // ?index=N — serve single segment as image
  if (index !== undefined) {
    const i = parseInt(index, 10);
    if (isNaN(i) || i < 0 || i >= screenshotSegments.length) {
      return res.status(400).json({
        error: `Invalid index. Valid range: 0..${screenshotSegments.length - 1}`
      });
    }

    const dataUrl = screenshotSegments[i];
    const matches = dataUrl.match(/^data:image\/([\w+]+);base64,(.+)$/);
    if (!matches) {
      return res.status(500).json({ error: 'Invalid screenshot data' });
    }

    const ext = matches[1];
    const buf = Buffer.from(matches[2], 'base64');

    res.set('Content-Type', `image/${ext}`);
    res.set('Content-Length', buf.length);
    res.set('X-Segment-Index', String(i));
    res.set('X-Segment-Count', String(screenshotSegments.length));
    return res.send(buf);
  }

  // No params — return metadata
  const segmentSizes = screenshotSegments.map(s => {
    const matches = s.match(/^data:image\/[\w+]+;base64,(.+)$/);
    return matches ? Math.round(Buffer.from(matches[1], 'base64').length / 1024) : 0;
  });

  res.json({
    hasScreenshot: true,
    count: screenshotSegments.length,
    meta: screenshotMeta,
    segments: segmentSizes.map((sizeKB, i) => ({ index: i, sizeKB }))
  });
});

// === Debug Endpoint ===
// Plugin отправляет debug-отчёт после каждой операции.
// Claude Code читает через GET /debug.
const debugReports = [];
const MAX_DEBUG_REPORTS = 5;

app.post('/debug', (req, res) => {
  const report = req.body;
  if (!report) {
    return res.status(400).json({ error: 'Empty body' });
  }
  report._receivedAt = new Date().toISOString();
  debugReports.unshift(report);
  if (debugReports.length > MAX_DEBUG_REPORTS) {
    debugReports.length = MAX_DEBUG_REPORTS;
  }
  console.log(`[Debug] Report received: ${report.operation || 'unknown'}, success=${report.success}, errors=${(report.errors || []).length}`);
  res.json({ ok: true, stored: debugReports.length });
});

app.get('/debug', (req, res) => {
  if (debugReports.length === 0) {
    return res.json({ hasReport: false, message: 'No debug reports yet. Run an import in Figma.' });
  }
  const latest = debugReports[0];
  res.json({ hasReport: true, report: latest, totalReports: debugReports.length });
});

app.get('/debug/all', (req, res) => {
  res.json({ reports: debugReports, count: debugReports.length });
});

// === Result Export (Figma frame → relay) ===

/**
 * POST /result — Plugin sends exported Figma frame as base64 data URL
 * Body: { dataUrl: "data:image/jpeg;base64,...", meta: { width, height, query, scale } }
 */
app.post('/result', (req, res) => {
  const { dataUrl, meta } = req.body;

  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid dataUrl' });
  }

  resultSegments = [dataUrl];
  resultMeta = {
    ...(meta || {}),
    receivedAt: new Date().toISOString()
  };

  const sizeKB = Math.round(dataUrl.length * 3 / 4 / 1024); // approx decoded size
  console.log(`🖼️ Result export stored: ~${sizeKB}KB, query: "${meta?.query || ''}"`);

  res.json({ success: true, sizeKB });
});

/**
 * GET /result — Serve the stored result image
 * No params  → JSON metadata
 * ?index=0   → raw JPEG bytes (Content-Type: image/jpeg)
 */
app.get('/result', (req, res) => {
  if (resultSegments.length === 0) {
    return res.status(404).json({ error: 'No result export available. Run an import in Figma first.' });
  }

  const index = req.query.index;

  // ?index=N — serve as raw image
  if (index !== undefined) {
    const i = parseInt(index, 10);
    if (isNaN(i) || i < 0 || i >= resultSegments.length) {
      return res.status(400).json({ error: `Invalid index. Valid range: 0..${resultSegments.length - 1}` });
    }

    const dataUrl = resultSegments[i];
    const matches = dataUrl.match(/^data:image\/([\w+]+);base64,(.+)$/);
    if (!matches) {
      return res.status(500).json({ error: 'Invalid result data' });
    }

    const ext = matches[1];
    const buf = Buffer.from(matches[2], 'base64');

    res.set('Content-Type', `image/${ext}`);
    res.set('Content-Length', buf.length);
    return res.send(buf);
  }

  // No params — return metadata
  const segmentSizes = resultSegments.map(s => {
    const matches = s.match(/^data:image\/[\w+]+;base64,(.+)$/);
    return matches ? Math.round(Buffer.from(matches[1], 'base64').length / 1024) : 0;
  });

  res.json({
    hasResult: true,
    count: resultSegments.length,
    meta: resultMeta,
    segments: segmentSizes.map((sizeKB, i) => ({ index: i, sizeKB }))
  });
});

/**
 * POST /reimport — Re-queue the last imported payload
 * Clones lastImportPayload into a new queue entry and broadcasts WebSocket event
 */
app.post('/reimport', (req, res) => {
  if (!lastImportPayload) {
    return res.status(404).json({ error: 'No previous import to replay. Send data via POST /push first.' });
  }

  // Clear previous result so the new export replaces it
  resultSegments = [];
  resultMeta = null;

  // Clone and inject into /push logic
  const cloned = JSON.parse(JSON.stringify(lastImportPayload));
  const payload = cloned.payload || cloned;
  const meta = cloned.meta || {};

  const entryId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  lastPushTimestamp = new Date().toISOString();

  dataQueue.push({
    id: entryId,
    payload,
    meta,
    pushedAt: lastPushTimestamp,
    acknowledged: false
  });

  while (dataQueue.length > MAX_QUEUE) {
    dataQueue.shift();
  }

  saveQueue();

  const snippetCount = payload.rawRows?.length || 0;
  const wizardCount = payload.wizards?.length || 0;
  console.log(`🔄 Reimport: ${snippetCount} snippets + ${wizardCount} wizards, id: ${entryId}`);

  // Broadcast to trigger plugin pickup
  const query = payload.rawRows?.[0]?.['#query'] || '';
  broadcast({
    type: 'new-data',
    entryId,
    itemCount: snippetCount + wizardCount,
    snippetCount,
    wizardCount,
    query,
    timestamp: Date.now()
  });

  res.json({ success: true, entryId, queueSize: dataQueue.length });
});

/**
 * GET /comparison — Convenience endpoint: availability of screenshot, result, source data
 */
app.get('/comparison', (req, res) => {
  const pendingCount = dataQueue.filter(e => !e.acknowledged).length;

  res.json({
    screenshot: {
      available: screenshotSegments.length > 0,
      count: screenshotSegments.length,
      meta: screenshotMeta
    },
    result: {
      available: resultSegments.length > 0,
      count: resultSegments.length,
      meta: resultMeta
    },
    sourceData: {
      available: pendingCount > 0,
      queueSize: dataQueue.length,
      pendingCount
    },
    canReimport: lastImportPayload !== null
  });
});

/**
 * GET /source-data — Serve last import's CSV rows for field-level verification
 * No params     → all rows + metadata
 * ?index=N      → single row by index
 */
app.get('/source-data', (req, res) => {
  if (!lastImportPayload) {
    return res.status(404).json({ error: 'No import data available. Send data via POST /push first.' });
  }

  const payload = lastImportPayload.payload || lastImportPayload;
  const rows = payload.rawRows || [];

  const index = req.query.index;
  if (index !== undefined) {
    const i = parseInt(index, 10);
    if (isNaN(i) || i < 0 || i >= rows.length) {
      return res.status(400).json({ error: `Invalid index. Valid range: 0..${rows.length - 1}` });
    }
    return res.json({ row: rows[i], index: i, totalRows: rows.length });
  }

  res.json({
    totalRows: rows.length,
    query: rows[0]?.['#query'] || '',
    capturedAt: payload.capturedAt || null,
    rows
  });
});

// === Start ===
server.listen(PORT, () => {
  console.log(`\n🚀 Relay Server — http://localhost:${PORT}`);
  console.log(`   POST /push    — send data from extension`);
  console.log(`   GET  /peek    — preview data (без удаления)`);
  console.log(`   GET  /pull    — receive data (удаляет из очереди)`);
  console.log(`   POST /ack     — confirm data received`);
  console.log(`   GET  /status  — queue status`);
  console.log(`   POST /result  — plugin exports Figma frame`);
  console.log(`   GET  /result  — serve exported result image`);
  console.log(`   POST /reimport — re-queue last import`);
  console.log(`   GET  /comparison — screenshot vs result status`);
  console.log(`   WS   /        — WebSocket for instant notifications\n`);
  
  if (dataQueue.length > 0) {
    console.log(`   📦 В очереди ${dataQueue.length} записей, ожидающих обработки\n`);
  }
});
