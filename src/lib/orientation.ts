/**
 * 디바이스 방위 계산 — 순수 함수.
 *
 * deviceorientation(absolute)의 오일러각(alpha,beta,gamma)을 받아,
 * 단말 뒷면 카메라가 향하는 수평 방위각(0=북, 시계방향)을 구한다. (AR HUD용)
 * 폰을 세워서 카메라로 목표(향)를 겨누는 사용을 기준으로 한다.
 *
 * 좌표계: 단말(x=오른쪽, y=위, z=화면 바깥), 지구(X=동, Y=북, Z=상).
 * W3C Device Orientation 회전행렬(Z-X'-Y'') 사용.
 *
 * ⚠️ 폰 지자기 센서는 노이즈·자기간섭이 있어 실제 패철과 오차가 있을 수 있다.
 *    UI에서 8자 캘리브레이션 + 사용자 오프셋 보정을 제공한다.
 */

const D2R = Math.PI / 180;
const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** 뒷면 카메라 광축이 향하는 수평 방위각 (AR HUD에서 "겨눈 방향") */
export function cameraHeadingFromEuler(alpha: number, beta: number, gamma: number): number {
  const _z = alpha * D2R;
  const _x = beta * D2R;
  const _y = gamma * D2R;
  const cX = Math.cos(_x), cY = Math.cos(_y), cZ = Math.cos(_z);
  const sX = Math.sin(_x), sY = Math.sin(_y), sZ = Math.sin(_z);

  // device→Earth 회전행렬 중 필요한 성분 (카메라축 (0,0,-1) → Earth: (-m13,-m23,-m33))
  const m13 = cZ * sY + cY * sZ * sX;
  const m23 = sZ * sY - cZ * cY * sX;
  const east = -m13;
  const north = -m23;

  return norm360((Math.atan2(east, north) * 180) / Math.PI);
}

/** 폰을 수평으로 눕혔을 때(전통 패철처럼) 윗변이 가리키는 방위각 */
export function flatHeadingFromEuler(alpha: number): number {
  // 평평할 때 윗변(y축) 방위 = 360 - alpha
  return norm360(360 - alpha);
}

/** 두 방위각의 최소 사이각 (-180~180] — 나침반 리본 배치용 */
export function angularDelta(target: number, current: number): number {
  let d = norm360(target) - norm360(current);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
