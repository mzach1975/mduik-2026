import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * Small data-fetching hook. `path` must be a stable string (build query
 * strings with useMemo or directly in the component body).
 */
export function useApi(path, options = {}) {
  const { enabled = true, initial = null } = options;
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(Boolean(path) && enabled);
  const [error, setError] = useState(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!path || !enabled) {
        setLoading(false);
        return undefined;
      }
      const my = ++reqId.current;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await api.get(path);
        if (my === reqId.current) setData(res);
        return res;
      } catch (err) {
        if (my === reqId.current) setError(err);
        return undefined;
      } finally {
        if (my === reqId.current) setLoading(false);
      }
    },
    [path, enabled],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}

export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · MDUIK` : 'MDUIK · Sistem Pentadbiran Sekolah';
  }, [title]);
}

export function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function fromCents(cents) {
  if (cents === null || cents === undefined) return '';
  return (Number(cents) / 100).toFixed(2);
}

export function buildQuery(params) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') q.set(key, value);
  }
  const str = q.toString();
  return str ? `?${str}` : '';
}

export function formatBytes(n) {
  const bytes = Number(n) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function yearStartIso() {
  return `${new Date().getUTCFullYear()}-01-01`;
}
