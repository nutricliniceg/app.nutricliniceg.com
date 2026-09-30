'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// UI-13: longitudinal chart loads on demand, not with the detail bundle.
const LongitudinalChart = dynamic(() => import('./longitudinal-chart'), { ssr: false });

type T = (key: string) => string;

interface VisitPoint {
  visit_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
}

export function LongitudinalPanel({ visits, t }: { visits: VisitPoint[]; t: T }) {
  const data = visits
    .slice()
    .reverse()
    .map((v) => ({
      date: String(v.visit_date).slice(0, 10),
      weight: v.weight_kg,
      fat: v.body_fat_pct,
      muscle: v.muscle_mass_kg,
    }))
    .filter((d) => d.weight !== null || d.fat !== null);
  if (data.length === 0) return null;
  return (
    <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, marginBottom: 24 }}>
      <h4 style={{ margin: '0 0 12px' }}>{t('longitudinalTrend')}</h4>
      <LongitudinalChart data={data} weightLabel={t('weight')} bodyFatLabel={t('bodyFat')} muscleMassLabel={t('muscleMass')} />
    </div>
  );
}

interface DocFile {
  id: string;
  purpose: string;
  originalName: string;
  mime: string;
  signedUrl: string;
}

export function DocumentsPanel({ patientId, t }: { patientId: string; t: T }) {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const res = await fetch(`/api/patients/${patientId}/documents`);
    const body = await res.json();
    if (body.success) setFiles(body.data.files);
  };

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const upload = async (form: FormData) => {
    setBusy(true);
    setError('');
    try {
      form.set('patient_id', patientId);
      const res = await fetch('/api/files/upload', { method: 'POST', body: form });
      const body = await res.json();
      if (!body.success) setError(body.error?.message || t('uploadFailed'));
      else await load();
    } catch {
      setError(t('uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 16px' }}>{t('documents')}</h3>
      {error && <p style={{ color: '#da1e28' }}>{error}</p>}
      <form
        action={upload}
        style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 16 }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
          {t('selectFile')}
          <input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
          {t('documentPurpose')}
          <select name="purpose" defaultValue="inbody">
            <option value="inbody">{t('purposeInbody')}</option>
            <option value="lab">{t('purposeLab')}</option>
          </select>
        </label>
        <button type="submit" disabled={busy} style={{ padding: '8px 20px' }}>
          {busy ? t('loading') : t('upload')}
        </button>
      </form>
      {files.length === 0 ? (
        <p style={{ color: '#5a6872' }}>{t('noDocumentsYet')}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {files.map((f) => (
            <li key={f.id} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{f.originalName} <small style={{ color: '#5a6872' }}>({f.purpose})</small></span>
              <a href={f.signedUrl}>{t('download')}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface LabItem {
  name: string;
  value: number;
  unit?: string | null;
}

interface LabDraft {
  id: string;
  source: string;
  items: LabItem[];
  created_at: string;
}

export function LabDraftsPanel({ patientId, t }: { patientId: string; t: T }) {
  const [drafts, setDrafts] = useState<LabDraft[]>([]);
  const [approved, setApproved] = useState<LabItem[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const res = await fetch(`/api/patients/${patientId}/labs`);
    const body = await res.json();
    if (body.success) {
      setDrafts(body.data.drafts);
      setApproved(body.data.approved.flatMap((d: LabDraft) => d.items));
    }
  };

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const analyze = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/labs/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, text }),
      });
      const body = await res.json();
      if (!body.success) setError(body.error?.message || t('analyzeFailed'));
      else {
        setText('');
        await load();
      }
    } catch {
      setError(t('analyzeFailed'));
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, action: 'approve' | 'discard') => {
    const res = await fetch(`/api/labs/drafts/${id}/${action}`, { method: 'POST' });
    const body = await res.json();
    if (body.success) await load();
    else setError(body.error?.message || t('analyzeFailed'));
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 16px' }}>{t('labDrafts')}</h3>
      {error && <p style={{ color: '#da1e28' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('analyzeText')}
          aria-label={t('analyzeText')}
          rows={3}
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={analyze} disabled={busy || !text.trim()} style={{ padding: '8px 20px', alignSelf: 'start' }}>
          {busy ? t('loading') : t('analyze')}
        </button>
      </div>
      {drafts.length === 0 ? (
        <p style={{ color: '#5a6872' }}>{t('noDraftsYet')}</p>
      ) : (
        drafts.map((d) => (
          <div key={d.id} style={{ border: '2px dashed #b45309', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#b45309' }}>{t('draftBadge')}</p>
            <ul style={{ margin: '0 0 8px', paddingInlineStart: 20 }}>
              {d.items.map((item, i) => (
                <li key={i}>{item.name}: {item.value}{item.unit ? ` ${item.unit}` : ''}</li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => review(d.id, 'approve')} style={{ padding: '6px 16px' }}>{t('approve')}</button>
              <button onClick={() => review(d.id, 'discard')} style={{ padding: '6px 16px' }}>{t('discard')}</button>
            </div>
          </div>
        ))
      )}
      {approved.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 8px' }}>{t('approvedValues')}</h4>
          <p style={{ color: '#5a6872', fontSize: 14 }}>{t('officialRecordNote')}</p>
          <ul>
            {approved.map((item, i) => (
              <li key={i}>{item.name}: {item.value}{item.unit ? ` ${item.unit}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AiSummaryPanel({ patientId, t }: { patientId: string; t: T }) {
  const [summary, setSummary] = useState('');
  const [disclaimer, setDisclaimer] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  const load = async () => {
    setState('loading');
    try {
      const res = await fetch(`/api/patients/${patientId}/summary`);
      const body = await res.json();
      if (body.success) {
        setSummary(body.data.summary);
        setDisclaimer(body.data.disclaimer);
        setState('idle');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    load().catch(() => setState('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  if (state === 'loading') return <p>{t('generatingSummary')}</p>;
  if (state === 'error') {
    return (
      <div>
        <p style={{ color: '#da1e28' }}>{t('summaryFailed')}</p>
        <button onClick={load} style={{ padding: '6px 16px' }}>{t('retry')}</button>
      </div>
    );
  }
  return (
    <div>
      <p style={{ whiteSpace: 'pre-wrap' }}>{summary}</p>
      <p style={{ borderInlineStart: '4px solid #008080', paddingInlineStart: 12, color: '#5a6872' }}>{disclaimer}</p>
    </div>
  );
}
