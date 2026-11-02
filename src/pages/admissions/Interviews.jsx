import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Badge,
  Card,
  DataTable,
  ErrorState,
  PageHeader,
  Progress,
  Select,
  StatusBadge,
  Tabs,
} from '../../components/ui';

export default function Interviews() {
  const { t, dateTime } = useI18n();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi('/interviews');
  const [tab, setTab] = useState('all');
  const [mode, setMode] = useState('');

  const interviews = data?.interviews || [];
  const filtered = useMemo(
    () =>
      interviews.filter((iv) => {
        if (tab === 'pending' && Number(iv.score_count) >= 2) return false;
        if (tab === 'completed' && iv.status !== 'completed') return false;
        if (tab === 'scheduled' && iv.status !== 'scheduled') return false;
        if (mode && iv.mode !== mode) return false;
        return true;
      }),
    [interviews, tab, mode],
  );

  return (
    <>
      <PageHeader
        title={t('interviews.title')}
        subtitle={t('interviews.subtitle')}
        actions={
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => reload()}>
            <Icon name="refresh" size={16} /> {t('common.refresh')}
          </button>
        }
      />

      <Card padded={false}>
        <div className="tabsbar">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: t('common.all'), count: interviews.length },
              { id: 'scheduled', label: t('common.scheduled'), count: interviews.filter((i) => i.status === 'scheduled').length },
              { id: 'pending', label: t('interviews.pending'), count: interviews.filter((i) => Number(i.score_count) < 2).length },
              { id: 'completed', label: t('interviews.completed'), count: interviews.filter((i) => i.status === 'completed').length },
            ]}
          />
        </div>
        <div className="toolbar">
          <span className="muted">{t('interviews.checklistHint')}</span>
          <div className="toolbar__filters">
            <Select value={mode} onChange={(e) => setMode(e.target.value)} aria-label={t('applications.mode')}>
              <option value="">{t('common.all')} · {t('applications.mode')}</option>
              <option value="in_person">{t('applications.inPerson')}</option>
              <option value="phone">{t('applications.phoneMode')}</option>
            </Select>
          </div>
        </div>

        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <DataTable
            rows={filtered}
            loading={loading}
            onRowClick={(row) => navigate(`/app/interviews/${row.id}`)}
            columns={[
              { key: 'scheduled_at', label: t('applications.interviewDate'), render: (r) => <span className="cell-strong">{dateTime(r.scheduled_at)}</span> },
              {
                key: 'student_name',
                label: t('applications.applicant'),
                render: (r) => (
                  <span className="stack-cell">
                    <strong>{r.student_name}</strong>
                    <small className="mono">{r.reference}</small>
                  </span>
                ),
              },
              { key: 'category', label: t('common.category'), render: (r) => <Badge tone={r.category === 'tahfiz' ? 'teal' : 'sand'}>{t(r.category === 'tahfiz' ? 'common.tahfiz' : 'common.islamicStudies')}</Badge> },
              { key: 'mode', label: t('applications.mode'), render: (r) => (r.mode === 'in_person' ? t('applications.inPerson') : t('applications.phoneMode')) },
              {
                key: 'score_count',
                label: t('interviews.scoreProgress'),
                render: (r) => (
                  <div className="scoreprogress">
                    <Progress value={Number(r.score_count)} max={2} tone={Number(r.score_count) >= 2 ? 'green' : 'amber'} />
                    <span>{r.score_count}/2</span>
                  </div>
                ),
              },
              {
                key: 'final_mark',
                label: t('interviews.finalMark'),
                align: 'right',
                render: (r) =>
                  r.final_mark === null || r.final_mark === undefined ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className={Number(r.final_mark) < 40 ? 'mark mark--low' : 'mark'}>{Number(r.final_mark).toFixed(1)}</span>
                  ),
              },
              { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
              { key: 'go', label: '', align: 'right', render: () => <span className="rowaction"><Icon name="chevronRight" size={17} /></span> },
            ]}
          />
        )}
      </Card>
    </>
  );
}
