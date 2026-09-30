import { redirect } from 'next/navigation';
import { getSession } from '@/lib/security/session';
import AdminFoodRequestsClient from './_client';

export default async function AdminFoodRequestsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'super_admin')) {
    redirect(`/${locale}/dashboard`);
  }
  return <AdminFoodRequestsClient />;
}
