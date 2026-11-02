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
  const klass = params.get('class') || '';
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

  const query = useMemo(() => buildQuery({ q: debounced, status, tracking, class: klass, page, pageSize: 20 }), [debounced, status, tracking, klass, page]);
  const { data, loading, error, reload } = useApi(`/students${query}`);
  const { data: classData } = useApi('/students/classes');
  const classes = classData?.classes || [];
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
          <SearchBox value={search} onChange={setSearch} placeholder={`${t('common.search')} — ${t('students.name')}`} />
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
            <Select value={klass} onChange={(e) => update('class', e.target.value)}>
              <option value="">{t('common.allClasses')}</option>
              {classes.map((c) => (
                <option key={c.class_name} value={c.class_name}>{c.class_name} ({c.n})</option>
              ))}
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
                { key: 'class_name', label: t('common.class'), render: (r) => r.class_name || '—' },
                { key: 'fee_plan_name', label: t('students.feePlan'), render: (r) => r.fee_plan_name || '—' },
                { key: 'monthly_fee_cents', label: t('students.monthlyFee'), align: 'right', render: (r) => money(r.monthly_fee_cents) },
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
  const { data: lookups } = useApi('/lookups', { enabled: open });
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fullName: '', ic: '', dob: '', gender: '', className: '', phone: '', email: '', address: '',
    feePlanId: '', monthlyFeeCents: '', monthlyTracking: false, parentName: '', parentEmail: '', parentPhone: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const plan = lookups?.feePlans?.find((p) => p.id === form.feePlanId);

  async function submit() {
    setBusy(true);
    try {
      const res = await api.post('/students', {
        ...form,
        monthlyFeeCents: form.monthlyFeeCents ? Math.round(Number(form.monthlyFeeCents) * 100) : plan?.monthly_fee_cents,
      });
      onDone(res.id);
    } catch (err) {
      push(err.message, 'danger');
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
          <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || !form.fullName}>
            {busy && <span className="spinner spinner--light" />} {t('students.saveStudent')}
          </button>
        </>
      }
    >
      <h4 className="detaillabel">{t('students.personalInfo')}</h4>
      <div className="formgrid">
        <Field label={t('students.name')} required className="formgrid__full">
          <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        <Field label={t('common.ic')} hint={t('students.icHint')}>
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
        <Field label={t('common.class')}>
          <Input value={form.className} onChange={(e) => set('className', e.target.value)} list="class-options" />
          <datalist id="class-options">
            {(lookups?.classes || []).map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <Field label={t('common.phone')}>
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label={t('common.email')}>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label={t('students.address')} className="formgrid__full">
          <Textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
      </div>

      <h4 className="detaillabel">{t('students.feePlan')}</h4>
      <div className="formgrid">
        <Field label={t('students.choosePlan')}>
          <Select value={form.feePlanId} onChange={(e) => set('feePlanId', e.target.value)}>
            <option value="">{t('common.select')}</option>
            {(lookups?.feePlans || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name} — RM {(p.monthly_fee_cents / 100).toFixed(2)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('students.monthlyFee')}>
          <Input type="number" min="0" step="0.01" value={form.monthlyFeeCents} placeholder={plan ? (plan.monthly_fee_cents / 100).toFixed(2) : ''} onChange={(e) => set('monthlyFeeCents', e.target.value)} />
        </Field>
      </div>
      <Checkbox checked={form.monthlyTracking} onChange={(e) => set('monthlyTracking', e.target.checked)} label={t('students.trackingHint')} />

      <h4 className="detaillabel">{t('students.parentSection')}</h4>
      <div className="formgrid">
        <Field label={t('students.parentName')}>
          <Input value={form.parentName} onChange={(e) => set('parentName', e.target.value)} />
        </Field>
        <Field label={t('students.parentEmail')}>
          <Input type="email" value={form.parentEmail} onChange={(e) => set('parentEmail', e.target.value)} />
        </Field>
        <Field label={t('students.parentPhone')}>
          <Input value={form.parentPhone} onChange={(e) => set('parentPhone', e.target.value)} />
        </Field>
      </div>
      <Alert tone="info">{t('students.trackingHint')}</Alert>
    </Modal>
  );
}
