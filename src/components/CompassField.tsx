'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { cameraHeadingFromEuler, angularDelta } from '@/lib/orientation';
import { to24, compassReading, MOUNTAINS_24 } from '@/lib/luopan';
import { resolveMeasurement } from '@/lib/measurement';
import { type PointReading } from '@/types/site';

type Phase = 'idle' | 'running' | 'error';

interface OrientationEventLike extends Event {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  webkitCompassHeading?: number;
}

const PX_PER_DEG = 4;
const RIBBON_SPAN = 70;

export default function CompassField({
  siteId,
  siteName,
}: {
  siteId?: string;
  siteName?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);

  const [top, setTop] = useState<PointReading | null>(null);
  const [bottom, setBottom] = useState<PointReading | null>(null);
  const [busy, setBusy] = useState<'top' | 'bottom' | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newName, setNewName] = useState(''); // 새 묘역 이름 (묘역 미지정 시)

  const corrected = heading == null ? null : ((heading + offset) % 360 + 360) % 360;

  // --- 센서/카메라 시작 ---
  const start = useCallback(async () => {
    setError(null);
    try {
      const DOE = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (DOE && typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res !== 'granted') throw new Error('방위 센서 권한이 거부되었습니다.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase('running');
    } catch (e) {
      setError((e as Error).message || '센서/카메라를 시작할 수 없습니다.');
      setPhase('error');
    }
  }, []);

  // --- 방위 이벤트 ---
  useEffect(() => {
    if (phase !== 'running') return;
    const handle = (ev: Event) => {
      const e = ev as OrientationEventLike;
      if (typeof e.webkitCompassHeading === 'number') {
        setHeading(e.webkitCompassHeading);
        return;
      }
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      setHeading(cameraHeadingFromEuler(e.alpha, e.beta, e.gamma));
    };
    window.addEventListener('deviceorientationabsolute', handle as EventListener);
    window.addEventListener('deviceorientation', handle as EventListener);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handle as EventListener);
      window.removeEventListener('deviceorientation', handle as EventListener);
    };
  }, [phase]);

  // --- 정리 ---
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --- 한 지점 측정: GPS + 현재 방위 + 표고 ---
  const capturePoint = useCallback(
    async (which: 'top' | 'bottom') => {
      if (corrected == null) {
        setError('방위가 아직 잡히지 않았습니다. 잠시 후 다시 시도하세요.');
        return;
      }
      setBusy(which);
      setError(null);
      setSaveState('idle');
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 0,
          }),
        );
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        const accuracy = pos.coords.accuracy ?? null;

        let elevation: number | null = null;
        try {
          const res = await fetch('/api/elevation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: [{ lng, lat }] }),
          });
          if (res.ok) elevation = (await res.json()).elevations?.[0] ?? null;
        } catch {
          /* 표고 실패는 무시 (배산임수 비교만 제한됨) */
        }

        const reading: PointReading = {
          lng,
          lat,
          elevation,
          heading: Math.round(corrected * 10) / 10,
          accuracy: accuracy == null ? null : Math.round(accuracy),
        };
        if (which === 'top') setTop(reading);
        else setBottom(reading);
      } catch (e) {
        const err = e as GeolocationPositionError;
        setError(
          err?.code === 1
            ? '위치 권한이 거부되었습니다. 허용 후 다시 시도하세요.'
            : '위치를 가져오지 못했습니다. (실외에서 GPS 신호 확인)',
        );
      } finally {
        setBusy(null);
      }
    },
    [corrected],
  );

  // --- 측정 종합 ---
  const summary = useMemo(() => {
    if (!top || !bottom) return null;
    const m = { top, bottom, measuredAt: '' };
    const r = resolveMeasurement(m);
    if (r.hyangDeg == null) return { r, reading: null };
    const reading = compassReading(r.hyangDeg, r.hyangDeg, 'estimated');
    return { r, reading };
  }, [top, bottom]);

  // --- 기존 묘역에 저장 (PATCH) ---
  const save = useCallback(async () => {
    if (!siteId || !top || !bottom) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          measurement: { top, bottom, measuredAt: new Date().toISOString() },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `저장 실패 (${res.status})`);
      }
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      setSaveError((e as Error).message);
    }
  }, [siteId, top, bottom]);

  // --- 새 묘역으로 저장 (POST) — 좌표는 두 측정점의 중점 ---
  const saveNew = useCallback(async () => {
    if (!top || !bottom) return;
    if (!newName.trim()) {
      setSaveError('묘역 이름을 입력하세요.');
      return;
    }
    setSaveState('saving');
    setSaveError(null);
    try {
      const lng = (top.lng + bottom.lng) / 2;
      const lat = (top.lat + bottom.lat) / 2;
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          lng,
          lat,
          measurement: { top, bottom, measuredAt: new Date().toISOString() },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `저장 실패 (${res.status})`);
      }
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      setSaveError((e as Error).message);
    }
  }, [top, bottom, newName]);

  const ribbon =
    corrected == null
      ? []
      : MOUNTAINS_24.map((m) => ({ ...m, delta: angularDelta(m.deg, corrected) })).filter(
          (m) => Math.abs(m.delta) <= RIBBON_SPAN,
        );
  const cur24 = corrected == null ? null : to24(corrected);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {/* 상단 바 */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3">
        <Link href="/" className="rounded bg-white/15 px-3 py-1.5 text-sm backdrop-blur">
          ← 대시보드
        </Link>
        <span className="truncate px-2 text-sm font-semibold">
          현장 패철 · {siteName ? siteName : '묘역 미선택'}
        </span>
        <span className="w-16" />
      </div>

      {phase !== 'running' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/85 px-8 text-center">
          <h1 className="text-lg font-bold">현장 패철 · 2점 측정</h1>
          <p className="text-sm leading-relaxed text-gray-300">
            ① 묘 <b className="text-amber-300">상단부(뒤)</b>에서 향을 겨눠 측정·저장하고,
            ② <b className="text-amber-300">하단부(앞)</b>에서 한 번 더 측정합니다.
            두 지점의 방위·표고로 좌향·사국·12포태와 배산임수를 계산합니다.
            <br />
            <span className="text-amber-300">※ 8자로 흔들어 보정 후 사용하세요. 위치·카메라 권한 모두 허용.</span>
          </p>
          {!siteId && (
            <p className="rounded bg-amber-500/20 px-3 py-1.5 text-xs text-amber-200">
              측정 후 <b>새 묘역으로 바로 저장</b>할 수 있습니다. 기존 묘역에 저장하려면 대시보드
              목록의 “현장측정”으로 여세요.
            </p>
          )}
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button onClick={start} className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold hover:bg-emerald-700">
            카메라·센서 시작
          </button>
        </div>
      )}

      {phase === 'running' && (
        <>
          {/* 중앙 방위 */}
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
            <div className="mb-2 rounded-xl bg-black/55 px-5 py-2 text-center backdrop-blur">
              <div className="text-3xl font-bold tabular-nums">
                {corrected == null ? '--' : Math.round(corrected)}°
              </div>
              {cur24 && (
                <div className="text-base font-semibold text-amber-300">
                  {cur24.kor}
                  <span className="ml-0.5 text-sm text-amber-200/80">({cur24.hanja})</span>
                </div>
              )}
            </div>
            <div className="h-16 w-px bg-white/70" />
            <div className="-mt-8 h-px w-16 bg-white/70" />
          </div>

          {/* 24산 리본 */}
          <div className="pointer-events-none absolute left-1/2 top-[16%] z-10 h-10 w-full -translate-x-1/2">
            {ribbon.map((m) => (
              <div
                key={m.index}
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: `calc(50% + ${m.delta * PX_PER_DEG}px)` }}
              >
                <div className="h-3 w-px bg-white/60" />
                <span className="mt-0.5 whitespace-nowrap text-xs font-semibold text-white/90">
                  {m.label.split('(')[0]}
                </span>
              </div>
            ))}
          </div>

          {/* 하단 컨트롤 */}
          <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 bg-gradient-to-t from-black/85 to-transparent px-4 pb-6 pt-10">
            {/* 보정 */}
            <div className="flex items-center justify-center gap-2 text-xs">
              <span className="text-gray-300">보정</span>
              <button onClick={() => setOffset((o) => o - 1)} className="rounded bg-white/15 px-2 py-1">−1°</button>
              <span className="w-12 text-center tabular-nums">{offset > 0 ? '+' : ''}{offset}°</span>
              <button onClick={() => setOffset((o) => o + 1)} className="rounded bg-white/15 px-2 py-1">+1°</button>
              <button onClick={() => setOffset(0)} className="rounded bg-white/15 px-2 py-1">초기화</button>
            </div>

            {/* 2점 측정 */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => capturePoint('top')}
                disabled={busy != null}
                className="rounded-lg bg-emerald-600 py-3 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === 'top' ? '측정 중…' : '① 상단부(뒤)'}
                {top && <span className="ml-1 font-mono text-emerald-200">{Math.round(top.heading ?? 0)}°</span>}
              </button>
              <button
                onClick={() => capturePoint('bottom')}
                disabled={busy != null}
                className="rounded-lg bg-sky-600 py-3 text-sm font-semibold hover:bg-sky-700 disabled:opacity-50"
              >
                {busy === 'bottom' ? '측정 중…' : '② 하단부(앞)'}
                {bottom && <span className="ml-1 font-mono text-sky-200">{Math.round(bottom.heading ?? 0)}°</span>}
              </button>
            </div>
            {(top || bottom) && (
              <button
                onClick={() => { setTop(null); setBottom(null); setSaveState('idle'); }}
                className="w-full rounded-lg bg-white/10 py-1.5 text-xs text-gray-200"
              >
                측정값 초기화
              </button>
            )}

            {/* 종합 결과 */}
            {summary?.reading && (
              <div className="space-y-1 rounded-lg bg-black/70 px-4 py-3 text-sm backdrop-blur">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300">
                    {summary.reading.jwaHyangLabel}{' '}
                    <span className="font-mono text-amber-200/70">({summary.reading.jwaHyangHanja})</span>
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      summary.reading.hyangFortune === '길'
                        ? 'bg-emerald-500/30 text-emerald-200'
                        : summary.reading.hyangFortune === '평'
                          ? 'bg-amber-500/30 text-amber-200'
                          : 'bg-rose-500/30 text-rose-200'
                    }`}
                  >
                    향 {summary.reading.hyangPotae} · {summary.reading.hyangFortune}
                  </span>
                </div>
                <p className="text-xs text-gray-300">
                  향 {Math.round(summary.r.hyangDeg ?? 0)}° · {summary.reading.saguk}(
                  {summary.reading.sagukHanja}) · 향포태 {summary.reading.hyangPotae}
                </p>
                <p className="text-xs text-gray-400">
                  {summary.r.baesanImsu == null
                    ? '표고 비교 불가'
                    : summary.r.baesanImsu
                      ? `배산임수 충족 (상단이 ${summary.r.elevDiff}m 높음)`
                      : `배산임수 미흡 (상단이 ${summary.r.elevDiff}m)`}
                  {summary.r.baselineDistM != null && ` · 축길이 ${summary.r.baselineDistM}m`}
                </p>
                {summary.r.gpsBearing != null && (
                  <p className="text-[11px] text-gray-500">
                    GPS 방위(상단→하단) {Math.round(summary.r.gpsBearing)}° · 헤딩 기준 향과 대조
                  </p>
                )}
              </div>
            )}

            {/* 저장 — 기존 묘역(PATCH) */}
            {summary?.reading && siteId && (
              <button
                onClick={save}
                disabled={saveState === 'saving' || saveState === 'saved'}
                className="w-full rounded-lg bg-amber-500 py-3 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-60"
              >
                {saveState === 'saving'
                  ? '저장 중…'
                  : saveState === 'saved'
                    ? '✓ 저장됨 — 대시보드 리포트에 반영됨'
                    : '이 묘역에 측정값 저장'}
              </button>
            )}

            {/* 저장 — 새 묘역(POST) */}
            {summary?.reading && !siteId && saveState !== 'saved' && (
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="새 묘역 이름 (예: 강씨 선영)"
                  className="min-w-0 flex-1 rounded-lg bg-white/90 px-3 py-2.5 text-sm text-black placeholder:text-gray-400 outline-none"
                />
                <button
                  onClick={saveNew}
                  disabled={saveState === 'saving' || !newName.trim()}
                  className="shrink-0 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-60"
                >
                  {saveState === 'saving' ? '저장 중…' : '새 묘역 저장'}
                </button>
              </div>
            )}
            {summary?.reading && !siteId && saveState === 'saved' && (
              <p className="rounded-lg bg-emerald-500/25 py-2.5 text-center text-sm font-semibold text-emerald-200">
                ✓ 새 묘역으로 저장됨 — 대시보드 목록에 추가됨
              </p>
            )}
            {saveState === 'saved' && (
              <Link href="/" className="block w-full rounded-lg bg-white/15 py-2 text-center text-sm">
                대시보드로 돌아가 리포트 생성 →
              </Link>
            )}
            {saveError && <p className="text-xs text-rose-400">{saveError}</p>}
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
