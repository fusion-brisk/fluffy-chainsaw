/**
 * Contentify Extension — Options Page
 */

const DEFAULT_RELAY_URL = 'http://localhost:3847';

const relayUrlInput = document.getElementById('relayUrl') as HTMLInputElement | null;
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const testBtn = document.getElementById('testBtn');
const testResult = document.getElementById('testResult');
const statusEl = document.getElementById('status');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');

// Load saved settings
async function loadSettings(): Promise<void> {
  const { relayUrl } = await chrome.storage.local.get('relayUrl');
  if (relayUrlInput) {
    relayUrlInput.value = (relayUrl as string) || DEFAULT_RELAY_URL;
  }
}

// Save settings
async function saveSettings(): Promise<void> {
  const url = relayUrlInput?.value.trim() || DEFAULT_RELAY_URL;
  await chrome.storage.local.set({ relayUrl: url });

  showStatus('success', '✅', 'Настройки сохранены');
}

// Reset to defaults
async function resetSettings(): Promise<void> {
  if (relayUrlInput) {
    relayUrlInput.value = DEFAULT_RELAY_URL;
  }
  await chrome.storage.local.set({ relayUrl: DEFAULT_RELAY_URL });

  showStatus('success', '🔄', 'Настройки сброшены');
}

// Test relay connection
async function testConnection(): Promise<void> {
  const url = relayUrlInput?.value.trim() || DEFAULT_RELAY_URL;

  if (testResult) {
    testResult.className = 'test-result visible';
    testResult.textContent = 'Проверка...';
  }

  try {
    const startTime = Date.now();
    const res = await fetch(`${url}/status`, {
      signal: AbortSignal.timeout(5000)
    });
    const elapsed = Date.now() - startTime;

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json() as Record<string, unknown>;

    if (testResult) {
      testResult.className = 'test-result visible success';
      testResult.textContent = `✅ Подключено (${elapsed}ms)\nОчередь: ${data.queueSize || 0} элементов`;
    }

  } catch (err: unknown) {
    if (testResult) {
      testResult.className = 'test-result visible error';

      const error = err as Error;
      if (error.name === 'AbortError') {
        testResult.textContent = '❌ Таймаут: сервер не отвечает';
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        testResult.textContent = '❌ Сервер недоступен\n\nЗапустите relay:\n  cd relay && npm start';
      } else {
        testResult.textContent = `❌ Ошибка: ${error.message}`;
      }
    }
  }
}

// Show status message
function showStatus(type: string, icon: string, message: string): void {
  if (statusEl) {
    statusEl.className = `status visible ${type}`;
  }
  if (statusIcon) {
    statusIcon.textContent = icon;
  }
  if (statusText) {
    statusText.textContent = message;
  }

  // Auto-hide after 3 seconds
  setTimeout(() => {
    if (statusEl) {
      statusEl.className = 'status';
    }
  }, 3000);
}

// Event listeners
saveBtn?.addEventListener('click', saveSettings);
resetBtn?.addEventListener('click', resetSettings);
testBtn?.addEventListener('click', testConnection);

// Enter key to save
relayUrlInput?.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') saveSettings();
});

// Load on init
loadSettings();

export {};
