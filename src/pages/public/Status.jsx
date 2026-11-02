import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { fieldLabel } from '../../fieldLabels';
import Icon from '../../components/Icon';
import { Alert, Badge, Field, Input, StatusBadge } from '../../components/ui';

export default function Status() {
  const { t, date, dateTime } = useI18n();
  const [params] = useSearchParams();
  const [reference, setReference] = useState(params.get('reference') || '');
  const [contact, setContact] = useState(params.get('contact') || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function check(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api.get(`/public/applications/status?reference=${encodeURIComponent(reference)}&contact=${encodeURIComponent(contact)}`);
      setResult(res.application);
    } catch (err) {
      setError(err.status === 404 ? t('status.notFound') : err.message);
    } finally {
      setLoading(false);
    }
  }

  const app = result;
  const order = ['submitted', 'interview', 'accepted', 'registered'];
  let stage = 0;
  if (app) {
    if (['interview'].includes(app.status)) stage = 1;
    if (['accepted', 'waiting_list', 'not_accepted'].includes(app.status)) stage = 2;
    if (app.status === 'registered') stage = 3;
    if (app.status === 'incomplete') stage = 0;
  }

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
              <Field label={t('status.reference')} required>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="APP-KL/2026/00001" />
              </Field>
              <Field label={t('status.contact')} required>
                <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="nama@email.com" />
              </Field>
              {error && <Alert tone="danger">{error}</Alert>}
              <button type="submit" className="btn btn--primary btn--block" disabled={loading || !reference || !contact}>
                {loading ? <span className="spinner spinner--light" /> : <Icon name="search" size={16} />} {loading ? t('status.checking') : t('status.check')}
              </button>
              <p className="statusform__help">{t('status.contactSchool')}</p>
            </div>
          </form>

          <div className="statusresult">
            {!app && (
              <div className="statusempty">
                <span className="statusempty__icon"><Icon name="file" size={28} /></span>
                <h3>{t('status.resultTitle')}</h3>
                <p>{t('status.notYet')}</p>
              </div>
            )}
            {app && (
              <div className="card statuscard">
                <div className="statuscard__head">
                  <div>
                    <span className="statuscard__label">{t('status.resultTitle')}</span>
                    <h2>{app.studentName}</h2>
                    <span className="statuscard__ref">{app.reference}</span>
                  </div>
                  <StatusBadge status={app.status} />
                </div>

                <div className="timeline">
                  {[t('apply.step1'), t('applications.interviewTab'), t('applications.decision'), t('applications.registered')].map((label, i) => (
                    <div key={label} className={`timeline__step ${i <= stage ? 'is-done' : ''} ${i === stage ? 'is-current' : ''}`.trim()}>
                      <span className="timeline__dot">{i < stage ? <Icon name="check" size={12} /> : i + 1}</span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>

                {app.status === 'incomplete' && <Alert tone="warning">{t('status.incompleteNotice')}</Alert>}

                <dl className="statusmeta">
                  <div><dt>{t('status.school')}</dt><dd>{app.schoolName}</dd></div>
                  <div><dt>{t('status.category')}</dt><dd>{t(app.category === 'tahfiz' ? 'common.tahfiz' : 'common.islamicStudies')}</dd></div>
                  <div><dt>{t('status.submittedOn')}</dt><dd>{date(app.submittedAt)}</dd></div>
                  <div><dt>{t('status.offer')}</dt><dd>{app.offerStatus ? t(`applications.${app.offerStatus}`) : t('common.none')}</dd></div>
                </dl>

                {app.interview && (
                  <div className="statusblock">
                    <h4><Icon name="calendar" size={16} /> {t('status.interviewAt')}</h4>
                    <p>
                      {dateTime(app.interview.scheduled_at)} · {app.interview.mode === 'in_person' ? t('applications.inPerson') : t('applications.phoneMode')}
                      {app.interview.location ? ` · ${app.interview.location}` : ''}
                    </p>
                  </div>
                )}

                {app.decision ? (
                  <div className="statusblock">
                    <h4><Icon name="checkCircle" size={16} /> {t('status.decision')}</h4>
                    <StatusBadge status={app.decision.decision} />
                    <p className="muted">{app.decision.reason}</p>
                    <small>{date(app.decision.decidedAt)}</small>
                  </div>
                ) : (
                  <p className="muted">{t('status.noDecision')}</p>
                )}

                {app.offerStatus === 'offered' && (
                  <Alert tone="warning" title={t('status.offer')}>
                    {t('status.offerDeadline')}: <strong>{date(app.offerDeadline)}</strong>.{' '}
                    {t('status.contactSchool')}
                  </Alert>
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
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
