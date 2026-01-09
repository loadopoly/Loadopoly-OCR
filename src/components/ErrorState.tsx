/**
 * Enhanced Error States Component
 * Graceful fallbacks with actionable suggestions and retry options
 */

import React, { useState, useCallback } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  WifiOff,
  FileQuestion,
  Camera,
  Upload,
  Edit3,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Home,
  ArrowLeft,
} from 'lucide-react';

// Error types
export type ErrorType =
  | 'ocr_failed'
  | 'upload_failed'
  | 'network_error'
  | 'processing_error'
  | 'permission_denied'
  | 'file_not_supported'
  | 'api_error'
  | 'wallet_error'
  | 'generic';

interface ErrorAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

interface ErrorConfig {
  title: string;
  description: string;
  icon: React.ReactNode;
  actions: ErrorAction[];
  suggestions?: string[];
  helpLink?: string;
}

// Error configurations with helpful messages
const ERROR_CONFIGS: Record<ErrorType, (context?: any) => ErrorConfig> = {
  ocr_failed: (context) => ({
    title: 'OCR Processing Failed',
    description: context?.message || 'We couldn\'t extract text from this image. The document may be too blurry or damaged.',
    icon: <FileQuestion className="text-amber-500" size={32} />,
    actions: [
      {
        label: 'Retry Processing',
        icon: <RefreshCw size={16} />,
        onClick: context?.onRetry || (() => {}),
        variant: 'primary',
      },
      {
        label: 'Edit Manually',
        icon: <Edit3 size={16} />,
        onClick: context?.onManualEdit || (() => {}),
        variant: 'secondary',
      },
    ],
    suggestions: [
      'Try uploading a higher resolution image',
      'Ensure the document is well-lit and in focus',
      'Crop to show only the document area',
      'For handwritten text, try our enhanced mode',
    ],
  }),

  upload_failed: (context) => ({
    title: 'Upload Failed',
    description: context?.message || 'The file couldn\'t be uploaded. Please try again.',
    icon: <Upload className="text-red-500" size={32} />,
    actions: [
      {
        label: 'Try Again',
        icon: <RefreshCw size={16} />,
        onClick: context?.onRetry || (() => {}),
        variant: 'primary',
      },
      {
        label: 'Choose Different File',
        icon: <Upload size={16} />,
        onClick: context?.onSelectNew || (() => {}),
        variant: 'secondary',
      },
    ],
    suggestions: [
      'Check your internet connection',
      'Ensure the file is under 10MB',
      'Supported formats: JPG, PNG, PDF, TIFF',
    ],
  }),

  network_error: () => ({
    title: 'Connection Lost',
    description: 'You appear to be offline. Your work is saved locally and will sync when connection is restored.',
    icon: <WifiOff className="text-slate-400" size={32} />,
    actions: [
      {
        label: 'Retry Connection',
        icon: <RefreshCw size={16} />,
        onClick: () => window.location.reload(),
        variant: 'primary',
      },
      {
        label: 'Work Offline',
        icon: <Home size={16} />,
        onClick: () => {},
        variant: 'secondary',
      },
    ],
    suggestions: [
      'Check your WiFi or mobile data connection',
      'Try moving closer to your router',
      'Your local changes are safe and will sync later',
    ],
  }),

  processing_error: (context) => ({
    title: 'Processing Error',
    description: context?.message || 'An error occurred while processing your request.',
    icon: <AlertTriangle className="text-red-500" size={32} />,
    actions: [
      {
        label: 'Try Again',
        icon: <RefreshCw size={16} />,
        onClick: context?.onRetry || (() => {}),
        variant: 'primary',
      },
    ],
    suggestions: [
      'Wait a moment and try again',
      'Try with a different file',
      'If the problem persists, contact support',
    ],
    helpLink: 'https://docs.geograph.app/troubleshooting',
  }),

  permission_denied: (context) => ({
    title: 'Permission Required',
    description: context?.message || 'Camera or location access was denied. Please enable in your browser settings.',
    icon: <Camera className="text-amber-500" size={32} />,
    actions: [
      {
        label: 'Open Settings',
        icon: <ExternalLink size={16} />,
        onClick: () => {},
        variant: 'primary',
      },
      {
        label: 'Upload Instead',
        icon: <Upload size={16} />,
        onClick: context?.onUpload || (() => {}),
        variant: 'secondary',
      },
    ],
    suggestions: [
      'Click the lock icon in your address bar',
      'Enable camera/location permissions',
      'Refresh the page after changing settings',
    ],
  }),

  file_not_supported: (context) => ({
    title: 'Unsupported File Format',
    description: `The file "${context?.fileName || 'selected'}" is not supported.`,
    icon: <FileQuestion className="text-amber-500" size={32} />,
    actions: [
      {
        label: 'Choose Different File',
        icon: <Upload size={16} />,
        onClick: context?.onSelectNew || (() => {}),
        variant: 'primary',
      },
    ],
    suggestions: [
      'Supported image formats: JPG, PNG, WebP, TIFF',
      'Supported document formats: PDF',
      'Maximum file size: 10MB',
    ],
  }),

  api_error: (context) => ({
    title: 'Service Unavailable',
    description: context?.message || 'The AI service is temporarily unavailable. Please try again later.',
    icon: <AlertTriangle className="text-amber-500" size={32} />,
    actions: [
      {
        label: 'Retry',
        icon: <RefreshCw size={16} />,
        onClick: context?.onRetry || (() => {}),
        variant: 'primary',
      },
      {
        label: 'Check Status',
        icon: <ExternalLink size={16} />,
        onClick: () => window.open('https://status.geograph.app', '_blank'),
        variant: 'secondary',
      },
    ],
    suggestions: [
      'The service may be experiencing high demand',
      'Check if your API key is valid in Settings',
      'Try again in a few minutes',
    ],
  }),

  wallet_error: (context) => ({
    title: 'Wallet Connection Failed',
    description: context?.message || 'Unable to connect to your wallet. Please try again.',
    icon: <AlertTriangle className="text-amber-500" size={32} />,
    actions: [
      {
        label: 'Reconnect Wallet',
        icon: <RefreshCw size={16} />,
        onClick: context?.onRetry || (() => {}),
        variant: 'primary',
      },
    ],
    suggestions: [
      'Ensure MetaMask or another wallet is installed',
      'Check you\'re on the correct network (Polygon)',
      'Try refreshing the page',
    ],
    helpLink: 'https://docs.geograph.app/web3-setup',
  }),

  generic: (context) => ({
    title: 'Something Went Wrong',
    description: context?.message || 'An unexpected error occurred. Please try again.',
    icon: <AlertTriangle className="text-red-500" size={32} />,
    actions: [
      {
        label: 'Try Again',
        icon: <RefreshCw size={16} />,
        onClick: context?.onRetry || (() => window.location.reload()),
        variant: 'primary',
      },
      {
        label: 'Go Home',
        icon: <Home size={16} />,
        onClick: () => (window.location.href = '/'),
        variant: 'secondary',
      },
    ],
    suggestions: [
      'Try refreshing the page',
      'Clear your browser cache',
      'If the problem persists, contact support',
    ],
  }),
};

// Main Error State Component
interface ErrorStateProps {
  type: ErrorType;
  context?: {
    message?: string;
    fileName?: string;
    errorCode?: string;
    onRetry?: () => void;
    onManualEdit?: () => void;
    onSelectNew?: () => void;
    onUpload?: () => void;
  };
  inline?: boolean;
  className?: string;
}

export function ErrorState({ type, context, inline = false, className = '' }: ErrorStateProps) {
  const [showDetails, setShowDetails] = useState(false);
  const config = ERROR_CONFIGS[type](context);

  const copyError = useCallback(() => {
    const errorInfo = `Error: ${config.title}\n${config.description}\nCode: ${context?.errorCode || 'N/A'}`;
    navigator.clipboard.writeText(errorInfo);
  }, [config, context]);

  if (inline) {
    return (
      <div className={`flex items-center gap-3 p-3 bg-red-950/30 border border-red-900/50 rounded-lg ${className}`}>
        <div className="flex-shrink-0">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-medium">{config.title}</p>
          <p className="text-xs text-slate-400 truncate">{config.description}</p>
        </div>
        {config.actions[0] && (
          <button
            onClick={config.actions[0].onClick}
            className="flex-shrink-0 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm rounded-lg transition-colors"
          >
            {config.actions[0].label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`max-w-md mx-auto p-6 bg-slate-900 border border-slate-800 rounded-2xl ${className}`}>
      {/* Icon & Title */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
          {config.icon}
        </div>
        <h3 className="text-xl font-bold text-white mb-2">{config.title}</h3>
        <p className="text-slate-400 text-sm">{config.description}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        {config.actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
              action.variant === 'primary'
                ? 'bg-primary-600 hover:bg-primary-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>

      {/* Suggestions */}
      {config.suggestions && config.suggestions.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors w-full"
          >
            <HelpCircle size={14} />
            <span>Suggestions</span>
            {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          
          {showDetails && (
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              {config.suggestions.map((suggestion, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary-400 mt-0.5">•</span>
                  {suggestion}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Help link & Error code */}
      <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-800">
        <div className="flex items-center gap-2">
          {context?.errorCode && (
            <button
              onClick={copyError}
              className="flex items-center gap-1 hover:text-slate-400 transition-colors"
              title="Copy error details"
            >
              <Copy size={12} />
              {context.errorCode}
            </button>
          )}
        </div>
        
        {config.helpLink && (
          <a
            href={config.helpLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-slate-400 transition-colors"
          >
            Need help?
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

// Processing State Component (Loading with potential error)
interface ProcessingStateProps {
  status: 'processing' | 'error' | 'success';
  message: string;
  progress?: number;
  errorType?: ErrorType;
  errorContext?: ErrorStateProps['context'];
  onCancel?: () => void;
}

export function ProcessingState({
  status,
  message,
  progress,
  errorType,
  errorContext,
  onCancel,
}: ProcessingStateProps) {
  if (status === 'error' && errorType) {
    return <ErrorState type={errorType} context={errorContext} />;
  }

  return (
    <div className="text-center p-6">
      {status === 'processing' && (
        <>
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-white font-medium mb-2">{message}</p>
          {progress !== undefined && (
            <div className="w-48 mx-auto h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          {onCancel && (
            <button
              onClick={onCancel}
              className="mt-4 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          )}
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-white font-medium">{message}</p>
        </>
      )}
    </div>
  );
}

// Empty State Component
interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`text-center py-12 ${className}`}>
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
        {icon}
      </div>
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      <p className="text-slate-400 text-sm mb-6 max-w-sm mx-auto">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default ErrorState;
