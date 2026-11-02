import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { useApi, useDebounced, buildQuery } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Badge,
  Card,
  DataTable,
  ErrorState,
  PageHeader,
  Pagination,
  SearchBox,
  Select,
  StatusBadge,
  Tabs,
} from '../../components/ui';

const TABS = [
  { id: '', label: 'applications.all' },
  { id: 'submitted', label: 'common.submitted' },
  { id: 'interview', label: 'common.interview' },
  { id: 'accepted', label: 'common.accepted' },
  { id: 'waiting_list', label: 'common.waitingList' },
  { id: 'not_accepted', label: 'common.notAccepted' },
  { id: 'registered', label: 'common.registered' },
  { id: 'incomplete', label: 'common.incomplete' },
];

export default function Applications() {
  const { t, number, date, statusLabel } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const debounced = useDebounced(search);
  const status = params.get('status') || '';
  const category = params.get('category') || '';
  const page = Number(params.get('page') || 1);

  useEffect(() => {
    if ((params.get('q') || '') !== debounced) {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (debounced) next.set('q', debounced);
        else next.delete('q');
        next.set('page', '1');
        return next;
      }, { replace: true });
    }
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = useMemo(() => buildQuery({ status, category, q: debounced, page, pageSize: 20 }), [status, category, debounced, page]);
  const { data, loading, error, reload } = useApi(`/applications${query}`);
  const { data: statsData, reload: reloadStats } = useApi('/applications/stats');

  function update(key, value) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.set('page', '1');
      return next;
    });
  }

  const byStatus = statsData?.byStatus || {};

  return (
    <>
      <PageHeader
        title={t('applications.title')}
        subtitle={t('applications.subtitle')}
        actions={
          <>
            <Link to="/apply" className="btn btn--primary btn--sm" target="_blank" rel="noreferrer">
              <Icon name="plus" size={16} /> {t('dashboard.newApplication')}
            </Link>
          </>
        }
      />

      <Card padded={false}>
        <div className="tabsbar">
          <Tabs
            tabs={[{ id: '', label: t('applications.all'), count: statsData?.total }, ...TABS.slice(1).map((tab) => ({ ...tab, label: statusLabel(tab.id), count: byStatus[tab.id] || 0 }))]}
            active={status}
            onChange={(id) => update('status', id)}
          />
        </div>
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder={t('applications.applicant')} />
          <div className="toolbar__filters">
            <Select value={category} onChange={(e) => update('category', e.target.value)} aria-label={t('applications.categoryFilter')}>
              <option value="">{t('common.all')} · {t('common.category')}</option>
              <option value="tahfiz">{t('common.tahfiz')}</option>
              <option value="islamic_studies">{t('common.islamicStudies')}</option>
            </Select>
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => { reload(); reloadStats(true); }} aria-label={t('common.refresh')}>
              <Icon name="refresh" size={17} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <>
            <DataTable
              rows={data?.applications || []}
              loading={loading}
              onRowClick={(row) => navigate(`/app/applications/${row.id}`)}
              columns={[
                { key: 'reference', label: t('applications.reference'), render: (r) => <span className="mono">{r.reference}</span> },
                {
                  key: 'student_name',
                  label: t('applications.applicant'),
                  render: (r) => (
                    <span className="stack-cell">
                      <strong>{r.student_name}</strong>
                      <small>{r.parent_name || '—'}</small>
                    </span>
                  ),
                },
                {
                  key: 'category',
                  label: t('common.category'),
                  render: (r) => <Badge tone={r.category === 'tahfiz' ? 'teal' : 'sand'}>{t(r.category === 'tahfiz' ? 'common.tahfiz' : 'common.islamicStudies')}</Badge>,
                },
                { key: 'submitted_at', label: t('applications.submitted'), render: (r) => date(r.submitted_at) },
                { key: 'interview_at', label: t('applications.interviewDate'), render: (r) => (r.interview_at ? date(r.interview_at) : '—') },
                {
                  key: 'final_mark',
                  label: t('applications.finalMark'),
                  align: 'right',
                  render: (r) =>
                    r.final_mark === null || r.final_mark === undefined ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className={Number(r.final_mark) < 40 ? 'mark mark--low' : 'mark'}>
                        {Number(r.final_mark).toFixed(1)}
                        <small>/100</small>
                      </span>
                    ),
                },
                { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
                {
                  key: 'actions',
                  label: '',
                  align: 'right',
                  render: () => (
                    <span className="rowaction"><Icon name="chevronRight" size={17} /></span>
                  ),
                },
              ]}
            />
            <Pagination page={data?.page || 1} pageCount={data?.pages || 1} total={data?.total || 0} pageSize={data?.pageSize || 20} onPage={(p) => update('page', String(p))} />
          </>
        )}
      </Card>
    </>
  );
}
