// Plugin communication utilities

import { SheetData, UIMessage } from '../types';
import { fetchWithRetry, APPS_SCRIPT_URL, SPREADSHEET_ID } from './network';
import { Logger } from '../logger';

// Logging function with timestamp
export function log(message: string, logArea?: HTMLTextAreaElement): void {
  const timestamp = new Date().toLocaleTimeString();
  if (logArea) {
    logArea.value += `[${timestamp}] ${message}\n`;
    logArea.scrollTop = logArea.scrollHeight;
  }
  Logger.debug(`[${timestamp}] ${message}`);
}

// Send message to plugin (typed for compile-time validation)
export function sendMessageToPlugin(message: UIMessage): void {
  try {
    if (typeof parent.postMessage !== 'function') {
      Logger.error('parent.postMessage is not available!');
      return;
    }

    parent.postMessage({ pluginMessage: message }, '*');
    Logger.debug('Message sent to plugin:', message.type);
  } catch (error) {
    Logger.error('Error sending message:', error);
  }
}

// Close plugin
export function closePlugin(): void {
  sendMessageToPlugin({ type: 'close' });
}

// Load pages list from Figma document
export async function loadPagesList(): Promise<string[]> {
  try {
    Logger.debug('📄 Loading pages list from Figma...');

    // Send message to plugin to get pages
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        Logger.error('❌ Timeout waiting for pages list');
        reject(new Error('Timeout waiting for pages list'));
      }, 10000); // Увеличиваем timeout до 10 секунд

      const handleMessage = (event: MessageEvent) => {
        Logger.debug('📄 Received message:', event.data);
        const msg = event.data.pluginMessage;
        if (msg && msg.type === 'pages') {
          clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
          Logger.debug('📄 Received pages list:', msg.pages);
          resolve(msg.pages || []);
        }
      };

      window.addEventListener('message', handleMessage);

      // Request pages from plugin
      Logger.debug('📄 Sending get-pages request to plugin...');
      sendMessageToPlugin({ type: 'get-pages' });
    });
  } catch (error) {
    Logger.error('❌ Error loading pages list:', error);
    throw error;
  }
}

// Load sheets list from Google Sheets
export async function loadSheetsList(): Promise<string[]> {
  try {
    Logger.debug('📋 Loading sheets list...');
    Logger.debug('📋 APPS_SCRIPT_URL:', APPS_SCRIPT_URL);
    Logger.debug('📋 SPREADSHEET_ID:', SPREADSHEET_ID);

    const url = `${APPS_SCRIPT_URL}?action=getSheets&spreadsheetId=${SPREADSHEET_ID}`;
    Logger.debug('📋 Full URL:', url);

    const response = await fetchWithRetry(url, {});
    Logger.debug('📋 Response status:', response.status);

    const data: SheetData = await response.json();
    Logger.debug('📋 Response data:', data);

    if (data.ok && data.sheets) {
      Logger.debug(`📋 Loaded ${data.sheets.length} sheets: ${data.sheets.join(', ')}`);
      return data.sheets;
    }

    throw new Error('Apps Script did not return sheets list');
  } catch (error) {
    Logger.error('❌ Error loading sheets:', error);

    // Fallback: use known sheets
    const fallbackSheets = ['Блендеры', 'Товары', 'Новости', 'Пользователи'];
    Logger.debug(`📋 Using fallback sheets: ${fallbackSheets.join(', ')}`);
    return fallbackSheets;
  }
}

// Fisher-Yates shuffle algorithm
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
