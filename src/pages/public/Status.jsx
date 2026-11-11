import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { fieldLabel } from '../../fieldLabels';
import Icon from '../../components/Icon';
import { Alert, Badge, Field, Input, StatusBadge } from '../../components/ui';

// Steps shown to the parent. Each status maps to the step it has reached.
const STEPS = ['received', 'review', 'interview', 'decision', 'registered'];
const STAGE = { incomplete: 1, submitted: 1, interview: 2, accepted: 3, waiting_list: 3, not_accepted: 3, registered: 4 };
const TONE = { incomplete: 'warn', not_accepted: 'bad', waiting_list: 'warn' };

export default function Status() {
  const { t, date, dateTime } = useI18n();
  const [params] = useSearchParams();
  const [reference, setReference] = useState(params.get('reference') || '');
  const [contact, setContact] = useState(params.get('contact') || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const resultRef = useRef(null);

  async function check(e) {
    e?.preventDefault();
    const ref = reference.trim();
    const who = contact.trim();
    if (!ref || !who) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api.get(`/public/applications/status?reference=${encodeURIComponent(ref)}&contact=${encodeURIComponent(who)}`);
      setResult(res.application);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      setError(err.status === 404 ? t('status.notFound') : err.message);
    } finally {
      setLoading(false);
    }
  }

  // Coming from the success page: the link carries both values, so check straight away.
  useEffect(() => {
    if (params.get('reference') && params.get('contact')) check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const app = result;
  const stage = app ? STAGE[app.status] ?? 1 : 0;
  const tone = app ? TONE[app.status] : null;

  return (
    <section className="statuspage">
      <div className="statuspage__inner">
        <header className="applyhead">
          <span className="eyebrow eyebrow--muted">{t('landing.checkStatus')}</span>
          <h1>{t('status.title')}</h1>
          <p>{t('status.subtitle')}</p>
        </header>

        <div className="statusgrid">
          <form className="statusform card" onSubmit={check}>
            <div className="card__body">
              <Field label={t('status.reference')} hint={t('status.referenceHint')} required>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="APP-KL/2026/00001" autoComplete="off" />
              </Field>
              <Field label={t('status.contact')} hint={t('status.contactHint')} required>
                <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="nama@email.com / 0123456789" autoComplete="email" />
              </Field>
              {error && <Alert tone="danger">{error}</Alert>}
              <button type="submit" className="btn btn--primary btn--block" disabled={loading || !reference.trim() || !contact.trim()}>
                {loading ? <span className="spinner spinner--light" /> : <Icon name="search" size={16} />} {loading ? t('status.checking') : t('status.check')}
              </button>
              <p className="statusform__help">
                {t('status.noReference')} <Link to="/apply">{t('apply.applyAnother')}</Link>
              </p>
            </div>
          </form>

          <div className="statusresult" ref={resultRef}>
            {!app && (
              <div className="statusempty">
                <span className="statusempty__icon"><Icon name="file" size={28} /></span>
                <h3>{t('status.resultTitle')}</h3>
                <p>{t('status.emptyHint')}</p>
              </div>
            )}
            {app && (
              <div className="card statuscard">
                <div className="statuscard__head">
                  <div>
                    <span className="statuscard__label">{app.schoolName}</span>
                    <h2>{app.studentName}</h2>
                    <span className="statuscard__ref">{app.reference}</span>
                  </div>
                  <StatusBadge status={app.status} />
                </div>

                <ol className="progresssteps" aria-label={t('status.progress')}>
                  {STEPS.map((key, i) => {
                    const done = i < stage || (i === stage && app.status === 'registered');
                    const current = i === stage && !done;
                    const cls = ['progresssteps__step', done && 'is-done', current && 'is-current', current && tone && `is-${tone}`].filter(Boolean).join(' ');
                    return (
                      <li key={key} className={cls} aria-current={current ? 'step' : undefined}>
                        <span className="progresssteps__dot">{done ? <Icon name="check" size={12} /> : i + 1}</span>
                        <span className="progresssteps__label">{t(`status.step_${key}`)}</span>
                      </li>
                    );
                  })}
                </ol>

                <div className={`statusnext ${tone ? `statusnext--${tone}` : ''}`.trim()}>
                  <Icon name={tone === 'bad' ? 'alert' : app.status === 'registered' || app.status === 'accepted' ? 'checkCircle' : 'info'} size={18} />
                  <div>
                    <strong>{t(`status.what_${app.status}`)}</strong>
                    <p>{t(`status.next_${app.status}`)}</p>
                  </div>
                </div>

                {app.offerStatus === 'offered' && (
                  <Alert tone="warning" title={t('status.offer')}>
                    {t('status.offerDeadline')}: <strong>{date(app.offerDeadline)}</strong>. {t('status.contactSchool')}
                  </Alert>
                )}

                {app.interview && (
                  <div className="statusblock statusblock--interview">
                    <h4><Icon name="calendar" size={16} /> {t('status.interviewAt')}</h4>
                    <strong>{dateTime(app.interview.scheduled_at)}</strong>
                    <span>
                      {app.interview.mode === 'in_person' ? t('applications.inPerson') : t('applications.phoneMode')}
                      {app.interview.location ? ` · ${app.interview.location}` : ''}
                    </span>
                  </div>
                )}

                {app.decision && (
                  <div className="statusblock">
                    <h4><Icon name="checkCircle" size={16} /> {t('status.decision')}</h4>
                    <StatusBadge status={app.decision.decision} />
                    {app.decision.reason && <p className="muted">{app.decision.reason}</p>}
                    <span>{date(app.decision.decidedAt)}</span>
                  </div>
                )}

                {app.flags?.missingFields?.length > 0 && (
                  <div className="statusflags">
                    <h4>{t('status.flags')}</h4>
                    <div className="chiprow">
                      {app.flags.missingFields.map((f) => (
                        <Badge key={f} tone="amber">{fieldLabel(t, f)}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <dl className="statusmeta">
                  <div><dt>{t('status.submittedOn')}</dt><dd>{date(app.submittedAt)}</dd></div>
                  <div><dt>{t('status.documents')}</dt><dd>{app.documentsCount || 0}</dd></div>
                  {app.offerStatus && <div><dt>{t('status.offer')}</dt><dd>{t(`applications.${app.offerStatus}`)}</dd></div>}
                </dl>

                <div className="statuscontact">
                  <span>{t('status.contactSchool')}</span>
                  <div className="chiprow">
                    {app.schoolPhone && <a className="btn btn--ghost btn--sm" href={`tel:${app.schoolPhone}`}><Icon name="phone" size={14} /> {app.schoolPhone}</a>}
                    {app.schoolEmail && <a className="btn btn--ghost btn--sm" href={`mailto:${app.schoolEmail}?subject=${encodeURIComponent(app.reference)}`}><Icon name="mail" size={14} /> {app.schoolEmail}</a>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
