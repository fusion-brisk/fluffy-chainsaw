// MHTML parsing utilities

import {
  MHTML_CONTENT_TYPE_REGEX,
  MHTML_BOUNDARY_REGEX,
  MHTML_BOUNDARY_HEADER_REGEX,
  MHTML_HTML_DOCTYPE_REGEX,
  MHTML_PART_CONTENT_TYPE_REGEX,
  MHTML_CONTENT_AFTER_HEADERS_REGEX,
  MHTML_TRANSFER_ENCODING_REGEX
} from './regex';

// Parse MHTML file and extract HTML content
export function parseMhtmlFile(mhtmlContent: string): string {
  console.log('📦 Парсинг MHTML файла...');
  console.log('📄 Размер MHTML:', mhtmlContent.length);
  
  // Находим boundary из заголовка Content-Type (может быть в разных форматах)
  let boundary: string | null = null;
  
  // Вариант 1: Content-Type: multipart/related; boundary="..."
  const contentTypeMatch1 = mhtmlContent.match(MHTML_CONTENT_TYPE_REGEX);
  if (contentTypeMatch1 && contentTypeMatch1[1]) {
    boundary = contentTypeMatch1[1].trim();
  }
  
  // Вариант 2: boundary может быть на отдельной строке
  if (!boundary) {
    const boundaryMatch = mhtmlContent.match(MHTML_BOUNDARY_REGEX);
    if (boundaryMatch && boundaryMatch[1]) {
      boundary = boundaryMatch[1].trim();
    }
  }
  
  // Вариант 3: Ищем boundary в начале файла (обычно после Content-Type)
  if (!boundary) {
    const firstLines = mhtmlContent.substring(0, 2000);
    const boundaryInHeader = firstLines.match(MHTML_BOUNDARY_HEADER_REGEX);
    if (boundaryInHeader && boundaryInHeader[1]) {
      boundary = boundaryInHeader[1].trim();
    }
  }
  
  if (!boundary) {
    console.warn('⚠️ Не найден boundary в MHTML, пытаемся найти HTML напрямую...');
    // Пробуем найти HTML напрямую
    const htmlMatch = mhtmlContent.match(MHTML_HTML_DOCTYPE_REGEX);
    if (htmlMatch) {
      return htmlMatch[0];
    }
    throw new Error('Не удалось найти HTML в MHTML файле');
  }
  
  console.log(`✅ Найден boundary: ${boundary}`);
  
  // Разделяем файл по boundary (может быть с -- или без)
  // Пробуем разные варианты разделения
  let parts: string[] = [];
  if (mhtmlContent.includes(`--${boundary}`)) {
    parts = mhtmlContent.split(`--${boundary}`);
  } else if (mhtmlContent.includes(boundary)) {
    parts = mhtmlContent.split(boundary);
  } else {
    throw new Error('Не удалось разделить MHTML по boundary');
  }
  
  // Ищем часть с Content-Type: text/html
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // Пропускаем пустые части и финальную часть (обычно заканчивается на --)
    if (!part || part.trim().length === 0 || part.trim() === '--') {
      continue;
    }
    
    // Проверяем Content-Type
    const partContentTypeMatch = part.match(MHTML_PART_CONTENT_TYPE_REGEX);
    if (partContentTypeMatch) {
      const partContentType = partContentTypeMatch[1].trim().toLowerCase();
      
      if (partContentType.includes('text/html')) {
        console.log(`✅ Найдена HTML часть (часть ${i + 1})`);
        
        // Извлекаем содержимое (после двойного переноса строки)
        const contentMatch = part.match(MHTML_CONTENT_AFTER_HEADERS_REGEX);
        if (!contentMatch) {
          continue;
        }
        
        let htmlContent = contentMatch[1];
        
        // Проверяем Content-Transfer-Encoding
        const encodingMatch = part.match(MHTML_TRANSFER_ENCODING_REGEX);
        if (encodingMatch) {
          const encoding = encodingMatch[1].trim().toLowerCase();
          
          if (encoding === 'quoted-printable') {
            // Декодируем quoted-printable
            console.log('📝 Декодирование quoted-printable...');
            htmlContent = htmlContent
              .replace(/=\r?\n/g, '') // Убираем мягкие переносы строк
              .replace(/=([0-9A-F]{2})/gi, (match, hex) => {
                return String.fromCharCode(parseInt(hex, 16));
              })
              .replace(/=\r?\n/g, ''); // Еще раз на всякий случай
          } else if (encoding === 'base64') {
            // Декодируем base64
            console.log('📝 Декодирование base64...');
            try {
              // Убираем пробелы и переносы строк
              const base64Content = htmlContent.replace(/\s/g, '');
              // В браузере используем atob для декодирования base64
              const binaryString = atob(base64Content);
              // Преобразуем в строку
              htmlContent = Array.from(binaryString, char => String.fromCharCode(char.charCodeAt(0))).join('');
            } catch (e) {
              console.warn('⚠️ Ошибка декодирования base64, используем как есть:', e);
            }
          }
        }
        
        // Убираем возможные финальные boundary маркеры
        htmlContent = htmlContent.replace(/--\s*$/, '').trim();
        
        console.log(`✅ HTML извлечен, размер: ${htmlContent.length} символов`);
        return htmlContent;
      }
    }
  }
  
  // Если не нашли HTML часть, пробуем найти HTML напрямую
  console.warn('⚠️ HTML часть не найдена по Content-Type, ищем HTML напрямую...');
  const htmlMatch = mhtmlContent.match(MHTML_HTML_DOCTYPE_REGEX);
  if (htmlMatch) {
    console.log('✅ HTML найден напрямую');
    return htmlMatch[0];
  }
  
  throw new Error('Не удалось найти HTML содержимое в MHTML файле');
}

