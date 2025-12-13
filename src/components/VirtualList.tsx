import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';

interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Fixed height of each item in pixels */
  itemHeight: number;
  /** Height of the visible container */
  containerHeight: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Number of items to render outside visible area */
  overscan?: number;
  /** Optional className for container */
  className?: string;
  /** Auto-scroll to bottom when items change */
  autoScrollToBottom?: boolean;
}

/**
 * VirtualList - Efficiently renders large lists
 * 
 * Features:
 * - Only renders visible items + overscan buffer
 * - Smooth scrolling with proper positioning
 * - Auto-scroll to bottom option for logs
 * - Keyboard navigation support
 */
function VirtualListInner<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  className,
  autoScrollToBottom = false
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Calculate total height
  const totalHeight = items.length * itemHeight;
  
  // Calculate visible range
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);
  
  // Get visible items
  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, idx) => ({
      item,
      index: startIndex + idx
    }));
  }, [items, startIndex, endIndex]);
  
  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
    
    // Mark as user scrolling
    setIsUserScrolling(true);
    
    // Clear previous timeout
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    
    // Reset user scrolling flag after delay
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 1000);
  }, []);
  
  // Auto-scroll to bottom when items change
  useEffect(() => {
    if (autoScrollToBottom && containerRef.current && !isUserScrolling) {
      const container = containerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < itemHeight * 3;
      
      // Only auto-scroll if user is near bottom or at top (initial state)
      if (isNearBottom || container.scrollTop === 0) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
          setScrollTop(container.scrollTop);
        });
      }
    }
  }, [items.length, autoScrollToBottom, itemHeight, isUserScrolling]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, []);
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    
    switch (e.key) {
      case 'Home':
        container.scrollTop = 0;
        e.preventDefault();
        break;
      case 'End':
        container.scrollTop = container.scrollHeight;
        e.preventDefault();
        break;
      case 'PageUp':
        container.scrollTop -= containerHeight;
        e.preventDefault();
        break;
      case 'PageDown':
        container.scrollTop += containerHeight;
        e.preventDefault();
        break;
    }
  }, [containerHeight]);
  
  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height: containerHeight,
        overflow: 'auto',
        position: 'relative'
      }}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Spacer to maintain scroll height */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Rendered items */}
        <div
          style={{
            position: 'absolute',
            top: startIndex * itemHeight,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map(({ item, index }) => (
            <div
              key={index}
              style={{ height: itemHeight }}
            >
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Memoized wrapper component
export const VirtualList = memo(VirtualListInner) as typeof VirtualListInner;
