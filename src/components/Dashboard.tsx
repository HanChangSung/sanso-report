'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import VworldMap from './VworldMap';
import TerrainPanel from './TerrainPanel';
import LocationInput from './LocationInput';
import { type Site } from '@/types/site';

type Coord = { lng: number; lat: number };

export default function Dashboard() {
  const [sites, setSites] = useState<Site[]>([]);
  // 신청자(유족) 모드 — 산소ON 추모단 딥링크(?src=sansoon 또는 ?owner=)로 진입한 경우.
  // 이때는 상담용 저장 목록(대표님 CRM: 고객명·메모)을 숨기고,
  // 넘어온 좌표의 풍수 리포트만 보여준다. base URL(관리자)은 기존 그대로 전체 작업공간.
  const [applicantMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const p = new URLSearchParams(window.location.search);
    return p.get('src') === 'sansoon' || !!p.get('owner');
  });
  const [pending, setPending] = useState<Coord | null>(null);
  const [flyTo, setFlyTo] = useState<Coord | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSites = useCallback(async () => {
    const res = await fetch('/api/sites');
    if (res.ok) setSites(await res.json());
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  // 외부(산소ON 등)에서 URL 파라미터로 진입 시 그 좌표를 자동 선택 + 지도 이동
  //   예) /?lat=36.2427&lng=128.573&label=홍길동&src=sansoon
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const lat = parseFloat(p.get('lat') ?? '');
    const lng = parseFloat(p.get('lng') ?? '');
    const label = p.get('label');
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setPending({ lng, lat });
      setFlyTo({ lng, lat });
      if (label) setName(label);
    }
  }, []);

  // 지도 클릭 → 임시 좌표 선택 (새 핀이므로 선택 해제)
  const handlePick = useCallback((lng: number, lat: number) => {
    setPending({ lng, lat });
    setSelectedId(null);
  }, []);

  // 주소검색/좌표입력/사진 → 임시 좌표 선택 + 지도 이동
  const handleLocate = useCallback((lng: number, lat: number) => {
    setPending({ lng, lat });
    setFlyTo({ lng, lat });
  }, []);

  // 저장
  const handleSave = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, customer, memo, lng: pending.lng, lat: pending.lat }),
      });
      if (res.ok) {
        await loadSites();
        setPending(null);
        setName('');
        setCustomer('');
        setMemo('');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`저장 실패: ${err.error ?? res.status}`);
      }
    } finally {
      setSaving(false);
    }
  };

  // 목록에서 위치 보기 → 지도 이동 + 해당 좌표 지형분석(측정값 있으면 반영)
  const handleView = (site: Site) => {
    setSelectedId(site.id);
    setFlyTo({ lng: site.lng, lat: site.lat });
    setPending({ lng: site.lng, lat: site.lat });
  };

  // 삭제
  const handleDelete = async (id: string) => {
    if (!confirm('이 묘역 좌표를 삭제하시겠습니까?')) return;
    const res = await fetch(`/api/sites/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadSites();
      if (selectedId === id) setSelectedId(null);
    }
  };

  const selectedSite = sites.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="flex h-[100dvh] w-full flex-col-reverse overflow-hidden md:flex-row">
      {/* 사이드바 (모바일: 지도 아래, 데스크톱: 좌측) */}
      <aside className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto border-t border-gray-200 bg-white md:h-[100dvh] md:w-96 md:flex-none md:border-t-0 md:border-r">
        <header className="flex items-start justify-between gap-2 border-b border-gray-200 px-5 py-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">산소 리포트</h1>
            <p className="text-xs text-gray-500">
              {applicantMode ? '묘소 명당 분석 리포트' : '디지털 묘지 명당 분석 · 상담 대시보드'}
            </p>
          </div>
          {!applicantMode && (
            <Link
              href="/compass"
              className="shrink-0 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              현장 패철 (AR)
            </Link>
          )}
        </header>

        {/* 좌표 저장 폼 — 관리자 전용 (신청자 모드에서는 숨김) */}
        {!applicantMode && (
        <section className="border-b border-gray-200 px-5 py-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">묘역 좌표 저장</h2>

          {/* 위치 지정: 주소검색 / 위경도 / 사진 (지도 클릭 외 보조 수단) */}
          <div className="mb-3">
            <LocationInput onLocate={handleLocate} />
          </div>

          <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-xs font-mono text-gray-700">
            {pending ? (
              <>
                위도 {pending.lat.toFixed(6)} / 경도 {pending.lng.toFixed(6)}
              </>
            ) : (
              <span className="text-gray-400">지도를 클릭해 좌표를 선택하세요</span>
            )}
          </div>

          <div className="space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="묘역명 / 위치 (예: 울산공원묘지 A구역 12번)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="고객명 (선택)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="상담 메모 (선택)"
              rows={2}
              className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSave}
              disabled={!pending || saving}
              className="w-full rounded-md bg-blue-600 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saving ? '저장 중…' : '좌표 저장'}
            </button>
          </div>
        </section>
        )}

        {/* 지형 분석 (클릭 좌표 기준, 측정값 있으면 실측 반영) */}
        <TerrainPanel
          coord={pending}
          siteName={name || selectedSite?.name}
          customer={customer || selectedSite?.customer}
          measurement={selectedSite?.measurement}
        />

        {/* 저장된 묘역 목록 — 관리자 전용 (신청자 모드에서는 숨김: 다른 고객 좌표 노출 방지) */}
        {!applicantMode && (
        <section className="flex flex-col">
          <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-gray-700">
            저장된 묘역 <span className="text-gray-400">({sites.length})</span>
          </h2>
          <ul className="px-3 pb-4">
            {sites.length === 0 && (
              <li className="px-2 py-6 text-center text-xs text-gray-400">
                저장된 묘역이 없습니다.
              </li>
            )}
            {sites.map((s) => (
              <li
                key={s.id}
                className={`mb-1.5 rounded-md border px-3 py-2 transition ${
                  selectedId === s.id
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {s.name}
                      {s.measurement && (
                        <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          측정됨
                        </span>
                      )}
                    </p>
                    {s.customer && (
                      <p className="truncate text-xs text-gray-500">고객: {s.customer}</p>
                    )}
                    <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                      {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                    </p>
                    {s.memo && <p className="mt-1 line-clamp-2 text-xs text-gray-600">{s.memo}</p>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => handleView(s)}
                    className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    보기
                  </button>
                  <Link
                    href={`/compass?siteId=${s.id}&name=${encodeURIComponent(s.name)}`}
                    className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    현장측정
                  </Link>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        )}
      </aside>

      {/* 지도 (모바일: 상단 고정 높이, 데스크톱: 우측 전체) */}
      <main className="relative h-[45dvh] shrink-0 md:h-auto md:flex-1">
        <VworldMap
          sites={applicantMode ? [] : sites}
          pending={pending}
          flyTo={flyTo}
          onPick={handlePick}
          onSelectSite={handleView}
        />
      </main>
    </div>
  );
}
