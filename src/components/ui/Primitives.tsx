import React from 'react';
import { X, AlertTriangle, CheckCircle2, Info, PackageOpen } from 'lucide-react';
import { ToastMessage } from '../../context/StoreContext';

// 1. Reusable Button
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315744] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0 cursor-pointer';

  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-[#315744] text-white hover:bg-[#264536] border border-[#315744]',
    secondary: 'bg-[#252923] text-white hover:bg-[#383D35] border border-[#252923]',
    outline:
      'bg-[#FFFFFF] text-[#252923] border border-[#E7E4DC] hover:bg-[#EFEEE8] hover:border-[#D5D1C5]',
    ghost: 'bg-transparent text-[#252923] hover:bg-[#EFEEE8]',
    danger: 'bg-[#FFFFFF] text-[#9E3B24] border border-[#E7E4DC] hover:bg-[#FDF3F1] hover:border-[#BD704F]',
  };

  const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

// 2. Reusable Input
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  id,
  className = '',
  ...props
}) => {
  const generatedId = id || `input_${label?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'field'}`;
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={generatedId} className="text-xs font-medium text-[#252923]">
          {label}
        </label>
      )}
      <input
        id={generatedId}
        className={`w-full px-3 py-2 text-sm bg-[#FFFFFF] text-[#252923] border ${
          error ? 'border-[#9E3B24]' : 'border-[#E7E4DC]'
        } placeholder:text-[#777A73]/70 focus:outline-none focus:border-[#315744] transition-colors ${className}`}
        {...props}
      />
      {hint && !error && <span className="text-[11px] text-[#777A73]">{hint}</span>}
      {error && <span className="text-xs text-[#9E3B24]">{error}</span>}
    </div>
  );
};

// 3. Reusable Select
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  id,
  className = '',
  ...props
}) => {
  const generatedId = id || `select_${label?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'field'}`;
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={generatedId} className="text-xs font-medium text-[#252923]">
          {label}
        </label>
      )}
      <select
        id={generatedId}
        className={`w-full px-3 py-2 text-sm bg-[#FFFFFF] text-[#252923] border ${
          error ? 'border-[#9E3B24]' : 'border-[#E7E4DC]'
        } focus:outline-none focus:border-[#315744] transition-colors ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-[#9E3B24]">{error}</span>}
    </div>
  );
};

// 4. Understated Status Indicator (Zero-Pill discipline: clean unboxed text with semantic tone)
interface StatusIndicatorProps {
  status: string;
  detail?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, detail }) => {
  let textColor = 'text-[#252923]';
  if (
    status === 'In Stock' ||
    status === 'Paid' ||
    status === 'Active' ||
    status === 'completed'
  ) {
    textColor = 'text-[#315744] font-medium';
  } else if (
    status === 'Low Stock' ||
    status === 'Pending' ||
    status === 'Partial' ||
    status === 'On Hold' ||
    status === 'received' ||
    status === 'issued'
  ) {
    textColor = 'text-[#BD704F] font-medium';
  } else if (status === 'Out of Stock' || status === 'Suspended') {
    textColor = 'text-[#9E3B24] font-medium';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${textColor} whitespace-nowrap`}>
      <span>{status}</span>
      {detail && (
        <>
          <span aria-hidden="true" className="text-[#777A73]">
            ·
          </span>
          <span className="text-[#777A73] font-normal">{detail}</span>
        </>
      )}
    </span>
  );
};

// 5. Page Heading
interface PageHeadingProps {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const PageHeading: React.FC<PageHeadingProps> = ({
  kicker,
  title,
  subtitle,
  actions,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[#E7E4DC]">
      <div>
        {kicker && (
          <div className="text-xs font-mono text-[#777A73] mb-1">
            {kicker}
          </div>
        )}
        <h1 className="text-2xl font-semibold text-[#252923] tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-[#777A73] mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
};

// 6. Metric Tile (Single-elevation flat surface with 1px warm border, tabular numerals)
interface MetricTileProps {
  label: string;
  value: string;
  meta?: string;
  accent?: 'default' | 'green' | 'terracotta';
  onClick?: () => void;
}

export const MetricTile: React.FC<MetricTileProps> = ({
  label,
  value,
  meta,
  accent = 'default',
  onClick,
}) => {
  const valueColor =
    accent === 'green'
      ? 'text-[#315744]'
      : accent === 'terracotta'
      ? 'text-[#BD704F]'
      : 'text-[#252923]';

  return (
    <div
      onClick={onClick}
      className={`bg-[#FFFFFF] border border-[#E7E4DC] p-5 flex flex-col justify-between ${
        onClick ? 'cursor-pointer hover:border-[#315744] transition-colors' : ''
      }`}
    >
      <div className="text-xs font-medium text-[#777A73]">{label}</div>
      <div className={`text-2xl font-semibold font-mono tabular-nums mt-2 ${valueColor}`}>
        {value}
      </div>
      {meta && <div className="text-xs text-[#777A73] mt-2">{meta}</div>}
    </div>
  );
};

// 7. Empty State
interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="bg-[#FFFFFF] border border-[#E7E4DC] p-10 text-center flex flex-col items-center justify-center">
      <PackageOpen className="w-8 h-8 text-[#777A73] mb-3 stroke-[1.5]" />
      <h3 className="text-base font-semibold text-[#252923]">{title}</h3>
      <p className="text-sm text-[#777A73] max-w-md mt-1 mb-5">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

// 8. Accessible Modal Dialog
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-lg',
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#252923]/40 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        className={`w-full ${maxWidth} bg-[#FFFFFF] border border-[#E7E4DC] max-h-[90vh] flex flex-col overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#E7E4DC]">
          <div>
            <h2 id="dialog-title" className="text-lg font-semibold text-[#252923]">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-[#777A73] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 text-[#777A73] hover:text-[#252923] hover:bg-[#EFEEE8] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

// 9. Toast Notification Container
export const ToastContainer: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none no-print"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto bg-[#FFFFFF] border border-[#E7E4DC] p-3.5 shadow-sm flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            {t.variant === 'success' && (
              <CheckCircle2 className="w-4 h-4 text-[#315744] shrink-0 mt-0.5" />
            )}
            {t.variant === 'warning' && (
              <AlertTriangle className="w-4 h-4 text-[#BD704F] shrink-0 mt-0.5" />
            )}
            {t.variant === 'error' && (
              <AlertTriangle className="w-4 h-4 text-[#9E3B24] shrink-0 mt-0.5" />
            )}
            {(!t.variant || t.variant === 'default') && (
              <Info className="w-4 h-4 text-[#252923] shrink-0 mt-0.5" />
            )}
            <div>
              <div className="text-xs font-semibold text-[#252923]">{t.title}</div>
              {t.description && (
                <div className="text-xs text-[#777A73] mt-0.5">{t.description}</div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            className="text-[#777A73] hover:text-[#252923] p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
