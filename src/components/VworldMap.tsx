'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import Map, {
  Marker,
  NavigationControl,
  ScaleControl,
  type MapLayerMouseEvent,
  type MapRef,
  type StyleSpecification,
} from 'react-map-gl/maplibre';
import { type Site } from '@/types/site';

// 울산공원묘지 기준 기본 뷰 (대표님 지정 좌표)
const INITIAL_VIEW = {
  longitude: 129.13,
  latitude: 35.53,
  zoom: 14,
};

interface VworldMapProps {
  /** 저장된 묘역 목록 (파란 마커) */
  sites: Site[];
  /** 클릭으로 선택된 임시 좌표 (빨간 마커) */
  pending: { lng: number; lat: number } | null;
  /** 변경되면 해당 좌표로 지도를 이동 */
  flyTo: { lng: number; lat: number } | null;
  /** 지도 클릭 시 좌표 전달 */
  onPick: (lng: number, lat: number) => void;
  /** 저장된 마커 클릭 시 */
  onSelectSite?: (site: Site) => void;
}

export default function VworldMap({
  sites,
  pending,
  flyTo,
  onPick,
  onSelectSite,
}: VworldMapProps) {
  const mapRef = useRef<MapRef | null>(null);

  // VWorld 래스터 타일 (Next.js 서버 프록시 경유 → 동일 출처)
  const mapStyle = useMemo<StyleSpecification>(
    () => ({
      version: 8,
      sources: {
        vworldBase: {
          type: 'raster',
          tiles: ['/api/vworld/Base/{z}/{y}/{x}.png'],
          tileSize: 256,
          attribution: '© VWorld',
        },
      },
      layers: [{ id: 'vworld-base', type: 'raster', source: 'vworldBase' }],
    }),
    []
  );

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const { lng, lat } = e.lngLat;
      console.log(`📍 위도(lat): ${lat.toFixed(6)}, 경도(lng): ${lng.toFixed(6)}`);
      onPick(lng, lat);
    },
    [onPick]
  );

  // flyTo 좌표가 바뀌면 부드럽게 이동
  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.flyTo({
        center: [flyTo.lng, flyTo.lat],
        zoom: 17,
        duration: 1200,
      });
    }
  }, [flyTo]);

  return (
    <Map
      ref={mapRef}
      initialViewState={INITIAL_VIEW}
      style={{ width: '100%', height: '100%' }}
      mapStyle={mapStyle}
      minZoom={6}
      maxZoom={19}
      onClick={handleClick}
    >
      <NavigationControl position="top-right" showCompass />
      <ScaleControl position="bottom-left" unit="metric" />

      {/* 저장된 묘역 — 파란 마커 */}
      {sites.map((s) => (
        <Marker
          key={s.id}
          longitude={s.lng}
          latitude={s.lat}
          color="#2563eb"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            onSelectSite?.(s);
          }}
        />
      ))}

      {/* 클릭 중인 임시 좌표 — 빨간 마커 */}
      {pending && (
        <Marker longitude={pending.lng} latitude={pending.lat} color="#e11d48" />
      )}
    </Map>
  );
}
