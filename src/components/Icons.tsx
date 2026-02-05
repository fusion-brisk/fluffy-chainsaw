/**
 * SVG Icons for the redesigned UI
 */

import React from 'react';

// Logo icon - green square with download arrow
export const LogoIcon: React.FC<{ className?: string; size?: number }> = ({ className, size = 20 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 6C0 2.68629 2.68629 0 6 0H14C17.3137 0 20 2.68629 20 6V14C20 17.3137 17.3137 20 14 20H6C2.68629 20 0 17.3137 0 14V6Z" fill="#00B341"/>
    <path fillRule="evenodd" clipRule="evenodd" d="M10.599 13.703L13.775 10.527L14.623 11.376L9.999 16L5.375 11.376L6.224 10.527L9.399 13.703V4H10.599V13.703Z" fill="white"/>
  </svg>
);

// Ready state icon - stylized signal/pulse
export const ReadyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ready-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a855f7" />
        <stop offset="50%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#06b6d4" />
      </linearGradient>
    </defs>
    <circle cx="40" cy="40" r="32" fill="url(#ready-gradient)" opacity="0.15" />
    <path 
      d="M40 20 L40 35 M40 45 L40 60 M20 40 L35 40 M45 40 L60 40" 
      stroke="url(#ready-gradient)" 
      strokeWidth="3" 
      strokeLinecap="round"
    />
    <circle cx="40" cy="40" r="8" fill="url(#ready-gradient)" />
    <path 
      d="M25 25 L32 32 M55 25 L48 32 M25 55 L32 48 M55 55 L48 48" 
      stroke="url(#ready-gradient)" 
      strokeWidth="2" 
      strokeLinecap="round"
      opacity="0.6"
    />
  </svg>
);

// Processing spinner - spiral animation
export const ProcessingSpinner: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="spinner-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="50%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#a855f7" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="40" stroke="url(#spinner-gradient)" strokeWidth="4" opacity="0.2" />
    <path 
      d="M50 10 A40 40 0 0 1 90 50" 
      stroke="url(#spinner-gradient)" 
      strokeWidth="4" 
      strokeLinecap="round"
      className="spinner-arc"
    />
    <circle cx="50" cy="50" r="25" stroke="url(#spinner-gradient)" strokeWidth="3" opacity="0.15" />
    <path 
      d="M50 25 A25 25 0 0 0 25 50" 
      stroke="url(#spinner-gradient)" 
      strokeWidth="3" 
      strokeLinecap="round"
      className="spinner-arc-inner"
    />
  </svg>
);

// Success icon - checkmark with sparkles
export const SuccessIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="success-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#06b6d4" />
      </linearGradient>
    </defs>
    {/* Background blob */}
    <circle cx="50" cy="50" r="35" fill="url(#success-gradient)" opacity="0.15" />
    {/* Main circle */}
    <circle cx="50" cy="50" r="28" fill="url(#success-gradient)" className="success-circle" />
    {/* Checkmark */}
    <path 
      d="M36 50 L46 60 L64 42" 
      stroke="white" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className="success-check"
    />
    {/* Sparkles */}
    <g className="success-sparkles">
      <circle cx="20" cy="30" r="3" fill="#10b981" opacity="0.8" />
      <circle cx="80" cy="35" r="2.5" fill="#06b6d4" opacity="0.8" />
      <circle cx="75" cy="70" r="2" fill="#10b981" opacity="0.6" />
      <circle cx="25" cy="65" r="2.5" fill="#06b6d4" opacity="0.7" />
      <path d="M15 50 L18 47 L21 50 L18 53 Z" fill="#a855f7" opacity="0.6" />
      <path d="M82 55 L85 52 L88 55 L85 58 Z" fill="#f59e0b" opacity="0.6" />
    </g>
  </svg>
);

// Search icon for query card
export const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
    <path d="M16 16 L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Check icon (simple)
export const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Check Circle icon - for success headers (unified style)
export const CheckCircleIcon: React.FC<{ className?: string; size?: number }> = ({ className, size = 24 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="var(--figma-color-text-success)" opacity="0.15" />
    <circle cx="12" cy="12" r="8" fill="var(--figma-color-text-success)" />
    <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Inbox/Received icon - for confirm dialog header
export const InboxIcon: React.FC<{ className?: string; size?: number }> = ({ className, size = 24 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" stroke="var(--figma-color-bg-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" stroke="var(--figma-color-bg-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Warning icon
export const WarningIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" />
  </svg>
);

// Info icon
export const InfoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Clear/Close icon
export const ClearIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Browser illustration for ready state
export const BrowserIllustration: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Browser window */}
    <rect x="5" y="5" width="110" height="80" rx="8" fill="white" stroke="#e5e7eb" strokeWidth="1.5" />
    {/* Title bar */}
    <rect x="5" y="5" width="110" height="20" rx="8" fill="#f9fafb" />
    <rect x="5" y="17" width="110" height="8" fill="#f9fafb" />
    {/* Traffic lights */}
    <circle cx="18" cy="15" r="4" fill="#ff6b6b" />
    <circle cx="30" cy="15" r="4" fill="#feca57" />
    <circle cx="42" cy="15" r="4" fill="#48dbfb" />
    {/* URL bar */}
    <rect x="55" y="10" width="50" height="10" rx="3" fill="#e5e7eb" />
    <circle cx="61" cy="15" r="2.5" stroke="#9ca3af" strokeWidth="1" fill="none" />
    {/* Content area - search results */}
    <rect x="15" y="35" width="60" height="6" rx="2" fill="#e5e7eb" />
    <rect x="15" y="45" width="45" height="4" rx="1" fill="#f3f4f6" />
    <rect x="15" y="55" width="55" height="4" rx="1" fill="#f3f4f6" />
    <rect x="15" y="65" width="40" height="4" rx="1" fill="#f3f4f6" />
    {/* Figma logo placeholder */}
    <g transform="translate(85, 40)">
      <rect width="24" height="24" rx="6" fill="linear-gradient(135deg, #f24e1e, #a259ff)" />
      <rect width="24" height="24" rx="6" fill="#1e1e1e" />
      <circle cx="8" cy="8" r="4" fill="#f24e1e" />
      <circle cx="16" cy="8" r="4" fill="#a259ff" />
      <circle cx="8" cy="16" r="4" fill="#0acf83" />
      <rect x="12" y="12" width="8" height="8" rx="4" fill="#1abcfe" />
    </g>
  </svg>
);

// Note: Sparkle, RingSpinner, SuccessCheckmark, InboxGlass removed in Figma-style refactor
