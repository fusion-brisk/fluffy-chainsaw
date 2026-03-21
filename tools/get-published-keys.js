/**
 * Получение ключей ОПУБЛИКОВАННЫХ компонентов из Team Library
 * 
 * ИНСТРУКЦИЯ:
 * Способ 1 — Через библиотеку:
 *   1. Откройте файл библиотеки DC • ECOM
 *   2. Убедитесь, что компоненты опубликованы (Publish library)
 *   3. Выделите нужные COMPONENT_SET
 *   4. Вставьте этот скрипт
 * 
 * Способ 2 — Через инстанс:
 *   1. Откройте любой файл, где уже ЕСТЬ инстансы из библиотеки
 *   2. Выделите инстансы компонентов (ESnippet, EOfferItem и т.д.)
 *   3. Вставьте этот скрипт
 */

const sel = figma.currentPage.selection;

if (!sel.length) {
  console.log('❌ Ничего не выделено!');
  console.log('');
  console.log('Варианты:');
  console.log('1. Выдели COMPONENT_SET в файле библиотеки');
  console.log('2. Выдели INSTANCE из библиотеки в рабочем файле');
} else {
  console.log(`\n📦 Анализ ${sel.length} элементов...\n`);
  
  for (const node of sel) {
    console.log(`\n📍 ${node.name} (${node.type})`);
    
    if (node.type === 'INSTANCE') {
      // Для инстанса — получаем главный компонент
      const mainComponent = node.mainComponent;
      if (mainComponent) {
        console.log(`   Main Component: ${mainComponent.name}`);
        console.log(`   Key: '${mainComponent.key}'`);
        
        // Проверяем, из библиотеки ли он
        if (mainComponent.remote) {
          console.log(`   ✅ Это REMOTE компонент (из библиотеки)`);
          console.log(`   → Используй этот key для importComponentByKeyAsync`);
        } else {
          console.log(`   ⚠️ Это ЛОКАЛЬНЫЙ компонент`);
          
          // Пробуем получить parent ComponentSet
          const parent = mainComponent.parent;
          if (parent && parent.type === 'COMPONENT_SET') {
            console.log(`   ComponentSet: ${parent.name}`);
            console.log(`   ComponentSet Key: '${parent.key}'`);
          }
        }
      }
    } else if (node.type === 'COMPONENT') {
      console.log(`   Key: '${node.key}'`);
      console.log(`   Remote: ${node.remote}`);
      
      const parent = node.parent;
      if (parent && parent.type === 'COMPONENT_SET') {
        console.log(`   Parent ComponentSet: ${parent.name}`);
        console.log(`   Parent Key: '${parent.key}'`);
      }
    } else if (node.type === 'COMPONENT_SET') {
      console.log(`   Key: '${node.key}'`);
      console.log(`   Remote: ${node.remote}`);
      
      // Показываем дефолтный вариант
      if (node.defaultVariant) {
        console.log(`   Default Variant: ${node.defaultVariant.name}`);
        console.log(`   Default Variant Key: '${node.defaultVariant.key}'`);
      }
    } else {
      // Ищем инстансы внутри
      const instances = node.findAll ? node.findAll(n => n.type === 'INSTANCE') : [];
      if (instances.length) {
        console.log(`   Найдено ${instances.length} инстансов внутри:`);
        
        const seen = new Set();
        for (const inst of instances.slice(0, 10)) {
          const mc = inst.mainComponent;
          if (mc && !seen.has(mc.key)) {
            seen.add(mc.key);
            console.log(`   - ${mc.name}: key='${mc.key}' remote=${mc.remote}`);
          }
        }
      }
    }
  }
  
  console.log('\n\n💡 Подсказка:');
  console.log('- Если remote=true → компонент из библиотеки, key рабочий');
  console.log('- Если remote=false → компонент локальный, нужно опубликовать библиотеку');
}

