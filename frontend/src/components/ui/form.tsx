'use client';

/**
 * Form controls.
 *
 * Every field is label-associated, announces its own error through
 * `aria-describedby`, and clears the 44px touch target minimum.
 */
import { forwardRef, useId, useState } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/format';

const FIELD_BASE =
  'w-full touch-target rounded-control bg-surface px-3.5 text-sm text-fg placeholder:text-subtle ' +
  'border border-border transition-colors focus:border-primary focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
  className,
  action,
}: {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {(label || action) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label htmlFor={id} className="text-sm font-medium text-fg">
              {label}
            </label>
          )}
          {action}
        </div>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Rendered inside the field on the right, e.g. a "Max" button. */
  suffix?: ReactNode;
  labelAction?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, suffix, labelAction, className, containerClassName, id, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      action={labelAction}
      className={containerClassName}
    >
      <div className="relative flex items-center">
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn(FIELD_BASE, Boolean(suffix) && 'pr-20', Boolean(error) && 'border-danger', className)}
          {...props}
        />
        {suffix && (
          <div className="absolute right-2 flex items-center gap-1">{suffix}</div>
        )}
      </div>
    </FieldShell>
  );
});

/** Password field with a show/hide toggle, as on the withdrawal screen. */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput(
  { className, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      ref={ref}
      type={visible ? 'text' : 'password'}
      className={cn('pr-12', className)}
      suffix={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="touch-target flex items-center justify-center rounded-control px-2 text-muted hover:text-fg"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
        </button>
      }
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, rows = 4, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(FIELD_BASE, 'min-h-[110px] py-2.5', Boolean(error) && 'border-danger', className)}
        {...props}
      />
    </FieldShell>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  options: { value: string; label: string; disabled?: boolean }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error}>
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(FIELD_BASE, 'appearance-none pr-9', Boolean(error) && 'border-danger', className)}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});

/** Search box with a leading icon, used on the markets screen. */
export function SearchInput({
  value,
  onValueChange,
  placeholder = 'Search markets',
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          'h-11 w-full rounded-pill border border-border bg-card pl-9 pr-3 text-sm',
          'text-fg placeholder:text-subtle transition-colors',
          'focus:border-primary focus:outline-none',
        )}
      />
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** Inline form-level error, shown above a submit button. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-xs text-danger">
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-control bg-primary/10 px-3 py-2 text-xs text-primary">
      {message}
    </p>
  );
}
