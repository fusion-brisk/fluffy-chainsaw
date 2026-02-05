/**
 * Formatting utilities for UI text
 */

/**
 * Format item count with proper Russian word form for "товар"
 * (product, item)
 * 
 * @example
 * formatItemWord(1) // 'товар'
 * formatItemWord(2) // 'товара'
 * formatItemWord(5) // 'товаров'
 * formatItemWord(11) // 'товаров'
 * formatItemWord(21) // 'товар'
 */
export function formatItemWord(count: number): string {
  const lastTwo = count % 100;
  const lastOne = count % 10;
  
  if (lastTwo >= 11 && lastTwo <= 19) {
    return 'товаров';
  }
  
  if (lastOne === 1) {
    return 'товар';
  }
  
  if (lastOne >= 2 && lastOne <= 4) {
    return 'товара';
  }
  
  return 'товаров';
}

/**
 * Detect if the user is on macOS
 */
export function isMac(): boolean {
  if (typeof navigator !== 'undefined') {
    return navigator.platform.toLowerCase().includes('mac');
  }
  return false;
}

/**
 * Get platform-specific paste shortcut
 */
export function getPasteShortcut(): string {
  return isMac() ? '⌘V' : 'Ctrl+V';
}
