import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, openFile } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import { fieldLabel } from '../../fieldLabels';
import Icon from '../../components/Icon';
import {
  Alert,
  Badge,
  Card,
  ConfirmDialog,
  ErrorState,
  Field,
  Input,
  KeyValue,
  Loading,
  Modal,
  PageHeader,
  Progress,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '../../components/ui';

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function localInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, date, dateTime, money, number, statusLabel } = useI18n();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi(`/applications/${id}`);
  const { data: lookups } = useApi('/lookups');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);

  const isAdmin = user?.isSuper || user?.role === 'school_admin';
  const app = data?.application;
  const flags = useMemo(() => parseJson(app?.flags, null), [app?.flags]);
  const documents = useMemo(() => parseJson(app?.documents, []), [app?.documents]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!app) return null;

  const interviews = data.interviews || [];
  const finalMark = data.finalMark;
  const decision = data.decision;

  async function act(fn, message) {
    setBusy(true);
    try {
      await fn();
      push(message);
      setModal(null);
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        back={
          <button type="button" className="backlink" onClick={() => navigate('/app/applications')}>
            <Icon name="arrowLeft" size={15} /> {t('applications.title')}
          </button>
        }
        eyebrow={app.reference}
        title={app.student_name}
        subtitle={`${t(app.category === 'tahfiz' ? 'common.tahfiz' : 'common.islamicStudies')} · ${t('status.submittedOn')} ${date(app.submitted_at)}`}
        actions={
          <>
            <StatusBadge status={app.status} />
            {isAdmin && (
              <>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModal('schedule')}>
                  <Icon name="calendar" size={16} /> {t('applications.scheduleInterview')}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModal('decision')}>
                  <Icon name="checkCircle" size={16} /> {t('applications.recordDecision')}
                </button>
                {app.status === 'accepted' && (
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => setModal('register')}>
                    <Icon name="student" size={16} /> {t('applications.registerStudent')}
                  </button>
                )}
              </>
            )}
          </>
        }
      />

      {app.status === 'registered' && (
        <Alert tone="success" title={t('applications.registered')}>
          {t('applications.alreadyRegistered')}{' '}
          <Link to={`/app/students`}>{t('students.title')}</Link>
        </Alert>
      )}
      {data.belowPass && <Alert tone="warning" title={t('applications.belowPass')}>{t('applications.belowPassNotice')}</Alert>}

      <div className="detailgrid">
        <div className="stack">
          <Card title={t('applications.studentDetails')}>
            <KeyValue
              items={[
                { label: t('common.name'), value: app.student_name },
                { label: t('common.ic'), value: app.ic_masked || '—' },
                { label: t('students.dob'), value: app.dob ? date(app.dob) : '—' },
                { label: t('students.gender'), value: app.gender ? t(app.gender === 'male' ? 'apply.male' : 'apply.female') : '—' },
                { label: t('common.phone'), value: app.phone || '—' },
                { label: t('common.email'), value: app.email || '—' },
                { label: t('apply.classApplied'), value: app.class_name || '—' },
                { label: t('common.state'), value: app.state || '—' },
              ]}
            />
            {app.address && <p className="detailaddress"><Icon name="mapPin" size={15} /> {app.address}</p>}
          </Card>

          <Card title={t('applications.parentInfo')}>
            <KeyValue
              items={[
                { label: t('common.name'), value: app.parent_name || '—' },
                { label: t('common.email'), value: app.parent_email || '—' },
                { label: t('common.phone'), value: app.parent_phone || '—' },
                { label: t('common.language'), value: app.language === 'en' ? 'English' : 'Bahasa Melayu' },
              ]}
            />
          </Card>

          <Card title={t('apply.educationSection')}>
            <h4 className="detaillabel">{t('apply.educationHistory')}</h4>
            <p className="detailtext">{app.education || '—'}</p>
            <h4 className="detaillabel">{t('apply.reason')}</h4>
            <p className="detailtext">{app.reason || '—'}</p>
          </Card>

          <Card title={t('applications.screening')}>
            {!flags ? (
              <p className="muted">{t('common.noData')}</p>
            ) : (
              <div className="checklist-grid">
                <div className={flags.consent ? 'checkline is-ok' : 'checkline is-bad'}>
                  <Icon name={flags.consent ? 'checkCircle' : 'alert'} size={17} /> {t('apply.consentSection')}
                </div>
                <div className={flags.emailValid ? 'checkline is-ok' : 'checkline is-bad'}>
                  <Icon name={flags.emailValid ? 'checkCircle' : 'alert'} size={17} /> {t('common.email')}
                </div>
                <div className={flags.ageEligible ? 'checkline is-ok' : 'checkline is-bad'}>
                  <Icon name={flags.ageEligible ? 'checkCircle' : 'alert'} size={17} /> {t('apply.ageError')} ({flags.age ?? '—'})
                </div>
                <div className={flags.documentsUploaded ? 'checkline is-ok' : 'checkline is-warn'}>
                  <Icon name={flags.documentsUploaded ? 'checkCircle' : 'info'} size={17} /> {t('apply.documentsSection')}
                </div>
                {flags.missingFields?.length > 0 && (
                  <div className="checkline is-bad checkline--full">
                    <Icon name="alert" size={17} /> {t('status.flags')}: {flags.missingFields.map((f) => fieldLabel(t, f)).join(', ')}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title={t('apply.documentsSection')} subtitle={t('apply.optionalDocs')}>
            {!documents.length ? (
              <p className="muted">{t('applications.noDocuments')}</p>
            ) : (
              <div className="doclist">
                {documents.map((docId, i) => (
                  <button type="button" key={docId} className="doclist__item" onClick={() => openFile(`/documents/${docId}`)}>
                    <Icon name="file" size={17} />
                    <span>{t('common.contents')} {i + 1}</span>
                    <Icon name="download" size={15} />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card className="scorecard">
            <div className="scorecard__inner">
              <div className="scorecard__dial" style={{ '--pct': `${Math.min(100, finalMark || 0)}%` }}>
                <strong>{finalMark === null || finalMark === undefined ? '—' : Number(finalMark).toFixed(1)}</strong>
                <span>/ 100</span>
              </div>
              <div className="scorecard__meta">
                <span>{t('applications.finalMark')}</span>
                <Badge tone={data.belowPass ? 'red' : finalMark === null ? 'slate' : 'green'}>
                  {finalMark === null ? t('common.pending') : data.belowPass ? t('applications.belowPass') : t('common.approved')}
                </Badge>
                <small>{t('applications.passMark')}: {data.passMark}/100</small>
              </div>
            </div>
            {finalMark !== null && <Progress value={finalMark} max={100} tone={data.belowPass ? 'rose' : 'teal'} />}
          </Card>

          <Card title={t('applications.interviewScores')} subtitle={`${interviews.length} ${t('nav.interviews').toLowerCase()}`}>
            {!interviews.length ? (
              <p className="muted">{t('applications.noInterview')}</p>
            ) : (
              <div className="interviewcards">
                {interviews.map((iv) => (
                  <div className="interviewcard" key={iv.id}>
                    <div className="interviewcard__head">
                      <span><Icon name="calendar" size={15} /> {dateTime(iv.scheduled_at)}</span>
                      <StatusBadge status={iv.status} />
                    </div>
                    <div className="interviewcard__meta">
                      <span><Icon name="mapPin" size={14} /> {iv.location || t('applications.inPerson')}</span>
                      <span><Icon name="users" size={14} /> {iv.assessors?.length || 0} {t('interviews.assessor')}</span>
                    </div>
                    <div className="interviewcard__scores">
                      {(iv.scores || []).map((sc) => (
                        <div key={sc.id} className="scoreline">
                          <span>{sc.assessor_name}</span>
                          <strong>{Number(sc.total).toFixed(1)}</strong>
                        </div>
                      ))}
                      {!(iv.scores || []).length && <small className="muted">{t('interviews.pending')}</small>}
                    </div>
                    {iv.assessors?.length > 0 && (
                      <div className="interviewcard__assessors">
                        {iv.assessors.map((a) => (
                          <Badge key={a.assessor_id} tone="blue">{a.full_name}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="interviewcard__foot">
                      <span className="muted">{iv.mode === 'in_person' ? t('applications.inPerson') : t('applications.phoneMode')}</span>
                      <button type="button" className="cardlink" onClick={() => navigate(`/app/interviews/${iv.id}`)}>
                        {t('interviews.enterMarks')} <Icon name="arrowRight" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title={t('applications.decision')}>
            {decision ? (
              <>
                <div className="decisionbox">
                  <StatusBadge status={decision.decision} />
                  <p>{decision.reason}</p>
                  <small>{dateTime(decision.decided_at)}</small>
                </div>
                {isAdmin && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModal('decision')}>
                    {t('common.edit')}
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="muted">{t('status.noDecision')}</p>
                {isAdmin && (
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => setModal('decision')}>
                    {t('applications.recordDecision')}
                  </button>
                )}
              </>
            )}
          </Card>

          <Card title={t('applications.offerTitle')}>
            <div className="offerbox">
              <div>
                <span className="muted">{t('applications.offerStatus')}</span>
                <div>{app.offer_status ? <StatusBadge status={app.offer_status} /> : <span className="muted">{t('applications.noOffer')}</span>}</div>
              </div>
              {app.offer_deadline && (
                <div>
                  <span className="muted">{t('applications.offerDeadline')}</span>
                  <strong>{date(app.offer_deadline)}</strong>
                </div>
              )}
            </div>
            {isAdmin && app.status === 'waiting_list' && (!app.offer_status || app.offer_status === 'declined' || app.offer_status === 'lapsed') && (
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setModal('offer')}>
                <Icon name="send" size={15} /> {t('applications.makeOffer')}
              </button>
            )}
            {isAdmin && app.offer_status === 'offered' && (
              <div className="buttonrow">
                <button type="button" className="btn btn--primary btn--sm" onClick={() => setModal('acceptOffer')}>{t('portal.acceptOffer')}</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModal('declineOffer')}>{t('portal.declineOffer')}</button>
              </div>
            )}
          </Card>

          {app.status === 'waiting_list' && (
            <Alert tone="info">{t('applications.offerTitle')}: {t('applications.offerHint')}</Alert>
          )}
        </div>
      </div>

      <ScheduleModal
        open={modal === 'schedule'}
        onClose={() => setModal(null)}
        busy={busy}
        teachers={lookups?.teachers || []}
        onSubmit={(payload) => act(() => api.post(`/applications/${app.id}/schedule`, payload), t('applications.scheduleTitle'))}
      />
      <DecisionModal
        open={modal === 'decision'}
        onClose={() => setModal(null)}
        busy={busy}
        current={decision?.decision}
        onSubmit={(payload) => act(() => api.post(`/applications/${app.id}/decision`, payload), t('applications.decisionRecorded'))}
      />
      <RegisterModal
        open={modal === 'register'}
        onClose={() => setModal(null)}
        busy={busy}
        app={app}
        onSubmit={(payload) => act(() => api.post(`/applications/${app.id}/register`, payload), t('applications.registered'))}
      />
      <ConfirmDialog
        open={modal === 'offer'}
        onClose={() => setModal(null)}
        busy={busy}
        danger={false}
        title={t('applications.makeOffer')}
        message={`${t('applications.offerHint')} (${t('applications.offerDeadline')}: 7 ${t('common.days')}).`}
        confirmLabel={t('applications.makeOffer')}
        onConfirm={() => act(() => api.post(`/applications/${app.id}/offer`, {}), t('applications.offerRecorded'))}
      />
      <ConfirmDialog
        open={modal === 'acceptOffer'}
        onClose={() => setModal(null)}
        busy={busy}
        danger={false}
        title={t('portal.acceptOffer')}
        message={t('portal.offer')}
        confirmLabel={t('portal.acceptOffer')}
        onConfirm={() => act(() => api.post(`/applications/${app.id}/offer-response`, { response: 'accepted' }), t('common.success'))}
      />
      <ConfirmDialog
        open={modal === 'declineOffer'}
        onClose={() => setModal(null)}
        busy={busy}
        title={t('portal.declineOffer')}
        message={t('portal.offer')}
        confirmLabel={t('portal.declineOffer')}
        onConfirm={() => act(() => api.post(`/applications/${app.id}/offer-response`, { response: 'declined' }), t('common.success'))}
      />
    </>
  );
}

function ScheduleModal({ open, onClose, onSubmit, busy, teachers }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ scheduledAt: '', mode: 'in_person', location: '', assessorIds: [] });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function toggle(id) {
    setForm((f) => {
      const has = f.assessorIds.includes(id);
      if (has) return { ...f, assessorIds: f.assessorIds.filter((x) => x !== id) };
      if (f.assessorIds.length >= 2) return f;
      return { ...f, assessorIds: [...f.assessorIds, id] };
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('applications.scheduleTitle')}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !form.scheduledAt}
            onClick={() => onSubmit({ ...form, scheduledAt: new Date(form.scheduledAt).toISOString() })}
          >
            {busy && <span className="spinner spinner--light" />} {t('common.save')}
          </button>
        </>
      }
    >
      <Field label={t('applications.interviewDate')} required>
        <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} />
      </Field>
      <div className="formgrid">
        <Field label={t('applications.mode')}>
          <Select value={form.mode} onChange={(e) => set('mode', e.target.value)}>
            <option value="in_person">{t('applications.inPerson')}</option>
            <option value="phone">{t('applications.phoneMode')}</option>
          </Select>
        </Field>
        <Field label={t('applications.location')}>
          <Input value={form.location} onChange={(e) => set('location', e.target.value)} />
        </Field>
      </div>
      <Field label={t('applications.assessors')} hint={t('interviews.bothRequired')}>
        <div className="assessorlist">
          {!teachers.length && <p className="muted">{t('common.noData')}</p>}
          {teachers.map((teacher) => (
            <label key={teacher.id} className={`assessor ${form.assessorIds.includes(teacher.user_id) ? 'is-selected' : ''}`.trim()}>
              <input type="checkbox" checked={form.assessorIds.includes(teacher.user_id)} onChange={() => toggle(teacher.user_id)} />
              <span>{teacher.full_name}</span>
              {form.assessorIds.includes(teacher.user_id) && <Icon name="check" size={14} />}
            </label>
          ))}
        </div>
      </Field>
    </Modal>
  );
}

function DecisionModal({ open, onClose, onSubmit, busy, current }) {
  const { t } = useI18n();
  const [decision, setDecision] = useState(current || 'accepted');
  const [reason, setReason] = useState('');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('applications.recordDecision')}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn btn--primary" disabled={busy || reason.trim().length < 3} onClick={() => onSubmit({ decision, reason })}>
            {busy && <span className="spinner spinner--light" />} {t('applications.sendDecision')}
          </button>
        </>
      }
    >
      <Field label={t('applications.decision')} required>
        <Select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="accepted">{t('common.accepted')}</option>
          <option value="waiting_list">{t('common.waitingList')}</option>
          <option value="not_accepted">{t('common.notAccepted')}</option>
        </Select>
      </Field>
      <Field label={t('applications.reason')} required hint={t('applications.decisionPlaceholder')}>
        <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Alert tone="info">{t('status.incompleteNotice')}</Alert>
    </Modal>
  );
}

function RegisterModal({ open, onClose, onSubmit, busy, app }) {
  const { t } = useI18n();
  const { data: settings } = useApi('/school-settings', { enabled: open });
  const [form, setForm] = useState({
    fullName: app.student_name || '',
    className: app.class_name || '',
    monthlyFee: '',
    parentName: app.parent_name || '',
    parentEmail: app.parent_email || '',
    parentPhone: app.parent_phone || '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const plan = settings?.feePlans?.find((p) => p.active);
  const monthlyFee = form.monthlyFee || (plan ? (plan.monthly_fee_cents / 100).toFixed(2) : '');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('applications.registerTitle')}
      subtitle={t('applications.registerHint')}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => {
              const { monthlyFee: _ignored, ...rest } = form;
              onSubmit({ ...rest, monthlyFeeCents: monthlyFee ? Math.round(Number(monthlyFee) * 100) : undefined });
            }}
          >
            {busy && <span className="spinner spinner--light" />} {t('applications.registerStudent')}
          </button>
        </>
      }
    >
      <div className="formgrid">
        <Field label={t('applications.studentDetails')} className="formgrid__full">
          <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        <Field label={t('applications.classOnRegistration')}>
          <Input value={form.className} onChange={(e) => set('className', e.target.value)} />
        </Field>
        <Field label={t('applications.monthlyFeeOnRegistration')} hint={`RM`}>
          <Input type="number" min="0" step="0.01" value={form.monthlyFee} placeholder={plan ? (plan.monthly_fee_cents / 100).toFixed(2) : ''} onChange={(e) => set('monthlyFee', e.target.value)} />
        </Field>
      </div>
      <h4 className="detaillabel">{t('applications.parentInfo')}</h4>
      <div className="formgrid">
        <Field label={t('common.name')}>
          <Input value={form.parentName} onChange={(e) => set('parentName', e.target.value)} />
        </Field>
        <Field label={t('common.email')}>
          <Input type="email" value={form.parentEmail} onChange={(e) => set('parentEmail', e.target.value)} />
        </Field>
        <Field label={t('common.phone')}>
          <Input value={form.parentPhone} onChange={(e) => set('parentPhone', e.target.value)} />
        </Field>
      </div>
      <Alert tone="warning">{t('applications.arrearsWarning')}</Alert>
    </Modal>
  );
}
