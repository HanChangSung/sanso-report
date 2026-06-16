import { NextResponse, type NextRequest } from 'next/server';
import { readSites, writeSites } from '@/lib/sitesStore';
import { type GraveMeasurement, type PointReading, type Site } from '@/types/site';

/** 신뢰할 수 없는 입력을 PointReading 으로 정규화 */
function toPoint(v: unknown): PointReading | null {
  const p = (v ?? {}) as Record<string, unknown>;
  if (typeof p.lng !== 'number' || typeof p.lat !== 'number') return null;
  return {
    lng: p.lng,
    lat: p.lat,
    elevation: typeof p.elevation === 'number' ? p.elevation : null,
    heading: typeof p.heading === 'number' ? p.heading : null,
    accuracy: typeof p.accuracy === 'number' ? p.accuracy : null,
  };
}

function toMeasurement(v: unknown): GraveMeasurement | null | undefined {
  if (v === null) return null; // 명시적 삭제
  if (v === undefined) return undefined;
  const m = v as Record<string, unknown>;
  const top = toPoint(m.top);
  const bottom = toPoint(m.bottom);
  if (!top || !bottom) return undefined;
  return {
    top,
    bottom,
    measuredAt: typeof m.measuredAt === 'string' ? m.measuredAt : new Date().toISOString(),
  };
}

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
  const measurement = toMeasurement(body.measurement);
  const updated: Site = {
    ...current,
    name: body.name !== undefined ? String(body.name).trim() || current.name : current.name,
    customer: body.customer !== undefined ? String(body.customer).trim() : current.customer,
    memo: body.memo !== undefined ? String(body.memo).trim() : current.memo,
    // measurement: 객체면 갱신, null이면 삭제, undefined면 유지
    ...(body.measurement !== undefined
      ? { measurement: measurement ?? undefined }
      : {}),
  };
  sites[idx] = updated;
  await writeSites(sites);

  return NextResponse.json(updated);
}
