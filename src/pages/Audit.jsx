import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useApi, buildQuery } from '../hooks';
import Icon from '../components/Icon';
import {
  Badge,
  Card,
  DataTable,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  RoleBadge,
} from '../components/ui';

function pretty(json) {
  if (!json) return '—';
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export default function Audit() {
  const { t, dateTime } = useI18n();
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const query = useMemo(() => buildQuery({ entity, action, from, to, page, pageSize: 25 }), [entity, action, from, to, page]);
  const { data, loading, error, reload } = useApi(`/audit-logs${query}`);

  function update(setter) {
    return (e) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  return (
    <>
      <PageHeader
        title={t('audit.title')}
        subtitle={t('audit.subtitle')}
        actions={
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => reload()}>
            <Icon name="refresh" size={15} /> {t('common.refresh')}
          </button>
        }
      />

      <Card padded={false}>
        <div className="toolbar toolbar--wrap">
          <div className="toolbar__filters">
            <Field label={t('audit.filterEntity')}>
              <Input value={entity} onChange={update(setEntity)} placeholder="student, invoice…" />
            </Field>
            <Field label={t('audit.filterAction')}>
              <Input value={action} onChange={update(setAction)} placeholder="view, create…" />
            </Field>
            <Field label={t('common.fromDate')}>
              <Input type="date" value={from} onChange={update(setFrom)} />
            </Field>
            <Field label={t('common.toDate')}>
              <Input type="date" value={to} onChange={update(setTo)} />
            </Field>
          </div>
        </div>

        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <>
            <DataTable
              rows={data?.logs || []}
              loading={loading}
              empty={t('audit.noLogs')}
              onRowClick={(row) => setDetail(row)}
              columns={[
                { key: 'created_at', label: t('audit.time'), render: (r) => <span className="cell-strong">{dateTime(r.created_at)}</span> },
                {
                  key: 'actor_name',
                  label: t('audit.actor'),
                  render: (r) => (
                    <span className="stack-cell">
                      <strong>{r.actor_name}</strong>
                      <small>{r.actor_role ? <RoleBadge role={r.actor_role} /> : '—'}</small>
                    </span>
                  ),
                },
                { key: 'action', label: t('audit.action'), render: (r) => <Badge tone={r.action === 'view' ? 'slate' : r.action.includes('delete') ? 'red' : 'teal'}>{r.action}</Badge> },
                { key: 'entity', label: t('audit.entity'), render: (r) => <span className="mono">{r.entity}</span> },
                { key: 'entity_id', label: t('audit.record'), render: (r) => <span className="mono smalltext">{r.entity_id || '—'}</span> },
                { key: 'ip', label: t('audit.ip'), render: (r) => <span className="mono smalltext">{r.ip || '—'}</span> },
                { key: 'go', label: '', align: 'right', render: () => <span className="rowaction"><Icon name="chevronRight" size={17} /></span> },
              ]}
            />
            <Pagination page={data?.page || 1} pageCount={data?.pages || 1} total={data?.total || 0} pageSize={data?.pageSize || 25} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.action}
        subtitle={`${detail?.entity} · ${detail?.entity_id || ''}`}
        size="lg"
        footer={<button type="button" className="btn btn--ghost" onClick={() => setDetail(null)}>{t('common.close')}</button>}
      >
        {detail && (
          <>
            <div className="auditmeta">
              <div><span>{t('audit.time')}</span><strong>{dateTime(detail.created_at)}</strong></div>
              <div><span>{t('audit.actor')}</span><strong>{detail.actor_name}</strong></div>
              <div><span>{t('audit.role')}</span><strong>{detail.actor_role}</strong></div>
              <div><span>{t('audit.ip')}</span><strong className="mono">{detail.ip || '—'}</strong></div>
            </div>
            <h4 className="detaillabel">{t('audit.before')}</h4>
            <pre className="jsonbox">{pretty(detail.before_json)}</pre>
            <h4 className="detaillabel">{t('audit.after')}</h4>
            <pre className="jsonbox">{pretty(detail.after_json)}</pre>
            <p className="muted smalltext">{t('audit.readOnly')}</p>
          </>
        )}
      </Modal>
    </>
  );
}
