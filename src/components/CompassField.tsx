'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cameraHeadingFromEuler, angularDelta } from '@/lib/orientation';
import { to24, compassReading, MOUNTAINS_24 } from '@/lib/luopan';
import { type CompassReading } from '@/types/terrain';

type Phase = 'idle' | 'running' | 'error';

interface OrientationEventLike extends Event {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  webkitCompassHeading?: number;
}

const PX_PER_DEG = 4; // 나침반 리본 픽셀/도
const RIBBON_SPAN = 70; // 중심 기준 ±도 표시

export default function CompassField() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [offset, setOffset] = useState(0); // 사용자 캘리브레이션 보정(도)

  // 현장 측정값
  const [hyangDeg, setHyangDeg] = useState<number | null>(null); // 향(앞)
  const [paguDeg, setPaguDeg] = useState<number | null>(null); // 파구(수구)
  const [result, setResult] = useState<CompassReading | null>(null);

  const corrected = heading == null ? null : ((heading + offset) % 360 + 360) % 360;

  // --- 센서/카메라 시작 ---
  const start = useCallback(async () => {
    setError(null);
    try {
      // iOS 등 권한 요청 필요한 경우
      const DOE = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (DOE && typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res !== 'granted') throw new Error('방위 센서 권한이 거부되었습니다.');
      }

      // 카메라 (후면)
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

  // --- 방위 이벤트 구독 (running 동안) ---
  useEffect(() => {
    if (phase !== 'running') return;

    const handle = (ev: Event) => {
      const e = ev as OrientationEventLike;
      // iOS: webkitCompassHeading(진북 기준, 평면) 우선
      if (typeof e.webkitCompassHeading === 'number') {
        setHeading(e.webkitCompassHeading);
        return;
      }
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      setHeading(cameraHeadingFromEuler(e.alpha, e.beta, e.gamma));
    };

    // 절대 방위 우선, 없으면 일반
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

  // --- 측정값으로 좌향·사국·포태 계산 ---
  useEffect(() => {
    if (hyangDeg == null) {
      setResult(null);
      return;
    }
    const pagu = paguDeg ?? hyangDeg; // 파구 미측정 시 향으로 추정
    setResult(compassReading(hyangDeg, pagu, paguDeg == null ? 'estimated' : 'manual'));
  }, [hyangDeg, paguDeg]);

  const capture = (kind: 'hyang' | 'pagu') => {
    if (corrected == null) return;
    if (kind === 'hyang') setHyangDeg(Math.round(corrected * 10) / 10);
    else setPaguDeg(Math.round(corrected * 10) / 10);
  };

  // 리본에 표시할 24산 (현재 방위 ±RIBBON_SPAN)
  const ribbon =
    corrected == null
      ? []
      : MOUNTAINS_24.map((m) => ({ ...m, delta: angularDelta(m.deg, corrected) })).filter(
          (m) => Math.abs(m.delta) <= RIBBON_SPAN,
        );

  const cur24 = corrected == null ? null : to24(corrected);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      {/* 카메라 배경 */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* 상단 바 */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3">
        <Link href="/" className="rounded bg-white/15 px-3 py-1.5 text-sm backdrop-blur">
          ← 대시보드
        </Link>
        <span className="text-sm font-semibold">현장 패철 (AR)</span>
        <span className="w-20" />
      </div>

      {phase !== 'running' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/80 px-8 text-center">
          <h1 className="text-lg font-bold">현장 패철 · AR 방위 측정</h1>
          <p className="text-sm leading-relaxed text-gray-300">
            카메라와 방위 센서를 사용합니다. 묘 앞에서 향(向), 뒤에서 좌(坐)를 겨눠 측정하면
            좌향·사국·12포태를 자동 계산합니다.
            <br />
            <span className="text-amber-300">
              ※ 폰 나침반은 오차가 있으니 8자 모양으로 흔들어 보정 후 사용하세요.
            </span>
          </p>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            onClick={start}
            className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold hover:bg-emerald-700"
          >
            카메라·센서 시작
          </button>
          <p className="text-xs text-gray-500">권한 요청이 뜨면 모두 허용해 주세요.</p>
        </div>
      )}

      {phase === 'running' && (
        <>
          {/* 중앙 십자선 + 현재 방위/24산 */}
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
            {/* 십자 레티클 */}
            <div className="h-16 w-px bg-white/70" />
            <div className="-mt-8 h-px w-16 bg-white/70" />
          </div>

          {/* 24산 리본 */}
          <div className="pointer-events-none absolute left-1/2 top-[18%] z-10 h-10 w-full -translate-x-1/2">
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
          <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 bg-gradient-to-t from-black/80 to-transparent px-4 pb-6 pt-10">
            {/* 캘리브레이션 오프셋 */}
            <div className="flex items-center justify-center gap-2 text-xs">
              <span className="text-gray-300">보정</span>
              <button
                onClick={() => setOffset((o) => o - 1)}
                className="rounded bg-white/15 px-2 py-1"
              >
                −1°
              </button>
              <span className="w-12 text-center tabular-nums">
                {offset > 0 ? '+' : ''}
                {offset}°
              </span>
              <button
                onClick={() => setOffset((o) => o + 1)}
                className="rounded bg-white/15 px-2 py-1"
              >
                +1°
              </button>
              <button
                onClick={() => setOffset(0)}
                className="rounded bg-white/15 px-2 py-1"
              >
                초기화
              </button>
            </div>

            {/* 측정 버튼 */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => capture('hyang')}
                className="rounded-lg bg-emerald-600 py-3 text-sm font-semibold hover:bg-emerald-700"
              >
                향(앞) 측정
                {hyangDeg != null && (
                  <span className="ml-1 font-mono text-emerald-200">{Math.round(hyangDeg)}°</span>
                )}
              </button>
              <button
                onClick={() => capture('pagu')}
                className="rounded-lg bg-sky-600 py-3 text-sm font-semibold hover:bg-sky-700"
              >
                파구(수구) 측정
                {paguDeg != null && (
                  <span className="ml-1 font-mono text-sky-200">{Math.round(paguDeg)}°</span>
                )}
              </button>
            </div>
            {(hyangDeg != null || paguDeg != null) && (
              <button
                onClick={() => {
                  setHyangDeg(null);
                  setPaguDeg(null);
                }}
                className="w-full rounded-lg bg-white/10 py-2 text-xs text-gray-200"
              >
                측정값 초기화
              </button>
            )}

            {/* 결과 */}
            {result && (
              <div className="rounded-lg bg-black/70 px-4 py-3 text-sm backdrop-blur">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300">
                    {result.jwaHyangLabel}{' '}
                    <span className="font-mono text-amber-200/70">({result.jwaHyangHanja})</span>
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      result.hyangFortune === '길'
                        ? 'bg-emerald-500/30 text-emerald-200'
                        : result.hyangFortune === '평'
                          ? 'bg-amber-500/30 text-amber-200'
                          : 'bg-rose-500/30 text-rose-200'
                    }`}
                  >
                    향 {result.hyangPotae} · {result.hyangFortune}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-300">
                  {result.saguk}({result.sagukHanja}) · 묘고 {result.myo} · 파구{' '}
                  {result.pagu.kor}({result.pagu.hanja}){' '}
                  {result.paguSource === 'estimated' ? '(향 기준 추정)' : '(실측)'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
