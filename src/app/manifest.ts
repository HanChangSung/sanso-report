import type { MetadataRoute } from 'next';

// PWA 매니페스트 — '홈 화면에 추가' 시 전체화면 앱처럼 동작
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '산소 리포트',
    short_name: '산소리포트',
    description: '풍수지리 명당 이론 + GIS 지형 데이터 기반 디지털 묘지 분석',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    orientation: 'portrait-primary',
    lang: 'ko',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
