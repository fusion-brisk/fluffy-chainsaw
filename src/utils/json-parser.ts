// JSON parsing utilities for Yandex search results

import { CSVRow } from '../types';
import {
  NOFRAMES_JSON_REGEX,
  FAVICON_V2_URL_REGEX,
  FAVICON_V2_PATH_REGEX,
  FAVICON_HOST_REGEX,
  PRICE_NUMBERS_REGEX,
  RATING_REGEX
} from './regex';

// Парсит JSON из блока noframes и извлекает данные о сниппетах
export function parseJsonFromNoframes(html: string): any {
  console.log('🔍 Поиск блока noframes с JSON данными...');
  
  // Ищем блок <noframes id="lazy-react-state-post-search">
  const noframesMatch = html.match(NOFRAMES_JSON_REGEX);
  
  if (!noframesMatch || !noframesMatch[1]) {
    console.log('⚠️ Блок noframes с id="lazy-react-state-post-search" не найден');
    return null;
  }
  
  const jsonContent = noframesMatch[1].trim();
  console.log(`✅ Блок noframes найден, размер JSON: ${jsonContent.length} символов`);
  
  try {
    const jsonData = JSON.parse(jsonContent);
    console.log('✅ JSON успешно распарсен');
    return jsonData;
  } catch (error) {
    console.error('❌ Ошибка парсинга JSON:', error);
    return null;
  }
}

// Извлекает фавиконку из JSON сниппета
export function extractFaviconFromJson(snippet: any, row: CSVRow): void {
  try {
    // Ищем фавиконку в различных возможных полях JSON
    let faviconData: any = null;
    let faviconField = '';
    
    // Список возможных полей для фавиконки
    const faviconFields = [
      'favicon', 'icon', 'faviconUrl', 'faviconImage', 'siteIcon', 'domainIcon',
      'faviconUrl', 'faviconSrc', 'iconUrl', 'iconSrc', 'siteFavicon',
      'faviconImageUrl', 'faviconImageSrc', 'shopIcon', 'vendorIcon'
    ];
    
    // Ищем фавиконку в прямых полях
    for (const field of faviconFields) {
      if (snippet[field]) {
        faviconData = snippet[field];
        faviconField = field;
        break;
      }
    }
    
    // Если не нашли в прямых полях, ищем во вложенных объектах
    if (!faviconData) {
      const nestedFields = ['site', 'shop', 'vendor', 'domain', 'brand', 'seller', 'merchant'];
      for (const nestedField of nestedFields) {
        if (snippet[nestedField] && typeof snippet[nestedField] === 'object') {
          for (const field of faviconFields) {
            if (snippet[nestedField][field]) {
              faviconData = snippet[nestedField][field];
              faviconField = `${nestedField}.${field}`;
              break;
            }
          }
          if (faviconData) break;
        }
      }
    }
    
    // Если не нашли, ищем в объекте с изображениями
    if (!faviconData && snippet.images && typeof snippet.images === 'object') {
      for (const field of faviconFields) {
        if (snippet.images[field]) {
          faviconData = snippet.images[field];
          faviconField = `images.${field}`;
          break;
        }
      }
    }
    
    if (!faviconData) {
      // Логируем только если это первый сниппет, чтобы не засорять логи
      return;
    }
    
    console.log(`🔍 Фавиконка найдена в поле "${faviconField}" для сниппета "${row['#OrganicTitle']?.substring(0, 30)}..."`);
    
    let faviconUrl: string | null = null;
    let bgPosition: string | null = null;
    let bgSize: string | null = null;
    
    // Обрабатываем разные форматы данных фавиконки
    if (typeof faviconData === 'string') {
      // Простая строка с URL
      faviconUrl = faviconData.trim();
    } else if (typeof faviconData === 'object' && faviconData !== null) {
      // Объект с данными фавиконки
      faviconUrl = faviconData.url || faviconData.src || faviconData.image || faviconData.href || null;
      bgPosition = faviconData.position || faviconData.backgroundPosition || faviconData.bgPosition || null;
      bgSize = faviconData.size || faviconData.backgroundSize || faviconData.bgSize || null;
      
      // Если URL в массиве (список фавиконок)
      if (Array.isArray(faviconData.urls) && faviconData.urls.length > 0) {
        const faviconUrls = faviconData.urls.map((url: string) => url.trim()).filter((url: string) => url.length > 0);
        if (faviconUrls.length > 0) {
          row['#FaviconImage'] = `SPRITE_LIST:${faviconUrls.join('|')}`;
          console.log(`✅ Список фавиконок найден: ${faviconUrls.length} адресов`);
          
          // Извлекаем первый хост для ShopName
          try {
            const firstUrl = faviconUrls[0];
            const urlMatch = firstUrl.match(FAVICON_V2_PATH_REGEX);
            if (urlMatch && urlMatch[1]) {
              const decodedHost = decodeURIComponent(urlMatch[1]);
              const hostUrl = new URL(decodedHost.startsWith('http') ? decodedHost : `https://${decodedHost}`);
              row['#OrganicHost'] = hostUrl.hostname;
              if (!row['#ShopName']) {
                row['#ShopName'] = row['#OrganicHost'];
              }
            }
          } catch (e) {
            // Игнорируем ошибки парсинга URL
          }
          
          return;
        }
      }
      
      // Если URL в массиве напрямую
      if (Array.isArray(faviconData) && faviconData.length > 0) {
        const faviconUrls = faviconData.map((url: any) => {
          if (typeof url === 'string') return url.trim();
          if (typeof url === 'object' && url.url) return url.url.trim();
          return null;
        }).filter((url: string | null) => url !== null && url.length > 0);
        
        if (faviconUrls.length > 0) {
          row['#FaviconImage'] = `SPRITE_LIST:${faviconUrls.join('|')}`;
          console.log(`✅ Список фавиконок найден в массиве: ${faviconUrls.length} адресов`);
          
          // Извлекаем первый хост для ShopName
          try {
            const firstUrl = faviconUrls[0];
            const urlMatch = firstUrl.match(FAVICON_V2_PATH_REGEX);
            if (urlMatch && urlMatch[1]) {
              const decodedHost = decodeURIComponent(urlMatch[1]);
              const hostUrl = new URL(decodedHost.startsWith('http') ? decodedHost : `https://${decodedHost}`);
              row['#OrganicHost'] = hostUrl.hostname;
              if (!row['#ShopName']) {
                row['#ShopName'] = row['#OrganicHost'];
              }
            }
          } catch (e) {
            // Игнорируем ошибки парсинга URL
          }
          
          return;
        }
      }
    }
    
    if (!faviconUrl || faviconUrl.length === 0) {
      return;
    }
    
    // Очищаем и нормализуем URL
    // Важно: удаляем quoted-printable артефакты (=3D, =3B) перед обработкой
    faviconUrl = faviconUrl.trim().replace(/\s+/g, '')
      .replace(/=3D/g, '=')
      .replace(/=3B/g, ';')
      .replace(/=\r?\n/g, '');
    
    if (faviconUrl.startsWith('//')) {
      faviconUrl = 'https:' + faviconUrl;
    }
    
    // Проверяем формат URL
    if (!faviconUrl.startsWith('http://') && !faviconUrl.startsWith('https://')) {
      console.warn(`⚠️ Некорректный формат URL фавиконки: ${faviconUrl.substring(0, 50)}...`);
      return;
    }
    
    // Проверяем, является ли это спрайтом с перечислением адресов
    // Формат: //favicon.yandex.net/favicon/v2/https://site1;https://site2;...;https://siteN?size=32&stub=1&reqid=...
    // Извлекаем список доменов: берем все после /favicon/v2/
    const spriteListMatch = faviconUrl.match(FAVICON_V2_URL_REGEX);
    if (spriteListMatch && spriteListMatch[1]) {
      let addressesString = spriteListMatch[1];
      
      // Убираем параметры запроса (аккуратно)
      const qIndex = addressesString.lastIndexOf('?');
      if (qIndex !== -1 && (addressesString.includes('size=') || addressesString.includes('stub='))) {
        addressesString = addressesString.substring(0, qIndex);
      } else if (addressesString.includes('?')) {
         addressesString = addressesString.split('?')[0];
      }
      
      // Разделяем по точке с запятой (параметры запроса могут быть в последнем домене)
      const addresses = addressesString.split(';').filter(addr => addr.trim().length > 0);
      
      if (addresses.length > 0) {
        // Создаем список URL фавиконок для каждого адреса
        const faviconUrls = addresses.map(addr => {
          const cleanAddr = addr.trim();
          // Убираем возможные параметры из адреса (если они есть, например в последнем домене)
          // Например: https://yandex.ru/products?size=32&stub=1&reqid=... -> https://yandex.ru/products
          const cleanAddrWithoutParams = cleanAddr.split('?')[0];
          if (!cleanAddrWithoutParams) return null;
          // Формируем URL фавиконки для единичного домена
          return `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(cleanAddrWithoutParams)}?size=32&stub=1`;
        }).filter(u => u !== null) as string[];
        
        // Сохраняем список в специальном формате: SPRITE_LIST:url1|url2|url3|...
        row['#FaviconImage'] = `SPRITE_LIST:${faviconUrls.join('|')}`;
        const firstDomain = addresses[0].trim().split('?')[0];
        const firstFaviconUrl = faviconUrls[0];
        console.log(`✅ Спрайт-список фавиконок найден: ${addresses.length} адресов, первый домен: ${firstDomain}, первая фавиконка: ${firstFaviconUrl}`);
        
        // Извлекаем первый хост для текущего сниппета
        const firstHost = firstDomain;
        try {
          const hostUrl = new URL(firstHost.startsWith('http') ? firstHost : `https://${firstHost}`);
          row['#OrganicHost'] = hostUrl.hostname;
          if (!row['#ShopName']) {
            row['#ShopName'] = row['#OrganicHost'];
          }
        } catch (e) {
          // Игнорируем ошибки парсинга URL
        }
        
        return;
      }
    }
    
    // Если есть background-position (спрайт), сохраняем в специальном формате
    // Формат: URL|position|size (например: url|-20px|20px)
    if (bgPosition) {
      bgPosition = bgPosition.trim().replace(/\s+/g, ' ');
      const spriteData = bgSize ? `${faviconUrl}|${bgPosition}|${bgSize}` : `${faviconUrl}|${bgPosition}`;
      row['#FaviconImage'] = spriteData;
      console.log(`✅ Фавиконка-спрайт найдена: ${faviconUrl.substring(0, 60)}... позиция: ${bgPosition}${bgSize ? `, размер: ${bgSize}` : ''}`);
    } else {
      row['#FaviconImage'] = faviconUrl;
      console.log(`✅ Фавиконка найдена: ${faviconUrl.substring(0, 80)}...`);
    }
    
    // Извлекаем хост из URL фавиконки
    const hostMatch = faviconUrl.match(FAVICON_HOST_REGEX);
    if (hostMatch && hostMatch[1]) {
      const firstHost = hostMatch[1].split(';')[0];
      try {
        row['#OrganicHost'] = decodeURIComponent(firstHost);
        if (!row['#ShopName']) {
          row['#ShopName'] = row['#OrganicHost'];
        }
      } catch (e) {
        // Игнорируем ошибки декодирования
      }
    }
  } catch (e) {
    console.error('❌ Ошибка извлечения фавиконки из JSON:', e);
  }
}

// Собирает все уникальные поля из массива объектов
export function collectAllFields(obj: any, prefix: string = '', depth: number = 0, maxDepth: number = 5): Set<string> {
  const fields = new Set<string>();
  
  if (depth > maxDepth) return fields;
  
  if (Array.isArray(obj) && obj.length > 0) {
    // Обрабатываем первый элемент массива
    const first = obj[0];
    if (first && typeof first === 'object') {
      const nestedFields = collectAllFields(first, prefix, depth + 1, maxDepth);
      nestedFields.forEach(f => fields.add(f));
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        fields.add(fullKey);
        
        // Рекурсивно обрабатываем вложенные объекты
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          const nestedFields = collectAllFields(obj[key], fullKey, depth + 1, maxDepth);
          nestedFields.forEach(f => fields.add(f));
        }
      }
    }
  }
  
  return fields;
}

// Извлекает данные о сниппетах из JSON структуры Яндекс.Поиска
export function extractSnippetsFromJson(jsonData: any): CSVRow[] {
  const results: CSVRow[] = [];
  
  console.log('🔍 Извлечение данных из JSON...');
  console.log('📊 Верхнеуровневые ключи JSON:', Object.keys(jsonData));
  
  // Собираем все поля из JSON для логирования
  const allFields = collectAllFields(jsonData);
  console.log('📋 Все поля, обнаруженные в JSON:');
  const sortedFields = Array.from(allFields).sort();
  sortedFields.forEach(field => {
    console.log(`   - ${field}`);
  });
  console.log(`📊 Всего уникальных полей в JSON: ${allFields.size}`);
  
  // Ищем данные о сниппетах в различных возможных местах JSON структуры
  // Обычно данные находятся в структуре типа: results, items, snippets, organic, products и т.д.
  
  let snippets: any[] = [];
  let foundPath = '';
  
  // Пробуем различные пути к данным
  if (jsonData.results && Array.isArray(jsonData.results)) {
    snippets = jsonData.results;
    foundPath = 'results';
  } else if (jsonData.items && Array.isArray(jsonData.items)) {
    snippets = jsonData.items;
    foundPath = 'items';
  } else if (jsonData.snippets && Array.isArray(jsonData.snippets)) {
    snippets = jsonData.snippets;
    foundPath = 'snippets';
  } else if (jsonData.organic && Array.isArray(jsonData.organic)) {
    snippets = jsonData.organic;
    foundPath = 'organic';
  } else if (jsonData.products && Array.isArray(jsonData.products)) {
    snippets = jsonData.products;
    foundPath = 'products';
  } else if (jsonData.data && jsonData.data.results && Array.isArray(jsonData.data.results)) {
    snippets = jsonData.data.results;
    foundPath = 'data.results';
  } else if (jsonData.data && jsonData.data.items && Array.isArray(jsonData.data.items)) {
    snippets = jsonData.data.items;
    foundPath = 'data.items';
  } else if (Array.isArray(jsonData)) {
    snippets = jsonData;
    foundPath = 'root array';
  } else {
    // Рекурсивно ищем массивы в структуре
    function findArrays(obj: any, path: string = '', depth: number = 0): { array: any[]; path: string } | null {
      if (depth > 5) return null; // Ограничиваем глубину поиска
      
      if (Array.isArray(obj) && obj.length > 0) {
        // Проверяем, похож ли первый элемент на сниппет
        const first = obj[0];
        if (first && typeof first === 'object') {
          const keys = Object.keys(first);
          if (keys.some(k => k.toLowerCase().includes('title') || k.toLowerCase().includes('url') || k.toLowerCase().includes('price'))) {
            return { array: obj, path: path || 'root array' };
          }
        }
      }
      
      if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const newPath = path ? `${path}.${key}` : key;
            const found = findArrays(obj[key], newPath, depth + 1);
            if (found) return found;
          }
        }
      }
      
      return null;
    }
    
    const found = findArrays(jsonData);
    if (found) {
      snippets = found.array;
      foundPath = found.path;
    }
  }
  
  if (foundPath) {
    console.log(`📦 Найдено ${snippets.length} потенциальных сниппетов в JSON по пути: ${foundPath}`);
  } else {
    console.log(`⚠️ Не найдено массивов со сниппетами в JSON`);
  }
  
  if (snippets.length === 0) {
    console.log('⚠️ Не найдено массивов со сниппетами. Структура JSON:', JSON.stringify(jsonData).substring(0, 500));
    return [];
  }
  
  // Собираем все уникальные поля из всех сниппетов
  const snippetFieldsSet = new Set<string>();
  for (const snippet of snippets) {
    if (snippet && typeof snippet === 'object') {
      const fields = collectAllFields(snippet);
      fields.forEach(f => snippetFieldsSet.add(f));
    }
  }
  console.log(`📋 Уникальные поля из всех сниппетов (${snippetFieldsSet.size} полей):`);
  const sortedSnippetFields = Array.from(snippetFieldsSet).sort();
  sortedSnippetFields.forEach(field => {
    console.log(`   - ${field}`);
  });
  
  // Логируем детальную структуру первого сниппета для отладки
  if (snippets.length > 0 && snippets[0] && typeof snippets[0] === 'object') {
    const firstSnippet = snippets[0];
    const firstSnippetFields = Object.keys(firstSnippet);
    console.log(`📋 Поля первого сниппета (${firstSnippetFields.length} полей):`);
    firstSnippetFields.forEach(field => {
      const value = firstSnippet[field];
      const valueType = typeof value;
      let valuePreview = '';
      if (valueType === 'string') {
        valuePreview = value.length > 50 ? value.substring(0, 50) + '...' : value;
      } else if (valueType === 'object') {
        if (Array.isArray(value)) {
          valuePreview = `[Array(${value.length})]`;
        } else if (value === null) {
          valuePreview = 'null';
        } else {
          valuePreview = `{${Object.keys(value).join(', ')}}`;
        }
      } else {
        valuePreview = String(value);
      }
      console.log(`   - ${field}: ${valueType} = ${valuePreview}`);
    });
  }
  
  // Преобразуем каждый сниппет в CSVRow
  for (let i = 0; i < snippets.length; i++) {
    const snippet = snippets[i];
    if (!snippet || typeof snippet !== 'object') continue;
    
    const row: CSVRow = {
      '#SnippetType': snippet.type || snippet.snippetType || 'Organic_withOfferInfo',
      '#ProductURL': snippet.url || snippet.link || snippet.href || snippet.productUrl || '',
      '#OrganicTitle': snippet.title || snippet.name || snippet.headline || snippet.text || '',
      '#ShopName': snippet.shopName || snippet.shop || snippet.vendor || snippet.domain || '',
      '#OrganicHost': '',
      '#OrganicPath': snippet.path || snippet.breadcrumbs || '',
      '#SnippetFavicon': '',
      '#FaviconImage': '',
      '#OrganicText': snippet.description || snippet.text || snippet.snippet || '',
      '#OrganicImage': snippet.image || snippet.thumbnail || snippet.thumb || snippet.img || '',
      '#ThumbImage': snippet.thumbnail || snippet.thumb || snippet.image || '',
      '#OrganicPrice': '',
      '#Currency': '',
      '#PriceInfo': '',
      '#OldPrice': '',
      '#DiscountPercent': '',
      '#ShopRating': snippet.rating || snippet.stars || '',
      '#ReviewsNumber': snippet.reviews || snippet.reviewsCount || '',
      '#LabelsList': '',
      '#DeliveryList': '',
      '#FintechList': '',
      '#QuoteImage': '',
      '#QuoteText': '',
      '#Availability': '',
      '#PickupOptions': '',
      '#DeliveryETA': ''
    };
    
    // Извлекаем хост из URL
    if (row['#ProductURL']) {
      try {
        const url = row['#ProductURL'].startsWith('http') ? row['#ProductURL'] : `https://${row['#ProductURL']}`;
        const u = new URL(url);
        row['#OrganicHost'] = u.hostname;
        if (!row['#ShopName']) {
          row['#ShopName'] = u.hostname;
        }
      } catch (e) {
        // ignore
      }
    }
    
    // Обрабатываем цену
    if (snippet.price) {
      if (typeof snippet.price === 'number') {
        row['#OrganicPrice'] = snippet.price.toString();
      } else if (typeof snippet.price === 'string') {
        const priceMatch = snippet.price.match(PRICE_NUMBERS_REGEX);
        if (priceMatch) {
          row['#OrganicPrice'] = priceMatch[1].replace(/\s/g, '');
        }
        if (snippet.price.includes('₽') || snippet.price.includes('руб')) {
          row['#Currency'] = '₽';
        } else if (snippet.price.includes('$')) {
          row['#Currency'] = '$';
        } else if (snippet.price.includes('€')) {
          row['#Currency'] = '€';
        }
      } else if (snippet.price.value) {
        row['#OrganicPrice'] = snippet.price.value.toString();
        row['#Currency'] = snippet.price.currency || '₽';
      }
    }
    
    // Обрабатываем старую цену
    if (snippet.oldPrice) {
      if (typeof snippet.oldPrice === 'number') {
        row['#OldPrice'] = snippet.oldPrice.toString();
      } else if (typeof snippet.oldPrice === 'string') {
        const oldPriceMatch = snippet.oldPrice.match(PRICE_NUMBERS_REGEX);
        if (oldPriceMatch) {
          row['#OldPrice'] = oldPriceMatch[1].replace(/\s/g, '');
        }
      } else if (snippet.oldPrice.value) {
        row['#OldPrice'] = snippet.oldPrice.value.toString();
      }
    }
    
    // Обрабатываем скидку
    if (snippet.discount || snippet.discountPercent) {
      const discount = snippet.discount || snippet.discountPercent;
      if (typeof discount === 'number') {
        row['#DiscountPercent'] = discount.toString();
      } else if (typeof discount === 'string') {
        const discMatch = discount.match(RATING_REGEX);
        if (discMatch) {
          row['#DiscountPercent'] = discMatch[1];
        }
      }
    }
    
    // Обрабатываем фавиконку из JSON
    extractFaviconFromJson(snippet, row);
    
    // Нормализуем URL изображений
    if (row['#OrganicImage'] && !row['#OrganicImage'].startsWith('http')) {
      row['#OrganicImage'] = row['#OrganicImage'].startsWith('//') ? `https:${row['#OrganicImage']}` : `https://${row['#OrganicImage']}`;
    }
    if (row['#ThumbImage'] && !row['#ThumbImage'].startsWith('http')) {
      row['#ThumbImage'] = row['#ThumbImage'].startsWith('//') ? `https:${row['#ThumbImage']}` : `https://${row['#ThumbImage']}`;
    }
    if (row['#FaviconImage'] && !row['#FaviconImage'].startsWith('http') && !row['#FaviconImage'].startsWith('SPRITE_LIST:')) {
      row['#FaviconImage'] = row['#FaviconImage'].startsWith('//') ? `https:${row['#FaviconImage']}` : `https://${row['#FaviconImage']}`;
    }
    
    // Валидация: требуем заголовок и хотя бы один источник
    const hasSource = (row['#OrganicHost'] && row['#OrganicHost'].trim() !== '') || (row['#ShopName'] && row['#ShopName'].trim() !== '');
    if (row['#OrganicTitle'] && hasSource) {
      results.push(row);
    }
  }
  
  console.log(`✅ Извлечено ${results.length} валидных сниппетов из JSON`);
  
  return results;
}

