'use client';

import { type Direction8, type TerrainAnalysis } from '@/types/terrain';
import { type GraveMeasurement } from '@/types/site';
import { DIRECTIONS_8, KOR_DIR } from '@/lib/geo';
import { resolveMeasurement } from '@/lib/measurement';

type Coord = { lng: number; lat: number };

interface Props {
  analysis: TerrainAnalysis;
  coord: Coord;
  report: string | null;
  siteName?: string;
  customer?: string;
  measurement?: GraveMeasurement;
}

/** 인쇄(Save as PDF) 전용 상담 리포트 문서. 화면에서는 #report-print 규칙으로 숨김. */
export default function ReportPrint({ analysis: a, coord, report, siteName, customer, measurement }: Props) {
  const rm = measurement ? resolveMeasurement(measurement) : null;
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const cell = 'border border-gray-400 px-2 py-1 text-left align-top';
  const head = 'border border-gray-400 bg-gray-100 px-2 py-1 text-left font-semibold whitespace-nowrap';

  return (
    <div id="report-print" className="mx-auto max-w-[180mm] p-8 text-[13px] leading-relaxed text-black">
      {/* 제목 */}
      <div className="mb-5 border-b-2 border-gray-800 pb-3">
        <h1 className="text-2xl font-bold">산소 리포트 — 풍수 지형 분석 상담 자료</h1>
        <p className="mt-1 text-xs text-gray-500">작성일: {today}</p>
      </div>

      {/* 묘역 정보 */}
      <h2 className="mb-2 text-base font-bold">1. 묘역 정보</h2>
      <table className="mb-5 w-full border-collapse">
        <tbody>
          <tr>
            <th className={head}>묘역명</th>
            <td className={cell}>{siteName?.trim() || '—'}</td>
            <th className={head}>고객</th>
            <td className={cell}>{customer?.trim() || '—'}</td>
          </tr>
          <tr>
            <th className={head}>좌표</th>
            <td className={cell}>
              위도 {coord.lat.toFixed(6)} / 경도 {coord.lng.toFixed(6)}
            </td>
            <th className={head}>표고</th>
            <td className={cell}>{a.centerElevation} m</td>
          </tr>
        </tbody>
      </table>

      {/* 지형 분석 */}
      <h2 className="mb-2 text-base font-bold">2. 지형 분석</h2>
      <table className="mb-3 w-full border-collapse">
        <tbody>
          <tr>
            <th className={head}>경사도</th>
            <td className={cell}>
              {a.slopeDeg}° ({a.labels[0]})
            </td>
            <th className={head}>좌향(방위)</th>
            <td className={cell}>
              {a.orientationLabel} (향 {a.aspectDeg}°)
            </td>
          </tr>
          <tr>
            <th className={head}>배산임수</th>
            <td className={cell}>{a.baesanImsu ? '충족 (뒤가 높고 앞이 트임)' : '미흡'}</td>
            <th className={head}>장풍 점수</th>
            <td className={cell}>{a.jangpungScore} / 100</td>
          </tr>
        </tbody>
      </table>

      {/* 방위별 상대고도 */}
      <p className="mb-1 text-sm font-semibold">방위별 상대고도 (중심 대비, +면 주변이 더 높음)</p>
      <table className="mb-5 w-full border-collapse text-center">
        <thead>
          <tr>
            {DIRECTIONS_8.map((d) => (
              <th key={d} className={head + ' text-center'}>
                {KOR_DIR[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {DIRECTIONS_8.map((d: Direction8) => {
              const v = a.relief[d];
              return (
                <td key={d} className={cell + ' text-center'}>
                  {v == null ? '—' : `${v > 0 ? '+' : ''}${v}m`}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      {/* 패철 좌향 · 12포태 */}
      <p className="mb-1 text-sm font-semibold">패철 좌향 · 12포태(88향법)</p>
      <table className="mb-1 w-full border-collapse">
        <tbody>
          <tr>
            <th className={head}>좌향(24산)</th>
            <td className={cell}>
              {a.compass.jwaHyangLabel} ({a.compass.jwaHyangHanja})
            </td>
            <th className={head}>사국</th>
            <td className={cell}>
              {a.compass.saguk} ({a.compass.sagukHanja}) · 묘고 {a.compass.myo}
            </td>
          </tr>
          <tr>
            <th className={head}>파구(수구)</th>
            <td className={cell}>
              {a.compass.pagu.kor}({a.compass.pagu.hanja}) {a.compass.paguDeg}° (
              {a.compass.paguSource === 'estimated' ? '지형 추정' : '현장 실측'})
            </td>
            <th className={head}>12포태</th>
            <td className={cell}>
              향 {a.compass.hyangPotae} / 파구 {a.compass.paguPotae} ({a.compass.hyangFortune})
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mb-3 text-[11px] text-gray-500">※ {a.compass.note}</p>

      {/* 현장 2점 실측 */}
      {measurement && rm && (
        <>
          <p className="mb-1 text-sm font-semibold">현장 2점 패철 실측</p>
          <table className="mb-5 w-full border-collapse">
            <tbody>
              <tr>
                <th className={head}>상단부(뒤)</th>
                <td className={cell}>
                  {measurement.top.lat.toFixed(6)}, {measurement.top.lng.toFixed(6)}
                  {measurement.top.elevation != null && ` · ${measurement.top.elevation}m`}
                  {measurement.top.heading != null && ` · 향 ${Math.round(measurement.top.heading)}°`}
                </td>
                <th className={head}>하단부(앞)</th>
                <td className={cell}>
                  {measurement.bottom.lat.toFixed(6)}, {measurement.bottom.lng.toFixed(6)}
                  {measurement.bottom.elevation != null && ` · ${measurement.bottom.elevation}m`}
                  {measurement.bottom.heading != null &&
                    ` · 향 ${Math.round(measurement.bottom.heading)}°`}
                </td>
              </tr>
              <tr>
                <th className={head}>측정 향</th>
                <td className={cell}>
                  {rm.hyangDeg != null ? `${rm.hyangDeg}°` : '—'}{' '}
                  ({rm.source === 'compass' ? '패철 헤딩' : rm.source === 'gps' ? 'GPS 방위' : '—'})
                </td>
                <th className={head}>축길이 / 표고차</th>
                <td className={cell}>
                  {rm.baselineDistM != null ? `${rm.baselineDistM}m` : '—'} /{' '}
                  {rm.elevDiff != null ? `상단 ${rm.elevDiff > 0 ? '+' : ''}${rm.elevDiff}m` : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* 비보(裨補) 석물 배치 */}
      <p className="mb-1 text-sm font-semibold">비보(裨補) 석물 배치 가이드</p>
      <p className="mb-1 text-[12px] text-gray-700">{a.bibo.summary}</p>
      {a.bibo.items.length > 0 && (
        <table className="mb-5 w-full border-collapse">
          <thead>
            <tr>
              <th className={head + ' text-center'}>방위</th>
              <th className={head}>위치</th>
              <th className={head}>설치물</th>
              <th className={head}>효과</th>
            </tr>
          </thead>
          <tbody>
            {a.bibo.items.map((b) => (
              <tr key={b.dir}>
                <td className={cell + ' whitespace-nowrap text-center'}>
                  {b.dirKor} {b.bearingDeg}°<br />
                  <span className="text-[11px] text-gray-500">
                    {b.role} · {b.relief}m
                  </span>
                </td>
                <td className={cell}>
                  {b.distance} {b.dirKor}쪽
                </td>
                <td className={cell}>{b.remedy}</td>
                <td className={cell}>{b.effect}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 풍수 해석 */}
      <h2 className="mb-2 text-base font-bold">3. 풍수 해석</h2>
      {report ? (
        <div className="mb-5 whitespace-pre-wrap rounded border border-gray-300 p-3">{report}</div>
      ) : (
        <p className="mb-5 rounded border border-dashed border-gray-300 p-3 text-gray-500">
          풍수 해석문이 아직 생성되지 않았습니다. (Claude 크레딧 충전 후 “풍수 리포트 생성”으로 작성)
        </p>
      )}

      {/* 출처 */}
      <div className="mt-8 border-t border-gray-300 pt-3 text-xs text-gray-500">
        <p>지도: VWorld · 표고: OpenTopoData SRTM 30m · 해석: 전통 풍수지리 + Claude</p>
        <p className="mt-0.5">본 자료는 전통 풍수 이론과 현대 지형데이터를 결합한 참고용 상담 자료입니다.</p>
        <p className="mt-1 font-semibold text-gray-700">산소 리포트</p>
      </div>
    </div>
  );
}
