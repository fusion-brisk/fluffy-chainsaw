/**
 * Streaming MHTML Parser
 * 
 * Оптимизированный парсер MHTML для больших файлов:
 * - Итеративный поиск частей без полного split()
 * - Ранний выход после нахождения HTML
 * - Прогресс-коллбэк для UI
 * - Экономия памяти через substring вместо массивов
 */

import { Logger } from '../logger';
import {
  MHTML_CONTENT_TYPE_REGEX,
  MHTML_BOUNDARY_REGEX,
  MHTML_BOUNDARY_HEADER_REGEX,
  MHTML_HTML_DOCTYPE_REGEX,
  MHTML_PART_CONTENT_TYPE_REGEX,
  MHTML_CONTENT_AFTER_HEADERS_REGEX,
  MHTML_TRANSFER_ENCODING_REGEX
} from './regex';

/**
 * Прогресс парсинга MHTML
 */
export interface MhtmlParseProgress {
  /** Текущая позиция в файле (байты) */
  position: number;
  /** Общий размер файла */
  totalSize: number;
  /** Процент завершения (0-100) */
  percent: number;
  /** Текущий этап */
  stage: 'boundary' | 'scanning' | 'decoding' | 'done';
  /** Сообщение о статусе */
  message: string;
}

/**
 * Результат парсинга MHTML
 */
export interface MhtmlParseResult {
  /** Извлечённый HTML */
  html: string;
  /** Полный MHTML (для извлечения изображений) */
  fullMhtml: string;
  /** Статистика парсинга */
  stats: {
    totalSize: number;
    htmlSize: number;
    partsScanned: number;
    parseTimeMs: number;
  };
}

/**
 * Опции парсера
 */
export interface MhtmlParseOptions {
  /** Коллбэк прогресса */
  onProgress?: (progress: MhtmlParseProgress) => void;
  /** Интервал обновления прогресса (мс) */
  progressInterval?: number;
}

/**
 * Находит boundary в начале MHTML файла
 */
function findBoundary(content: string, maxSearchLength = 2000): string | null {
  const header = content.substring(0, maxSearchLength);
  
  // Вариант 1: Content-Type: multipart/related; boundary="..."
  const match1 = header.match(MHTML_CONTENT_TYPE_REGEX);
  if (match1?.[1]) return match1[1].trim();
  
  // Вариант 2: boundary на отдельной строке
  const match2 = header.match(MHTML_BOUNDARY_REGEX);
  if (match2?.[1]) return match2[1].trim();
  
  // Вариант 3: boundary в заголовке
  const match3 = header.match(MHTML_BOUNDARY_HEADER_REGEX);
  if (match3?.[1]) return match3[1].trim();
  
  return null;
}

/**
 * Декодирует quoted-printable контент
 */
function decodeQuotedPrintable(content: string): string {
  return content
    .replace(/=\r?\n/g, '') // Убираем мягкие переносы
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Декодирует base64 контент
 */
function decodeBase64(content: string): string {
  try {
    const base64 = content.replace(/\s/g, '');
    const binary = atob(base64);
    return Array.from(binary, char => String.fromCharCode(char.charCodeAt(0))).join('');
  } catch {
    console.warn('⚠️ Ошибка декодирования base64');
    return content;
  }
}

/**
 * Извлекает HTML из MHTML части
 */
function extractHtmlFromPart(part: string): string | null {
  // Проверяем Content-Type
  const contentTypeMatch = part.match(MHTML_PART_CONTENT_TYPE_REGEX);
  if (!contentTypeMatch) return null;
  
  const contentType = contentTypeMatch[1].trim().toLowerCase();
  if (!contentType.includes('text/html')) return null;
  
  // Извлекаем контент после заголовков
  const contentMatch = part.match(MHTML_CONTENT_AFTER_HEADERS_REGEX);
  if (!contentMatch) return null;
  
  let html = contentMatch[1];
  
  // Проверяем кодировку
  const encodingMatch = part.match(MHTML_TRANSFER_ENCODING_REGEX);
  if (encodingMatch) {
    const encoding = encodingMatch[1].trim().toLowerCase();
    if (encoding === 'quoted-printable') {
      html = decodeQuotedPrintable(html);
    } else if (encoding === 'base64') {
      html = decodeBase64(html);
    }
  }
  
  // Убираем финальные boundary маркеры
  return html.replace(/--\s*$/, '').trim();
}

/**
 * Streaming MHTML парсер
 * 
 * Использует итеративный поиск вместо split() для экономии памяти
 */
export function parseMhtmlStreaming(
  mhtmlContent: string,
  options: MhtmlParseOptions = {}
): MhtmlParseResult {
  const startTime = performance.now();
  const totalSize = mhtmlContent.length;
  let partsScanned = 0;
  
  const { onProgress, progressInterval = 100 } = options;
  let lastProgressUpdate = 0;
  
  const reportProgress = (position: number, stage: MhtmlParseProgress['stage'], message: string) => {
    if (!onProgress) return;
    
    const now = performance.now();
    if (now - lastProgressUpdate < progressInterval && stage !== 'done') return;
    lastProgressUpdate = now;
    
    onProgress({
      position,
      totalSize,
      percent: Math.round((position / totalSize) * 100),
      stage,
      message
    });
  };
  
  Logger.debug('📦 [Streaming] Парсинг MHTML файла...');
  Logger.debug('📄 [Streaming] Размер:', (totalSize / 1024 / 1024).toFixed(2), 'MB');
  
  reportProgress(0, 'boundary', 'Поиск boundary...');
  
  // 1. Находим boundary
  const boundary = findBoundary(mhtmlContent);
  
  if (!boundary) {
    console.warn('⚠️ Boundary не найден, ищем HTML напрямую...');
    const htmlMatch = mhtmlContent.match(MHTML_HTML_DOCTYPE_REGEX);
    if (htmlMatch) {
      const html = htmlMatch[0];
      reportProgress(totalSize, 'done', 'HTML найден напрямую');
      return {
        html,
        fullMhtml: mhtmlContent,
        stats: {
          totalSize,
          htmlSize: html.length,
          partsScanned: 0,
          parseTimeMs: performance.now() - startTime
        }
      };
    }
    throw new Error('Не удалось найти HTML в MHTML файле');
  }
  
  Logger.debug(`✅ [Streaming] Boundary: ${boundary.substring(0, 50)}...`);
  
  // 2. Определяем разделитель
  const separator = mhtmlContent.includes(`--${boundary}`) ? `--${boundary}` : boundary;
  
  // 3. Итеративный поиск частей (без split!)
  let searchPos = 0;
  let html: string | null = null;
  
  reportProgress(0, 'scanning', 'Сканирование частей...');
  
  while (searchPos < totalSize && !html) {
    // Находим начало следующей части
    const partStart = mhtmlContent.indexOf(separator, searchPos);
    if (partStart === -1) break;
    
    // Находим конец этой части (начало следующей или конец файла)
    const nextPartStart = mhtmlContent.indexOf(separator, partStart + separator.length);
    const partEnd = nextPartStart === -1 ? totalSize : nextPartStart;
    
    // Извлекаем часть (substring вместо создания нового массива)
    const part = mhtmlContent.substring(partStart + separator.length, partEnd);
    partsScanned++;
    
    // Проверяем, содержит ли часть HTML
    if (part.includes('text/html')) {
      reportProgress(partStart, 'decoding', `Декодирование HTML (часть ${partsScanned})...`);
      html = extractHtmlFromPart(part);
      
      if (html) {
        Logger.debug(`✅ [Streaming] HTML найден в части ${partsScanned}`);
        break;
      }
    }
    
    // Переходим к следующей части
    searchPos = partEnd;
    
    // Обновляем прогресс
    reportProgress(searchPos, 'scanning', `Сканирование... (часть ${partsScanned})`);
  }
  
  // 4. Fallback: ищем HTML напрямую
  if (!html) {
    console.warn('⚠️ [Streaming] HTML не найден в частях, ищем напрямую...');
    const htmlMatch = mhtmlContent.match(MHTML_HTML_DOCTYPE_REGEX);
    if (htmlMatch) {
      html = htmlMatch[0];
    }
  }
  
  if (!html) {
    throw new Error('Не удалось найти HTML в MHTML файле');
  }
  
  const parseTimeMs = performance.now() - startTime;
  
  Logger.debug(`✅ [Streaming] Готово за ${parseTimeMs.toFixed(0)}ms`);
  Logger.debug(`📊 [Streaming] Просканировано частей: ${partsScanned}`);
  Logger.debug(`📄 [Streaming] HTML размер: ${(html.length / 1024).toFixed(1)} KB`);
  
  reportProgress(totalSize, 'done', `Готово (${partsScanned} частей за ${parseTimeMs.toFixed(0)}ms)`);
  
  return {
    html,
    fullMhtml: mhtmlContent,
    stats: {
      totalSize,
      htmlSize: html.length,
      partsScanned,
      parseTimeMs
    }
  };
}

/**
 * Асинхронная версия для больших файлов с yield'ом в event loop
 */
export async function parseMhtmlStreamingAsync(
  mhtmlContent: string,
  options: MhtmlParseOptions = {}
): Promise<MhtmlParseResult> {
  const startTime = performance.now();
  const totalSize = mhtmlContent.length;
  let partsScanned = 0;
  
  const { onProgress } = options;
  
  const reportProgress = (position: number, stage: MhtmlParseProgress['stage'], message: string) => {
    onProgress?.({
      position,
      totalSize,
      percent: Math.round((position / totalSize) * 100),
      stage,
      message
    });
  };
  
  // Yield to event loop каждые N итераций для больших файлов
  const yieldToEventLoop = () => new Promise<void>(resolve => setTimeout(resolve, 0));
  
  Logger.debug('📦 [Async Streaming] Парсинг MHTML файла...');
  
  reportProgress(0, 'boundary', 'Поиск boundary...');
  
  const boundary = findBoundary(mhtmlContent);
  
  if (!boundary) {
    const htmlMatch = mhtmlContent.match(MHTML_HTML_DOCTYPE_REGEX);
    if (htmlMatch) {
      reportProgress(totalSize, 'done', 'HTML найден');
      return {
        html: htmlMatch[0],
        fullMhtml: mhtmlContent,
        stats: { totalSize, htmlSize: htmlMatch[0].length, partsScanned: 0, parseTimeMs: performance.now() - startTime }
      };
    }
    throw new Error('HTML не найден');
  }
  
  const separator = mhtmlContent.includes(`--${boundary}`) ? `--${boundary}` : boundary;
  
  let searchPos = 0;
  let html: string | null = null;
  
  reportProgress(0, 'scanning', 'Сканирование частей...');
  
  while (searchPos < totalSize && !html) {
    const partStart = mhtmlContent.indexOf(separator, searchPos);
    if (partStart === -1) break;
    
    const nextPartStart = mhtmlContent.indexOf(separator, partStart + separator.length);
    const partEnd = nextPartStart === -1 ? totalSize : nextPartStart;
    
    const part = mhtmlContent.substring(partStart + separator.length, partEnd);
    partsScanned++;
    
    if (part.includes('text/html')) {
      reportProgress(partStart, 'decoding', `Декодирование HTML...`);
      html = extractHtmlFromPart(part);
      if (html) break;
    }
    
    searchPos = partEnd;
    
    // Yield каждые 10 частей для отзывчивости UI
    if (partsScanned % 10 === 0) {
      reportProgress(searchPos, 'scanning', `Сканирование... (часть ${partsScanned})`);
      await yieldToEventLoop();
    }
  }
  
  if (!html) {
    const htmlMatch = mhtmlContent.match(MHTML_HTML_DOCTYPE_REGEX);
    if (htmlMatch) html = htmlMatch[0];
  }
  
  if (!html) throw new Error('HTML не найден');
  
  reportProgress(totalSize, 'done', 'Готово');
  
  return {
    html,
    fullMhtml: mhtmlContent,
    stats: {
      totalSize,
      htmlSize: html.length,
      partsScanned,
      parseTimeMs: performance.now() - startTime
    }
  };
}

