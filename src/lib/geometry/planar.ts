import polygonClipping, {
  type MultiPolygon,
  type Polygon,
  type Ring,
} from "polygon-clipping";
import type {
  AreaDeductionPolygon,
  BoundingBox,
  ImageTransformMeta,
  Point2D,
} from "@/types/domain";

/**
 * 두 점 사이의 유클리드 거리 계산 (단위 동일)
 */
export function distance2D(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

/**
 * 축척 보정: PDF 좌표(pt) 상의 두 점과 실제 길이(mm 또는 m)로
 * 1 PDF pt 당 미터(m) 비율을 계산한다.
 */
export function calculateMetersPerPdfPoint(
  p1Pt: Point2D,
  p2Pt: Point2D,
  realLengthInput: number,
  unit: "mm" | "m"
): number | null {
  const distPt = distance2D(p1Pt, p2Pt);
  if (distPt <= 1e-6 || realLengthInput <= 0 || !Number.isFinite(realLengthInput)) {
    return null;
  }
  const realMeters = unit === "mm" ? realLengthInput / 1000 : realLengthInput;
  return realMeters / distPt;
}

/**
 * PDF pt 좌표를 미터(m) 평면 좌표로 변환
 */
export function pdfPointToMeters(
  pt: Point2D,
  metersPerPdfPoint: number
): Point2D {
  return {
    x: pt.x * metersPerPdfPoint,
    y: pt.y * metersPerPdfPoint,
  };
}

/**
 * 직교(Orthogonal) 보정: 이전 점 기준으로 수평/수직에 가깝거나 직교 모드가 활성화된 경우 스냅
 */
export function applyOrthogonalConstraint(
  anchor: Point2D,
  candidate: Point2D
): Point2D {
  const dx = Math.abs(candidate.x - anchor.x);
  const dy = Math.abs(candidate.y - anchor.y);
  if (dx >= dy) {
    return { x: candidate.x, y: anchor.y };
  }
  return { x: anchor.x, y: candidate.y };
}

/**
 * 기존 사용자 작성 꼭짓점에 스냅 (원본 PDF 선 자동 스냅은 제외)
 */
export function snapToExistingVertices(
  cursorPt: Point2D,
  existingVerticesPt: Point2D[],
  thresholdPt: number
): { point: Point2D; snapped: boolean } {
  let bestPoint = cursorPt;
  let minDist = thresholdPt;
  let snapped = false;

  for (const v of existingVerticesPt) {
    const d = distance2D(cursorPt, v);
    if (d <= minDist) {
      minDist = d;
      bestPoint = { x: v.x, y: v.y };
      snapped = true;
    }
  }
  return { point: bestPoint, snapped };
}

/**
 * 평면 단순 다각형의 신발끈 공식(Shoelace formula) 면적 계산
 * 위경도 지리 면적 함수를 사용하지 않고 평면 직교 좌표(m) 기준으로 계산한다.
 */
export function calculateRingSignedArea(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export function calculatePolygonPlanarAreaSqm(
  pointsPt: Point2D[],
  metersPerPdfPoint: number
): number {
  if (pointsPt.length < 3 || metersPerPdfPoint <= 0) return 0;
  const ringMeters: [number, number][] = pointsPt.map((p) => [
    p.x * metersPerPdfPoint,
    p.y * metersPerPdfPoint,
  ]);
  return Math.abs(calculateRingSignedArea(ringMeters));
}

/**
 * 두 선분 (a1-a2), (b1-b2)의 고유 교차 여부 검사 (자기 교차 판정용)
 */
function ccw(p1: Point2D, p2: Point2D, p3: Point2D): number {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
}

function onSegment(a: Point2D, b: Point2D, p: Point2D): boolean {
  const eps = 1e-7;
  return (
    p.x <= Math.max(a.x, b.x) + eps &&
    p.x >= Math.min(a.x, b.x) - eps &&
    p.y <= Math.max(a.y, b.y) + eps &&
    p.y >= Math.min(a.y, b.y) - eps
  );
}

function segmentsProperlyIntersect(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D
): boolean {
  const d1 = ccw(a1, a2, b1);
  const d2 = ccw(a1, a2, b2);
  const d3 = ccw(b1, b2, a1);
  const d4 = ccw(b1, b2, a2);

  const eps = 1e-9;
  if (
    ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
  ) {
    return true;
  }

  if (Math.abs(d1) <= eps && onSegment(a1, a2, b1)) return true;
  if (Math.abs(d2) <= eps && onSegment(a1, a2, b2)) return true;
  if (Math.abs(d3) <= eps && onSegment(b1, b2, a1)) return true;
  if (Math.abs(d4) <= eps && onSegment(b1, b2, a2)) return true;

  return false;
}

/**
 * 다각형이 자기 교차(Self-intersecting)하는지 검사
 */
export function isPolygonSelfIntersecting(points: Point2D[]): boolean {
  const n = points.length;
  if (n < 3) return false;
  if (n === 3) {
    const area = Math.abs(
      calculateRingSignedArea(points.map((p) => [p.x, p.y]))
    );
    return area <= 1e-7;
  }

  for (let i = 0; i < n; i++) {
    const a1 = points[i]!;
    const a2 = points[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      // 인접한 변은 끝점을 공유하므로 제외
      if (j === i || j === (i + 1) % n || (i === 0 && j === n - 1)) {
        continue;
      }
      const b1 = points[j]!;
      const b2 = points[(j + 1) % n]!;
      if (segmentsProperlyIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

function pointsToClosedMetersRing(
  pointsPt: Point2D[],
  metersPerPdfPoint: number
): Ring {
  const ring: Ring = pointsPt.map((p) => [
    p.x * metersPerPdfPoint,
    p.y * metersPerPdfPoint,
  ]);
  if (ring.length > 0) {
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
  }
  return ring;
}

/**
 * polygon-clipping MultiPolygon의 총 면적(㎡) 계산
 * 각 Polygon은 [외곽 링, ...내부 홀 링]으로 구성됨
 */
export function calculateMultiPolygonAreaSqm(
  multiPoly: MultiPolygon
): number {
  let totalArea = 0;
  for (const poly of multiPoly) {
    if (poly.length === 0) continue;
    const outerArea = Math.abs(calculateRingSignedArea(poly[0]!));
    let holesArea = 0;
    for (let i = 1; i < poly.length; i++) {
      holesArea += Math.abs(calculateRingSignedArea(poly[i]!));
    }
    totalArea += Math.max(0, outerArea - holesArea);
  }
  return totalArea;
}

export interface ZoneGeometryEvaluation {
  grossAreaSqm: number;
  deductionUnionAreaSqm: number;
  netAreaSqm: number;
  hasSelfIntersectingOuter: boolean;
  selfIntersectingDeductionIds: string[];
  deductionsOutsideOuterIds: string[];
}

/**
 * 구역 외곽 다각형 및 내부 공제 다각형 평가:
 * - 겹치는 공제는 합집합(union)으로 처리하여 중복 차감 방지
 * - 외곽 밖으로 나가는 공제가 있는지 검사 (difference(deduction, outer) 면적 > 허용오차)
 * - 자기 교차 도형 검사
 */
export function evaluateZoneGeometry(
  outerPolygonPt: Point2D[],
  deductionsPt: AreaDeductionPolygon[],
  metersPerPdfPoint: number | null
): ZoneGeometryEvaluation {
  const hasSelfIntersectingOuter =
    outerPolygonPt.length >= 3 && isPolygonSelfIntersecting(outerPolygonPt);

  const selfIntersectingDeductionIds: string[] = [];
  for (const d of deductionsPt) {
    if (d.pointsPt.length >= 3 && isPolygonSelfIntersecting(d.pointsPt)) {
      selfIntersectingDeductionIds.push(d.id);
    }
  }

  if (
    !metersPerPdfPoint ||
    metersPerPdfPoint <= 0 ||
    outerPolygonPt.length < 3 ||
    hasSelfIntersectingOuter
  ) {
    return {
      grossAreaSqm: 0,
      deductionUnionAreaSqm: 0,
      netAreaSqm: 0,
      hasSelfIntersectingOuter,
      selfIntersectingDeductionIds,
      deductionsOutsideOuterIds: [],
    };
  }

  const outerPoly: Polygon = [
    pointsToClosedMetersRing(outerPolygonPt, metersPerPdfPoint),
  ];
  const grossAreaSqm = calculateMultiPolygonAreaSqm([outerPoly]);

  const validDeductionPolys: { id: string; poly: Polygon }[] = [];
  const deductionsOutsideOuterIds: string[] = [];

  for (const d of deductionsPt) {
    if (
      d.pointsPt.length < 3 ||
      selfIntersectingDeductionIds.includes(d.id)
    ) {
      continue;
    }
    const dPoly: Polygon = [
      pointsToClosedMetersRing(d.pointsPt, metersPerPdfPoint),
    ];

    try {
      // 공제 다각형이 외곽 밖으로 나가는지 검사: difference(공제, 외곽) 면적이 1e-4㎡ 이상이면 이탈
      const outsideDiff = polygonClipping.difference(dPoly, outerPoly);
      const outsideArea = calculateMultiPolygonAreaSqm(outsideDiff);
      if (outsideArea > 1e-4) {
        deductionsOutsideOuterIds.push(d.id);
      }
      validDeductionPolys.push({ id: d.id, poly: dPoly });
    } catch {
      selfIntersectingDeductionIds.push(d.id);
    }
  }

  if (validDeductionPolys.length === 0) {
    return {
      grossAreaSqm,
      deductionUnionAreaSqm: 0,
      netAreaSqm: grossAreaSqm,
      hasSelfIntersectingOuter,
      selfIntersectingDeductionIds,
      deductionsOutsideOuterIds,
    };
  }

  try {
    // 모든 공제 다각형의 합집합 계산 (겹치는 공제 중복 차감 방지)
    const firstPoly = validDeductionPolys[0]!.poly;
    const restPolys = validDeductionPolys.slice(1).map((item) => item.poly);
    const unionedDeductions =
      restPolys.length > 0
        ? polygonClipping.union(firstPoly, ...restPolys)
        : [firstPoly];

    // 외곽 내부와 실제로 겹치는 공제 합집합 면적
    const effectiveDeductionMulti = polygonClipping.intersection(
      [outerPoly],
      unionedDeductions
    );
    const deductionUnionAreaSqm = calculateMultiPolygonAreaSqm(
      effectiveDeductionMulti
    );

    // 외곽에서 공제 합집합을 차감한 순면적
    const netMulti = polygonClipping.difference([outerPoly], unionedDeductions);
    const netAreaSqm = calculateMultiPolygonAreaSqm(netMulti);

    return {
      grossAreaSqm,
      deductionUnionAreaSqm,
      netAreaSqm,
      hasSelfIntersectingOuter,
      selfIntersectingDeductionIds,
      deductionsOutsideOuterIds,
    };
  } catch {
    return {
      grossAreaSqm,
      deductionUnionAreaSqm: 0,
      netAreaSqm: grossAreaSqm,
      hasSelfIntersectingOuter,
      selfIntersectingDeductionIds,
      deductionsOutsideOuterIds,
    };
  }
}

/**
 * 같은 작업 영역 내 두 구역 다각형의 중복(교차) 면적(㎡) 계산
 */
export function calculateOverlapAreaBetweenPolygonsSqm(
  polyAPt: Point2D[],
  polyBPt: Point2D[],
  metersPerPdfPoint: number
): number {
  if (
    polyAPt.length < 3 ||
    polyBPt.length < 3 ||
    metersPerPdfPoint <= 0 ||
    isPolygonSelfIntersecting(polyAPt) ||
    isPolygonSelfIntersecting(polyBPt)
  ) {
    return 0;
  }
  try {
    const geomA: Polygon = [
      pointsToClosedMetersRing(polyAPt, metersPerPdfPoint),
    ];
    const geomB: Polygon = [
      pointsToClosedMetersRing(polyBPt, metersPerPdfPoint),
    ];
    const inter = polygonClipping.intersection(geomA, geomB);
    return calculateMultiPolygonAreaSqm(inter);
  } catch {
    return 0;
  }
}

/**
 * 기준 외곽(Reference Envelope) 대비 내부 구역들의 누락 면적(㎡) 계산
 */
export function calculateUnaccountedEnvelopeAreaSqm(
  envelopePt: Point2D[],
  zonePolygonsPt: Point2D[][],
  metersPerPdfPoint: number
): number {
  if (
    envelopePt.length < 3 ||
    metersPerPdfPoint <= 0 ||
    isPolygonSelfIntersecting(envelopePt)
  ) {
    return 0;
  }
  try {
    const envGeom: Polygon = [
      pointsToClosedMetersRing(envelopePt, metersPerPdfPoint),
    ];
    const validZones = zonePolygonsPt
      .filter((pts) => pts.length >= 3 && !isPolygonSelfIntersecting(pts))
      .map(
        (pts): Polygon => [
          pointsToClosedMetersRing(pts, metersPerPdfPoint),
        ]
      );
    if (validZones.length === 0) {
      return calculateMultiPolygonAreaSqm([envGeom]);
    }
    const remaining = polygonClipping.difference(envGeom, ...validZones);
    return calculateMultiPolygonAreaSqm(remaining);
  } catch {
    return 0;
  }
}

/**
 * 다각형의 중심점(Centroid) 계산 (구역 번호 라벨 표시용)
 */
export function getPolygonCentroid(points: Point2D[]): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return {
    x: sx / points.length,
    y: sy / points.length,
  };
}

/**
 * 점이 BoundingBox 내부에 있는지 확인
 */
export function isPointInsideBounds(pt: Point2D, box: BoundingBox): boolean {
  return (
    pt.x >= box.x &&
    pt.x <= box.x + box.width &&
    pt.y >= box.y &&
    pt.y <= box.y + box.height
  );
}

/**
 * 좌표 변환 유틸리티:
 * 저장 좌표(원본 PDF 좌상단 기준 비회전 pt 좌표: x ∈ [0, widthPt], y ∈ [0, heightPt])와
 * 화면 표시 좌표(확대 zoom, 회전 rotation 0/90/180/270 적용 후 픽셀 좌표) 간 양방향 변환.
 * 확대·이동·회전은 표시 변환으로만 처리하며 저장 좌표에 영향을 주지 않는다.
 */
export function pdfPointToViewportPx(
  pt: Point2D,
  pageWidthPt: number,
  pageHeightPt: number,
  zoom: number,
  rotationDeg: number
): Point2D {
  const rot = ((rotationDeg % 360) + 360) % 360;
  let rx = pt.x;
  let ry = pt.y;

  if (rot === 90) {
    rx = pageHeightPt - pt.y;
    ry = pt.x;
  } else if (rot === 180) {
    rx = pageWidthPt - pt.x;
    ry = pageHeightPt - pt.y;
  } else if (rot === 270) {
    rx = pt.y;
    ry = pageWidthPt - pt.x;
  }

  return {
    x: rx * zoom,
    y: ry * zoom,
  };
}

export function viewportPxToPdfPoint(
  px: Point2D,
  pageWidthPt: number,
  pageHeightPt: number,
  zoom: number,
  rotationDeg: number
): Point2D {
  const safeZoom = zoom > 0 ? zoom : 1;
  const rx = px.x / safeZoom;
  const ry = px.y / safeZoom;
  const rot = ((rotationDeg % 360) + 360) % 360;

  if (rot === 90) {
    return {
      x: ry,
      y: pageHeightPt - rx,
    };
  } else if (rot === 180) {
    return {
      x: pageWidthPt - rx,
      y: pageHeightPt - ry,
    };
  } else if (rot === 270) {
    return {
      x: pageWidthPt - ry,
      y: rx,
    };
  }
  return { x: rx, y: ry };
}

/**
 * AI가 반환한 정규화 [0~1000] bbox를 원본 PDF pt 좌표 bbox로 변환
 */
export function normalizedBbox1000ToPdfBboxPt(
  bbox1000: { ymin: number; xmin: number; ymax: number; xmax: number } | null,
  meta: ImageTransformMeta
): BoundingBox | null {
  if (!bbox1000) return null;
  const crop = meta.cropBoxPt;
  const x1 = crop.x + (bbox1000.xmin / 1000) * crop.width;
  const y1 = crop.y + (bbox1000.ymin / 1000) * crop.height;
  const x2 = crop.x + (bbox1000.xmax / 1000) * crop.width;
  const y2 = crop.y + (bbox1000.ymax / 1000) * crop.height;

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/**
 * 화면 및 출력용 반올림 포맷터 (내부 정밀도는 유지하고 표시 단계에서만 소수점 둘째 자리 반올림)
 */
export function formatAreaSqm(
  val: number | null | undefined,
  decimals = 2
): string {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return "미입력";
  }
  return `${val.toLocaleString("ko-KR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ㎡`;
}

export function roundToDecimals(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}
