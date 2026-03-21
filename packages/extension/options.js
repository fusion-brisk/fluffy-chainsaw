/**
 * Contentify Extension — Options Page
 */

const DEFAULT_RELAY_URL = 'http://localhost:3847';

const relayUrlInput = document.getElementById('relayUrl');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const testBtn = document.getElementById('testBtn');
const testResult = document.getElementById('testResult');
const status = document.getElementById('status');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');

// Load saved settings
async function loadSettings() {
  const { relayUrl } = await chrome.storage.local.get('relayUrl');
  relayUrlInput.value = relayUrl || DEFAULT_RELAY_URL;
}

// Save settings
async function saveSettings() {
  const url = relayUrlInput.value.trim() || DEFAULT_RELAY_URL;
  await chrome.storage.local.set({ relayUrl: url });
  
  showStatus('success', '✅', 'Настройки сохранены');
}

// Reset to defaults
async function resetSettings() {
  relayUrlInput.value = DEFAULT_RELAY_URL;
  await chrome.storage.local.set({ relayUrl: DEFAULT_RELAY_URL });
  
  showStatus('success', '🔄', 'Настройки сброшены');
}

// Test relay connection
async function testConnection() {
  const url = relayUrlInput.value.trim() || DEFAULT_RELAY_URL;
  
  testResult.className = 'test-result visible';
  testResult.textContent = 'Проверка...';
  
  try {
    const startTime = Date.now();
    const res = await fetch(`${url}/status`, { 
      signal: AbortSignal.timeout(5000) 
    });
    const elapsed = Date.now() - startTime;
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = await res.json();
    
    testResult.className = 'test-result visible success';
    testResult.textContent = `✅ Подключено (${elapsed}ms)\nОчередь: ${data.queueSize || 0} элементов`;
    
  } catch (err) {
    testResult.className = 'test-result visible error';
    
    if (err.name === 'AbortError') {
      testResult.textContent = '❌ Таймаут: сервер не отвечает';
    } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      testResult.textContent = '❌ Сервер недоступен\n\nЗапустите relay:\n  cd relay && npm start';
    } else {
      testResult.textContent = `❌ Ошибка: ${err.message}`;
    }
  }
}

// Show status message
function showStatus(type, icon, message) {
  status.className = `status visible ${type}`;
  statusIcon.textContent = icon;
  statusText.textContent = message;
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    status.className = 'status';
  }, 3000);
}

// Event listeners
saveBtn.addEventListener('click', saveSettings);
resetBtn.addEventListener('click', resetSettings);
testBtn.addEventListener('click', testConnection);

// Enter key to save
relayUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveSettings();
});

// Load on init
loadSettings();
