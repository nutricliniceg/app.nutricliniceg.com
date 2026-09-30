'use client';

import { Tag, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';

export interface ThreadSummary {
  patient_id: string;
  patient_name: string;
  last_message_at: string;
  last_preview: string | null;
  last_sender: 'patient' | 'doctor';
  unread_count: number;
  total_count: number;
}

export default function ThreadList({ threads, selected, onSelect }: { threads: ThreadSummary[]; selected: string | null; onSelect: (patientId: string) => void }) {
  const t = useTranslations('inbox');
  if (threads.length === 0) return <p>{t('empty')}</p>;
  return (
    <div>
      {threads.map((th) => (
        <Tile key={th.patient_id} onClick={() => onSelect(th.patient_id)} style={selected === th.patient_id ? { borderInlineStart: '4px solid #008080' } : undefined}>
          <strong>{th.patient_name}</strong>
          {th.unread_count > 0 && <Tag type="red">{th.unread_count}</Tag>}
          <p>{th.last_preview ?? ''}</p>
        </Tile>
      ))}
    </div>
  );
}
