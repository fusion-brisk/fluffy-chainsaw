// Plugin communication utilities

import { SheetData, UIMessage } from '../types';
import { fetchWithRetry, APPS_SCRIPT_URL, SPREADSHEET_ID } from './network';

// Logging function with timestamp
export function log(message: string, logArea?: HTMLTextAreaElement): void {
  const timestamp = new Date().toLocaleTimeString();
  if (logArea) {
    logArea.value += `[${timestamp}] ${message}\n`;
    logArea.scrollTop = logArea.scrollHeight;
  }
  console.log(`[${timestamp}] ${message}`);
}

// Apply Figma theme
export function applyFigmaTheme(): void {
  try {
    // Try to get theme from Figma via postMessage
    parent.postMessage({ pluginMessage: { type: 'get-theme' } }, '*');
    
    // Fallback: use system theme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    
    console.log(`Applied theme: ${prefersDark ? 'dark' : 'light'}`);
  } catch (error) {
    // If theme detection fails, use dark theme by default
    document.documentElement.setAttribute('data-theme', 'dark');
    console.log('Applied default theme: dark');
  }
}

// Send message to plugin (typed for compile-time validation)
export function sendMessageToPlugin(message: UIMessage): void {
  try {
    if (typeof parent.postMessage !== 'function') {
      console.error('parent.postMessage is not available!');
      return;
    }
    
    parent.postMessage({ pluginMessage: message }, '*');
    console.log('Message sent to plugin:', message.type);
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

// Close plugin
export function closePlugin(): void {
  sendMessageToPlugin({ type: 'close' });
}

// Load pages list from Figma document
export async function loadPagesList(): Promise<string[]> {
  try {
    console.log('📄 Loading pages list from Figma...');
    
    // Send message to plugin to get pages
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('❌ Timeout waiting for pages list');
        reject(new Error('Timeout waiting for pages list'));
      }, 10000); // Увеличиваем timeout до 10 секунд
      
      const handleMessage = (event: MessageEvent) => {
        console.log('📄 Received message:', event.data);
        const msg = event.data.pluginMessage;
        if (msg && msg.type === 'pages') {
          clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
          console.log('📄 Received pages list:', msg.pages);
          resolve(msg.pages || []);
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      // Request pages from plugin
      console.log('📄 Sending get-pages request to plugin...');
      sendMessageToPlugin({ type: 'get-pages' });
    });
    
  } catch (error) {
    console.error('❌ Error loading pages list:', error);
    throw error;
  }
}

// Load sheets list from Google Sheets
export async function loadSheetsList(): Promise<string[]> {
  try {
    console.log('📋 Loading sheets list...');
    console.log('📋 APPS_SCRIPT_URL:', APPS_SCRIPT_URL);
    console.log('📋 SPREADSHEET_ID:', SPREADSHEET_ID);
    
    const url = `${APPS_SCRIPT_URL}?action=getSheets&spreadsheetId=${SPREADSHEET_ID}`;
    console.log('📋 Full URL:', url);
    
    const response = await fetchWithRetry(url, {});
    console.log('📋 Response status:', response.status);
    
    const data: SheetData = await response.json();
    console.log('📋 Response data:', data);
    
    if (data.ok && data.sheets) {
      console.log(`📋 Loaded ${data.sheets.length} sheets: ${data.sheets.join(', ')}`);
      return data.sheets;
    }
    
    throw new Error('Apps Script did not return sheets list');
    
  } catch (error) {
    console.error('❌ Error loading sheets:', error);
    
    // Fallback: use known sheets
    const fallbackSheets = ['Блендеры', 'Товары', 'Новости', 'Пользователи'];
    console.log(`📋 Using fallback sheets: ${fallbackSheets.join(', ')}`);
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

