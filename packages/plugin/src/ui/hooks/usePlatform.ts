import { useState } from 'react';

export type PluginPlatform = 'desktop' | 'mobile';

/**
 * Определяет платформу, на которой запущен Figma-плагин.
 *
 * desktop: Figma Desktop App (Electron) или Figma в браузере на desktop
 * mobile:  Figma на iPad (единственная мобильная платформа с поддержкой плагинов)
 *
 * Критерии:
 * - Touch support: 'ontouchstart' in window + navigator.maxTouchPoints > 0
 * - iPad с iOS 13+ отправляет Macintosh user agent, но имеет touch
 * - maxTouchPoints >= 5 — надёжный признак iPad (desktop touchscreen обычно 1-2)
 */
export function detectPluginPlatform(): PluginPlatform {
  const hasTouch = 'ontouchstart' in window && navigator.maxTouchPoints > 0;

  const ua = navigator.userAgent;

  // iPad с iOS 13+ отправляет Macintosh UA, но имеет maxTouchPoints >= 5
  const isMacWithTouch = ua.includes('Macintosh') && hasTouch && navigator.maxTouchPoints >= 5;

  // Прямое определение iPad (старые iOS)
  const isIPad = /iPad/.test(ua) || isMacWithTouch;

  if (isIPad) {
    return 'mobile';
  }

  // Android tablets — Figma не поддерживает плагины, но на всякий случай
  if (/Android/.test(ua) && hasTouch) {
    return 'mobile';
  }

  return 'desktop';
}

/**
 * React hook для использования в компонентах.
 * Значение вычисляется один раз при маунте — платформа не меняется в runtime.
 */
export function usePlatform(): PluginPlatform {
  const [platform] = useState(() => detectPluginPlatform());
  return platform;
}
