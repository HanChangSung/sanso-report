'use client';

import { useEffect, useRef, useState } from 'react';
import { type Direction8, type TerrainAnalysis } from '@/types/terrain';
import { type GraveMeasurement } from '@/types/site';
import { compassReading, MOUNTAINS_24 } from '@/lib/luopan';
import { resolveMeasurement } from '@/lib/measurement';
import ReportPrint from './ReportPrint';

type Coord = { lng: number; lat: number };

// 3x3 그리드 배치 (중심 제외) — 방위별 상대고도 미니맵용
const GRID: (Direction8 | 'C')[] = ['NW', 'N', 'NE', 'W', 'C', 'E', 'SW', 'S', 'SE'];

/** 상대고도(+높음/-낮음)에 따른 셀 색상 */
function reliefColor(v: number | null): string {
  if (v == null) return 'bg-gray-100 text-gray-300';
  if (v >= 8) return 'bg-amber-300 text-amber-900';
  if (v >= 2) return 'bg-amber-100 text-amber-800';
  if (v > -2) return 'bg-gray-100 text-gray-600';
  if (v > -8) return 'bg-sky-100 text-sky-800';
  return 'bg-sky-300 text-sky-900';
}

export default function TerrainPanel({
  coord,
  siteName,
  customer,
  measurement,
}: {
  coord: Coord | null;
  siteName?: string;
  customer?: string;
  measurement?: GraveMeasurement;
}) {
  const [data, setData] = useState<TerrainAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 풍수 리포트(Claude) 생성 상태
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // 리포트가 생성/실패하면 화면 밖으로 밀리지 않도록 해당 위치로 스크롤
  useEffect(() => {
    if (report || reportError) {
      reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [report, reportError]);

  // 파구(수구) 수정 → 패철·포태 재계산 (코드가 결정론적으로 계산). 기존 리포트는 무효화.
  const handlePaguChange = (val: string) => {
    if (!data) return;
    const paguDeg = val === 'auto' ? data.aspectDeg : Number(val);
    const source = val === 'auto' ? 'estimated' : 'manual';
    setData({ ...data, compass: compassReading(data.aspectDeg, paguDeg, source) });
    setReport(null);
    setReportError(null);
  };

  const handleGenerateReport = async () => {
    if (!data) return;
    setReportLoading(true);
    setReportError(null);
    setReport(null);
    try {
      const rm = measurement ? resolveMeasurement(measurement) : null;
      const measurementNote =
        rm?.hyangDeg != null
          ? `현장 2점(묘 상단·하단) 패철 실측 반영. 측정 향 ${rm.hyangDeg}°` +
            (rm.baselineDistM != null ? `, 축길이 ${rm.baselineDistM}m` : '') +
            (rm.elevDiff != null ? `, 상단-하단 표고차 ${rm.elevDiff}m` : '') +
            '.'
          : undefined;
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis: data, name: siteName, customer, measurementNote }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `생성 실패 (${res.status})`);
      setReport(json.report as string);
    } catch (e) {
      setReportError((e as Error).message);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (!coord) {
      setData(null);
      setError(null);
      return;
    }
    // 좌표가 바뀌면 이전 리포트 초기화
    setReport(null);
    setReportError(null);
    let cancelled = false;
    setLoading(true);
    setError(null);

    // 현장 2점 실측이 있으면 향·경사·배산임수를 실측값으로 덮어쓰도록 전달
    const rm = measurement ? resolveMeasurement(measurement) : null;
    const body: Record<string, number | boolean> = { lng: coord.lng, lat: coord.lat };
    if (rm?.hyangDeg != null) {
      body.hyangDeg = rm.hyangDeg;
      if (rm.axisSlopeDeg != null) body.axisSlopeDeg = rm.axisSlopeDeg;
      if (rm.baesanImsu != null) body.baesanImsu = rm.baesanImsu;
    }

    fetch('/api/terrain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error ?? `분석 실패 (${res.status})`);
        }
        return res.json() as Promise<TerrainAnalysis>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coord, measurement]);

  if (!coord) return null;

  return (
    <section className="border-b border-gray-200 px-5 py-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-700">지형 분석</h2>
        {data?.labels.includes('현장 2점 실측 반영') && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            현장 2점 실측 반영
          </span>
        )}
      </div>

      {loading && <p className="text-xs text-gray-400">표고 데이터를 분석 중…</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {data && !loading && (
        <div className="space-y-3">
          {/* 핵심 수치 */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-gray-50 px-2.5 py-1.5">
              <span className="text-gray-400">표고</span>
              <span className="ml-1 font-mono font-semibold text-gray-800">
                {data.centerElevation} m
              </span>
            </div>
            <div className="rounded-md bg-gray-50 px-2.5 py-1.5">
              <span className="text-gray-400">경사</span>
              <span className="ml-1 font-mono font-semibold text-gray-800">
                {data.slopeDeg}°
              </span>
            </div>
            <div className="col-span-2 rounded-md bg-gray-50 px-2.5 py-1.5">
              <span className="text-gray-400">좌향</span>
              <span className="ml-1 font-semibold text-gray-800">
                {data.orientationLabel}
              </span>
              <span className="ml-1 font-mono text-gray-400">({data.aspectDeg}°)</span>
            </div>
          </div>

          {/* 장풍 점수 바 */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-gray-500">장풍 점수</span>
              <span className="font-mono font-semibold text-gray-800">
                {data.jangpungScore} / 100
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full ${
                  data.jangpungScore >= 70
                    ? 'bg-emerald-500'
                    : data.jangpungScore >= 40
                      ? 'bg-amber-500'
                      : 'bg-gray-400'
                }`}
                style={{ width: `${data.jangpungScore}%` }}
              />
            </div>
          </div>

          {/* 방위별 상대고도 미니맵 (+높음/-낮음) */}
          <div className="flex items-center gap-3">
            <div className="grid grid-cols-3 gap-0.5">
              {GRID.map((cell) => {
                if (cell === 'C') {
                  return (
                    <div
                      key="C"
                      className="flex h-9 w-9 items-center justify-center rounded bg-gray-800 text-[10px] font-bold text-white"
                    >
                      묘
                    </div>
                  );
                }
                const v = data.relief[cell];
                return (
                  <div
                    key={cell}
                    className={`flex h-9 w-9 items-center justify-center rounded text-[10px] font-mono ${reliefColor(v)}`}
                    title={cell}
                  >
                    {v == null ? '—' : v > 0 ? `+${v}` : v}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] leading-relaxed text-gray-400">
              주변 80m 지점의
              <br />
              상대고도 (m)
              <br />
              <span className="text-amber-600">주황=높음</span> /{' '}
              <span className="text-sky-600">파랑=낮음</span>
            </p>
          </div>

          {/* 1차 룰 판정 라벨 */}
          <div className="flex flex-wrap gap-1">
            {data.labels.map((l) => (
              <span
                key={l}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700"
              >
                {l}
              </span>
            ))}
          </div>

          {/* 패철 24방위 · 12포태(88향법) */}
          <div className="rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">패철 좌향 · 포태</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  data.compass.hyangFortune === '길'
                    ? 'bg-emerald-100 text-emerald-700'
                    : data.compass.hyangFortune === '평'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                }`}
              >
                향 {data.compass.hyangPotae} · {data.compass.hyangFortune}
              </span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
              <dt className="text-gray-400">좌향</dt>
              <dd className="font-medium text-gray-800">
                {data.compass.jwaHyangLabel}{' '}
                <span className="font-mono text-gray-400">({data.compass.jwaHyangHanja})</span>
              </dd>
              <dt className="text-gray-400">사국</dt>
              <dd className="text-gray-800">
                {data.compass.saguk} ({data.compass.sagukHanja}) · 묘고 {data.compass.myo}
              </dd>
              <dt className="text-gray-400">포태</dt>
              <dd className="text-gray-800">
                향 {data.compass.hyangPotae} / 파구 {data.compass.paguPotae}
              </dd>
            </dl>

            {/* 파구(수구) 방위 — 지형 추정 / 현장 실측 수정 */}
            <div className="mt-2 flex items-center gap-1.5">
              <label className="whitespace-nowrap text-[11px] text-gray-400">파구</label>
              <select
                value={
                  data.compass.paguSource === 'estimated'
                    ? 'auto'
                    : String(data.compass.pagu.centerDeg)
                }
                onChange={(e) => handlePaguChange(e.target.value)}
                className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px] text-gray-700 outline-none focus:border-blue-500"
              >
                <option value="auto">지형 추정 ({data.compass.pagu.kor} 방, 자동)</option>
                {MOUNTAINS_24.map((m) => (
                  <option key={m.index} value={m.deg}>
                    {m.label} {m.deg}°
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
              {data.compass.paguSource === 'estimated'
                ? '지형 내리막으로 추정한 파구입니다. 현장 패철 실측값으로 수정하면 사국·포태가 재계산됩니다.'
                : '현장 실측 파구 기준으로 재계산된 값입니다.'}
            </p>
          </div>

          {/* 풍수 리포트 생성 (Claude) */}
          <div className="border-t border-gray-100 pt-3">
            <button
              onClick={handleGenerateReport}
              disabled={reportLoading}
              className="w-full rounded-md bg-emerald-600 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {reportLoading ? '풍수 해석문 작성 중…' : '풍수 리포트 생성'}
            </button>
            {reportError && (
              <p ref={reportRef} className="mt-2 text-xs text-red-500">
                {reportError}
              </p>
            )}
            {report && (
              <div
                ref={reportRef}
                className="mt-2 whitespace-pre-wrap rounded-md bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-gray-800"
              >
                {report}
              </div>
            )}
          </div>

          {/* 상담 리포트 출력 (브라우저 인쇄 → PDF로 저장) */}
          <button
            onClick={() => window.print()}
            className="w-full rounded-md border border-gray-800 bg-gray-800 py-2 text-sm font-semibold text-white transition hover:bg-gray-900"
          >
            상담 리포트 출력 (인쇄 / PDF)
          </button>

          <p className="text-[10px] text-gray-300">
            표고 출처: OpenTopoData SRTM 30m · 해석문: Claude (전통 풍수 + 지형데이터)
          </p>
        </div>
      )}

      {/* 인쇄 전용 문서 (화면에서는 숨김) */}
      {coord && data && (
        <ReportPrint
          analysis={data}
          coord={coord}
          report={report}
          siteName={siteName}
          customer={customer}
          measurement={measurement}
        />
      )}
    </section>
  );
}
