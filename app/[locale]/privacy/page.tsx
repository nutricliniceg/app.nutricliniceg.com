import { legalPage } from '@/lib/cms/legal';

// Rendered as plain text (whitespace-pre-line, no dangerouslySetInnerHTML)
// so CMS copy can never inject scripts into a public page.
export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { title, body } = await legalPage('privacy', locale);
  return (
    <main>
      <h1>{title}</h1>
      <p style={{ whiteSpace: 'pre-line' }}>{body}</p>
    </main>
  );
}
