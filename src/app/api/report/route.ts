import { NextResponse, type NextRequest } from 'next/server';
import { generateFengshuiReport } from '@/lib/fengshuiReport';
import { reportCacheKey, getCachedReport, setCachedReport } from '@/lib/reportCache';
import { type TerrainAnalysis } from '@/types/terrain';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

/**
 * POST /api/report — 지형 분석 결과(TerrainAnalysis)로 풍수 해석 리포트 생성.
 * body: { analysis: TerrainAnalysis, name?, customer? }
 */
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY 가 설정되지 않았습니다. (.env.local 확인)' },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const { analysis, name, customer, measurementNote } = (body ?? {}) as {
    analysis?: TerrainAnalysis;
    name?: string;
    customer?: string;
    measurementNote?: string;
  };

  if (!analysis || typeof analysis.slopeDeg !== 'number') {
    return NextResponse.json(
      { error: '지형 분석 결과(analysis)가 필요합니다.' },
      { status: 400 },
    );
  }

  const site = {
    name,
    customer,
    measurementNote: typeof measurementNote === 'string' ? measurementNote : undefined,
  };

  // 좌표(리포트) 캐싱: 동일 입력이면 저장된 리포트 재사용 → Claude 재호출 없음
  const cacheKey = reportCacheKey(MODEL, { analysis, ...site });
  const cached = await getCachedReport(cacheKey);
  if (cached) {
    return NextResponse.json({ report: cached, cached: true });
  }

  try {
    const report = await generateFengshuiReport(analysis, site);
    await setCachedReport(cacheKey, report);
    return NextResponse.json({ report, cached: false });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.error('[report] 생성 실패:', err.message);
    // 크레딧 부족/인증 등 Anthropic 오류를 사용자에게 전달
    const msg =
      err.status === 400 || err.status === 401 || err.status === 403
        ? `Claude API 오류: ${err.message ?? '요청이 거부되었습니다.'} (크레딧 잔액·키 확인)`
        : '풍수 리포트 생성 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
