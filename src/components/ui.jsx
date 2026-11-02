import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import Icon from './Icon';

/* ------------------------------------------------------------------ */
/* Brand                                                              */
/* ------------------------------------------------------------------ */

export function Brand({ compact = false, light = false }) {
  return (
    <span className={`brand ${light ? 'brand--light' : ''}`}>
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="40" height="40" fill="none">
          <rect width="40" height="40" rx="12" fill="currentColor" opacity="0.12" />
          <path d="M20 7.5 31 13v6.2c0 6.4-4.6 11-11 13.3C13.6 30.2 9 25.6 9 19.2V13l11-5.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M20 12.2v11.4M15.3 16.6h9.4M16.6 22.4h6.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="20" cy="10.4" r="1.5" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span className="brand__text">
          <strong>MDUIK</strong>
          <small>Sistem Pentadbiran Sekolah</small>
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Layout primitives                                                  */
/* ------------------------------------------------------------------ */

export function PageHeader({ title, subtitle, actions, eyebrow, back }) {
  return (
    <header className="page-head">
      <div className="page-head__text">
        {back}
        {eyebrow && <span className="page-head__eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, subtitle, actions, children, className = '', padded = true, footer }) {
  return (
    <section className={`card ${className}`.trim()}>
      {(title || actions) && (
        <div className="card__head">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'card__body' : 'card__body card__body--flush'}>{children}</div>
      {footer && <div className="card__foot">{footer}</div>}
    </section>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'teal', trend, onClick, href }) {
  const Tag = onClick || href ? 'a' : 'div';
  return (
    <Tag
      className={`stat stat--${tone} ${onClick || href ? 'stat--link' : ''}`.trim()}
      onClick={onClick}
      href={href}
    >
      <div className="stat__top">
        <span className="stat__label">{label}</span>
        {icon && (
          <span className="stat__icon">
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <div className="stat__value">{value}</div>
      {hint && <div className="stat__hint">{hint}</div>}
      {trend && <div className="stat__trend">{trend}</div>}
    </Tag>
  );
}

export function SectionTitle({ children, actions }) {
  return (
    <div className="section-title">
      <h3>{children}</h3>
      {actions}
    </div>
  );
}

export function KeyValue({ items, columns = 2 }) {
  return (
    <dl className={`kv kv--${columns}`}>
      {items.filter(Boolean).map((item, index) => (
        <div className="kv__item" key={`${item.label}-${index}`}>
          <dt>{item.label}</dt>
          <dd>{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Avatar({ name = '', size = 40 }) {
  const initials = String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const tones = ['sand', 'teal', 'rose', 'sky', 'moss'];
  const tone = tones[(String(name).length + (name?.charCodeAt(0) || 0)) % tones.length];
  return (
    <span className={`avatar avatar--${tone}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials || '?'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                             */
/* ------------------------------------------------------------------ */

const TONES = {
  green: ['accepted', 'approved', 'active', 'paid', 'completed', 'sent', 'confirmed', 'registered', 'resolved', 'accepted_offer'],
  amber: ['pending', 'submitted', 'interview', 'waiting_list', 'partial', 'issued', 'scheduled', 'queued', 'dry_run', 'pending_review', 'offered'],
  red: ['rejected', 'not_accepted', 'cancelled', 'overdue', 'unpaid', 'failed', 'lapsed', 'declined', 'suspended', 'inactive'],
  blue: ['new', 'info', 'submitted'],
  purple: ['waived', 'adjustment', 'credit'],
  slate: ['draft', 'withdrawn', 'graduated', 'archived', 'dismissed', 'anonymise'],
};

export function statusTone(status) {
  const s = String(status || '').toLowerCase();
  for (const [tone, list] of Object.entries(TONES)) if (list.includes(s)) return tone;
  return 'slate';
}

export function Badge({ tone = 'slate', children, dot = false }) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot && <span className="badge__dot" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  const { statusLabel } = useI18n();
  if (!status) return <span className="muted">—</span>;
  return (
    <Badge tone={statusTone(status)} dot>
      {statusLabel(status)}
    </Badge>
  );
}

export function RoleBadge({ role }) {
  const { t } = useI18n();
  const key = { super_admin: 'superAdmin', school_admin: 'schoolAdmin', bursar: 'bursar', teacher: 'teacher', parent: 'parent' }[role];
  return <Badge tone={role === 'super_admin' ? 'purple' : role === 'school_admin' ? 'teal' : role === 'bursar' ? 'green' : role === 'teacher' ? 'blue' : 'sand'}>{t(`users.${key || role}`)}</Badge>;
}

/* ------------------------------------------------------------------ */
/* Tables                                                             */
/* ------------------------------------------------------------------ */

export function DataTable({ columns, rows, loading, empty, rowKey, onRowClick, footer, dense = false, className = '' }) {
  const { t } = useI18n();
  const keyFor = (row, index) => (rowKey ? rowKey(row, index) : row?.id || index);
  return (
    <div className={`table-wrap ${className}`.trim()}>
      <table className={`table ${dense ? 'table--dense' : ''}`.trim()}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={col.key || i} style={{ width: col.width, textAlign: col.align || 'left' }} className={col.className}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length}>
                <div className="table-loading">
                  <span className="spinner" /> {t('common.loading')}
                </div>
              </td>
            </tr>
          )}
          {!loading && (!rows || !rows.length) && (
            <tr>
              <td colSpan={columns.length}>
                <div className="empty empty--inline">
                  <Icon name="info" size={22} />
                  <p>{empty || t('common.noData')}</p>
                </div>
              </td>
            </tr>
          )}
          {!loading &&
            rows?.map((row, index) => (
              <tr
                key={keyFor(row, index)}
                onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                className={onRowClick ? 'table__row--click' : ''}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter') onRowClick(row, index);
                      }
                    : undefined
                }
              >
                {columns.map((col, i) => (
                  <td key={col.key || i} style={{ textAlign: col.align || 'left' }} className={col.className}>
                    {col.render ? col.render(row, index) : row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}

export function Pagination({ page = 1, pageCount = 1, total, pageSize, onPage }) {
  const { t } = useI18n();
  if (!total) return null;
  const pages = Math.max(1, pageCount);
  const list = [];
  const start = Math.max(1, Math.min(page - 1, pages - 2));
  for (let i = start; i <= Math.min(pages, start + 2); i++) list.push(i);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pagination">
      <span className="pagination__meta">
        {t('common.showing', { from, to, total })}
      </span>
      <div className="pagination__controls">
        <button type="button" className="btn btn--ghost btn--icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('common.back')}>
          <Icon name="chevronLeft" size={16} />
        </button>
        {start > 1 && (
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onPage(1)}>
              1
            </button>
            {start > 2 && <span className="muted">…</span>}
          </>
        )}
        {list.map((p) => (
          <button key={p} type="button" className={`btn btn--sm ${p === page ? 'btn--primary' : 'btn--ghost'}`} onClick={() => onPage(p)}>
            {p}
          </button>
        ))}
        {start + 2 < pages && (
          <>
            {start + 3 < pages && <span className="muted">…</span>}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onPage(pages)}>
              {pages}
            </button>
          </>
        )}
        <button type="button" className="btn btn--ghost btn--icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('common.next')}>
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                              */
/* ------------------------------------------------------------------ */

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', danger = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const focusable = ref.current?.querySelector('input, select, textarea, button');
      focusable?.focus?.();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal__panel modal__panel--${size} ${danger ? 'modal__panel--danger' : ''}`.trim()} ref={ref}>
        <div className="modal__head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, danger = true, busy }) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || t('common.confirm')}
      size="sm"
      danger={danger}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm} disabled={busy}>
            {busy && <span className="spinner spinner--light" />}
            {confirmLabel || t('common.confirm')}
          </button>
        </>
      }
    >
      <p className="confirm-text">{message}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                      */
/* ------------------------------------------------------------------ */

export function Field({ label, hint, error, required, children, className = '' }) {
  return (
    <label className={`field ${error ? 'field--error' : ''} ${className}`.trim()}>
      {label && (
        <span className="field__label">
          {label} {required && <span className="field__req">*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}

export function Input({ className = '', ...props }) {
  return <input className={`input ${className}`.trim()} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <span className="select-wrap">
      <select className={`input select ${className}`.trim()} {...props}>
        {children}
      </select>
      <Icon name="chevronDown" size={16} className="select__chev" />
    </span>
  );
}

export function Textarea({ className = '', rows = 4, ...props }) {
  return <textarea className={`input textarea ${className}`.trim()} rows={rows} {...props} />;
}

export function Checkbox({ label, checked, onChange, name, disabled }) {
  return (
    <label className={`checkbox ${disabled ? 'checkbox--disabled' : ''}`.trim()}>
      <input type="checkbox" name={name} checked={checked} onChange={onChange} disabled={disabled} />
      <span className="checkbox__box">
        <Icon name="check" size={13} strokeWidth={2.4} />
      </span>
      {label && <span className="checkbox__label">{label}</span>}
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder, onSubmit }) {
  const { t } = useI18n();
  return (
    <form
      className="searchbox"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      role="search"
    >
      <Icon name="search" size={17} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || t('common.searchPlaceholder')} aria-label={t('common.search')} />
      {value && (
        <button type="button" className="searchbox__clear" onClick={() => onChange('')} aria-label="Clear">
          <Icon name="close" size={14} />
        </button>
      )}
    </form>
  );
}

export function FileField({ label, hint, accept, onChange, fileName, required, error }) {
  const { t } = useI18n();
  return (
    <Field label={label} hint={hint} required={required} error={error}>
      <span className="filefield">
        <input type="file" accept={accept} onChange={onChange} />
        <span className="btn btn--ghost btn--sm">
          <Icon name="upload" size={16} /> {t('common.upload')}
        </span>
        <span className="filefield__name">{fileName || t('common.none')}</span>
      </span>
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                           */
/* ------------------------------------------------------------------ */

export function Alert({ tone = 'info', title, children, onClose }) {
  const icons = { info: 'info', success: 'checkCircle', warning: 'alert', danger: 'alert' };
  return (
    <div className={`alert alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="alert__icon">
        <Icon name={icons[tone] || 'info'} size={18} />
      </span>
      <div className="alert__body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {onClose && (
        <button type="button" className="alert__close" onClick={onClose} aria-label="Dismiss">
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = 'file', title, children, action }) {
  const { t } = useI18n();
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title || t('common.noData')}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ label }) {
  const { t } = useI18n();
  return (
    <div className="loading-block">
      <span className="spinner" />
      <span>{label || t('common.loading')}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const { t } = useI18n();
  return (
    <Alert tone="danger" title={t('common.error')}>
      <p>{error?.message || t('errors.generic')}</p>
      {onRetry && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onRetry()}>
          {t('common.refresh')}
        </button>
      )}
    </Alert>
  );
}

export function Progress({ value = 0, max = 100, tone = 'teal', label }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / (Number(max) || 1)) * 100));
  return (
    <div className="progress" title={`${value} / ${max}`}>
      <div className={`progress__bar progress__bar--${tone}`} style={{ width: `${pct}%` }} />
      {label && <span className="progress__label">{label}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                               */
/* ------------------------------------------------------------------ */

export function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={`tabs ${className}`.trim()} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`tab ${active === tab.id ? 'tab--active' : ''}`.trim()}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && tab.count !== null && <span className="tab__count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Exports                                                            */
/* ------------------------------------------------------------------ */

export function ExportButtons({ onExport, formats = ['csv', 'xls', 'pdf'], busy }) {
  const { t } = useI18n();
  const labels = { csv: 'CSV', xls: 'Excel', pdf: 'PDF' };
  return (
    <span className="export-group">
      {formats.map((f) => (
        <button key={f} type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onExport(f)}>
          <Icon name="download" size={15} /> {labels[f]}
        </button>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                             */
/* ------------------------------------------------------------------ */

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const remove = useCallback((id) => setItems((prev) => prev.filter((i) => i.id !== id)), []);
  const push = useCallback(
    (message, tone = 'success', timeout = 4200) => {
      const id = `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
      if (timeout) setTimeout(() => remove(id), timeout);
      return id;
    },
    [remove],
  );
  const value = useMemo(() => ({ push, remove }), [push, remove]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast toast--${item.tone}`}>
            <Icon name={item.tone === 'success' ? 'checkCircle' : item.tone === 'danger' ? 'alert' : 'info'} size={18} />
            <span>{item.message}</span>
            <button type="button" onClick={() => remove(item.id)} aria-label="Dismiss">
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Bars (simple charts)                                               */
/* ------------------------------------------------------------------ */

export function BarList({ items, format }) {
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  return (
    <div className="barlist">
      {items.map((item) => (
        <div className="barlist__row" key={item.label}>
          <span className="barlist__label">{item.label}</span>
          <span className="barlist__track">
            <span className={`barlist__bar barlist__bar--${item.tone || 'teal'}`} style={{ width: `${((Number(item.value) || 0) / max) * 100}%` }} />
          </span>
          <span className="barlist__value">{format ? format(item.value) : item.value}</span>
        </div>
      ))}
    </div>
  );
}
