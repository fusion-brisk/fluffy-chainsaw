/**
 * Contentify Extension — Options Page
 *
 * Cloud-only: user enters a 6-char session code that matches the one
 * shown by the Figma plugin. No relay URL to configure anymore.
 */

import { CLOUD_RELAY_URL, SESSION_CODE_KEY, SESSION_CODE_PATTERN } from './config';

const sessionCodeInput = document.getElementById('sessionCode') as HTMLInputElement | null;
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const testBtn = document.getElementById('testBtn');
const testResult = document.getElementById('testResult');
const screenshotCheckbox = document.getElementById('captureScreenshots') as HTMLInputElement | null;
const statusEl = document.getElementById('status');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');

/** Normalize raw input into the canonical A-Z0-9 form. */
function normalizeSessionCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Returns true if the code matches `^[A-Z0-9]{6}$`. */
function isValidSessionCode(code: string): boolean {
  return SESSION_CODE_PATTERN.test(code);
}

// Load saved settings
async function loadSettings(): Promise<void> {
  const stored = await chrome.storage.local.get([SESSION_CODE_KEY, 'captureScreenshots']);
  const code = stored[SESSION_CODE_KEY];
  const captureScreenshots = stored.captureScreenshots;
  if (sessionCodeInput) {
    sessionCodeInput.value = typeof code === 'string' ? code : '';
  }
  if (screenshotCheckbox) {
    screenshotCheckbox.checked = captureScreenshots !== false;
  }
}

// Save settings
async function saveSettings(): Promise<void> {
  const raw = sessionCodeInput?.value ?? '';
  const normalized = normalizeSessionCode(raw);

  if (!normalized) {
    showStatus('error', '⚠️', 'Введите session code из плагина Figma');
    return;
  }

  if (!isValidSessionCode(normalized)) {
    showStatus('error', '⚠️', 'Session code должен быть 6 символов A-Z 0-9');
    return;
  }

  if (sessionCodeInput) {
    sessionCodeInput.value = normalized;
  }
  await chrome.storage.local.set({ [SESSION_CODE_KEY]: normalized });

  showStatus('success', '✅', 'Session code сохранён. Теперь данные пойдут в ваш плагин Figma.');
}

// Reset — clears the stored session code
async function resetSettings(): Promise<void> {
  if (sessionCodeInput) {
    sessionCodeInput.value = '';
  }
  await chrome.storage.local.remove(SESSION_CODE_KEY);

  showStatus('success', '🔄', 'Session code очищен');
}

// Test cloud relay connectivity using the entered code
async function testConnection(): Promise<void> {
  const normalized = normalizeSessionCode(sessionCodeInput?.value ?? '');

  if (testResult) {
    testResult.className = 'test-result visible';
    testResult.textContent = 'Проверка...';
  }

  if (!isValidSessionCode(normalized)) {
    if (testResult) {
      testResult.className = 'test-result visible error';
      testResult.textContent = '❌ Введите корректный session code (6 символов A-Z 0-9)';
    }
    return;
  }

  try {
    const startTime = Date.now();
    const url = `${CLOUD_RELAY_URL}/health?session=${encodeURIComponent(normalized)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const elapsed = Date.now() - startTime;

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    if (testResult) {
      testResult.className = 'test-result visible success';
      testResult.textContent = `✅ Cloud relay отвечает (${elapsed}ms)`;
    }
  } catch (err: unknown) {
    if (testResult) {
      testResult.className = 'test-result visible error';

      const error = err as Error;
      if (error.name === 'AbortError') {
        testResult.textContent = '❌ Таймаут: cloud relay не отвечает';
      } else if (
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError')
      ) {
        testResult.textContent = '❌ Нет сети или cloud relay недоступен';
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

  // Auto-hide after 4 seconds
  setTimeout(() => {
    if (statusEl) {
      statusEl.className = 'status';
    }
  }, 4000);
}

// Auto-uppercase + strip whitespace as the user types
sessionCodeInput?.addEventListener('input', () => {
  const raw = sessionCodeInput.value;
  const normalized = raw.toUpperCase().replace(/\s+/g, '');
  if (normalized !== raw) {
    sessionCodeInput.value = normalized;
  }
});

// Event listeners
saveBtn?.addEventListener('click', saveSettings);
resetBtn?.addEventListener('click', resetSettings);
testBtn?.addEventListener('click', testConnection);
screenshotCheckbox?.addEventListener('change', async () => {
  const enabled = screenshotCheckbox.checked;
  await chrome.storage.local.set({ captureScreenshots: enabled });
  showStatus(
    'success',
    enabled ? '📷' : '⚡',
    enabled ? 'Скриншоты включены' : 'Быстрый режим (без скриншотов)',
  );
});

// Enter key to save
sessionCodeInput?.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') saveSettings();
});

// Load on init
loadSettings();

export {};
