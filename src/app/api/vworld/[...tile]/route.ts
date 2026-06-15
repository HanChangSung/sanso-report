import { type NextRequest } from 'next/server';

// 인증키는 서버에서만 사용 (클라이언트에 노출되지 않음)
const VWORLD_KEY =
  process.env.VWORLD_KEY ?? process.env.NEXT_PUBLIC_VWORLD_KEY ?? '';
const VWORLD_BASE = 'https://api.vworld.kr/req/wmts/1.0.0';

// VWorld 키에 등록된 도메인 (Referer 검증 통과용)
const REFERER = process.env.VWORLD_REFERER ?? 'http://localhost:3000/';

// 1x1 투명 PNG — 상류 응답이 이미지가 아닐 때 대체 반환하여
// MapLibre 의 "source image could not be decoded" 에러를 원천 차단
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

function transparentTile() {
  return new Response(TRANSPARENT_PNG, {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tile: string[] }> }
) {
  const { tile } = await params;
  // tile 예: ['Base', '14', '6460', '14069.png']
  const path = tile.join('/');
  const url = `${VWORLD_BASE}/${VWORLD_KEY}/${path}`;

  if (!VWORLD_KEY) {
    console.warn('[vworld proxy] VWORLD_KEY 가 설정되지 않았습니다.');
    return transparentTile();
  }

  try {
    const upstream = await fetch(url, { headers: { Referer: REFERER } });
    const contentType = upstream.headers.get('content-type') ?? '';

    // 이미지가 아니면(에러 XML 등) 투명 타일로 대체
    if (!upstream.ok || !contentType.startsWith('image/')) {
      return transparentTile();
    }

    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // 브라우저 + CDN 캐싱 (3일)
        'Cache-Control': 'public, max-age=259200, immutable',
      },
    });
  } catch {
    return transparentTile();
  }
}
