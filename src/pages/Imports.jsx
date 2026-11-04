import { useState } from 'react';
import { api, downloadFile } from '../api';
import { useI18n } from '../i18n';
import { useApi } from '../hooks';
import Icon from '../components/Icon';
import {
  Alert,
  Badge,
  Card,
  DataTable,
  ErrorState,
  Field,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '../components/ui';

const TYPES = [
  { id: 'students', label: 'imports.students' },
  { id: 'parents', label: 'imports.parents' },
  { id: 'teachers', label: 'imports.teachers' },
  { id: 'opening-balances', label: 'imports.openingBalances' },
];

export default function Imports() {
  const { t, date } = useI18n();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi('/imports');
  const [type, setType] = useState('students');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [dupAction, setDupAction] = useState('');
  const [dupReason, setDupReason] = useState('');
  const dupRows = report?.report?.duplicates || 0;
  const dupReady = !dupRows || dupAction === 'link' || (dupAction === 'create' && dupReason.trim().length >= 5);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('file', file);
      const res = await api.upload('/imports', fd);
      setReport(res);
      setDupAction('');
      setDupReason('');
      push(t('imports.dryRunDone'));
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setConfirming(true);
    try {
      const res = await api.post(
        `/imports/${report.batch.id}/confirm`,
        dupRows ? { duplicateAction: dupAction, duplicateReason: dupAction === 'create' ? dupReason : undefined } : {},
      );
      push(`${t('imports.imported')}: ${res.imported}${res.parentSkipped ? ` · ${t('parentRecord.importSkipped', { n: res.parentSkipped })}` : ''}`);
      setReport(null);
      setFile(null);
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <>
      <PageHeader title={t('imports.title')} subtitle={t('imports.subtitle')} />

      <div className="detailgrid">
        <Card title={t('imports.dryRunTitle')} subtitle={t('imports.fileHint')}>
          <Field label={t('imports.type')} required>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((x) => <option key={x.id} value={x.id}>{t(x.label)}</option>)}
            </Select>
          </Field>
          <Field label={t('imports.chooseFile')} required>
            <span className="filefield">
              <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <span className="btn btn--ghost btn--sm"><Icon name="upload" size={16} /> {t('common.upload')}</span>
              <span className="filefield__name">{file?.name || t('common.none')}</span>
            </span>
          </Field>
          <div className="buttonrow">
            <button type="button" className="btn btn--primary" onClick={upload} disabled={busy || !file}>
              {busy && <span className="spinner spinner--light" />} {t('imports.dryRun')}
            </button>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => downloadFile(`/imports/templates/${type}`)}>
              <Icon name="download" size={15} /> {t('imports.downloadTemplate')}
            </button>
          </div>
          <Alert tone="info">{t('imports.confirmWarning')}</Alert>
        </Card>

        <Card title={t('imports.template')}>
          <p className="muted">{t('imports.fileHint')}</p>
          <div className="templatelist">
            {TYPES.map((x) => (
              <button key={x.id} type="button" className="templatelist__item" onClick={() => downloadFile(`/imports/templates/${x.id}`)}>
                <Icon name="file" size={17} />
                <span>{t(x.label)}</span>
                <Icon name="download" size={15} />
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card title={t('imports.importHistory')} padded={false}>
        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <DataTable
            rows={data?.batches || []}
            loading={loading}
            empty={t('imports.noBatches')}
            columns={[
              { key: 'created_at', label: t('common.date'), render: (r) => date(r.created_at) },
              { key: 'type', label: t('imports.type'), render: (r) => <Badge tone="teal">{t(`imports.${r.type === 'opening-balances' ? 'openingBalances' : r.type}`)}</Badge> },
              { key: 'filename', label: t('imports.chooseFile') },
              { key: 'total_rows', label: t('imports.totalRows'), align: 'right' },
              { key: 'ok_rows', label: t('imports.validRows'), align: 'right', render: (r) => <span className="text-green">{r.ok_rows}</span> },
              { key: 'error_rows', label: t('imports.failedRows'), align: 'right', render: (r) => <span className={r.error_rows ? 'text-rose' : ''}>{r.error_rows}</span> },
              { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        )}
      </Card>

      <Modal
        open={!!report}
        onClose={() => setReport(null)}
        title={t('imports.validationReport')}
        subtitle={report ? `${report.batch?.filename} · ${report.batch?.total || 0} ${t('imports.totalRows').toLowerCase()}` : ''}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setReport(null)}>{t('common.close')}</button>
            <button type="button" className="btn btn--primary" disabled={confirming || !report?.report?.ok || !dupReady} onClick={confirm}>
              {confirming && <span className="spinner spinner--light" />} {t('imports.confirmImport')}
            </button>
          </>
        }
      >
        {report && (
          <>
            <div className="statgrid statgrid--3">
              <div className="miniStat"><span>{t('imports.totalRows')}</span><strong>{report.report.total}</strong></div>
              <div className="miniStat"><span>{t('imports.validRows')}</span><strong className="text-green">{report.report.ok}</strong></div>
              <div className="miniStat"><span>{t('imports.failedRows')}</span><strong className="text-rose">{report.report.failed}</strong></div>
            </div>
            <Alert tone={report.report.failed ? 'warning' : 'success'}>{t('imports.confirmWarning')}</Alert>
            {dupRows > 0 && (
              <div className="insetform">
                <Alert tone="warning" title={t('parentRecord.dupTitle')}>{t('parentRecord.importDupHint', { n: dupRows })}</Alert>
                <div className="formgrid">
                  <Field label={t('parentRecord.importChoice')} required>
                    <Select value={dupAction} onChange={(e) => setDupAction(e.target.value)}>
                      <option value="">{t('common.select')}</option>
                      <option value="link">{t('parentRecord.linkExisting')}</option>
                      <option value="create">{t('parentRecord.createAnyway')}</option>
                    </Select>
                  </Field>
                  {dupAction === 'create' && (
                    <Field label={t('parentRecord.reason')} hint={t('parentRecord.reasonHint')} required>
                      <Textarea rows={2} value={dupReason} onChange={(e) => setDupReason(e.target.value)} />
                    </Field>
                  )}
                </div>
              </div>
            )}
            <DataTable
              dense
              rows={report.report.rows || []}
              rowKey={(r) => r.row}
              columns={[
                { key: 'row', label: t('imports.row'), align: 'right' },
                {
                  key: 'errors',
                  label: t('imports.errors'),
                  render: (r) => {
                    if (r.errors.length) return <span className="text-rose">{r.errors.join('; ')}</span>;
                    if (r.duplicates?.length) return <Badge tone="amber">{t('parentRecord.dupBadge', { name: r.duplicates[0].full_name })}</Badge>;
                    if (r.parentMatch) return <Badge tone="teal">{t('parentRecord.icMatchBadge', { name: r.parentMatch.full_name })}</Badge>;
                    return <Badge tone="green">{t('imports.validRows')}</Badge>;
                  },
                },
                {
                  key: 'data',
                  label: t('common.contents'),
                  render: (r) => (
                    <span className="mono smalltext">
                      {Object.entries(r.data).filter(([k, v]) => v && !k.endsWith('_enc')).slice(0, 4).map(([, v]) => v).join(' · ')}
                    </span>
                  ),
                },
              ]}
            />
          </>
        )}
      </Modal>
    </>
  );
}
