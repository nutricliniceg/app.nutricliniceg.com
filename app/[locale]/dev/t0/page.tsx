'use client';

/* eslint-disable react/jsx-key */
import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import {
  Header,
  HeaderName,
  HeaderGlobalAction,
  HeaderGlobalBar,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  InlineNotification,
  Button,
} from '@carbon/react';
import { User, Notification, Language } from '@carbon/icons-react';

export default function T0Page() {
  const t = useTranslations('t0');
  const commonT = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (newLocale: string) => {
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`;
    const newPathname = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPathname);
  };

  const rows = [
    { id: '1', name: 'أحمد علي', age: 30 },
    { id: '2', name: 'سارة محمد', age: 25 },
    { id: '3', name: 'خالد يوسف', age: 40 },
    { id: '4', name: 'ليلى إبراهيم', age: 22 },
    { id: '5', name: 'عمر محمود', age: 35 },
  ];

  const headers = [
    { key: 'name', header: t('name_header') },
    { key: 'age', header: t('age_header') },
  ];

  return (
    <div style={{ padding: '2rem' }}>
      <Header aria-label="NutriClinicEG">
        <HeaderName href="/" prefix="NutriClinicEG">
          {t('title')}
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction 
            aria-label={locale === 'ar' ? 'Switch to English' : 'التحويل للعربية'}
            onClick={() => switchLocale(locale === 'ar' ? 'en' : 'ar')}
          >
            <Language />
            {commonT(locale === 'ar' ? 'switch_to_english' : 'switch_to_arabic')}
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label="Notifications">
            <Notification />
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label="User">
            <User />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>
      
      <main style={{ marginTop: '3rem' }}>
        <InlineNotification
          kind="info"
          title={t('info_title')}
          subtitle={t('info_subtitle')}
          hideCloseButton
        />
        
        <div style={{ marginTop: '1rem' }}>
          <Button>{t('button')}</Button>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <DataTable rows={rows} headers={headers}>
            {({ rows, headers, getHeaderProps, getRowProps, getCellProps }) => (
              <TableContainer title={t('title')}>
                <Table>
                  <TableHead>
                    <TableRow>
                      {headers.map((header) => (
                        <React.Fragment key={header.key}>
                          <TableHeader {...getHeaderProps({ header })}>
                            {header.header}
                          </TableHeader>
                        </React.Fragment>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow {...getRowProps({ row })}>
                        {row.cells.map((cell) => (
                          <React.Fragment key={cell.id}>
                            <TableCell {...getCellProps({ cell })}>
                              {cell.value}
                            </TableCell>
                          </React.Fragment>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        </div>
      </main>
    </div>
  );
}
