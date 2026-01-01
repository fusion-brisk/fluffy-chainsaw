import React, { memo } from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

// Navigation Icons - Figma UI3: 1px stroke weight
export const ImportIcon = memo<IconProps>(({ className, size = 16 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M8 2v8M8 2L5 5M8 2l3 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 10v3a1 1 0 001 1h8a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
  </svg>
));
ImportIcon.displayName = 'ImportIcon';

export const SettingsIcon = memo<IconProps>(({ className, size = 16 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1"/>
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
  </svg>
));
SettingsIcon.displayName = 'SettingsIcon';

export const LogsIcon = memo<IconProps>(({ className, size = 16 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1"/>
    <path d="M5 6h6M5 8h6M5 10h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
  </svg>
));
LogsIcon.displayName = 'LogsIcon';

export const StarIcon = memo<IconProps>(({ className, size = 16 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path 
      d="M8 2L9.5 6.5L14 8L9.5 9.5L8 14L6.5 9.5L2 8L6.5 6.5L8 2Z" 
      stroke="currentColor" 
      strokeWidth="1" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
));
StarIcon.displayName = 'StarIcon';

// Status Icons
export const CheckIcon = memo<IconProps>(({ className, size = 16 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path 
      d="M3 8.5L6.5 12L13 4" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
));
CheckIcon.displayName = 'CheckIcon';

export const WarningIcon = memo<IconProps>(({ className, size = 16 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1"/>
    <path d="M8 4v5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
  </svg>
));
WarningIcon.displayName = 'WarningIcon';

export const InfoIcon = memo<IconProps>(({ className, size = 12 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 12 12" fill="none">
    <path 
      d="M6 11C8.76142 11 11 8.76142 11 6C11 3.23858 8.76142 1 6 1C3.23858 1 1 3.23858 1 6C1 8.76142 3.23858 11 6 11Z" 
      stroke="currentColor" 
      strokeWidth="1"
    />
    <path 
      d="M6 3.5V6.5" 
      stroke="currentColor" 
      strokeWidth="1" 
      strokeLinecap="round"
    />
    <circle cx="6" cy="8.5" r="0.75" fill="currentColor"/>
  </svg>
));
InfoIcon.displayName = 'InfoIcon';

// Large Icons (keep slightly thicker for visibility)
export const UploadIcon = memo<IconProps>(({ className }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <path 
      d="M24 4L24 32M24 4L14 14M24 4L34 14" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M8 28V38C8 40.2091 9.79086 42 12 42H36C38.2091 42 40 40.2091 40 38V28" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
    />
  </svg>
));
UploadIcon.displayName = 'UploadIcon';

// Action Icons
export const ResetIcon = memo<IconProps>(({ className, size = 14 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path 
      d="M2 8C2 4.68629 4.68629 2 8 2C10.5 2 12.5 3.5 13.5 5.5M14 8C14 11.3137 11.3137 14 8 14C5.5 14 3.5 12.5 2.5 10.5" 
      stroke="currentColor" 
      strokeWidth="1" 
      strokeLinecap="round"
    />
    <path 
      d="M13.5 2V5.5H10" 
      stroke="currentColor" 
      strokeWidth="1" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M2.5 14V10.5H6" 
      stroke="currentColor" 
      strokeWidth="1" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
));
ResetIcon.displayName = 'ResetIcon';

// Close Icon
export const CloseIcon = memo<IconProps>(({ className, size = 16 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path 
      d="M4 4L12 12M12 4L4 12" 
      stroke="currentColor" 
      strokeWidth="1" 
      strokeLinecap="round"
    />
  </svg>
));
CloseIcon.displayName = 'CloseIcon';

// Clear/Reset Icon (circular arrow)
export const ClearIcon = memo<IconProps>(({ className, size = 16 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path 
      d="M2.5 8a5.5 5.5 0 0 1 9.3-4" 
      stroke="currentColor" 
      strokeWidth="1.2" 
      strokeLinecap="round"
    />
    <path 
      d="M13.5 8a5.5 5.5 0 0 1-9.3 4" 
      stroke="currentColor" 
      strokeWidth="1.2" 
      strokeLinecap="round"
    />
    <path 
      d="M11 3l1 1.5L10.5 5" 
      stroke="currentColor" 
      strokeWidth="1.2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M5 13l-1-1.5 1.5-.5" 
      stroke="currentColor" 
      strokeWidth="1.2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
));
ClearIcon.displayName = 'ClearIcon';
