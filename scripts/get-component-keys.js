/**
 * Скрипт для получения ключей компонентов из библиотеки DC • ECOM
 * 
 * ИНСТРУКЦИЯ:
 * 1. Откройте файл библиотеки DC • ECOM в Figma Desktop
 * 2. Выделите секцию "Organisms" с компонентами
 * 3. Откройте Dev Console (Menu → Plugins → Development → Open console)
 * 4. Скопируйте и вставьте этот скрипт в консоль
 * 5. Результат скопируйте в src/page-builder/component-map.ts
 */

// Известные node IDs из секции Organisms
const KNOWN_NODE_IDS = {
  // EOfferItem variants
  'EOfferItem/Desktop/BtnRight': '22275:104394',
  'EOfferItem/Desktop/BtnDown': '22275:104613', 
  'EOfferItem/Touch/BtnRight': '15029:574539',
  'EOfferItem/Touch/BtnDown': '22266:215796',
  
  // EShopItem variants
  'EShopItem/Desktop': '22266:253481',
  'EShopItem/Touch': '22266:253420',
  
  // EProductSnippet2 variants
  'EProductSnippet2/Default': '22275:120573',
  'EProductSnippet2/WithPadding': '22275:120677',
  'EProductSnippet2/WithBtn': '23256:276424',
  
  // ESnippet variants
  'ESnippet/Desktop': '21938:180822',
  'ESnippet/Touch': '15390:158563',
};

// Поиск компонентов по известным ID
console.log('🔍 Поиск компонентов по известным Node IDs...\n');

const results = {};

for (const [name, nodeId] of Object.entries(KNOWN_NODE_IDS)) {
  try {
    const node = figma.getNodeById(nodeId);
    if (node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET')) {
      results[name] = {
        nodeId: nodeId,
        key: node.key,
        name: node.name,
        type: node.type
      };
      console.log(`✅ ${name}: key="${node.key}"`);
    } else {
      console.log(`❌ ${name}: узел не найден или не компонент`);
    }
  } catch (e) {
    console.log(`❌ ${name}: ошибка - ${e.message}`);
  }
}

console.log('\n📋 Результат для component-map.ts:\n');
console.log(JSON.stringify(results, null, 2));

// Также поиск ComponentSets
console.log('\n\n🔍 Поиск всех ComponentSets на текущей странице...\n');

const allComponents = figma.currentPage.findAll(node => 
  node.type === 'COMPONENT_SET'
);

console.log(`📦 Найдено ${allComponents.length} ComponentSets на странице\n`);

// Фильтруем нужные компоненты
const results = {};
const foundNames = new Set();

for (const component of allComponents) {
  const name = component.name;
  
  // Проверяем, начинается ли имя с нужного префикса
  for (const target of TARGET_COMPONENTS) {
    if (name === target || name.startsWith(target + '/') || name.startsWith(target + ' ')) {
      // Берём только основной компонент (без вариантов)
      if (!foundNames.has(target) || name === target) {
        results[target] = {
          key: component.key,
          id: component.id,
          name: component.name,
          type: component.type,
        };
        foundNames.add(target);
      }
    }
  }
}

// Выводим результаты
console.log('✅ НАЙДЕННЫЕ КОМПОНЕНТЫ:\n');
console.log('```typescript');
console.log('// Скопируйте эти ключи в src/page-builder/component-map.ts\n');

for (const [targetName, info] of Object.entries(results)) {
  console.log(`// ${info.name} (${info.type})`);
  console.log(`'${targetName}': {`);
  console.log(`  key: '${info.key}',`);
  console.log(`  name: '${info.name}',`);
  console.log(`},\n`);
}

console.log('```\n');

// Проверяем, какие компоненты не найдены
const missingComponents = TARGET_COMPONENTS.filter(name => !results[name]);
if (missingComponents.length > 0) {
  console.log('⚠️ НЕ НАЙДЕНЫ:');
  for (const name of missingComponents) {
    console.log(`  - ${name}`);
  }
  console.log('\nПопробуйте поискать на других страницах библиотеки.');
}

// Дополнительно: выводим все компоненты для отладки
console.log('\n📋 ВСЕ КОМПОНЕНТЫ НА СТРАНИЦЕ (первые 50):');
const sortedComponents = allComponents
  .map(c => ({ name: c.name, key: c.key, type: c.type }))
  .sort((a, b) => a.name.localeCompare(b.name))
  .slice(0, 50);

for (const c of sortedComponents) {
  console.log(`  ${c.type}: ${c.name}`);
}

if (allComponents.length > 50) {
  console.log(`  ... и ещё ${allComponents.length - 50} компонентов`);
}

console.log('\n✨ Готово!');

