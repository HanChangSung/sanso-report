'use client';

import { useRef, useState } from 'react';

type OnLocate = (lng: number, lat: number, label?: string) => void;

/**
 * 위치 지정 입력 — 지도 클릭 외 3가지 보조 수단:
 *  ① 주소 검색(VWorld geocoder)  ② 위경도 직접 입력  ③ 사진 EXIF GPS
 * 결과 좌표는 onLocate 로 부모(Dashboard)에 전달 → pending + flyTo.
 */
export default function LocationInput({ onLocate }: { onLocate: OnLocate }) {
  const [address, setAddress] = useState('');
  const [coordText, setCoordText] = useState('');
  const [busy, setBusy] = useState<null | 'addr' | 'photo'>(null);
  const [msg, setMsg] = useState<{ type: 'err' | 'ok'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ① 주소 검색
  const searchAddress = async () => {
    const q = address.trim();
    if (!q) return;
    setBusy('addr');
    setMsg(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `검색 실패 (${res.status})`);
      onLocate(json.lng, json.lat, q);
      setMsg({ type: 'ok', text: `이동: ${q}` });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  // ② 위경도 직접 입력 — "위도, 경도" 또는 "위도 경도"
  const applyCoord = () => {
    setMsg(null);
    const nums = coordText.match(/-?\d+(\.\d+)?/g);
    if (!nums || nums.length < 2) {
      setMsg({ type: 'err', text: '예: 35.5103, 129.2667 (위도, 경도)' });
      return;
    }
    const lat = Number(nums[0]);
    const lng = Number(nums[1]);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setMsg({ type: 'err', text: '위도(-90~90) / 경도(-180~180) 범위를 확인하세요.' });
      return;
    }
    onLocate(lng, lat, `좌표 ${lat}, ${lng}`);
    setMsg({ type: 'ok', text: `이동: ${lat}, ${lng}` });
  };

  // ③ 사진 EXIF GPS
  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    setBusy('photo');
    setMsg(null);
    try {
      // 사진 처리 시점에만 로드 (초기 번들·SSR에서 제외)
      const { default: exifr } = await import('exifr');
      const gps = await exifr.gps(file);
      if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
        setMsg({
          type: 'err',
          text: '사진에 위치(GPS) 정보가 없습니다. 원본 사진인지 확인해 주세요.',
        });
        return;
      }
      onLocate(gps.longitude, gps.latitude, `사진: ${file.name}`);
      setMsg({ type: 'ok', text: `사진 위치 적용: ${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}` });
    } catch {
      setMsg({ type: 'err', text: '사진을 읽지 못했습니다.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      {/* ① 주소 검색 */}
      <div className="flex gap-1.5">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && searchAddress()}
          placeholder="주소 검색 (도로명 / 지번)"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          onClick={searchAddress}
          disabled={busy === 'addr'}
          className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          {busy === 'addr' ? '검색…' : '찾기'}
        </button>
      </div>

      {/* ② 위경도 직접 입력 */}
      <div className="flex gap-1.5">
        <input
          value={coordText}
          onChange={(e) => setCoordText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applyCoord()}
          placeholder="위경도 입력 (예: 35.5103, 129.2667)"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          onClick={applyCoord}
          className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          적용
        </button>
      </div>

      {/* ③ 사진 EXIF */}
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPhoto}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy === 'photo'}
          className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
        >
          {busy === 'photo' ? '사진 분석…' : '📷 사진에서 위치 가져오기'}
        </button>
      </div>

      {msg && (
        <p className={`text-xs ${msg.type === 'err' ? 'text-red-500' : 'text-emerald-600'}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
