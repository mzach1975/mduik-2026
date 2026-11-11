import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import { Alert, Checkbox, Field, Input, Select, Textarea } from '../../components/ui';

// Applicants must be at least 7 years old; there is no maximum age.
const MIN_AGE = 7;

function ageOn(dob) {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return -1;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

const EMPTY = {
  schoolId: '',
  studentName: '',
  ic: '',
  dob: '',
  gender: '',
  address: '',
  parentName: '',
  parentEmail: '',
  parentPhone: '',
  education: '',
  reason: '',
  consent: false,
  language: 'bm',
};

export default function Apply() {
  const { t, lang } = useI18n();
  const [params] = useSearchParams();
  const { data: schoolData } = useApi('/public/schools');
  const schools = schoolData?.schools || [];

  const [form, setForm] = useState(() => ({ ...EMPTY, language: lang, schoolId: params.get('school') || '' }));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setForm((f) => ({ ...f, language: lang }));
  }, [lang]);

  const selectedSchool = useMemo(() => schools.find((s) => s.id === form.schoolId), [schools, form.schoolId]);

  function set(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  }

  function validate(which) {
    const next = {};
    const emailOk = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    if (which === 0) {
      if (!form.schoolId) next.schoolId = t('common.requiredField');
      if (!form.studentName.trim()) next.studentName = t('common.requiredField');
      if (!form.dob) next.dob = t('common.requiredField');
      if (!form.gender) next.gender = t('common.requiredField');
      if (form.dob) {
        if (ageOn(form.dob) < MIN_AGE) next.dob = t('apply.ageError');
      }
      const ic = form.ic.toUpperCase().replace(/[\s-]+/g, '');
      if (!ic) next.ic = t('common.requiredField');
      else if (!/^[A-Z0-9]{5,20}$/.test(ic)) next.ic = t('apply.icError');
    }
    if (which === 1) {
      if (!form.parentName.trim()) next.parentName = t('common.requiredField');
      if (!form.parentEmail.trim()) next.parentEmail = t('common.requiredField');
      else if (!emailOk(form.parentEmail)) next.parentEmail = t('apply.emailError');
      if (!form.parentPhone.trim()) next.parentPhone = t('common.requiredField');
    }
    if (which === 2) {
      if (!form.education.trim()) next.education = t('common.requiredField');
      if (!form.reason.trim()) next.reason = t('common.requiredField');
      if (!documents.length) next.documents = t('apply.documentsRequired');
      if (!form.consent) next.consent = t('common.requiredField');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function nextStep() {
    if (validate(step)) setStep((s) => Math.min(2, s + 1));
    else window.scrollTo({ top: 120, behavior: 'smooth' });
  }

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploadError('');
    setUploading(true);
    try {
      for (const file of files) {
        if (file.size > 4 * 1024 * 1024) {
          setUploadError(t('apply.fileTooLarge'));
          continue;
        }
        if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          setUploadError(t('apply.fileType'));
          continue;
        }
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.upload('/public/documents', fd);
        setDocuments((prev) => [...prev, { id: res.id, name: res.filename, size: res.size }]);
        setErrors((e) => ({ ...e, documents: undefined }));
      }
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate(2)) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await api.post('/public/applications', {
        ...form,
        consent: form.consent ? 1 : 0,
        documents: documents.map((d) => d.id),
      });
      setResult(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyRef() {
    try {
      await navigator.clipboard.writeText(result.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (result) {
    return (
      <section className="applypage">
        <div className="applypage__inner applypage__inner--narrow">
          <div className="successcard">
            <span className="successcard__icon"><Icon name="checkCircle" size={34} /></span>
            <h1>{t('apply.successTitle')}</h1>
            <p>{t('apply.successText')}</p>
            <div className="successcard__ref">
              <span>{t('apply.reference')}</span>
              <strong>{result.reference}</strong>
              <button type="button" className="btn btn--ghost btn--sm" onClick={copyRef}>
                <Icon name={copied ? 'check' : 'file'} size={15} /> {copied ? t('common.copied') : t('common.copy')}
              </button>
            </div>
            <p className="muted">{t('apply.keepReference')}</p>
            {result.status === 'incomplete' && <Alert tone="warning">{t('status.incompleteNotice')}</Alert>}
            <div className="successcard__actions">
              <Link to={`/status?reference=${encodeURIComponent(result.reference)}&contact=${encodeURIComponent(form.parentEmail || form.parentPhone)}`} className="btn btn--primary">
                {t('apply.statusLink')} <Icon name="arrowRight" size={16} />
              </Link>
              <Link to="/" className="btn btn--ghost">
                {t('apply.backToHome')}
              </Link>
            </div>
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                setResult(null);
                setForm({ ...EMPTY, language: lang });
                setDocuments([]);
                setStep(0);
              }}
            >
              {t('apply.applyAnother')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="applypage">
      <div className="applypage__inner">
        <header className="applyhead">
          <span className="eyebrow eyebrow--muted">{t('landing.applyNow')}</span>
          <h1>{t('apply.title')}</h1>
          <p>{t('apply.subtitle')}</p>
        </header>

        <div className="wizard wizard__side">
          <aside className="wizard__aside">
            <ol className="wizardsteps">
              {[t('apply.step1'), t('apply.step2'), t('apply.step3')].map((label, i) => (
                <li key={label} className={`${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}`.trim()}>
                  <span className="wizardsteps__num">{i < step ? <Icon name="check" size={13} /> : i + 1}</span>
                  <span>{label}</span>
                </li>
              ))}
            </ol>
            {selectedSchool && (
              <div className="wizard__school">
                <span className="wizard__schoollogo"><Icon name="school" size={18} /></span>
                <div>
                  <strong>{selectedSchool.name}</strong>
                  {selectedSchool.state && <small>{selectedSchool.state}</small>}
                </div>
              </div>
            )}
            <div className="wizard__help">
              <Icon name="info" size={17} />
              <p>{t('apply.sectionNote')}</p>
            </div>
          </aside>

          <form className="wizard__panel" onSubmit={submit} noValidate>
            {step === 0 && (
              <div className="formsection">
                <div className="formsection__head">
                  <h2>{t('apply.studentSection')}</h2>
                  <span>{t('common.requiredNote')}</span>
                </div>
                <div className="formgrid">
                  <Field label={t('apply.schoolLabel')} required error={errors.schoolId} className="formgrid__full">
                    <Select value={form.schoolId} onChange={(e) => set('schoolId', e.target.value)}>
                      <option value="">{t('apply.selectSchool')}</option>
                      {schools.map((s) => (
                        <option value={s.id} key={s.id}>{s.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('apply.fullName')} required error={errors.studentName} className="formgrid__full">
                    <Input value={form.studentName} onChange={(e) => set('studentName', e.target.value)} autoComplete="name" />
                  </Field>
                  <Field label={t('apply.ic')} hint={t('students.icHint')} required error={errors.ic}>
                    <Input value={form.ic} onChange={(e) => set('ic', e.target.value)} autoComplete="off" />
                  </Field>
                  <Field label={t('apply.dob')} hint={t('apply.ageHint')} required error={errors.dob}>
                    <Input type="date" value={form.dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('dob', e.target.value)} />
                  </Field>
                  <Field label={t('apply.gender')} required error={errors.gender}>
                    <Select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                      <option value="">{t('common.select')}</option>
                      <option value="male">{t('apply.male')}</option>
                      <option value="female">{t('apply.female')}</option>
                    </Select>
                  </Field>
                  <Field label={t('apply.address')} className="formgrid__full">
                    <Textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
                  </Field>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="formsection">
                <div className="formsection__head">
                  <h2>{t('apply.parentSection')}</h2>
                  <span>{t('common.requiredNote')}</span>
                </div>
                <div className="formgrid">
                  <Field label={t('apply.parentName')} required error={errors.parentName} className="formgrid__full">
                    <Input value={form.parentName} onChange={(e) => set('parentName', e.target.value)} autoComplete="name" />
                  </Field>
                  <Field label={t('apply.parentEmail')} required error={errors.parentEmail}>
                    <Input type="email" value={form.parentEmail} onChange={(e) => set('parentEmail', e.target.value)} autoComplete="email" />
                  </Field>
                  <Field label={t('apply.parentPhone')} required error={errors.parentPhone}>
                    <Input value={form.parentPhone} onChange={(e) => set('parentPhone', e.target.value)} inputMode="tel" />
                  </Field>
                </div>
                <Alert tone="info">{t('apply.sectionNote')}</Alert>
              </div>
            )}

            {step === 2 && (
              <>
                <div className="formsection">
                  <div className="formsection__head">
                    <h2>{t('apply.educationSection')}</h2>
                    <span>{t('common.requiredNote')}</span>
                  </div>
                  <div className="formgrid">
                    <Field label={t('apply.educationHistory')} required error={errors.education} className="formgrid__full">
                      <Textarea rows={3} value={form.education} onChange={(e) => set('education', e.target.value)} />
                    </Field>
                    <Field label={t('apply.reason')} required error={errors.reason} className="formgrid__full">
                      <Textarea rows={4} value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder={t('apply.reasonPlaceholder')} />
                    </Field>
                  </div>
                </div>

                <div className="formsection">
                  <div className="formsection__head">
                    <h2>{t('apply.documentsSection')}</h2>
                    <span>{t('apply.requiredBadge')}</span>
                  </div>
                  <p className="field__label">{t('apply.documentsLabel')} <span className="field__req">*</span></p>
                  <p className="muted">{t('apply.documentsHint')}</p>
                  <div className="uploadlist">
                    {documents.map((doc) => (
                      <div className="uploadlist__item" key={doc.id}>
                        <Icon name="file" size={17} />
                        <span>{doc.name}</span>
                        <small>{(doc.size / 1024).toFixed(0)} KB</small>
                        <button type="button" className="btn btn--ghost btn--icon" onClick={() => setDocuments((d) => d.filter((x) => x.id !== doc.id))} aria-label={t('common.remove')}>
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple onChange={handleFiles} hidden />
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => fileRef.current?.click()} disabled={uploading || documents.length >= 10}>
                    {uploading ? <span className="spinner" /> : <Icon name="upload" size={16} />} {t('apply.addFile')}
                  </button>
                  {errors.documents && <span className="field__error">{errors.documents}</span>}
                  {uploadError && <Alert tone="danger">{uploadError}</Alert>}
                </div>

                <div className="formsection">
                  <div className="formsection__head">
                    <h2>{t('apply.consentSection')}</h2>
                  </div>
                  <Checkbox checked={form.consent} onChange={(e) => set('consent', e.target.checked)} label={t('apply.consentLabel')} />
                  {errors.consent && <span className="field__error">{errors.consent}</span>}
                  <p className="consenttext">{t('apply.consentText')}</p>
                </div>
              </>
            )}

            {submitError && <Alert tone="danger">{submitError}</Alert>}

            <div className="wizard__actions">
              {step > 0 ? (
                <button type="button" className="btn btn--ghost" onClick={() => setStep((s) => s - 1)}>
                  <Icon name="arrowLeft" size={16} /> {t('common.back')}
                </button>
              ) : (
                <Link to="/" className="btn btn--ghost">{t('apply.backToHome')}</Link>
              )}
              {step < 2 ? (
                <button type="button" className="btn btn--primary" onClick={nextStep}>
                  {t('common.next')} <Icon name="arrowRight" size={16} />
                </button>
              ) : (
                <button type="submit" className="btn btn--primary btn--lg" disabled={submitting || uploading}>
                  {submitting && <span className="spinner spinner--light" />} {t('apply.submit')}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
