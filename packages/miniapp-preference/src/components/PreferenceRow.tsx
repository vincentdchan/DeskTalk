import React, { useCallback, useState, useEffect } from 'react';
import type { PreferenceSchema } from '../schema';
import styles from '../styles/PreferenceApp.module.css';

interface PreferenceRowProps {
  schema: PreferenceSchema;
  value: string | number | boolean;
  onChange: (key: string, value: string | number | boolean) => void;
}

export function PreferenceRow({ schema, value, onChange }: PreferenceRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.rowInfo}>
        <div className={styles.rowLabel}>
          {schema.label}
          {schema.requiresRestart && <span className={styles.rowRestartBadge}>restart</span>}
        </div>
        <div className={styles.rowDescription}>{schema.description}</div>
      </div>
      <div className={styles.rowControl}>
        <Control schema={schema} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

// ─── Control dispatcher ──────────────────────────────────────────────────────

function Control({
  schema,
  value,
  onChange,
}: {
  schema: PreferenceSchema;
  value: string | number | boolean;
  onChange: (key: string, value: string | number | boolean) => void;
}) {
  if (schema.type === 'boolean') {
    return <ToggleControl schema={schema} value={value as boolean} onChange={onChange} />;
  }
  if (schema.type === 'string' && schema.options) {
    return <DropdownControl schema={schema} value={value as string} onChange={onChange} />;
  }
  if (schema.type === 'string') {
    return <TextControl schema={schema} value={value as string} onChange={onChange} />;
  }
  if (schema.type === 'number') {
    return <NumberControl schema={schema} value={value as number} onChange={onChange} />;
  }
  return null;
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

function ToggleControl({
  schema,
  value,
  onChange,
}: {
  schema: PreferenceSchema;
  value: boolean;
  onChange: (key: string, value: boolean) => void;
}) {
  const handleChange = useCallback(() => {
    onChange(schema.key, !value);
  }, [schema.key, value, onChange]);

  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        className={styles.toggleInput}
        checked={value}
        onChange={handleChange}
      />
      <span className={styles.toggleTrack} />
      <span className={styles.toggleKnob} />
    </label>
  );
}

// ─── Dropdown ────────────────────────────────────────────────────────────────

function DropdownControl({
  schema,
  value,
  onChange,
}: {
  schema: PreferenceSchema;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(schema.key, e.target.value);
    },
    [schema.key, onChange],
  );

  return (
    <select className={styles.dropdown} value={value} onChange={handleChange}>
      {(schema.options ?? []).map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

// ─── Text Input ──────────────────────────────────────────────────────────────

function TextControl({
  schema,
  value,
  onChange,
}: {
  schema: PreferenceSchema;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = useCallback(() => {
    if (localValue !== value) {
      onChange(schema.key, localValue);
    }
  }, [schema.key, localValue, value, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onChange(schema.key, localValue);
      }
    },
    [schema.key, localValue, onChange],
  );

  return (
    <input
      type={schema.sensitive ? 'password' : 'text'}
      className={schema.sensitive ? styles.textInputSensitive : styles.textInput}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={schema.sensitive ? 'Enter API key...' : undefined}
    />
  );
}

// ─── Number Input ────────────────────────────────────────────────────────────

function NumberControl({
  schema,
  value,
  onChange,
}: {
  schema: PreferenceSchema;
  value: number;
  onChange: (key: string, value: number) => void;
}) {
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const commit = useCallback(() => {
    let num = Number(localValue);
    if (Number.isNaN(num)) {
      setLocalValue(String(value));
      return;
    }
    if (schema.min !== undefined) num = Math.max(schema.min, num);
    if (schema.max !== undefined) num = Math.min(schema.max, num);
    setLocalValue(String(num));
    if (num !== value) {
      onChange(schema.key, num);
    }
  }, [schema.key, schema.min, schema.max, localValue, value, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commit();
    },
    [commit],
  );

  return (
    <input
      type="number"
      className={styles.numberInput}
      value={localValue}
      min={schema.min}
      max={schema.max}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
}
