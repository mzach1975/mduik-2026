import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Alert,
  Badge,
  Card,
  ErrorState,
  Loading,
  PageHeader,
  Progress,
  Select,
  StatusBadge,
  useToast,
} from '../../components/ui';

export default function InterviewDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, lang, dateTime, date } = useI18n();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi(`/interviews/${id}`);
  const [marks, setMarks] = useState({});
  const [busy, setBusy] = useState(false);
  const [initialised, setInitialised] = useState(false);

  const isAdmin = user?.isSuper || user?.role === 'school_admin';
  const myScore = data?.myScore;
  const scores = data?.scores || [];
  const rubric = data?.rubric;

  useEffect(() => {
    if (data && !initialised) {
      if (data.myScore?.marks) {
        try {
          setMarks(JSON.parse(data.myScore.marks));
        } catch {
          setMarks({});
        }
      }
      setInitialised(true);
    }
  }, [data, initialised]);

  const items = useMemo(() => rubric?.sections?.flatMap((s) => s.items) || [], [rubric]);
  const total = useMemo(() => items.reduce((sum, item) => sum + (Number(marks[item.key]) || 0), 0), [items, marks]);
  const overLimit = items.some((item) => Number(marks[item.key]) > item.max || Number(marks[item.key]) < 0);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { interview } = data;
  const finalMark = data.finalMark;
  const showAllScores = isAdmin || scores.length >= Math.max(1, data.assessors?.length || 0);
  const visibleScores = showAllScores ? scores : scores.filter((s) => s.assessor_id === user?.id);

  function setMark(key, value, max) {
    const num = value === '' ? '' : Math.max(0, Math.min(max, Number(value)));
    setMarks((m) => ({ ...m, [key]: num }));
  }

  function setCheck(key, patch) {
    setMarks((m) => {
      const list = m.checklist && typeof m.checklist === 'object' ? m.checklist : {};
      return { ...m, checklist: { ...list, [key]: { ...(list[key] || {}), ...patch } } };
    });
  }

  async function submit() {
    setBusy(true);
    try {
      const payload = {};
      // Blank items are sent as null so the server can ask for every mark.
      for (const item of items) payload[item.key] = marks[item.key] === '' || marks[item.key] == null ? null : Number(marks[item.key]);
      await api.post(`/interviews/${id}/score`, {
        marks: payload,
        s6_time: marks.s6_time || '',
        checklist: marks.checklist || {},
      });
      push(t('interviews.saved'));
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
          <button type="button" className="backlink" onClick={() => navigate('/app/interviews')}>
            <Icon name="arrowLeft" size={15} /> {t('interviews.title')}
          </button>
        }
        eyebrow={interview.reference}
        title={interview.student_name}
        subtitle={`${dateTime(interview.scheduled_at)} · ${interview.mode === 'in_person' ? t('applications.inPerson') : t('applications.phoneMode')}${interview.location ? ` · ${interview.location}` : ''}`}
        actions={<StatusBadge status={interview.status} />}
      />

      {!showAllScores && !isAdmin && (
        <Alert tone="info">{t('interviews.otherScoresHidden')}</Alert>
      )}
      {myScore && (
        <Alert tone="success" title={t('interviews.submitted')}>
          {t('interviews.saved')} · {dateTime(myScore.submitted_at)} — {Number(myScore.total).toFixed(1)}/100
        </Alert>
      )}
      {data.belowPass && <Alert tone="warning" title={t('interviews.belowPassNotice')} />}

      <div className="scoringgrid">
        <div className="stack">
          {rubric.sections.map((section) => (
            <Card key={section.id} title={section.id + '. ' + (section.bm && section.en ? (lang === 'en' ? section.en : section.bm) : section.bm)} actions={<Badge tone="slate">{section.max} {t('interviews.marks')}</Badge>}>
              <div className="rubricitems">
                {section.items.map((item) => (
                  <div className="rubricitem" key={item.key}>
                    <div className="rubricitem__label">
                      <span>{lang === 'en' ? item.en : item.bm}</span>
                      <small>{t('interviews.max')}: {item.max}</small>
                    </div>
                    <div className="rubricitem__control">
                      <input
                        type="range"
                        min="0"
                        max={item.max}
                        step="0.5"
                        value={Number(marks[item.key]) || 0}
                        onChange={(e) => setMark(item.key, e.target.value, item.max)}
                        aria-label={item.bm}
                      />
                      <input
                        type="number"
                        className="input input--score"
                        min="0"
                        max={item.max}
                        step="0.5"
                        value={marks[item.key] ?? ''}
                        placeholder="0"
                        onChange={(e) => setMark(item.key, e.target.value, item.max)}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {section.id === 6 && (
                <div className="rubricextra">
                  <label className="field">
                    <span className="field__label">{t('interviews.timeRating')}</span>
                    <Select value={marks.s6_time || ''} onChange={(e) => setMarks((m) => ({ ...m, s6_time: e.target.value }))}>
                      <option value="">{t('common.select')}</option>
                      <option value="good">{t('interviews.good')}</option>
                      <option value="fair">{t('interviews.fair')}</option>
                      <option value="weak">{t('interviews.weak')}</option>
                    </Select>
                  </label>
                </div>
              )}
              <div className="rubrictotal">
                <span>{t('interviews.section')}</span>
                <strong>
                  {section.items.reduce((s, i) => s + (Number(marks[i.key]) || 0), 0).toFixed(1)} / {section.max}
                </strong>
              </div>
            </Card>
          ))}

          {rubric.checklist.map((section) => (
            <Card key={section.id} title={`${section.id}. ${lang === 'en' ? section.en : section.bm}`} subtitle={t('interviews.checklistHint')} actions={<Badge tone="slate">{t('interviews.checklist')}</Badge>}>
              <div className="checkitems">
                {(section.items || []).map((item) => {
                  const entry = marks.checklist?.[item.key] || {};
                  return (
                    <div className="checkitem" key={item.key}>
                      <label className="checkline">
                        <input type="checkbox" checked={!!entry.checked} onChange={(e) => setCheck(item.key, { checked: e.target.checked })} />
                        <span>{lang === 'en' ? item.en : item.bm}</span>
                      </label>
                      <textarea
                        className="input checkitem__remark"
                        rows={2}
                        maxLength={500}
                        placeholder={t('interviews.remarkPlaceholder')}
                        aria-label={`${t('interviews.remark')}: ${lang === 'en' ? item.en : item.bm}`}
                        value={entry.remark || ''}
                        onChange={(e) => setCheck(item.key, { remark: e.target.value })}
                      />
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

          <div className="scorebar">
            <div className="scorebar__total">
              <span>{t('interviews.totalMarks')}</span>
              <strong>{total.toFixed(1)} / 100</strong>
            </div>
            <button type="button" className="btn btn--gold btn--lg" onClick={submit} disabled={busy || overLimit}>
              {busy ? <span className="spinner" /> : <Icon name="check" size={16} />} {myScore ? t('interviews.submitScore') : t('interviews.confirmScore')}
            </button>
          </div>
        </div>

        <div className="stack scoringgrid__side">
          <Card className="scorecard">
            <div className="scorecard__inner">
              <div className="scorecard__dial" style={{ '--pct': `${Math.min(100, total)}%` }}>
                <strong>{total.toFixed(1)}</strong>
                <span>/ 100</span>
              </div>
              <div className="scorecard__meta">
                <span>{t('interviews.totalMarks')}</span>
                <Badge tone={overLimit ? 'red' : total >= 40 ? 'green' : 'amber'}>{overLimit ? t('common.error') : total >= 40 ? t('common.approved') : t('interviews.belowPassNotice')}</Badge>
                <small>{t('interviews.passMark')}: {rubric.passMark}/100</small>
              </div>
            </div>
            <Progress value={total} max={100} tone={total >= 40 ? 'teal' : 'amber'} />
            <button type="button" className="btn btn--gold btn--lg btn--block" onClick={submit} disabled={busy || overLimit}>
              {busy ? <span className="spinner" /> : <Icon name="check" size={16} />} {myScore ? t('interviews.submitScore') : t('interviews.confirmScore')}
            </button>
            {overLimit && <p className="field__error">{t('common.error')}: {t('interviews.max')}</p>}
          </Card>

          <Card title={t('interviews.assessor')}>
            <div className="assessorsubmit">
              {(data.assessors || []).map((a) => {
                const submitted = scores.find((s) => s.assessor_id === a.assessor_id);
                return (
                  <div className="assessorsubmit__row" key={a.assessor_id}>
                    <span className="avatar avatar--teal">{a.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                    <div>
                      <strong>{a.full_name}</strong>
                      <small>{a.assessor_id === user?.id ? t('interviews.myScore') : ''}</small>
                    </div>
                    <Badge tone={submitted ? 'green' : 'amber'} dot>{submitted ? t('interviews.submitted') : t('interviews.pending')}</Badge>
                  </div>
                );
              })}
            </div>
          </Card>

          {visibleScores.length > 0 && (
            <Card title={t('applications.interviewScores')}>
              {visibleScores.map((sc) => (
                <div className="scoreline scoreline--lg" key={sc.id}>
                  <span>{sc.assessor_name}</span>
                  <strong>{Number(sc.total).toFixed(1)}</strong>
                </div>
              ))}
            </Card>
          )}

          {finalMark !== null && showAllScores && (
            <Card className="finalmark">
              <span>{t('interviews.finalMark')}</span>
              <strong className={data.belowPass ? 'text-rose' : 'text-green'}>{Number(finalMark).toFixed(1)}<small>/100</small></strong>
              <Badge tone={data.belowPass ? 'red' : 'green'}>{data.belowPass ? t('applications.belowPass') : t('common.approved')}</Badge>
            </Card>
          )}

          <Card title={t('applications.decision')}>
            <button type="button" className="btn btn--outline btn--block btn--sm" onClick={() => navigate(`/app/applications/${interview.application_id}`)}>
              {t('applications.viewApplication')} <Icon name="arrowRight" size={15} />
            </button>
            {interview.status === 'completed' && <p className="muted smalltext">{t('interviews.completed')} · {date(interview.scheduled_at)}</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
