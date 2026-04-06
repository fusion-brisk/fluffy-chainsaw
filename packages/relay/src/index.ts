import path from 'path';
import { runSetup } from './setup';

// Auto-setup: if run with --setup flag OR from outside ~/.contentify/
const INSTALL_DIR = path.join(process.env.HOME || '/tmp', '.contentify');
const isSetupFlag = process.argv.includes('--setup');
const isInstalledLocation = path.resolve(process.execPath).startsWith(path.resolve(INSTALL_DIR));

if (isSetupFlag || !isInstalledLocation) {
  runSetup();
  process.exit(0);
}

/**
 * Contentify Relay Server -- with WebSocket
 *
 * Relay for localhost with WebSocket support:
 * - POST /push    -- Extension sends data
 * - GET  /peek    -- Plugin previews data without removing
 * - GET  /pull    -- Plugin receives data (removes from queue)
 * - POST /ack     -- Plugin confirms data received
 * - GET  /status  -- Queue status
 * - POST /result  -- Plugin sends exported Figma frame
 * - GET  /result  -- Serve exported result image
 * - POST /reimport -- Re-queue last import
 * - GET  /comparison -- Screenshot vs result status
 * - GET  /health  -- Health check (includes version)
 * - GET  /version -- Detailed version + update info
 * - POST /update  -- Manual update trigger
 * - WS   /        -- WebSocket for instant push notifications
 *
 * No auth, single user.
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import http from 'http';
import { loadQueue, saveQueueImmediate, setBroadcast } from './queue';
import { initWebSocket, broadcast } from './websocket';
import pushRoutes from './routes/push';
import resultRoutes from './routes/result';
import screenshotRoutes from './routes/screenshot';
import healthRoutes from './routes/health';
import updateRoutes, { startUpdateSchedule } from './routes/update';
import debugRoutes from './routes/debug';
import debugLogRoutes from './routes/debug-log';
import comparisonRoutes from './routes/comparison';
import versionsRoutes from './routes/versions';
import buildHashRoutes from './routes/build-hash';
import imageProxyRoutes from './routes/image-proxy';
import { getQueue } from './queue';

const app = express();
const PORT = process.env.PORT || 3847;

// Create HTTP server for both Express and WebSocket
const server = http.createServer(app);

// Initialize WebSocket
initWebSocket(server);

// Wire broadcast into queue module
setBroadcast(broadcast);

// Load persisted queue
loadQueue();

// === Middleware ===
app.use(cors({ origin: '*' }));
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '10mb' }));

// === Routes ===
app.use(pushRoutes);
app.use(resultRoutes);
app.use(screenshotRoutes);
app.use(healthRoutes);
app.use(buildHashRoutes);
app.use(imageProxyRoutes);
app.use(updateRoutes);
app.use(debugRoutes);
app.use(debugLogRoutes);
app.use(comparisonRoutes);
app.use(versionsRoutes);

// === Graceful shutdown ===
process.on('SIGINT', () => {
  saveQueueImmediate();
  process.exit(0);
});
process.on('SIGTERM', () => {
  saveQueueImmediate();
  process.exit(0);
});

// === Start ===
server.listen(PORT, () => {
  console.log(`\nRelay Server -- http://localhost:${PORT}`);
  console.log('  POST /push    -- send data from extension');
  console.log('  GET  /peek    -- preview data (without removing)');
  console.log('  GET  /pull    -- receive data (removes from queue)');
  console.log('  POST /ack     -- confirm data received');
  console.log('  GET  /status  -- queue status');
  console.log('  POST /result  -- plugin exports Figma frame');
  console.log('  GET  /result  -- serve exported result image');
  console.log('  POST /reimport -- re-queue last import');
  console.log('  GET  /comparison -- screenshot vs result status');
  console.log('  WS   /        -- WebSocket for instant notifications\n');

  const queue = getQueue();
  if (queue.length > 0) {
    console.log(`  ${queue.length} entries in queue, waiting to be processed\n`);
  }

  // Start periodic update checks
  startUpdateSchedule();
});
