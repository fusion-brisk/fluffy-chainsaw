// DOM utilities for parsing HTML

// Проверяет, находится ли контейнер внутри рекламной галереи
export function isInsideAdvProductGallery(container: Element): boolean {
  let parent: Element | null = container.parentElement;

  while (parent) {
    if (
      parent.classList.contains('AdvProductGallery') ||
      parent.className.includes('AdvProductGallery')
    ) {
      return true;
    }
    parent = parent.parentElement;
  }

  return false;
}
