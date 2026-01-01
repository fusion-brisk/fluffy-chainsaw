/**
 * Browser Notifications API wrapper for Figma plugin
 * 
 * Shows native browser notifications when processing completes.
 * Works even when Figma window is not in focus.
 */

// Check if notifications are supported
export function isNotificationSupported(): boolean {
  return 'Notification' in window;
}

// Get current permission status
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

// Request permission for notifications
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

// Show a notification
export function showNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    silent?: boolean;
  }
): Notification | null {
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== 'granted') return null;
  
  // Don't show if document is focused
  if (document.hasFocus()) return null;
  
  try {
    const notification = new Notification(title, {
      body: options?.body,
      icon: options?.icon || 'https://www.figma.com/favicon.ico',
      silent: options?.silent ?? false,
      tag: 'eproductsnippet-done', // Prevents duplicate notifications
    });
    
    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
    
    // Focus Figma when notification is clicked
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    
    return notification;
  } catch (e) {
    console.warn('Failed to show notification:', e);
    return null;
  }
}

// Show completion notification
export function showCompletionNotification(
  processedCount: number,
  processingTime?: number | null,
  hasErrors?: boolean
): void {
  const timeStr = processingTime 
    ? ` за ${Math.round(processingTime / 1000)} сек` 
    : '';
  
  const title = hasErrors 
    ? '⚠️ Обработка завершена с ошибками'
    : '✅ Обработка завершена';
  
  const body = `Обработано ${processedCount} элементов${timeStr}`;
  
  showNotification(title, { body });
}

