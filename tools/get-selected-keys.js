/**
 * Простой скрипт для получения ключей выделенных компонентов
 *
 * ИНСТРУКЦИЯ:
 * 1. Открой файл библиотеки DC • ECOM в Figma
 * 2. Выдели нужные компоненты (COMPONENT_SET или COMPONENT)
 * 3. Вставь этот скрипт в Dev Console
 */

const sel = figma.currentPage.selection;

if (!sel.length) {
  console.log('❌ Выдели компоненты!');
} else {
  console.log(`\n📦 Выделено: ${sel.length} элементов\n`);

  for (const n of sel) {
    if (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') {
      console.log(`✅ ${n.name}`);
      console.log(`   key: '${n.key}'`);
      console.log(`   id: '${n.id}'`);
      console.log(`   type: ${n.type}\n`);
    } else {
      // Ищем компоненты внутри
      const children = n.findAll ? n.findAll((c) => c.type === 'COMPONENT_SET') : [];
      if (children.length) {
        console.log(`📁 ${n.name} содержит ${children.length} ComponentSets:\n`);
        for (const c of children) {
          console.log(`   ✅ ${c.name}`);
          console.log(`      key: '${c.key}'`);
          console.log(`      id: '${c.id}'\n`);
        }
      } else {
        console.log(`⚠️ ${n.name} — ${n.type}, не компонент`);
      }
    }
  }
}
