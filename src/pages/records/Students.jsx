import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi, useDebounced, buildQuery } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Alert,
  Badge,
  Card,
  Checkbox,
  DataTable,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchBox,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '../../components/ui';

export default function Students() {
  const { t, money, number, statusLabel } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const debounced = useDebounced(search);
  const status = params.get('status') || '';
  const tracking = params.get('tracking') || '';
  const page = Number(params.get('page') || 1);
  const [addOpen, setAddOpen] = useState(false);

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

  const query = useMemo(() => buildQuery({ q: debounced, status, tracking, page, pageSize: 20 }), [debounced, status, tracking, page]);
  const { data, loading, error, reload } = useApi(`/students${query}`);
  const isAdmin = user?.isSuper || user?.role === 'school_admin';

  function update(key, value) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.set('page', '1');
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title={t('students.title')}
        subtitle={t('students.subtitle')}
        actions={
          isAdmin && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={16} /> {t('students.addStudent')}
            </button>
          )
        }
      />

      <Card padded={false}>
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder={t('students.searchPlaceholder')} />
          <div className="toolbar__filters">
            <Select value={status} onChange={(e) => update('status', e.target.value)}>
              <option value="">{t('common.all')} · {t('common.status')}</option>
              <option value="active">{t('common.active')}</option>
              <option value="withdrawn">{t('students.withdrawn')}</option>
              <option value="graduated">{t('students.graduated')}</option>
            </Select>
            <Select value={tracking} onChange={(e) => update('tracking', e.target.value)}>
              <option value="">{t('common.all')} · {t('students.tracking')}</option>
              <option value="on">{t('students.trackingOn')}</option>
              <option value="off">{t('students.trackingOff')}</option>
            </Select>
          </div>
        </div>

        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <>
            <DataTable
              rows={data?.students || []}
              loading={loading}
              onRowClick={(row) => navigate(`/app/students/${row.id}`)}
              columns={[
                {
                  key: 'full_name',
                  label: t('students.name'),
                  render: (r) => (
                    <span className="stack-cell">
                      <strong>{r.full_name}</strong>
                      <small>{r.ic_masked || '—'}</small>
                    </span>
                  ),
                },
                {
                  key: 'monthly_fee_cents',
                  label: t('students.monthlyFee'),
                  align: 'right',
                  render: (r) => (
                    <span className="stack-cell">
                      <span>{money(r.monthly_fee_cents)}</span>
                      {r.has_adjusted_rate ? <small>{t('students.adjustedRate')}</small> : null}
                    </span>
                  ),
                },
                {
                  key: 'monthly_tracking',
                  label: t('students.tracking'),
                  render: (r) => <Badge tone={r.monthly_tracking ? 'green' : 'slate'} dot>{r.monthly_tracking ? t('students.trackingOn') : t('students.trackingOff')}</Badge>,
                },
                {
                  key: 'outstanding',
                  label: t('common.outstanding'),
                  align: 'right',
                  render: (r) => <span className={r.outstanding > 0 ? 'text-rose cell-strong' : 'cell-strong'}>{money(r.outstanding)}</span>,
                },
                { key: 'credit', label: t('common.credit'), align: 'right', render: (r) => (r.credit > 0 ? money(r.credit) : '—') },
                { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
                { key: 'go', label: '', align: 'right', render: () => <span className="rowaction"><Icon name="chevronRight" size={17} /></span> },
              ]}
            />
            <Pagination page={data?.page || 1} pageCount={data?.pages || 1} total={data?.total || 0} pageSize={data?.pageSize || 20} onPage={(p) => update('page', String(p))} />
          </>
        )}
      </Card>

      <AddStudentModal open={addOpen} onClose={() => setAddOpen(false)} onDone={(studentId) => { push(t('students.created')); setAddOpen(false); navigate(`/app/students/${studentId}`); }} />
    </>
  );
}

function AddStudentModal({ open, onClose, onDone }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const empty = { fullName: '', ic: '', dob: '', gender: '', address: '', monthlyTracking: false };
  const [form, setForm] = useState(empty);
  const [icMatches, setIcMatches] = useState(null);
  const set = (k, v) => {
    if (k === 'ic') setIcMatches(null);
    setForm((f) => ({ ...f, [k]: v }));
  };

  useEffect(() => {
    if (open) {
      setForm(empty);
      setIcMatches(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setBusy(true);
    try {
      const res = await api.post('/students', { ...form, allowDuplicateIc: !!icMatches });
      onDone(res.id);
    } catch (err) {
      if (err.data?.code === 'student_ic_exists') setIcMatches(err.data.matches || []);
      else push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('students.addTitle')}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || !form.fullName.trim() || !form.ic.trim()}>
            {busy && <span className="spinner spinner--light" />} {icMatches ? t('students.saveAnyway') : t('students.saveStudent')}
          </button>
        </>
      }
    >
      <h4 className="detaillabel">{t('students.personalInfo')}</h4>
      <div className="formgrid">
        <Field label={t('students.name')} required className="formgrid__full">
          <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        <Field label={t('common.ic')} required hint={t('students.icHint')}>
          <Input value={form.ic} onChange={(e) => set('ic', e.target.value)} />
        </Field>
        <Field label={t('students.dob')}>
          <Input type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
        </Field>
        <Field label={t('students.gender')}>
          <Select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">{t('common.select')}</option>
            <option value="male">{t('apply.male')}</option>
            <option value="female">{t('apply.female')}</option>
          </Select>
        </Field>
        <Field label={t('students.address')} className="formgrid__full">
          <Textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
      </div>
      <Checkbox checked={form.monthlyTracking} onChange={(e) => set('monthlyTracking', e.target.checked)} label={t('students.trackingHint')} />
      <Alert tone="info">{t('students.feeFromSchool')}</Alert>
      <Alert tone="info">{t('students.parentsLinkedLater')}</Alert>
      {icMatches && (
        <Alert tone="warning">
          {t('students.icExists')}
          <ul>
            {icMatches.map((m) => <li key={m.id}>{m.full_name} — {m.school_name}</li>)}
          </ul>
        </Alert>
      )}
    </Modal>
  );
}
