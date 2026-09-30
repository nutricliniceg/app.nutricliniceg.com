'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';
import ConversationList from './_components/conversation-list';
import { ChatLog, Composer, type ChatMessage } from './_components/chat-panel';
import PatientBar from './_components/patient-bar';
import PayloadModal from './_components/payload-modal';
import LabPanel from './_components/lab-panel';

export default function AiAssistantPage() {
  const t = useTranslations('assistant');
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [patient, setPatient] = useState<{ id: string; name_ar: string } | null>(null);
  const [disclaimer, setDisclaimer] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async (): Promise<void> => {
    if (!selected) {
      setMessages([]);
      setPatient(null);
      return;
    }
    const d = await readApi<{ messages: ChatMessage[]; patient: { id: string; name_ar: string } | null }>(
      await fetch(`/api/ai-assistant/conversations/${selected}`)
    );
    setMessages(d.messages);
    setPatient(d.patient);
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createChat(): Promise<void> {
    const d = await readApi<{ id: string }>(await fetch('/api/ai-assistant/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }));
    setSelected(d.id);
    setRefreshKey((k) => k + 1);
    await load();
  }

  return (
    <div>
      <h1>{t('title')}</h1>
      <ConversationList onSelect={(id) => { setSelected(id); }} refreshKey={refreshKey} />
      {!selected && <Button onClick={() => void createChat()}>{t('newChat')}</Button>}
      {selected && (
        <>
          <PatientBar conversationId={selected} patient={patient} onChange={() => void load()} />
          <ChatLog messages={messages} disclaimer={disclaimer} />
          <Composer
            conversationId={selected}
            onSent={(d) => {
              setDisclaimer(d);
              void load();
              setRefreshKey((k) => k + 1);
            }}
          />
          <PayloadModal conversationId={selected} />
          <Button
            kind="ghost"
            size="sm"
            onClick={() => window.open(`/api/ai-assistant/conversations/${selected}/export`, '_blank')}
          >
            {t('export')}
          </Button>
          <LabPanel patientId={patient?.id ?? null} />
        </>
      )}
    </div>
  );
}
