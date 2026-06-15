import { NextResponse, type NextRequest } from 'next/server';
import { readSites, writeSites } from '@/lib/sitesStore';
import { type Site } from '@/types/site';

// DELETE /api/sites/[id] — 묘역 삭제
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sites = await readSites();
  const next = sites.filter((s) => s.id !== id);

  if (next.length === sites.length) {
    return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 });
  }

  await writeSites(next);
  return NextResponse.json({ ok: true });
}

// PATCH /api/sites/[id] — 묘역명/고객명/메모 수정 (메모장 기능 확장용)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const sites = await readSites();
  const idx = sites.findIndex((s) => s.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 });
  }

  const current = sites[idx];
  const updated: Site = {
    ...current,
    name: body.name !== undefined ? String(body.name).trim() || current.name : current.name,
    customer: body.customer !== undefined ? String(body.customer).trim() : current.customer,
    memo: body.memo !== undefined ? String(body.memo).trim() : current.memo,
  };
  sites[idx] = updated;
  await writeSites(sites);

  return NextResponse.json(updated);
}
