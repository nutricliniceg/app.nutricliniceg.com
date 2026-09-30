'use client';

import { Button, Tag, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import type { TemplateCardData } from './template-types';

export default function TemplateCard({ tpl, onApply }: { tpl: TemplateCardData; onApply: (tpl: TemplateCardData) => void }) {
  const t = useTranslations('templates');
  return (
    <Tile>
      <h4>{tpl.name}</h4>
      <p>
        {tpl.is_global ? <Tag type="blue">{t('globalBadge')}</Tag> : <Tag type="cool-gray">{t('privateBadge')}</Tag>}
        {tpl.category && <Tag type="green">{tpl.category}</Tag>}
        {tpl.reference_calories != null && <Tag type="outline">{`${tpl.reference_calories} kcal`}</Tag>}
      </p>
      {tpl.description && <p>{tpl.description}</p>}
      <p>{t('usageCount', { n: tpl.usage_count })}</p>
      <Button size="sm" onClick={() => onApply(tpl)}>
        {t('applyToPatient')}
      </Button>
    </Tile>
  );
}
