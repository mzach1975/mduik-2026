import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { useApi } from '../hooks';
import Icon from '../components/Icon';
import {
  Alert,
  Avatar,
  BarList,
  Card,
  DataTable,
  ErrorState,
  Loading,
  PageHeader,
  RoleBadge,
  StatCard,
  StatusBadge,
} from '../components/ui';

export default function Dashboard() {
  const { user } = useAuth();
  const { t, money, number, date, monthLabel, statusLabel } = useI18n();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi('/dashboard');

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const role = data.role;

  if (role === 'super_admin') return <SuperDashboard data={data} />;
  if (role === 'teacher') return <TeacherDashboard data={data} />;
  if (role === 'parent') return <ParentDashboard data={data} />;
  return <SchoolDashboard data={data} />;
}

function Greeting({ name, subtitle }) {
  const { t } = useI18n();
  const hour = new Date().getHours();
  const part = hour < 12 ? t('dashboard.welcome') : hour < 18 ? t('dashboard.welcome') : t('dashboard.welcome');
  return (
    <div className="dashgreet">
      <div>
        <span className="page-head__eyebrow">{part}</span>
        <h1>{name}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Super admin                                                        */
/* ------------------------------------------------------------------ */

function SuperDashboard({ data }) {
  const { t, money, number, monthLabel } = useI18n();
  const { switchSchool } = useAuth();
  const navigate = useNavigate();
  const { totals, schools, states, collectionRate, month } = data;

  async function openSchool(school) {
    await switchSchool(school.id);
    window.location.assign('/app');
  }

  return (
    <>
      <PageHeader
        title={t('dashboard.overview')}
        subtitle={`${monthLabel(month)} · ${t('dashboard.superAdmin')}`}
        actions={
          <>
            <Link to="/app/schools" className="btn btn--primary btn--sm"><Icon name="plus" size={16} /> {t('schools.addSchool')}</Link>
            <Link to="/app/reports" className="btn btn--ghost btn--sm"><Icon name="report" size={16} /> {t('nav.reports')}</Link>
          </>
        }
      />

      <div className="statgrid statgrid--5">
        <StatCard label={t('dashboard.schoolsCount')} value={number(totals.schools)} icon="school" tone="teal" hint={t('common.active')} href="/app/schools" />
        <StatCard label={t('common.students')} value={number(totals.students)} icon="student" tone="sky" hint={t('common.active')} />
        <StatCard label={t('nav.applications')} value={number(totals.applications)} icon="file" tone="sand" />
        <StatCard label={t('dashboard.collectionsMonth')} value={money(totals.collected)} icon="payment" tone="green" hint={monthLabel(month)} />
        <StatCard label={t('common.outstanding')} value={money(totals.outstanding)} icon="clock" tone="rose" />
      </div>

      <div className="dashgrid dashgrid--2-1">
        <Card title={t('common.schools')} subtitle={t('dashboard.stateBreakdown')} padded={false}>
          <DataTable
            dense
            rows={schools}
            rowKey={(r) => r.id}
            onRowClick={openSchool}
            columns={[
              { key: 'name', label: t('common.school'), render: (r) => <span className="cell-strong">{r.name}</span> },
              { key: 'state', label: t('common.state') },
              { key: 'students', label: t('common.students'), align: 'right' },
              { key: 'applications', label: t('nav.applications'), align: 'right' },
              { key: 'collected_month', label: t('dashboard.collectionsMonth'), align: 'right', render: (r) => money(r.collected_month) },
              { key: 'outstanding', label: t('common.outstanding'), align: 'right', render: (r) => <span className="text-rose">{money(r.outstanding)}</span> },
              { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        </Card>

        <div className="stack">
          <Card title={t('dashboard.collectionRate')}>
            <div className="rate">
              <div className="rate__dial" style={{ '--pct': `${collectionRate}%` }}>
                <strong>{collectionRate}%</strong>
                <span>{t('dashboard.collectionsMonth')}</span>
              </div>
              <div className="rate__legend">
                <div><span className="dot dot--green" /> {t('common.paid')}<strong>{money(totals.collected)}</strong></div>
                <div><span className="dot dot--rose" /> {t('common.outstanding')}<strong>{money(totals.outstanding)}</strong></div>
              </div>
            </div>
          </Card>
          <Card title={t('dashboard.stateBreakdown')}>
            <BarList
              items={states.map((s) => ({ label: s.state || '—', value: s.students, tone: 'teal' }))}
              format={(v) => number(v)}
            />
          </Card>
        </div>
      </div>

      <Card title={t('dashboard.quickActions')}>
        <div className="quickgrid">
          <button type="button" className="quick" onClick={() => navigate('/app/schools')}>
            <span className="quick__icon"><Icon name="school" size={20} /></span>
            <span><strong>{t('schools.addSchool')}</strong><small>{t('schools.subtitle')}</small></span>
          </button>
          <button type="button" className="quick" onClick={() => navigate('/app/users')}>
            <span className="quick__icon"><Icon name="users" size={20} /></span>
            <span><strong>{t('users.addUser')}</strong><small>{t('users.subtitle')}</small></span>
          </button>
          <button type="button" className="quick" onClick={() => navigate('/app/reports')}>
            <span className="quick__icon"><Icon name="report" size={20} /></span>
            <span><strong>{t('reports.stateConsolidated')}</strong><small>{t('reports.subtitle')}</small></span>
          </button>
          <button type="button" className="quick" onClick={() => navigate('/app/audit')}>
            <span className="quick__icon"><Icon name="audit" size={20} /></span>
            <span><strong>{t('nav.audit')}</strong><small>{t('audit.subtitle')}</small></span>
          </button>
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* School admin / bursar                                              */
/* ------------------------------------------------------------------ */

function SchoolDashboard({ data }) {
  const { t, money, number, date, monthLabel, statusLabel } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { counts = {}, funnel = {}, buckets = {}, latestReceipts = [], recentApplications = [], school, day, month } = data;
  const pending = (counts.pending_refunds || 0) + (counts.pending_adjustments || 0) + (counts.pending_reminders || 0);

  const funnelItems = ['submitted', 'interview', 'waiting_list', 'accepted', 'not_accepted', 'registered', 'incomplete']
    .map((s) => ({ label: statusLabel(s), value: funnel[s] || 0, tone: s === 'accepted' || s === 'registered' ? 'green' : s === 'not_accepted' ? 'rose' : s === 'waiting_list' ? 'amber' : 'teal' }))
    .filter((i) => i.value > 0);

  const agingItems = [
    { label: t('dashboard.current'), value: buckets.current || 0, tone: 'green' },
    { label: t('dashboard.days1_30'), value: buckets.d1_30 || 0, tone: 'teal' },
    { label: t('dashboard.days31_60'), value: buckets.d31_60 || 0, tone: 'amber' },
    { label: t('dashboard.days61_90'), value: buckets.d61_90 || 0, tone: 'orange' },
    { label: t('dashboard.over90'), value: buckets.over90 || 0, tone: 'rose' },
  ];

  return (
    <>
      <div className="dashhero">
        <div className="dashhero__text">
          <span className="page-head__eyebrow">{monthLabel(month)} · {date(day)}</span>
          <h1>{t('dashboard.welcome')}, {user.name.split(' ')[0]}</h1>
          <p>{school?.name} · {t(school?.category === 'tahfiz' ? 'common.tahfiz' : 'common.islamicStudies')}</p>
          <div className="dashhero__actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate('/app/payments?new=1')}>
              <Icon name="payment" size={16} /> {t('finance.recordPayment')}
            </button>
            <Link to="/app/reports" className="btn btn--outline btn--sm"><Icon name="report" size={16} /> {t('nav.reports')}</Link>
          </div>
        </div>
        <div className="dashhero__date">
          <span>{new Date().toLocaleDateString(undefined, { weekday: 'long' })}</span>
          <strong>{new Date().getDate()}</strong>
          <small>{monthLabel(month)}</small>
        </div>
      </div>

      <div className="statgrid statgrid--4">
        <StatCard
          label={t('dashboard.activeStudents')}
          value={number(counts.active_students)}
          hint={`${number(counts.tracking_on)} ${t('students.trackingOn')}`}
          icon="student"
          tone="teal"
          href="/app/students"
        />
        <StatCard
          label={t('dashboard.feesThisMonth')}
          value={money(counts.collected_month)}
          hint={`${money(counts.collected_today)} ${t('common.today').toLowerCase()}`}
          icon="payment"
          tone="green"
          href="/app/payments"
        />
        <StatCard
          label={t('dashboard.outstandingFees')}
          value={money(counts.outstanding)}
          hint={`${number(counts.open_invoices)} ${t('common.invoice').toLowerCase()}`}
          icon="clock"
          tone="rose"
          href="/app/arrears"
        />
        <StatCard
          label={t('dashboard.pendingActions')}
          value={number(pending)}
          hint={`${number(counts.pending_refunds)} ${t('nav.refunds').toLowerCase()} · ${number(counts.pending_adjustments)} ${t('nav.adjustments').toLowerCase()}`}
          icon="alert"
          tone="amber"
          href="/app/refunds"
        />
      </div>

      <div className="dashgrid dashgrid--2">
        <Card title={t('dashboard.arrearsAging')} subtitle={t('finance.arrearsSubtitle')} actions={<Link to="/app/arrears" className="cardlink">{t('common.view')} <Icon name="arrowRight" size={14} /></Link>}>
          <BarList items={agingItems} format={(v) => money(v)} />
          <div className="cardmini">
            <span>{t('finance.totalOutstanding')}</span>
            <strong>{money(agingItems.reduce((s, i) => s + i.value, 0))}</strong>
          </div>
        </Card>
        <Card title={t('dashboard.admissionsFunnel')} subtitle={t('applications.subtitle')} actions={<Link to="/app/applications" className="cardlink">{t('common.view')} <Icon name="arrowRight" size={14} /></Link>}>
          {funnelItems.length ? <BarList items={funnelItems} format={(v) => number(v)} /> : <p className="muted">{t('common.noData')}</p>}
          <div className="cardmini">
            <span>{t('common.total')}</span>
            <strong>{number(Object.values(funnel).reduce((s, v) => s + v, 0))}</strong>
          </div>
        </Card>
      </div>

      <div className="dashgrid dashgrid--2">
        <Card
          title={t('dashboard.recentApplications')}
          actions={<Link to="/app/applications" className="cardlink">{t('dashboard.viewAll')} <Icon name="arrowRight" size={14} /></Link>}
          padded={false}
        >
          <DataTable
            dense
            rows={recentApplications}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/app/applications/${r.id}`)}
            columns={[
              { key: 'student_name', label: t('applications.applicant'), render: (r) => <span className="cell-strong">{r.student_name}</span> },
              { key: 'reference', label: t('applications.reference'), render: (r) => <span className="mono">{r.reference}</span> },
              { key: 'submitted_at', label: t('common.date'), render: (r) => date(r.submitted_at) },
              { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        </Card>
        <Card
          title={t('dashboard.latestReceipts')}
          actions={<Link to="/app/receipts" className="cardlink">{t('dashboard.viewAll')} <Icon name="arrowRight" size={14} /></Link>}
          padded={false}
        >
          <DataTable
            dense
            rows={latestReceipts}
            rowKey={(r) => r.number}
            columns={[
              { key: 'number', label: t('common.receipt'), render: (r) => <span className="mono">{r.number}</span> },
              { key: 'student_name', label: t('common.student') },
              { key: 'issued_at', label: t('common.date'), render: (r) => date(r.issued_at) },
              { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => <span className="cell-strong">{money(r.amount_cents)}</span> },
            ]}
          />
        </Card>
      </div>

      <Card title={t('dashboard.quickActions')}>
        <div className="quickgrid">
          <button type="button" className="quick" onClick={() => navigate('/app/payments?new=1')}>
            <span className="quick__icon"><Icon name="payment" size={20} /></span>
            <span><strong>{t('finance.recordPayment')}</strong><small>{t('finance.paymentTitle')}</small></span>
          </button>
          <button type="button" className="quick" onClick={() => navigate('/app/invoices?run=1')}>
            <span className="quick__icon"><Icon name="invoice" size={20} /></span>
            <span><strong>{t('finance.runMonthly')}</strong><small>{t('finance.runBillingTitle')}</small></span>
          </button>
          <button type="button" className="quick" onClick={() => navigate('/app/applications')}>
            <span className="quick__icon"><Icon name="file" size={20} /></span>
            <span><strong>{t('dashboard.admissions')}</strong><small>{t('applications.subtitle')}</small></span>
          </button>
          <button type="button" className="quick" onClick={() => navigate('/app/reports')}>
            <span className="quick__icon"><Icon name="report" size={20} /></span>
            <span><strong>{t('reports.feeCollection')}</strong><small>{t('reports.subtitle')}</small></span>
          </button>
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Teacher                                                            */
/* ------------------------------------------------------------------ */

function TeacherDashboard({ data }) {
  const { t, dateTime, statusLabel } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { upcoming = [], pendingScores = 0 } = data;

  return (
    <>
      <PageHeader
        title={`${t('dashboard.teacherWelcome')}, ${user.name.split(' ')[0]}`}
        subtitle={t('dashboard.overview')}
        actions={<Link to="/app/interviews" className="btn btn--primary btn--sm">{t('interviews.evaluateNow')} <Icon name="arrowRight" size={15} /></Link>}
      />
      <div className="statgrid statgrid--3">
        <StatCard label={t('dashboard.pendingScores')} value={pendingScores} icon="teacher" tone="amber" hint={t('interviews.bothRequired')} />
        <StatCard label={t('dashboard.upcomingInterviews')} value={upcoming.length} icon="calendar" tone="teal" />
        <StatCard label={t('interviews.passMark')} value="40/100" icon="checkCircle" tone="green" hint={t('interviews.belowPassNotice')} />
      </div>

      <Card title={t('dashboard.upcomingInterviews')} subtitle={t('interviews.subtitle')}>
        {!upcoming.length ? (
          <Alert tone="info">{t('dashboard.noInterviews')}</Alert>
        ) : (
          <div className="interviewlist">
            {upcoming.map((iv) => (
              <button type="button" key={iv.id} className="interviewrow" onClick={() => navigate(`/app/interviews/${iv.id}`)}>
                <span className="interviewrow__date">
                  <strong>{new Date(iv.scheduled_at).getDate()}</strong>
                  <small>{new Date(iv.scheduled_at).toLocaleDateString(undefined, { month: 'short' })}</small>
                </span>
                <span className="interviewrow__body">
                  <strong>{iv.student_name}</strong>
                  <small>{iv.reference} · {iv.mode === 'in_person' ? t('applications.inPerson') : t('applications.phoneMode')} {iv.location ? `· ${iv.location}` : ''}</small>
                  <small>{dateTime(iv.scheduled_at)}</small>
                </span>
                <span className="interviewrow__status">
                  {iv.my_score ? <StatusBadge status="completed" /> : <StatusBadge status="pending" />}
                  <Icon name="chevronRight" size={17} />
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Parent                                                             */
/* ------------------------------------------------------------------ */

function ParentDashboard({ data }) {
  const { t, money, date } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { children = [] } = data;

  return (
    <>
      <PageHeader
        title={`${t('dashboard.welcome')}, ${user.name.split(' ')[0]}`}
        subtitle={t('dashboard.children')}
        actions={<Link to="/app/portal" className="btn btn--primary btn--sm">{t('landing.parentPortal')} <Icon name="arrowRight" size={15} /></Link>}
      />
      {!children.length ? (
        <Card><Alert tone="info">{t('dashboard.noChildren')}</Alert></Card>
      ) : (
        <div className="childgrid">
          {children.map((child) => (
            <article className="childcard" key={child.id}>
              <div className="childcard__head">
                <Avatar name={child.full_name} size={46} />
                <div>
                  <strong>{child.full_name}</strong>
                  <small>{child.class_name || '—'} · {child.school_name}</small>
                </div>
                <StatusBadge status={child.status} />
              </div>
              <div className="childcard__balance">
                <div>
                  <span>{t('common.outstanding')}</span>
                  <strong className={child.outstanding > 0 ? 'text-rose' : ''}>{money(child.outstanding)}</strong>
                </div>
                <div>
                  <span>{t('common.credit')}</span>
                  <strong>{money(child.credit)}</strong>
                </div>
              </div>
              <div className="childcard__foot">
                <span><Icon name="calendar" size={15} /> {t('portal.nextDue')}: {date(child.next_due)}</span>
                <button type="button" className="btn btn--outline btn--sm" onClick={() => navigate(`/app/portal/${child.id}`)}>
                  {t('portal.viewChild')} <Icon name="arrowRight" size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
