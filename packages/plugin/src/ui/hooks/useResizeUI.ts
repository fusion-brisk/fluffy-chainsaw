import { useCallback, useRef } from 'react';
import { UI_SIZES, STATE_TO_TIER } from '../../types';
import { sendMessageToPlugin } from '../../utils/index';

/** Resize animation duration (ms) */
const RESIZE_ANIMATION_DURATION = 400;

/** Delay before resize starts (ms) — allows content to prepare */
const RESIZE_DELAY = 50;

/**
 * Animated resize helper.
 * Maps state/panel name → size tier → animated transition via sendMessageToPlugin.
 */
export function useResizeUI(): (state: string) => void {
  const currentSizeRef = useRef<{ width: number; height: number }>({
    width: UI_SIZES.compact.width,
    height: UI_SIZES.compact.height,
  });
  const resizeAnimationRef = useRef<number | null>(null);
  const isFirstResizeRef = useRef(true);

  return useCallback((state: string) => {
    const tier = STATE_TO_TIER[state] || 'standard';
    const targetSize = UI_SIZES[tier];
    const currentSize = currentSizeRef.current;

    if (resizeAnimationRef.current) {
      cancelAnimationFrame(resizeAnimationRef.current);
      resizeAnimationRef.current = null;
    }

    if (currentSize.width === targetSize.width && currentSize.height === targetSize.height) {
      return;
    }

    if (isFirstResizeRef.current) {
      isFirstResizeRef.current = false;
      currentSizeRef.current = { width: targetSize.width, height: targetSize.height };
      sendMessageToPlugin({ type: 'resize-ui', width: targetSize.width, height: targetSize.height });
      return;
    }

    setTimeout(() => {
      const startWidth = currentSizeRef.current.width;
      const startHeight = currentSizeRef.current.height;
      const deltaWidth = targetSize.width - startWidth;
      const deltaHeight = targetSize.height - startHeight;
      const startTime = performance.now();

      const easeInOutQuad = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / RESIZE_ANIMATION_DURATION, 1);
        const easedProgress = easeInOutQuad(progress);

        const newWidth = Math.round(startWidth + deltaWidth * easedProgress);
        const newHeight = Math.round(startHeight + deltaHeight * easedProgress);

        currentSizeRef.current = { width: newWidth, height: newHeight };
        sendMessageToPlugin({ type: 'resize-ui', width: newWidth, height: newHeight });

        if (progress < 1) {
          resizeAnimationRef.current = requestAnimationFrame(animate);
        } else {
          resizeAnimationRef.current = null;
        }
      };

      resizeAnimationRef.current = requestAnimationFrame(animate);
    }, RESIZE_DELAY);
  }, []);
}
