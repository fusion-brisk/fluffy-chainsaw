import React, { useState, useEffect, memo, ReactNode } from 'react';

interface LazyTabProps {
  /** Whether this tab is currently active */
  isActive: boolean;
  /** Content to render when tab becomes active */
  children: ReactNode;
  /** Keep content mounted after first render (useful for preserving state) */
  keepMounted?: boolean;
  /** Optional className for the wrapper */
  className?: string;
}

/**
 * LazyTab - Lazily renders tab content on first activation
 * 
 * Features:
 * - Delays mounting until tab is first activated
 * - Optional keepMounted to preserve state after tab switch
 * - Hides content via CSS when inactive (if keepMounted)
 */
export const LazyTab: React.FC<LazyTabProps> = memo(({
  isActive,
  children,
  keepMounted = false,
  className
}) => {
  // Track if tab has ever been active
  const [hasBeenActive, setHasBeenActive] = useState(isActive);
  
  // Mark as activated when becomes active
  useEffect(() => {
    if (isActive && !hasBeenActive) {
      setHasBeenActive(true);
    }
  }, [isActive, hasBeenActive]);
  
  // Never been active - don't render anything
  if (!hasBeenActive) {
    return null;
  }
  
  // If keepMounted, always render but hide when inactive
  if (keepMounted) {
    return (
      <div 
        className={className}
        style={{ display: isActive ? 'contents' : 'none' }}
      >
        {children}
      </div>
    );
  }
  
  // Standard behavior - only render when active
  if (!isActive) {
    return null;
  }
  
  return <>{children}</>;
});

LazyTab.displayName = 'LazyTab';
