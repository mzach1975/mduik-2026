import { useEffect, useMemo, useState } from 'react';
import { downloadFile } from '../api';
import { useI18n } from '../i18n';
import { useApi, todayIso, yearStartIso } from '../hooks';
import Icon from '../components/Icon';
import {
  Card,
  DataTable,
  ErrorState,
  Field,
  Input,
  Loading,
  PageHeader,
  Select,
  StatCard,
} from '../components/ui';

const LABELS = {
  'admissions-funnel': 'reports.admissionsFunnel',
  'interview-results': 'reports.interviewResults',
  'registration-list': 'reports.registrationList',
  'student-records': 'reports.studentRecords',
  'teacher-records': 'reports.teacherRecords',
  'fee-collection': 'reports.feeCollection',
  'arrears-aging': 'reports.arrearsAging',
  'receipt-register': 'reports.receiptRegister',
  'refund-log': 'reports.refundLog',
  'teacher-assignments': 'reports.teacherAssignments',
  'audit-log': 'reports.auditLog',
  'write-off-report': 'reports.writeOffReport',
  'state-consolidated': 'reports.stateConsolidated',
};

export default function Reports() {
  const { t, money, date } = useI18n();
  const [selected, setSelected] = useState('');
  const [from, setFrom] = useState(yearStartIso());
  const [to, setTo] = useState(todayIso());
  const [klass, setKlass] = useState('');
  const { data: listData } = useApi('/reports');
  const { data: classData } = useApi('/students/classes');
  const reports = listData?.reports || [];

  useEffect(() => {
    if (reports.length && !reports.includes(selected)) setSelected(reports[0]);
  }, [listData, selected]);

  const path = selected ? `/reports/${selected}?from=${from}&to=${to}${klass ? `&class=${encodeURIComponent(klass)}` : ''}` : null;
  const { data, loading, error, reload } = useApi(path, { enabled: !!path });
  const report = data;

  const columns = useMemo(
    () =>
      (report?.columns || []).map((col) => ({
        key: col.key,
        label: col.label,
        align: /amount|total|fee|outstanding|collected|count|students|teachers|marks|mark|n$/i.test(col.key) ? 'right' : 'left',
        render: (row) => {
          const v = row[col.key];
          if (v === null || v === undefined || v === '') return '—';
          if (col.money || col.key.includes('_cents') || /\(RM\)/i.test(col.label)) return money(v);
          if (col.key === 'percent') return `${v}%`;
          if (col.key.endsWith('_at') || col.key.endsWith('_date')) return date(v);
          return String(v);
        },
      })),
    [report, money, date],
  );

  return (
    <>
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} />

      <div className="reportlayout">
        <aside className="reportnav">
          <span className="reportnav__label">{t('reports.chooseReport')}</span>
          {!reports.length ? (
            <p className="muted">{t('reports.noAccess')}</p>
          ) : (
            reports.map((id) => (
              <button
                key={id}
                type="button"
                className={`reportnav__item ${selected === id ? 'is-active' : ''}`.trim()}
                onClick={() => setSelected(id)}
              >
                <Icon name="report" size={16} />
                <span>{t(LABELS[id] || id)}</span>
                <Icon name="chevronRight" size={14} />
              </button>
            ))
          )}
        </aside>

        <div className="stack">
          <Card>
            <div className="reportfilters">
              <Field label={t('common.fromDate')}>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label={t('common.toDate')}>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
              <Field label={t('common.class')}>
                <Select value={klass} onChange={(e) => setKlass(e.target.value)}>
                  <option value="">{t('reports.allClasses')}</option>
                  {(classData?.classes || []).map((c) => <option key={c.class_name} value={c.class_name}>{c.class_name}</option>)}
                </Select>
              </Field>
              <div className="reportfilters__actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => reload()}>
                  <Icon name="refresh" size={15} /> {t('reports.generate')}
                </button>
                <span className="export-group">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile(`/reports/${selected}?from=${from}&to=${to}${klass ? `&class=${encodeURIComponent(klass)}` : ''}&format=csv`)}>CSV</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile(`/reports/${selected}?from=${from}&to=${to}${klass ? `&class=${encodeURIComponent(klass)}` : ''}&format=xls`)}>Excel</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile(`/reports/${selected}?from=${from}&to=${to}${klass ? `&class=${encodeURIComponent(klass)}` : ''}&format=pdf`)}>PDF</button>
                </span>
              </div>
            </div>
          </Card>

          {error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : loading && !report ? (
            <Loading />
          ) : report ? (
            <>
              {report.summary?.length > 0 && (
                <div className={`statgrid statgrid--${Math.min(4, report.summary.length)}`}>
                  {report.summary.map((s) => (
                    <StatCard key={s.label} label={s.label} value={typeof s.value === 'number' ? s.value.toLocaleString() : s.value} tone="teal" />
                  ))}
                </div>
              )}
              <Card title={report.title || t(LABELS[selected] || selected)} subtitle={`${date(from)} — ${date(to)}`} padded={false}>
                <DataTable rows={report.rows || []} columns={columns} dense rowKey={(r, i) => `${selected}-${i}`} empty={t('common.noData')} />
              </Card>
              <p className="muted smalltext">{t('reports.exportNote')}</p>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
