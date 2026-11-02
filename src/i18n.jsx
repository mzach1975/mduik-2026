import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import bm from './locales/bm';
import en from './locales/en';

const dictionaries = { bm, en };
const I18nContext = createContext(null);

function lookup(dict, key) {
  return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), dict);
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('mduik_lang') || 'bm');

  useEffect(() => {
    localStorage.setItem('mduik_lang', lang);
    document.documentElement.lang = lang === 'bm' ? 'ms' : 'en';
  }, [lang]);

  const t = useCallback(
    (key, vars = {}) => {
      let value = lookup(dictionaries[lang], key);
      if (value === undefined) value = lookup(dictionaries.en, key);
      if (value === undefined) value = key;
      if (typeof value !== 'string') return value;
      return value.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
    },
    [lang],
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
      money: (cents) =>
        new Intl.NumberFormat(lang === 'bm' ? 'ms-MY' : 'en-MY', {
          style: 'currency',
          currency: 'MYR',
          minimumFractionDigits: 2,
        }).format((Number(cents) || 0) / 100),
      number: (n) => new Intl.NumberFormat(lang === 'bm' ? 'ms-MY' : 'en-MY').format(Number(n) || 0),
      date: (value, opts = {}) => {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
        return d.toLocaleDateString(lang === 'bm' ? 'ms-MY' : 'en-MY', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          ...opts,
        });
      },
      dateTime: (value) => {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleString(lang === 'bm' ? 'ms-MY' : 'en-MY', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      },
      monthLabel: (period) => {
        if (!period) return '—';
        const [y, m] = String(period).split('-');
        if (!m) return period;
        const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
        return d.toLocaleDateString(lang === 'bm' ? 'ms-MY' : 'en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      },
      monthName: (month) => t('common.monthNames')[Number(month) - 1] || month,
      statusLabel: (status) => {
        const map = {
          active: 'common.active',
          inactive: 'common.inactive',
          pending: 'common.pending',
          approved: 'common.approved',
          rejected: 'common.rejected',
          cancelled: 'common.cancelled',
          issued: 'common.issued',
          scheduled: 'common.scheduled',
          completed: 'common.completed',
          accepted: 'common.accepted',
          not_accepted: 'common.notAccepted',
          waiting_list: 'common.waitingList',
          registered: 'common.registered',
          submitted: 'common.submitted',
          interview: 'common.interview',
          incomplete: 'common.incomplete',
          paid: 'common.paidStatus',
          partial: 'common.partial',
          unpaid: 'common.unpaid',
          waived: 'common.waivedStatus',
          withdrawn: 'students.withdrawn',
          graduated: 'students.graduated',
          lapsed: 'applications.lapsed',
          offered: 'applications.offered',
          declined: 'applications.declined',
          sent: 'common.sent',
          dry_run: 'common.pending',
          confirmed: 'common.approved',
        };
        return t(map[status] || `common.${status}`);
      },
    }),
    [lang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside LanguageProvider');
  return ctx;
}
