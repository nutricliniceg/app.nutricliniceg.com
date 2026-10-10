'use client';

import { useTranslations, useLocale } from 'next-intl';
import {
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react';
import { Add, ChevronRight, Edit, TaskAdd } from '@carbon/icons-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { LongitudinalPanel, DocumentsPanel, LabDraftsPanel, AiSummaryPanel } from './_components/p10-panels';
import PortalTokenModal from './_components/portal-token-modal';
import { calculateAge } from '@/lib/nutrition/calc';

// UI-13: weight chart loads on demand, not with the detail bundle.
const WeightChart = dynamic(() => import('./_components/weight-chart'), { ssr: false });

interface Patient {
  id: string;
  name_ar: string;
  name_en: string | null;
  gender: 'male' | 'female';
  birth_date: string;
  height_cm: number;
  initial_weight_kg: number;
  current_weight_kg: number | null;
  activity_level: string;
  goal: string;
  medical_notes: string | null;
  chronic_conditions: string[] | null;
  allergies: string[] | null;
  consent_ai_sharing_at: string | null;
  nutrition?: {
    bmi: number;
    bmr: number;
    tdee: number;
    targetCalories: number;
    targetProteinG: number;
    targetCarbsG: number;
    targetFatsG: number;
    targetWaterMl: number;
    safetyClamped: boolean;
    safetyWarning?: string;
    chronicConditionFlags: string[];
    doctorReviewRequired: boolean;
  };
}

interface Visit {
  id: string;
  visit_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
  water_pct: number | null;
  notes: string | null;
}

interface Plan {
  id: string;
  type: 'nutrition' | 'exercise';
  week_number: number;
  status: string;
  target_calories: number | null;
  created_at: string;
}

type T = (key: string) => string;

export default function PatientDetailPage() {
  const rawT = useTranslations('dashboard');
  const t = rawT as unknown as T;
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const patientId = String(params.id);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [weightDate, setWeightDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    let cancelled = false;
    async function fetchPatient(): Promise<void> {
      setLoading(true);
      try {
        const response = await fetch(`/api/patients/${patientId}`);
        const data = (await response.json()) as {
          success: boolean;
          data?: { patient: Patient; visits?: Visit[]; plans?: Plan[] };
          error?: { message?: string };
        };
        if (!cancelled && data.success && data.data) {
          setPatient(data.data.patient);
          setVisits(data.data.visits ?? []);
          setPlans(data.data.plans ?? []);
        } else if (!cancelled) {
          setError(data.error?.message ?? 'Failed to load patient');
        }
      } catch {
        if (!cancelled) setError('Failed to load patient');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchPatient();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  async function handleAddWeight(): Promise<void> {
    if (!newWeight) return;
    try {
      const response = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          visit_date: weightDate,
          weight_kg: parseFloat(newWeight),
        }),
      });
      const data = (await response.json()) as { success: boolean; error?: { message?: string } };
      if (data.success) {
        setShowWeightModal(false);
        setNewWeight('');
        const refresh = await fetch(`/api/patients/${patientId}`);
        const refreshed = (await refresh.json()) as {
          success: boolean;
          data?: { patient: Patient; visits?: Visit[]; plans?: Plan[] };
        };
        if (refreshed.success && refreshed.data) {
          setPatient(refreshed.data.patient);
          setVisits(refreshed.data.visits ?? []);
          setPlans(refreshed.data.plans ?? []);
        }
      } else {
        setError(data.error?.message ?? 'Failed to update weight');
      }
    } catch {
      setError('Failed to update weight');
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', display: 'flex', justifyContent: 'center' }}>
        <InlineLoading description={t('loading')} />
      </div>
    );
  }

  if (!patient) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <InlineNotification kind="error" title={t('notFound')} subtitle={error ?? ''} lowContrast />
        <Button style={{ marginTop: '16px' }} onClick={() => router.push(`/${locale}/dashboard/patients`)}>
          {t('backToList')}
        </Button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {patient.name_ar}
            {patient.consent_ai_sharing_at && (
              <Tag type="green">{t('consentGiven')}</Tag>
            )}
          </h1>
          <p style={{ margin: 0, color: '#525252' }}>{patient.id}</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button kind="ghost" onClick={() => setPortalOpen(true)}>{t('portalLink')}</Button>
          <Link href={`/${locale}/dashboard/patients/${patientId}/edit`}>
            <Button kind="secondary" renderIcon={Edit}>{t('edit')}</Button>
          </Link>
          <Link href={`/${locale}/dashboard/patients/${patientId}/plan`}>
            <Button kind="primary" renderIcon={TaskAdd}>{t('createPlan')}</Button>
          </Link>
        </div>
      </div>

      <PortalTokenModal patientId={patientId} open={portalOpen} onClose={() => setPortalOpen(false)} />
      {error && <InlineNotification kind="error" title={error} lowContrast onCloseButtonClick={() => setError(null)} />}

      {patient.nutrition?.safetyClamped && (
        <InlineNotification
          kind="warning"
          title={t('safetyClampedTitle')}
          subtitle={patient.nutrition.safetyWarning ?? t('safetyClampedDesc')}
          lowContrast
        />
      )}
      {patient.nutrition?.doctorReviewRequired && (
        <InlineNotification kind="warning" title={t('doctorReviewRequiredTitle')} subtitle={t('doctorReviewRequiredDesc')} lowContrast />
      )}
      {(patient.nutrition?.chronicConditionFlags ?? []).map((flag, i) => (
        <InlineNotification key={i} kind="info" title={t('chronicConditionFlag')} subtitle={flag} lowContrast />
      ))}

      <Tabs>
        <TabList aria-label={t('info')}>
          <Tab>{t('info')}</Tab>
          <Tab>{t('visits')}</Tab>
          <Tab>{t('plans')}</Tab>
          <Tab>{t('selfReports')}</Tab>
          <Tab>{t('documents')}</Tab>
          <Tab>{t('labDrafts')}</Tab>
          <Tab>{t('aiSummary')}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel><InfoTab patient={patient} t={t} onUpdateWeight={() => setShowWeightModal(true)} /></TabPanel>
          <TabPanel><VisitsTab visits={visits} t={t} onAddWeight={() => setShowWeightModal(true)} /></TabPanel>
          <TabPanel><PlansTab plans={plans} t={t} locale={locale} patientId={patientId} /></TabPanel>
          <TabPanel><SelfReportsTab t={t} /></TabPanel>
          <TabPanel><DocumentsPanel patientId={patientId} t={t} /></TabPanel>
          <TabPanel><LabDraftsPanel patientId={patientId} t={t} /></TabPanel>
          <TabPanel><AiSummaryPanel patientId={patientId} t={t} /></TabPanel>
        </TabPanels>
      </Tabs>

      <Modal open={showWeightModal} onRequestClose={() => setShowWeightModal(false)} size="sm">
        <ModalHeader title={t('addWeight')} />
        <ModalBody>
          <NumberInput
            id="w-weight"
            label={t('weightKg')}
            min={1}
            max={500}
            step={0.1}
            value={newWeight === '' ? 0 : Number(newWeight)}
            onChange={(_e: unknown, state?: { value?: number | string }) => setNewWeight(String(state?.value ?? ''))}
          />
          <TextInput
            id="w-date"
            type="date"
            labelText={t('date')}
            value={weightDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWeightDate(e.target.value)}
          />
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={() => setShowWeightModal(false)}>
            {t('cancel')}
          </Button>
          <Button kind="primary" onClick={() => void handleAddWeight()} disabled={!newWeight}>
            {t('save')}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

function InfoTab({ patient, t, onUpdateWeight }: { patient: Patient; t: T; onUpdateWeight: () => void }) {
  const weight = patient.current_weight_kg ?? patient.initial_weight_kg;
  const nutrition = patient.nutrition;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
      <Tile>
        <h3>{t('basicInfo')}</h3>
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', margin: 0 }}>
          <dt style={{ color: '#525252' }}>{t('nameAr')}</dt>
          <dd style={{ margin: 0 }}>{patient.name_ar}</dd>
          {patient.name_en && (
            <>
              <dt style={{ color: '#525252' }}>{t('nameEn')}</dt>
              <dd style={{ margin: 0 }}>{patient.name_en}</dd>
            </>
          )}
          <dt style={{ color: '#525252' }}>{t('gender')}</dt>
          <dd style={{ margin: 0 }}><Tag type="cool-gray">{t(patient.gender)}</Tag></dd>
          <dt style={{ color: '#525252' }}>{t('age')}</dt>
          <dd style={{ margin: 0 }}>{calculateAge(new Date(patient.birth_date))} {t('years')}</dd>
          <dt style={{ color: '#525252' }}>{t('height')}</dt>
          <dd style={{ margin: 0 }}>{patient.height_cm} cm</dd>
          <dt style={{ color: '#525252' }}>{t('currentWeight')}</dt>
          <dd style={{ margin: 0 }}>{weight} kg</dd>
          <dt style={{ color: '#525252' }}>{t('activityLevel')}</dt>
          <dd style={{ margin: 0 }}>{t(patient.activity_level)}</dd>
          <dt style={{ color: '#525252' }}>{t('goal')}</dt>
          <dd style={{ margin: 0 }}><Tag type="green">{t(patient.goal)}</Tag></dd>
        </dl>
      </Tile>

      {nutrition && (
        <Tile>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>{t('nutritionTargets')}</h3>
            <Button kind="ghost" size="sm" onClick={onUpdateWeight}>{t('updateWeight')}</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <StatCard label={t('bmi')} value={nutrition.bmi.toFixed(1)} />
            <StatCard label={t('bmr')} value={`${nutrition.bmr} kcal`} />
            <StatCard label={t('tdee')} value={`${nutrition.tdee} kcal`} />
            <StatCard label={t('targetCalories')} value={`${nutrition.targetCalories} kcal`} />
            <StatCard label={t('protein')} value={`${nutrition.targetProteinG} g`} />
            <StatCard label={t('carbs')} value={`${nutrition.targetCarbsG} g`} />
            <StatCard label={t('fats')} value={`${nutrition.targetFatsG} g`} />
            <StatCard label={t('water')} value={`${Math.round((nutrition.targetWaterMl / 1000) * 10) / 10} L`} />
          </div>
        </Tile>
      )}

      <Tile>
        <h3>{t('medicalInfo')}</h3>
        {patient.medical_notes && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ color: '#525252', fontWeight: 600 }}>{t('medicalNotes')}</p>
            <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{patient.medical_notes}</p>
          </div>
        )}
        {(patient.chronic_conditions?.length ?? 0) > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ color: '#525252', fontWeight: 600 }}>{t('chronicConditions')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              {(patient.chronic_conditions ?? []).map((c, i) => (
                <Tag key={i} type="warm-gray">{t(c)}</Tag>
              ))}
            </div>
          </div>
        )}
        {(patient.allergies?.length ?? 0) > 0 && (
          <div>
            <p style={{ color: '#525252', fontWeight: 600 }}>{t('allergies')}</p>
            <p style={{ margin: '8px 0 0' }}>{(patient.allergies ?? []).join(', ')}</p>
          </div>
        )}
        {!patient.medical_notes && (patient.chronic_conditions?.length ?? 0) === 0 && (patient.allergies?.length ?? 0) === 0 && (
          <p style={{ color: '#525252' }}>{t('noMedicalInfo')}</p>
        )}
      </Tile>
    </div>
  );
}

function VisitsTab({ visits, t, onAddWeight }: { visits: Visit[]; t: T; onAddWeight: () => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>{t('visitsHistory')}</h3>
        <Button kind="primary" renderIcon={Add} onClick={onAddWeight}>
          {t('recordWeight')}
        </Button>
      </div>

      {visits.length === 0 ? (
        <Tile style={{ textAlign: 'center', padding: '48px' }}>
          <p style={{ margin: '0 0 16px', color: '#525252' }}>{t('noVisitsYet')}</p>
          <Button kind="primary" renderIcon={Add} onClick={onAddWeight}>
            {t('recordFirstWeight')}
          </Button>
        </Tile>
      ) : (
        <>
          <LongitudinalPanel visits={visits} t={t} />
          <Tile>
            <h3>{t('weightTrend')}</h3>
            <WeightChart data={visits.slice().reverse()} weightLabel={t('weight')} />
          </Tile>
          <Tile style={{ marginTop: '24px' }}>
            <h3>{t('visitsList')}</h3>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('date')}</TableHeader>
                    <TableHeader>{t('weight')}</TableHeader>
                    <TableHeader>{t('bodyFat')}</TableHeader>
                    <TableHeader>{t('muscleMass')}</TableHeader>
                    <TableHeader>{t('water')}</TableHeader>
                    <TableHeader>{t('notes')}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visits.map((visit) => (
                    <TableRow key={visit.id}>
                      <TableCell>{visit.visit_date}</TableCell>
                      <TableCell>{visit.weight_kg ? `${visit.weight_kg} kg` : '-'}</TableCell>
                      <TableCell>{visit.body_fat_pct ? `${visit.body_fat_pct}%` : '-'}</TableCell>
                      <TableCell>{visit.muscle_mass_kg ? `${visit.muscle_mass_kg} kg` : '-'}</TableCell>
                      <TableCell>{visit.water_pct ? `${visit.water_pct}%` : '-'}</TableCell>
                      <TableCell>{visit.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Tile>
        </>
      )}
    </div>
  );
}

function PlansTab({ plans, t, locale, patientId }: { plans: Plan[]; t: T; locale: string; patientId: string }) {
  function statusType(status: string): 'green' | 'gray' | 'cool-gray' {
    if (status === 'active') return 'green';
    if (status === 'archived') return 'gray';
    return 'cool-gray';
  }
  return (
    <div>
      <h3 style={{ margin: '0 0 16px' }}>{t('nutritionExercisePlans')}</h3>
      {plans.length === 0 ? (
        <Tile style={{ textAlign: 'center', padding: '48px' }}>
          <p style={{ margin: '0 0 16px', color: '#525252' }}>{t('noPlansYet')}</p>
          <Link href={`/${locale}/dashboard/patients/${patientId}/plan`}>
            <Button kind="primary" renderIcon={Add}>{t('createFirstPlan')}</Button>
          </Link>
        </Tile>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('type')}</TableHeader>
                <TableHeader>{t('week')}</TableHeader>
                <TableHeader>{t('status')}</TableHeader>
                <TableHeader>{t('targetCalories')}</TableHeader>
                <TableHeader>{t('created')}</TableHeader>
                <TableHeader>{t('actions')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell><Tag type={plan.type === 'nutrition' ? 'blue' : 'green'}>{t(plan.type)}</Tag></TableCell>
                  <TableCell>{t('week')} {plan.week_number}</TableCell>
                  <TableCell><Tag type={statusType(plan.status)}>{t(plan.status)}</Tag></TableCell>
                  <TableCell>{plan.target_calories ? `${plan.target_calories} kcal` : '-'}</TableCell>
                  <TableCell>{new Date(plan.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button kind="ghost" size="sm" renderIcon={ViewIcon}>{t('view')}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}

function ViewIcon(props: { className?: string }) {
  return <ChevronRight className={`flip-rtl${props.className ? ` ${props.className}` : ''}`} />;
}

function SelfReportsTab({ t }: { t: T }) {
  return (
    <Tile style={{ textAlign: 'center', padding: '48px' }}>
      <TaskAdd style={{ width: '48px', height: '48px', color: '#8d8d8d', marginBottom: '16px' }} />
      <p style={{ margin: '0 0 16px', color: '#525252' }}>{t('noSelfReportsYet')}</p>
      <p style={{ margin: 0, color: '#525252', fontSize: '14px' }}>{t('selfReportsDesc')}</p>
    </Tile>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '16px', backgroundColor: '#f4f4f4', borderRadius: '8px' }}>
      <div style={{ fontSize: '14px', color: '#525252' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 600, color: '#161616' }}>{value}</div>
    </div>
  );
}
