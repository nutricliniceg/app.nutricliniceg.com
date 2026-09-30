'use client';

import { Button, Tile, Tag, InlineNotification } from '@carbon/react';
import { Checkmark } from '@carbon/icons-react';
import { useTranslations } from 'next-intl';

export interface ReportDetail {
  name: string;
  verified: boolean;
  note: string;
}

export interface DraftResult {
  planId: string;
  deviationKcal: number;
  attempts: number;
  wallTimeMs: number;
  verifiedItemsRatio: number;
  valuesUnverified: boolean;
  publishWarning: boolean;
  report: {
    verified: number;
    unverified: number;
    total: number;
    details: ReportDetail[];
    reliabilityCaveat: string | null;
    mineralNotice: string | null;
  } | null;
}

export default function PlanResult({ result, onConvert, converting, converted }: {
  result: DraftResult;
  onConvert: () => void;
  converting: boolean;
  converted: boolean;
}) {
  const t = useTranslations('plans');
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <InlineNotification kind="success" title={t('draftReady')} subtitle={`${t('draftId')}: ${result.planId}`} hideCloseButton lowContrast />
      <Tile>
        <p>
          {t('deviation')}: {result.deviationKcal} · {t('attempts')}: {result.attempts} · {t('wallTime')}: {(result.wallTimeMs / 1000).toFixed(1)}
          {t('seconds')}
        </p>
        {result.publishWarning && <InlineNotification kind="warning" title={t('publishWarning')} hideCloseButton lowContrast />}
      </Tile>
      {result.report && (
        <Tile>
          <h4>{t('verificationReport')}</h4>
          <p>{t('verifiedOf', { v: result.report.verified, t: result.report.total })}</p>
          {result.report.reliabilityCaveat && <p style={{ opacity: 0.75 }}>{result.report.reliabilityCaveat}</p>}
          {result.report.mineralNotice && <p style={{ opacity: 0.75 }}>{result.report.mineralNotice}</p>}
          {result.report.details.map((d) => (
            <p key={d.name}>
              <Tag type={d.verified ? 'green' : 'red'}>{d.verified ? t('verifiedBadge') : t('unverifiedBadge')}</Tag> {d.name} — {d.note}
            </p>
          ))}
          {result.valuesUnverified && !converted && (
            <Button kind="secondary" size="sm" renderIcon={Checkmark} disabled={converting} onClick={onConvert}>
              {t('convertToVerified')}
            </Button>
          )}
          {converted && <InlineNotification kind="success" title={t('converted')} hideCloseButton lowContrast />}
        </Tile>
      )}
      <Tile>
        <p style={{ opacity: 0.75 }}>{t('approveHandoff')}</p>
      </Tile>
    </div>
  );
}
