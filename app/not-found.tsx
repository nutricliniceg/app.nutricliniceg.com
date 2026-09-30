import Link from 'next/link';

export default function NotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: 'system-ui', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ color: '#008080' }}>الصفحة غير موجودة</h1>
        <p>الصفحة التي تبحث عنها غير موجودة أو تم نقلها.</p>
        <Link href="/ar" style={{ color: '#008080', textDecoration: 'underline' }}>
          العودة للرئيسية
        </Link>
      </body>
    </html>
  );
}