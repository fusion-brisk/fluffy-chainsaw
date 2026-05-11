import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Measures rendered height of a DOM element via ResizeObserver.
 *
 * Returns `[refCallback, height]`. `height` is 0 until the element is
 * attached and measured. Use as a ref callback on the element you want
 * to measure:
 *
 *   const [ref, height] = useMeasuredHeight<HTMLDivElement>();
 *   return <div ref={ref}>...</div>;
 *
 * Designed for dynamic banners and menus whose height depends on content
 * (text wrapping, font size, theme). Disconnects ResizeObserver on
 * unmount or when the ref detaches.
 */
export function useMeasuredHeight<T extends HTMLElement = HTMLDivElement>(): [
  (node: T | null) => void,
  number,
] {
  const [height, setHeight] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const refCallback = useCallback((node: T | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!node) {
      setHeight(0);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setHeight(Math.ceil(entry.contentRect.height));
      }
    });
    observer.observe(node);
    observerRef.current = observer;
    // Initial measurement — ResizeObserver fires async, so seed
    // synchronously from getBoundingClientRect to avoid a one-frame
    // flash at 0 height.
    setHeight(Math.ceil(node.getBoundingClientRect().height));
  }, []);

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  return [refCallback, height];
}
