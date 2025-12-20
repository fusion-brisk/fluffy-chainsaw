// Network utilities for UI

import { Config, CSVRow } from '../types';

export const CONFIG: Config = {
  CORS_PROXY: 'https://proxy.cors.sh/',
  CORS_KEY: 'live_ad2976dadc87176d0acc2af12774c65db5ef345ea278a779350258330573dde4',
  FETCH_TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 1000 // 1 second
};

export const SPREADSHEET_ID = '1Qk6Lki3Jm88lBA04YmW7LKfKKbKFPJm9O3Vq3yQsOhw';
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxNjv0lTBwBOjE9QI2WOT0eViw_kikZ1bX65L28fIXGIlsyauYe0Jlf5dTXnHlF7iwYyg/exec';

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
    console.error(`Error fetching ${url}:`, error);
    
    if (attempt < CONFIG.RETRY_ATTEMPTS) {
      console.log(`Retrying request (${attempt + 1}/${CONFIG.RETRY_ATTEMPTS})...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      return fetchWithRetry(url, options, attempt + 1);
    }
    
    throw error;
  }
}

// Convert image URL to base64
export async function convertImageToBase64(url: string): Promise<string | null> {
  try {
    console.log(`🖼️ Конвертируем изображение в base64: ${url}`);
    
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
        console.log(`✅ Изображение конвертировано в base64, размер: ${result.length} символов`);
        resolve(result);
      };
      reader.onerror = () => reject(new Error('Failed to convert image to base64'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`❌ Ошибка конвертации изображения ${url}:`, error);
    return null;
  }
}

// Process CSV rows for special parameters and image conversion
export async function processCSVRows(rows: CSVRow[]): Promise<CSVRow[]> {
  const processedRows: CSVRow[] = [];
  
  for (const row of rows) {
    const processedRow = { ...row };
    
    // Find image fields and convert them to base64
    const imageFields = Object.keys(row).filter(key => {
      const value = row[key];
      return typeof value === 'string' && 
             value.trim() !== '' && 
             (value.startsWith('http://') || value.startsWith('https://')) &&
             (value.includes('.jpg') || value.includes('.jpeg') || value.includes('.png') || value.includes('.gif') || value.includes('.webp'));
    });
    
    console.log(`🖼️ Найдено ${imageFields.length} полей изображений в строке: ${imageFields.join(', ')}`);
    
    // Convert each image field to base64
    for (const imageField of imageFields) {
      const imageUrl = row[imageField];
      console.log(`🖼️ Обрабатываем поле изображения "${imageField}": ${imageUrl}`);
      
      if (!imageUrl) continue;
      const base64Data = await convertImageToBase64(imageUrl);
      if (base64Data) {
        processedRow[imageField + '_base64'] = base64Data;
        console.log(`✅ Добавлено поле "${imageField}_base64"`);
      } else {
        console.log(`⚠️ Не удалось конвертировать изображение для поля "${imageField}"`);
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
    console.error('Error creating sheet:', error);
    throw error;
  }
}

