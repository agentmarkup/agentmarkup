import type { FormEvent, RefObject } from 'react';

import { normalizeWebsiteInput } from '../../normalizeWebsiteInput';
import { StatusIcon } from '../Status';

interface ScanBarProps {
  value: string;
  onChange(value: string): void;
  /** Receives the normalized address (the draft state may not have caught up yet). */
  onSubmit(normalized: string): void;
  onCancel(): void;
  scanning: boolean;
  /** A report is on screen: Scan is a secondary action there, so the report's own primary button leads. */
  secondary?: boolean;
  fieldError: string | null;
  quota: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
}

/** The compact form at the top of the report (spec 11.2). Read-only with a Cancel button while a scan runs. */
export function ScanBar({ value, onChange, onSubmit, onCancel, scanning, secondary = false, fieldError, quota, inputRef }: ScanBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scanning) return;
    const normalized = normalizeWebsiteInput(value);
    onChange(normalized);
    onSubmit(normalized);
  }

  const describedBy = [fieldError ? 'scan-bar-error' : null, quota ? 'scan-bar-quota' : null]
    .filter(Boolean)
    .join(' ');

  return (
    <form className="scan-bar" onSubmit={handleSubmit} noValidate>
      <label className="sr-only" htmlFor="scan-bar-url">
        Website address
      </label>
      <div className="scan-bar-row">
        <input
          id="scan-bar-url"
          ref={inputRef}
          className="checker-input scan-bar-input"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="example.com"
          value={value}
          readOnly={scanning}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            if (!scanning) onChange(normalizeWebsiteInput(value));
          }}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={describedBy || undefined}
        />
        {scanning ? (
          <button className="checker-action scan-bar-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button className={`${secondary ? 'checker-action' : 'checker-submit'} scan-bar-button`} type="submit">
            Scan
          </button>
        )}
      </div>
      {fieldError ? (
        <p className="field-error" id="scan-bar-error" role="alert">
          <StatusIcon status="action" />
          {fieldError}
        </p>
      ) : null}
      {quota ? (
        <p className="scan-bar-quota" id="scan-bar-quota">
          {quota}
        </p>
      ) : null}
    </form>
  );
}
