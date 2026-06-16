import CompassField from '@/components/CompassField';

export const metadata = {
  title: '현장 패철 (AR) · 산소 리포트',
};

export default async function CompassPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string; name?: string }>;
}) {
  const { siteId, name } = await searchParams;
  return <CompassField siteId={siteId} siteName={name} />;
}
