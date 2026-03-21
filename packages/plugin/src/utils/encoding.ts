// Encoding utilities for UI

import { ENCODING_BAD_CHARS_REGEX } from './regex';

// Fix encoding issues: convert incorrectly decoded UTF-8 text (interpreted as Latin-1) back to UTF-8
// Example: "ÐÐ¸Ð½Ð¸" -> "Мини"
export function fixEncoding(text: string): string {
  if (!text) return text;
  
  try {
    // Проверяем, есть ли признаки неправильной кодировки (символы типа Ð, Ñ, Ð°)
    if (!ENCODING_BAD_CHARS_REGEX.test(text)) {
      return text; // Похоже, что кодировка правильная
    }
    
    // Пробуем исправить: конвертируем строку как Latin-1 в байты, затем интерпретируем как UTF-8
    // Это работает, когда UTF-8 текст был прочитан как Latin-1
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i);
    }
    
    // Используем TextDecoder для правильной интерпретации UTF-8
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const fixed = decoder.decode(bytes);
    
    // Проверяем, что результат лучше (меньше странных символов)
    const originalBadChars = (text.match(ENCODING_BAD_CHARS_REGEX) || []).length;
    const fixedBadChars = (fixed.match(ENCODING_BAD_CHARS_REGEX) || []).length;
    
    if (fixedBadChars < originalBadChars) {
      return fixed;
    }
    
    return text;
  } catch (e) {
    // Если не удалось исправить, возвращаем оригинал
    return text;
  }
}

// Helper function для извлечения текста с автоматическим исправлением кодировки
export function getTextContent(element: Element | null): string {
  if (!element) return '';
  const text = (element.textContent || '').trim();
  return fixEncoding(text);
}

