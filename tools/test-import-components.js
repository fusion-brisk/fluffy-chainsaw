/**
 * Тест импорта компонентов по ключам
 * 
 * ИНСТРУКЦИЯ:
 * 1. Открой любой рабочий файл в Figma (НЕ библиотеку)
 * 2. Вставь этот скрипт в Dev Console
 * 3. Скрипт создаст по одному инстансу каждого компонента
 */

const COMPONENT_KEYS = {
  'ESnippet': '9cc1db3b34bdd3cedf0a3a29c86884bc618f4fdf',
  'EOfferItem': '09f5630474c44e6514735edd7202c35adcf27613',
  'EShopItem': 'b1c1848c5454036cc48fdfaea06fcc14cd400980',
  'EProductSnippet': 'f921fc66ed6f56cccf558f7bcacbebcaa97495b7',
};

async function testImport() {
  console.log('🧪 Тест импорта компонентов...\n');
  
  // Создаём фрейм для компонентов
  const frame = figma.createFrame();
  frame.name = '🧪 Test Import';
  frame.layoutMode = 'VERTICAL';
  frame.itemSpacing = 24;
  frame.paddingTop = 24;
  frame.paddingRight = 24;
  frame.paddingBottom = 24;
  frame.paddingLeft = 24;
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  
  let yOffset = 0;
  
  for (const [name, key] of Object.entries(COMPONENT_KEYS)) {
    try {
      console.log(`📦 Импорт ${name}...`);
      
      const component = await figma.importComponentByKeyAsync(key);
      console.log(`   ✅ Компонент загружен: ${component.name}`);
      
      // Создаём инстанс
      const instance = component.createInstance();
      instance.name = `Test: ${name}`;
      
      // Добавляем в фрейм
      frame.appendChild(instance);
      
      console.log(`   ✅ Инстанс создан\n`);
      
    } catch (error) {
      console.log(`   ❌ Ошибка: ${error.message}\n`);
    }
  }
  
  // Позиционируем фрейм
  frame.x = figma.viewport.center.x - frame.width / 2;
  frame.y = figma.viewport.center.y - frame.height / 2;
  
  // Выделяем и фокусируемся
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
  
  console.log('✨ Готово! Фрейм с тестовыми компонентами создан.');
}

testImport();

