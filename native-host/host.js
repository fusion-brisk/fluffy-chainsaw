#!/usr/bin/env node
/**
 * EProductSnippet Native Messaging Host
 * 
 * Этот скрипт:
 * 1. Принимает сообщения от Chrome Extension через Native Messaging
 * 2. Запускает встроенный Relay сервер на localhost:3847
 * 3. Отвечает расширению о статусе сервера
 * 
 * Native Messaging Protocol:
 * - Входящие сообщения: 4 байта длины (little-endian) + JSON
 * - Исходящие сообщения: 4 байта длины (little-endian) + JSON
 */

const http = require('http');
const { spawn } = require('child_process');

// === Конфигурация ===
const RELAY_PORT = 3847;
const HOST_NAME = 'com.eproductsnippet.relay';

// === Состояние ===
let relayServer = null;
let dataQueue = [];
let lastPushTimestamp = null;  // Время последнего push от Extension
const MAX_QUEUE = 20;

// === Native Messaging I/O ===

/**
 * Читает сообщение из stdin (Native Messaging протокол)
 */
function readMessage(callback) {
  let lengthBuffer = Buffer.alloc(4);
  let bytesRead = 0;
  
  process.stdin.on('readable', function onReadable() {
    // Читаем 4 байта длины
    if (bytesRead < 4) {
      const chunk = process.stdin.read(4 - bytesRead);
      if (chunk) {
        chunk.copy(lengthBuffer, bytesRead);
        bytesRead += chunk.length;
      }
    }
    
    if (bytesRead === 4) {
      const messageLength = lengthBuffer.readUInt32LE(0);
      
      if (messageLength > 0 && messageLength < 1024 * 1024) {
        const messageChunk = process.stdin.read(messageLength);
        if (messageChunk) {
          try {
            const message = JSON.parse(messageChunk.toString('utf8'));
            callback(message);
          } catch (e) {
            sendMessage({ error: 'Invalid JSON', details: e.message });
          }
          // Сброс для следующего сообщения
          bytesRead = 0;
          lengthBuffer = Buffer.alloc(4);
        }
      }
    }
  });
}

/**
 * Отправляет сообщение в stdout (Native Messaging протокол)
 */
function sendMessage(message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buffer.length, 0);
  
  process.stdout.write(header);
  process.stdout.write(buffer);
}

// === Встроенный Relay Server ===

/**
 * Создаёт и запускает HTTP сервер для relay
 */
function startRelayServer() {
  if (relayServer) {
    return Promise.resolve({ success: true, message: 'Already running' });
  }
  
  return new Promise((resolve) => {
    relayServer = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      const url = req.url;
      
      // === POST /push ===
      if (req.method === 'POST' && url === '/push') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const { payload, meta } = data;
            
            if (!payload) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing payload' }));
              return;
            }
            
            // Обновляем timestamp последнего push
            lastPushTimestamp = new Date().toISOString();
            
            dataQueue.push({
              payload,
              meta: meta || {},
              pushedAt: lastPushTimestamp
            });
            
            while (dataQueue.length > MAX_QUEUE) {
              dataQueue.shift();
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, queueSize: dataQueue.length }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }
      
      // === GET /pull ===
      if (req.method === 'GET' && url === '/pull') {
        if (dataQueue.length === 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hasData: false, queueSize: 0 }));
          return;
        }
        
        const entry = dataQueue.shift();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          hasData: true,
          payload: entry.payload,
          meta: entry.meta,
          pushedAt: entry.pushedAt,
          remainingQueue: dataQueue.length
        }));
        return;
      }
      
      // === GET /status ===
      if (req.method === 'GET' && url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ queueSize: dataQueue.length, hasData: dataQueue.length > 0 }));
        return;
      }
      
      // === GET /health ===
      if (req.method === 'GET' && url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'ok', 
          queueSize: dataQueue.length, 
          host: HOST_NAME,
          lastPushAt: lastPushTimestamp  // Время последнего push от Extension
        }));
        return;
      }
      
      // === 404 ===
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
    
    relayServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Порт уже занят — возможно, уже запущен другой инстанс
        resolve({ success: true, message: 'Port already in use (relay may already be running)', port: RELAY_PORT });
      } else {
        resolve({ success: false, error: err.message });
      }
    });
    
    relayServer.listen(RELAY_PORT, '127.0.0.1', () => {
      resolve({ success: true, message: 'Relay server started', port: RELAY_PORT });
    });
  });
}

/**
 * Останавливает relay сервер
 */
function stopRelayServer() {
  return new Promise((resolve) => {
    if (!relayServer) {
      resolve({ success: true, message: 'Not running' });
      return;
    }
    
    relayServer.close(() => {
      relayServer = null;
      resolve({ success: true, message: 'Relay server stopped' });
    });
  });
}

// === Обработка сообщений от Extension ===

async function handleMessage(message) {
  const { action } = message;
  
  switch (action) {
    case 'start':
    case 'ping':
      const result = await startRelayServer();
      sendMessage({
        action: 'status',
        running: true,
        port: RELAY_PORT,
        ...result
      });
      break;
      
    case 'stop':
      const stopResult = await stopRelayServer();
      sendMessage({
        action: 'status',
        running: false,
        ...stopResult
      });
      break;
      
    case 'status':
      sendMessage({
        action: 'status',
        running: !!relayServer,
        port: RELAY_PORT,
        queueSize: dataQueue.length
      });
      break;
      
    default:
      sendMessage({
        error: 'Unknown action',
        received: action
      });
  }
}

// === Главный цикл ===

async function main() {
  // Автозапуск relay при старте host
  await startRelayServer();
  
  // Отправляем начальный статус
  sendMessage({
    action: 'started',
    running: true,
    port: RELAY_PORT,
    host: HOST_NAME
  });
  
  // Слушаем сообщения от Extension
  readMessage(handleMessage);
  
  // Обработка завершения
  process.on('SIGTERM', async () => {
    await stopRelayServer();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    await stopRelayServer();
    process.exit(0);
  });
}

// Запуск
main().catch(err => {
  sendMessage({ error: 'Host error', details: err.message });
  process.exit(1);
});
