'use client';

import { useTranslations, useLocale } from 'next-intl';
import {
  Button,
  InlineLoading,
  InlineNotification,
  OverflowMenu,
  OverflowMenuItem,
  Search,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from '@carbon/react';
import { Add, ChevronLeft, ChevronRight } from '@carbon/icons-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { calculateAge } from '@/lib/nutrition/calc';

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
  chronic_conditions: string[] | null;
  allergies: string[] | null;
  consent_ai_sharing_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PatientsResponse {
  patients: Patient[];
  total: number;
  page: number;
  limit: number;
}

export default function PatientsListPage() {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const router = useRouter();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchPatients(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (search) params.set('search', search);
        if (genderFilter !== 'all') params.set('gender', genderFilter);
        const response = await fetch(`/api/patients?${params.toString()}`);
        const data = (await response.json()) as { success: boolean; data?: PatientsResponse; error?: { message?: string } };
        if (!cancelled && data.success && data.data) {
          setPatients(data.data.patients);
          setTotal(data.data.total);
        } else if (!cancelled && !data.success) {
          setError(data.error?.message ?? t('loadFailed'));
        }
      } catch {
        if (!cancelled) setError(t('loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchPatients();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, genderFilter]);

  async function handleDelete(patientId: string): Promise<void> {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      const response = await fetch(`/api/patients/${patientId}`, { method: 'DELETE' });
      const data = (await response.json()) as { success: boolean; error?: { message?: string } };
      if (data.success) {
        setPatients((prev) => prev.filter((p) => p.id !== patientId));
        setTotal((prev) => Math.max(0, prev - 1));
      } else {
        setError(data.error?.message ?? t('deleteFailed'));
      }
    } catch {
      setError(t('deleteFailed'));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0 }}>{t('patients')}</h1>
        <Link href={`/${locale}/dashboard/patients/new`}>
          <Button kind="primary" renderIcon={Add}>{t('newPatient')}</Button>
        </Link>
      </div>
      {error && <InlineNotification kind="error" title={error} lowContrast onClose={() => setError(null)} />}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Search
          id="patients-search"
          labelText={t('searchPlaceholder')}
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          id="patients-gender"
          labelText={t('genderFilter')}
          value={genderFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            setGenderFilter(e.target.value as 'all' | 'male' | 'female');
            setPage(1);
          }}
        >
          <SelectItem value="all" text={t('allGenders')} />
          <SelectItem value="male" text={t('male')} />
          <SelectItem value="female" text={t('female')} />
        </Select>
      </div>

      {loading ? (
        <InlineLoading description={t('loading')} />
      ) : patients.length === 0 ? (
        <Tile>
          <h3>{t('noPatientsFound')}</h3>
          <p>{t('noPatientsSubtitle')}</p>
          <Link href={`/${locale}/dashboard/patients/new`}>
            <Button kind="primary" renderIcon={Add}>{t('newPatient')}</Button>
          </Link>
        </Tile>
      ) : (
        <>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('name')}</TableHeader>
                  <TableHeader>{t('gender')}</TableHeader>
                  <TableHeader>{t('age')}</TableHeader>
                  <TableHeader>{t('currentWeight')}</TableHeader>
                  <TableHeader>{t('goal')}</TableHeader>
                  <TableHeader>{t('aiConsent')}</TableHeader>
                  <TableHeader>{t('actions')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {patients.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell>{patient.name_ar}</TableCell>
                    <TableCell>{t(patient.gender)}</TableCell>
                    <TableCell>{calculateAge(new Date(patient.birth_date))}</TableCell>
                    <TableCell>{`${patient.current_weight_kg ?? patient.initial_weight_kg} kg`}</TableCell>
                    <TableCell>{t(patient.goal)}</TableCell>
                    <TableCell>
                      <Tag type={patient.consent_ai_sharing_at ? 'green' : 'cool-gray'}>
                        {patient.consent_ai_sharing_at ? t('consentGiven') : t('consentPending')}
                      </Tag>
                    </TableCell>
                    <TableCell>
                      <OverflowMenu iconDescription={t('actions')} flipped>
                        <OverflowMenuItem
                          itemText={t('viewDetails')}
                          onClick={() => router.push(`/${locale}/dashboard/patients/${patient.id}`)}
                        />
                        <OverflowMenuItem
                          itemText={t('edit')}
                          onClick={() => router.push(`/${locale}/dashboard/patients/${patient.id}/edit`)}
                        />
                        <OverflowMenuItem
                          itemText={t('createPlan')}
                          onClick={() => router.push(`/${locale}/dashboard/patients/${patient.id}/plan`)}
                        />
                        <OverflowMenuItem
                          itemText={t('delete')}
                          onClick={() => void handleDelete(patient.id)}
                        />
                      </OverflowMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '16px' }}>
            <Button kind="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)} renderIcon={PrevIcon}>
              {t('previous')}
            </Button>
            <span>{t('pageOf', { current: page, total: totalPages })}</span>
            <Button kind="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)} renderIcon={NextIcon}>
              {t('next')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function PrevIcon(props: { className?: string }) {
  return <ChevronLeft className={`flip-rtl${props.className ? ` ${props.className}` : ''}`} />;
}

function NextIcon(props: { className?: string }) {
  return <ChevronRight className={`flip-rtl${props.className ? ` ${props.className}` : ''}`} />;
}
