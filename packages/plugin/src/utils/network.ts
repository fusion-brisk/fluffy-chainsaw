// Network utilities for UI

import { Config, CSVRow } from '../types';
import { Logger } from '../logger';

export const CONFIG: Config = {
  CORS_PROXY: '',
  CORS_KEY: '',
  FETCH_TIMEOUT: 30000,
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 1000
};

export const SPREADSHEET_ID = '';
export const APPS_SCRIPT_URL = '';

// Fetch with retry logic
export async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  attempt: number = 0
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    return response;
  } catch (error) {
    Logger.error(`Error fetching ${url}:`, error);
    
    if (attempt < CONFIG.RETRY_ATTEMPTS) {
      Logger.debug(`Retrying request (${attempt + 1}/${CONFIG.RETRY_ATTEMPTS})...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      return fetchWithRetry(url, options, attempt + 1);
    }
    
    throw error;
  }
}

// Convert image URL to base64
export async function convertImageToBase64(url: string): Promise<string | null> {
  try {
    Logger.debug(`🖼️ Конвертируем изображение в base64: ${url}`);
    
    // Use CORS proxy for the image
    const proxiedUrl = CONFIG.CORS_PROXY + url;
    const response = await fetch(proxiedUrl, {
      headers: { 'x-cors-api-key': CONFIG.CORS_KEY }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        Logger.debug(`✅ Изображение конвертировано в base64, размер: ${result.length} символов`);
        resolve(result);
      };
      reader.onerror = () => reject(new Error('Failed to convert image to base64'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    Logger.error(`❌ Ошибка конвертации изображения ${url}:`, error);
    return null;
  }
}

// Process CSV rows for special parameters and image conversion
export async function processCSVRows(rows: CSVRow[]): Promise<CSVRow[]> {
  const processedRows: CSVRow[] = [];
  
  for (const row of rows) {
    const processedRow = { ...row };
    // Dynamic key access: this function intentionally iterates over arbitrary CSVFields keys
    const rowRecord = row as Record<string, string | undefined>;
    const processedRecord = processedRow as Record<string, string | undefined>;

    // Find image fields and convert them to base64
    const imageFields = Object.keys(row).filter(key => {
      const value = rowRecord[key];
      return typeof value === 'string' &&
             value.trim() !== '' &&
             (value.startsWith('http://') || value.startsWith('https://')) &&
             (value.includes('.jpg') || value.includes('.jpeg') || value.includes('.png') || value.includes('.gif') || value.includes('.webp'));
    });

    Logger.debug(`🖼️ Найдено ${imageFields.length} полей изображений в строке: ${imageFields.join(', ')}`);

    // Convert each image field to base64
    for (const imageField of imageFields) {
      const imageUrl = rowRecord[imageField];
      Logger.debug(`🖼️ Обрабатываем поле изображения "${imageField}": ${imageUrl}`);

      if (!imageUrl) continue;
      const base64Data = await convertImageToBase64(imageUrl);
      if (base64Data) {
        processedRecord[imageField + '_base64'] = base64Data;
        Logger.debug(`✅ Добавлено поле "${imageField}_base64"`);
      } else {
        Logger.debug(`⚠️ Не удалось конвертировать изображение для поля "${imageField}"`);
      }
    }

    processedRows.push(processedRow);
  }
  
  return processedRows;
}

// Create sheet from parsed data
export async function createSheetFromParsedData(data: CSVRow[]): Promise<string> {
  const timestamp = new Date().toISOString().slice(0, 10);
  const sheetName = `parsed_${timestamp}`;
  
  try {
    const url = `${APPS_SCRIPT_URL}?action=createSheet&spreadsheetId=${SPREADSHEET_ID}&sheetName=${encodeURIComponent(sheetName)}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result.ok) {
      throw new Error(result.error || 'Failed to create sheet');
    }
    
    return sheetName;
  } catch (error) {
    Logger.error('Error creating sheet:', error);
    throw error;
  }
}

