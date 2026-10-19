"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Move,
  Square,
  Ruler,
  PenTool,
  Scissors,
  Undo2,
  Redo2,
  Search,
  Check,
  X,
  Crosshair,
  ShieldAlert,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace-store";
import {
  extractPageTextAndPositions,
  getPdfJs,
  type PdfExtractedTextItem,
} from "@/lib/pdf/pdf-engine";
import {
  applyOrthogonalConstraint,
  calculatePolygonPlanarAreaSqm,
  distance2D,
  getPolygonCentroid,
  isPolygonSelfIntersecting,
  pdfPointToViewportPx,
  snapToExistingVertices,
  viewportPxToPdfPoint,
} from "@/lib/geometry/planar";
import type { BoundingBox, Point2D } from "@/types/domain";

export function CenterCanvasEditor() {
  const bundle = useWorkspaceStore((s) => s.bundle);
  const pdfBytes = useWorkspaceStore((s) => s.pdfBytes);
  const activePageIndex = useWorkspaceStore((s) => s.activePageIndex);
  const zoom = useWorkspaceStore((s) => s.zoom);
  const setZoom = useWorkspaceStore((s) => s.setZoom);
  const rotateActivePage = useWorkspaceStore((s) => s.rotateActivePage);
  const toolMode = useWorkspaceStore((s) => s.toolMode);
  const setToolMode = useWorkspaceStore((s) => s.setToolMode);
  const orthogonalLock = useWorkspaceStore((s) => s.orthogonalLock);
  const setOrthogonalLock = useWorkspaceStore((s) => s.setOrthogonalLock);
  const snapEnabled = useWorkspaceStore((s) => s.snapEnabled);
  const setSnapEnabled = useWorkspaceStore((s) => s.setSnapEnabled);
  const searchQuery = useWorkspaceStore((s) => s.searchQuery);
  const setSearchQuery = useWorkspaceStore((s) => s.setSearchQuery);
  const highlightedBboxPt = useWorkspaceStore((s) => s.highlightedBboxPt);
  const selectedRegionId = useWorkspaceStore((s) => s.selectedRegionId);
  const setSelectedRegionId = useWorkspaceStore((s) => s.setSelectedRegionId);
  const selectedZoneId = useWorkspaceStore((s) => s.selectedZoneId);
  const setSelectedZoneId = useWorkspaceStore((s) => s.setSelectedZoneId);

  const undoStack = useWorkspaceStore((s) => s.undoStack);
  const redoStack = useWorkspaceStore((s) => s.redoStack);
  const undoGeometry = useWorkspaceStore((s) => s.undoGeometry);
  const redoGeometry = useWorkspaceStore((s) => s.redoGeometry);

  const createDrawingRegion = useWorkspaceStore((s) => s.createDrawingRegion);
  const applyRegionCalibration = useWorkspaceStore(
    (s) => s.applyRegionCalibration
  );
  const applyRegionVerificationMeasurement = useWorkspaceStore(
    (s) => s.applyRegionVerificationMeasurement
  );
  const setRegionReferenceEnvelope = useWorkspaceStore(
    (s) => s.setRegionReferenceEnvelope
  );
  const createMeasuredZoneFromPolygon = useWorkspaceStore(
    (s) => s.createMeasuredZoneFromPolygon
  );
  const addDeductionToZone = useWorkspaceStore((s) => s.addDeductionToZone);
  const updateZoneVertices = useWorkspaceStore((s) => s.updateZoneVertices);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [viewportSize, setViewportSize] = useState({ width: 842, height: 595 });
  const [pageTexts, setPageTexts] = useState<PdfExtractedTextItem[]>([]);

  // 다각형 / 직사각형 / 축척 두 점 드로잉 임시 상태
  const [draftPointsPt, setDraftPointsPt] = useState<Point2D[]>([]);
  const [cursorPt, setCursorPt] = useState<Point2D | null>(null);
  const [snappedIndicatorPt, setSnappedIndicatorPt] = useState<Point2D | null>(
    null
  );

  // 꼭짓점 드래그 이동 상태
  const [draggingVertex, setDraggingVertex] = useState<{
    zoneId: string;
    vertexIndex: number;
  } | null>(null);

  // 모달/폼 입력 상태 (작업영역 생성, 축척 길이 입력, 신규 구역 이름/용도 입력, 공제 입력)
  const [pendingRegionRectPt, setPendingRegionRectPt] =
    useState<BoundingBox | null>(null);
  const [newRegionName, setNewRegionName] = useState("평면 작업영역");
  const [newRegionFloorId, setNewRegionFloorId] = useState<string>("");

  const [pendingScalePairPt, setPendingScalePairPt] = useState<{
    p1: Point2D;
    p2: Point2D;
    isVerification: boolean;
  } | null>(null);
  const [scaleInputLength, setScaleInputLength] = useState("20000");
  const [scaleInputUnit, setScaleInputUnit] = useState<"mm" | "m">("mm");

  const [pendingZonePolyPt, setPendingZonePolyPt] = useState<Point2D[] | null>(
    null
  );
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneUsage, setNewZoneUsage] = useState("제1종근린생활시설");
  const [newZoneFloorId, setNewZoneFloorId] = useState("");

  const [pendingDeductionPolyPt, setPendingDeductionPolyPt] = useState<
    Point2D[] | null
  >(null);
  const [newDeductionLabel, setNewDeductionLabel] = useState("설비샤프트/오픈 공제");
  const [newDeductionReason, setNewDeductionReason] = useState(
    "내부 보이드/설비샤프트 면적 제외"
  );

  const activePage = useMemo(
    () => bundle?.pages.find((p) => p.pageIndex === activePageIndex) ?? null,
    [bundle, activePageIndex]
  );

  const pageWidthPt = activePage?.widthPt ?? 842;
  const pageHeightPt = activePage?.heightPt ?? 595;
  const viewRotation = activePage?.viewRotation ?? 0;

  const pageRegions = useMemo(
    () =>
      (bundle?.regions ?? []).filter((r) => r.pageIndex === activePageIndex),
    [bundle, activePageIndex]
  );

  const activeRegion = useMemo(
    () =>
      pageRegions.find((r) => r.id === selectedRegionId) ??
      pageRegions[0] ??
      null,
    [pageRegions, selectedRegionId]
  );

  const pageZones = useMemo(
    () =>
      (bundle?.zones ?? []).filter(
        (z) =>
          z.sourcePageIndex === activePageIndex && z.reviewStatus !== "rejected"
      ),
    [bundle, activePageIndex]
  );

  // 현재 페이지의 기존 사용자 작성 꼭짓점 목록 (스냅용 - 원본 PDF 선 자동 스냅은 제외)
  const existingUserVerticesPt = useMemo(() => {
    const pts: Point2D[] = [];
    for (const z of pageZones) {
      pts.push(...z.outerPolygonPt);
      for (const d of z.deductionPolygonsPt) {
        pts.push(...d.pointsPt);
      }
    }
    return pts;
  }, [pageZones]);

  // PDF 페이지 캔버스 렌더링 및 원문 텍스트/좌표 추출
  useEffect(() => {
    let cancelled = false;
    if (!pdfBytes || pdfBytes.byteLength === 0) return;

    async function renderMainPage() {
      try {
        const pdfjs = await getPdfJs();
        const task = pdfjs.getDocument({ data: pdfBytes!.slice() });
        const doc = await task.promise;
        const pageNum = Math.min(activePageIndex, doc.numPages);
        const page = await doc.getPage(pageNum);

        const vp = page.getViewport({
          scale: zoom,
          rotation: (page.rotate + viewRotation) % 360,
        });

        if (!cancelled && canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          setViewportSize({
            width: Math.floor(vp.width),
            height: Math.floor(vp.height),
          });
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
          }
        }
        await doc.destroy();

        const texts = await extractPageTextAndPositions(pdfBytes!, pageNum);
        if (!cancelled) {
          setPageTexts(texts);
        }
      } catch {
        // 렌더링 오류 시 무시
      }
    }

    void renderMainPage();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes, activePageIndex, zoom, viewRotation]);

  // 툴 모드 변경 시 작성 중이던 임시 점 초기화
  useEffect(() => {
    setDraftPointsPt([]);
    setCursorPt(null);
  }, [toolMode, activePageIndex]);

  if (!bundle) return null;

  // 마우스 이벤트로부터 원본 PDF pt 좌표 계산 (직교 보정 및 사용자 꼭짓점 스냅 반영)
  const getPdfPointFromMouseEvent = (
    e: React.MouseEvent<SVGSVGElement>
  ): Point2D => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const px = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    let pt = viewportPxToPdfPoint(
      px,
      pageWidthPt,
      pageHeightPt,
      zoom,
      viewRotation
    );

    if (
      (orthogonalLock || e.shiftKey) &&
      draftPointsPt.length > 0 &&
      (toolMode === "draw_zone_outer" ||
        toolMode === "draw_zone_deduction" ||
        toolMode === "draw_envelope" ||
        toolMode === "calibrate_scale" ||
        toolMode === "verify_scale")
    ) {
      const lastAnchor = draftPointsPt[draftPointsPt.length - 1]!;
      pt = applyOrthogonalConstraint(lastAnchor, pt);
    }

    if (snapEnabled && existingUserVerticesPt.length > 0) {
      const snapRes = snapToExistingVertices(
        pt,
        existingUserVerticesPt,
        8 / Math.max(zoom, 0.5)
      );
      if (snapRes.snapped) {
        setSnappedIndicatorPt(snapRes.point);
        return snapRes.point;
      }
    }

    setSnappedIndicatorPt(null);
    return pt;
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getPdfPointFromMouseEvent(e);
    setCursorPt(pt);

    if (draggingVertex) {
      const targetZone = pageZones.find((z) => z.id === draggingVertex.zoneId);
      if (targetZone) {
        const nextOuter = targetZone.outerPolygonPt.map((v, idx) =>
          idx === draggingVertex.vertexIndex ? pt : v
        );
        void updateZoneVertices(targetZone.id, nextOuter);
      }
    }
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingVertex) return;
    const pt = getPdfPointFromMouseEvent(e);

    if (toolMode === "draw_region") {
      if (draftPointsPt.length === 0) {
        setDraftPointsPt([pt]);
      } else {
        const p1 = draftPointsPt[0]!;
        const box: BoundingBox = {
          x: Math.min(p1.x, pt.x),
          y: Math.min(p1.y, pt.y),
          width: Math.max(20, Math.abs(pt.x - p1.x)),
          height: Math.max(20, Math.abs(pt.y - p1.y)),
        };
        setPendingRegionRectPt(box);
        setNewRegionFloorId(bundle.floors[0]?.id ?? "");
        setDraftPointsPt([]);
      }
      return;
    }

    if (toolMode === "calibrate_scale" || toolMode === "verify_scale") {
      if (!activeRegion) {
        alert("먼저 작업 도면 영역(작업영역 지정)을 생성하거나 선택하세요.");
        return;
      }
      if (draftPointsPt.length === 0) {
        setDraftPointsPt([pt]);
      } else {
        const p1 = draftPointsPt[0]!;
        setPendingScalePairPt({
          p1,
          p2: pt,
          isVerification: toolMode === "verify_scale",
        });
        setDraftPointsPt([]);
      }
      return;
    }

    if (
      toolMode === "draw_zone_outer" ||
      toolMode === "draw_zone_deduction" ||
      toolMode === "draw_envelope"
    ) {
      // 시작점 근처를 클릭하면 다각형 닫기
      if (draftPointsPt.length >= 3) {
        const firstPt = draftPointsPt[0]!;
        if (distance2D(firstPt, pt) <= 10 / Math.max(zoom, 0.5)) {
          finishPolygonDraft();
          return;
        }
      }
      setDraftPointsPt([...draftPointsPt, pt]);
    }
  };

  const finishPolygonDraft = () => {
    if (draftPointsPt.length < 3) return;
    if (isPolygonSelfIntersecting(draftPointsPt)) {
      alert(
        "자기 교차(Self-intersecting)하는 다각형은 확정할 수 없습니다. 꼭짓점이 교차하지 않도록 다시 작성하세요."
      );
      return;
    }

    if (toolMode === "draw_envelope") {
      if (!activeRegion) return;
      void setRegionReferenceEnvelope(activeRegion.id, draftPointsPt);
      setDraftPointsPt([]);
      return;
    }

    if (toolMode === "draw_zone_outer") {
      if (!activeRegion) {
        alert("구역을 작성할 작업 도면 영역을 먼저 지정하거나 선택하세요.");
        return;
      }
      setPendingZonePolyPt(draftPointsPt);
      const matchedFloor =
        bundle.floors.find((f) => f.id === activeRegion.floorId) ??
        bundle.floors[0];
      setNewZoneFloorId(matchedFloor?.id ?? "");
      setNewZoneName(`${matchedFloor?.label ?? "신규"} 측정구역`);
      setNewZoneUsage(matchedFloor?.mainUse || "제1종근린생활시설");
      setDraftPointsPt([]);
      return;
    }

    if (toolMode === "draw_zone_deduction") {
      if (!selectedZoneId) {
        alert("공제 영역을 추가할 대상 구역을 먼저 클릭하여 선택하세요.");
        return;
      }
      setPendingDeductionPolyPt(draftPointsPt);
      setDraftPointsPt([]);
    }
  };

  // 원문 검색 매칭 결과
  const matchedSearchItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return pageTexts.filter((t) => t.str.toLowerCase().includes(q));
  }, [pageTexts, searchQuery]);

  // 작성 중인 다각형 실시간 면적 미리보기
  const draftPreviewAreaSqm = useMemo(() => {
    if (
      draftPointsPt.length < 2 ||
      !activeRegion?.metersPerPdfPoint ||
      !cursorPt
    ) {
      return null;
    }
    const pts = [...draftPointsPt, cursorPt];
    if (pts.length < 3) return null;
    return calculatePolygonPlanarAreaSqm(pts, activeRegion.metersPerPdfPoint);
  }, [draftPointsPt, cursorPt, activeRegion]);

  return (
    <section className="flex-1 flex flex-col bg-slate-100 min-w-0 relative overflow-hidden">
      {/* 상단 도면 편집 툴바 */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setToolMode("pan")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              toolMode === "pan"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            <Move className="w-3.5 h-3.5" />
            <span>선택·이동</span>
          </button>

          <button
            type="button"
            onClick={() => setToolMode("draw_region")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              toolMode === "draw_region"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            <Square className="w-3.5 h-3.5" />
            <span>1. 작업영역 지정</span>
          </button>

          <button
            type="button"
            onClick={() => setToolMode("calibrate_scale")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              toolMode === "calibrate_scale"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>2. 축척 보정(두 점)</span>
          </button>

          <button
            type="button"
            onClick={() => setToolMode("verify_scale")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              toolMode === "verify_scale"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
            title="다른 치수로 축척 확인"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>축척 검산</span>
          </button>

          <button
            type="button"
            onClick={() => setToolMode("draw_zone_outer")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              toolMode === "draw_zone_outer"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>3. 구역 산정선 작성</span>
          </button>

          <button
            type="button"
            onClick={() => setToolMode("draw_zone_deduction")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              toolMode === "draw_zone_deduction"
                ? "bg-rose-600 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>4. 내부 공제 작성</span>
          </button>

          <button
            type="button"
            onClick={() => setToolMode("draw_envelope")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              toolMode === "draw_envelope"
                ? "bg-purple-600 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
            title="공간 누락 검사용 기준 외곽 다각형 지정"
          >
            <span>기준 외곽 지정</span>
          </button>
        </div>

        {/* 보조 옵션: 직교 보조, 꼭짓점 스냅, Undo/Redo, 확대/축소/회전, 원문 검색 */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1 text-xs text-slate-700 cursor-pointer px-2 py-1 rounded bg-slate-100">
            <input
              type="checkbox"
              checked={orthogonalLock}
              onChange={(e) => setOrthogonalLock(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>직교(Shift)</span>
          </label>

          <label
            className="inline-flex items-center gap-1 text-xs text-slate-700 cursor-pointer px-2 py-1 rounded bg-slate-100"
            title="사용자가 작성한 꼭짓점에 스냅 (원본 PDF 선 자동 스냅은 제외)"
          >
            <input
              type="checkbox"
              checked={snapEnabled}
              onChange={(e) => setSnapEnabled(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>꼭짓점 스냅</span>
          </label>

          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
            <button
              type="button"
              disabled={undoStack.length === 0}
              onClick={() => void undoGeometry()}
              className="p-1.5 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700"
              title="실행 취소 (Undo)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={redoStack.length === 0}
              onClick={() => void redoGeometry()}
              className="p-1.5 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 border-l border-slate-200"
              title="다시 실행 (Redo)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setZoom(zoom - 0.15)}
              className="p-1.5 bg-white hover:bg-slate-100 text-slate-700"
              title="축소"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono text-[11px]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom(zoom + 0.15)}
              className="p-1.5 bg-white hover:bg-slate-100 text-slate-700"
              title="확대"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void rotateActivePage(90)}
              className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 border-l border-slate-200"
              title="화면 표시 90° 회전 (저장 좌표 불변)"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="페이지 내 원문 검색..."
              className="pl-7 pr-2.5 py-1 text-xs border border-slate-300 rounded-lg w-40"
            />
          </div>
        </div>
      </div>

      {/* 현재 작업 영역 & 축척 상태 안내 바 */}
      <div className="bg-slate-800 text-slate-200 px-3.5 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            현재 페이지: <strong>P.{activePageIndex}</strong> (기재 축척 참고값:{" "}
            <strong className="text-amber-300">
              {activePage?.statedScaleText || "미기재"}
            </strong>
            )
          </span>

          <div className="flex items-center gap-1.5">
            <span>작업영역:</span>
            <select
              value={activeRegion?.id ?? ""}
              onChange={(e) => setSelectedRegionId(e.target.value || null)}
              className="bg-slate-900 text-white border border-slate-700 rounded px-2 py-0.5 text-xs"
            >
              {pageRegions.length === 0 ? (
                <option value="">지정된 작업영역 없음</option>
              ) : (
                pageRegions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {activeRegion && (
            <span className="text-[11px]">
              {activeRegion.metersPerPdfPoint ? (
                <span className="text-emerald-300 font-semibold">
                  ✓ 보정 축척: 1 pt = {activeRegion.metersPerPdfPoint.toFixed(4)} m
                  {activeRegion.verificationMeasurement &&
                    ` (검산 오차: ${activeRegion.verificationMeasurement.diffM.toFixed(
                      3
                    )}m)`}
                </span>
              ) : (
                <span className="text-amber-300 font-semibold">
                  ⚠ 축척 미보정 (보정 전 측정 면적 확정 불가)
                </span>
              )}
            </span>
          )}
        </div>

        {/* 다각형 작성 중일 때 닫기 / 취소 버튼 */}
        {draftPointsPt.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-amber-300 font-semibold">
              점 {draftPointsPt.length}개 선택됨
              {draftPreviewAreaSqm !== null &&
                ` (예상 ${draftPreviewAreaSqm.toFixed(2)} ㎡)`}
            </span>
            {draftPointsPt.length >= 3 && (
              <button
                type="button"
                onClick={finishPolygonDraft}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                <Check className="w-3 h-3" />
                다각형 닫기·완료
              </button>
            )}
            <button
              type="button"
              onClick={() => setDraftPointsPt([])}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
            >
              <X className="w-3 h-3" />
              작성 취소
            </button>
          </div>
        )}
      </div>

      {/* 중앙 캔버스 + SVG 산정선·근거 오버레이 영역 */}
      <div className="flex-1 overflow-auto p-6 flex items-start justify-center bg-slate-200/70">
        <div
          className="relative bg-white shadow-lg border border-slate-300"
          style={{
            width: viewportSize.width,
            height: viewportSize.height,
          }}
        >
          <canvas ref={canvasRef} className="block" />

          <svg
            ref={svgRef}
            width={viewportSize.width}
            height={viewportSize.height}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={() => setDraggingVertex(null)}
            onClick={handleSvgClick}
            className={`absolute inset-0 ${
              toolMode === "pan" ? "cursor-default" : "cursor-crosshair"
            }`}
          >
            {/* 1. 작업 도면 영역(DrawingRegion) 경계 및 기준 외곽 표시 */}
            {pageRegions.map((reg) => {
              const pTopLeft = pdfPointToViewportPx(
                { x: reg.boundsPt.x, y: reg.boundsPt.y },
                pageWidthPt,
                pageHeightPt,
                zoom,
                viewRotation
              );
              const pBottomRight = pdfPointToViewportPx(
                {
                  x: reg.boundsPt.x + reg.boundsPt.width,
                  y: reg.boundsPt.y + reg.boundsPt.height,
                },
                pageWidthPt,
                pageHeightPt,
                zoom,
                viewRotation
              );
              const rx = Math.min(pTopLeft.x, pBottomRight.x);
              const ry = Math.min(pTopLeft.y, pBottomRight.y);
              const rw = Math.abs(pBottomRight.x - pTopLeft.x);
              const rh = Math.abs(pBottomRight.y - pTopLeft.y);
              const isSelectedReg = reg.id === activeRegion?.id;

              return (
                <g key={reg.id}>
                  <rect
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rh}
                    fill="none"
                    stroke={isSelectedReg ? "#2563eb" : "#94a3b8"}
                    strokeWidth={isSelectedReg ? 1.5 : 1}
                    strokeDasharray="6 4"
                  />
                  <text
                    x={rx + 6}
                    y={ry + 14}
                    fill="#1d4ed8"
                    fontSize={11}
                    fontWeight="bold"
                  >
                    [작업영역] {reg.name}
                  </text>

                  {/* 축척 보정 기준선 */}
                  {reg.calibration && (
                    <g>
                      {(() => {
                        const c1 = pdfPointToViewportPx(
                          reg.calibration.p1,
                          pageWidthPt,
                          pageHeightPt,
                          zoom,
                          viewRotation
                        );
                        const c2 = pdfPointToViewportPx(
                          reg.calibration.p2,
                          pageWidthPt,
                          pageHeightPt,
                          zoom,
                          viewRotation
                        );
                        return (
                          <>
                            <line
                              x1={c1.x}
                              y1={c1.y}
                              x2={c2.x}
                              y2={c2.y}
                              stroke="#0284c7"
                              strokeWidth={2.5}
                            />
                            <circle cx={c1.x} cy={c1.y} r={4} fill="#0284c7" />
                            <circle cx={c2.x} cy={c2.y} r={4} fill="#0284c7" />
                          </>
                        );
                      })()}
                    </g>
                  )}

                  {/* 공간 누락 검사용 기준 외곽 다각형 */}
                  {reg.referenceEnvelopePolygonPt &&
                    reg.referenceEnvelopePolygonPt.length >= 3 && (
                      <polygon
                        points={reg.referenceEnvelopePolygonPt
                          .map((pt) => {
                            const vp = pdfPointToViewportPx(
                              pt,
                              pageWidthPt,
                              pageHeightPt,
                              zoom,
                              viewRotation
                            );
                            return `${vp.x},${vp.y}`;
                          })
                          .join(" ")}
                        fill="none"
                        stroke="#9333ea"
                        strokeWidth={1.8}
                        strokeDasharray="4 2"
                      />
                    )}
                </g>
              );
            })}

            {/* 2. 원문 검색 하이라이트 */}
            {matchedSearchItems.map((item, idx) => {
              const p1 = pdfPointToViewportPx(
                { x: item.x, y: item.y },
                pageWidthPt,
                pageHeightPt,
                zoom,
                viewRotation
              );
              const p2 = pdfPointToViewportPx(
                { x: item.x + item.width, y: item.y + item.height },
                pageWidthPt,
                pageHeightPt,
                zoom,
                viewRotation
              );
              return (
                <rect
                  key={`search-${idx}`}
                  x={Math.min(p1.x, p2.x) - 2}
                  y={Math.min(p1.y, p2.y) - 2}
                  width={Math.abs(p2.x - p1.x) + 4}
                  height={Math.abs(p2.y - p1.y) + 4}
                  fill="rgba(250, 204, 21, 0.35)"
                  stroke="#eab308"
                  strokeWidth={1.5}
                />
              );
            })}

            {/* 3. AI 추출 후보 근거(bbox) 강조 표시 (근거 확인에만 사용하며 측정 경계로 사용하지 않음) */}
            {highlightedBboxPt &&
              (() => {
                const p1 = pdfPointToViewportPx(
                  { x: highlightedBboxPt.x, y: highlightedBboxPt.y },
                  pageWidthPt,
                  pageHeightPt,
                  zoom,
                  viewRotation
                );
                const p2 = pdfPointToViewportPx(
                  {
                    x: highlightedBboxPt.x + highlightedBboxPt.width,
                    y: highlightedBboxPt.y + highlightedBboxPt.height,
                  },
                  pageWidthPt,
                  pageHeightPt,
                  zoom,
                  viewRotation
                );
                const bx = Math.min(p1.x, p2.x);
                const by = Math.min(p1.y, p2.y);
                const bw = Math.abs(p2.x - p1.x);
                const bh = Math.abs(p2.y - p1.y);
                return (
                  <g>
                    <rect
                      x={bx}
                      y={by}
                      width={bw}
                      height={bh}
                      fill="rgba(245, 158, 11, 0.25)"
                      stroke="#d97706"
                      strokeWidth={2.5}
                    />
                    <text
                      x={bx}
                      y={Math.max(12, by - 5)}
                      fill="#b45309"
                      fontSize={11}
                      fontWeight="bold"
                    >
                      [AI 추출 근거 위치]
                    </text>
                  </g>
                );
              })()}

            {/* 4. 구역 산정선(AreaZone) 외곽 다각형·꼭짓점 편집·내부 공제 영역 */}
            {pageZones.map((zone, zIdx) => {
              if (zone.outerPolygonPt.length < 3) return null;
              const isSelected = zone.id === selectedZoneId;
              const outerViewportPts = zone.outerPolygonPt.map((pt) =>
                pdfPointToViewportPx(
                  pt,
                  pageWidthPt,
                  pageHeightPt,
                  zoom,
                  viewRotation
                )
              );
              const centroidVp = getPolygonCentroid(outerViewportPts);

              return (
                <g
                  key={zone.id}
                  onClick={(e) => {
                    if (toolMode === "pan" || toolMode === "draw_zone_deduction") {
                      e.stopPropagation();
                      setSelectedZoneId(zone.id);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <polygon
                    points={outerViewportPts
                      .map((p) => `${p.x},${p.y}`)
                      .join(" ")}
                    fill={
                      isSelected
                        ? "rgba(16, 185, 129, 0.28)"
                        : "rgba(16, 185, 129, 0.14)"
                    }
                    stroke={isSelected ? "#047857" : "#10b981"}
                    strokeWidth={isSelected ? 2.8 : 2}
                  />

                  {/* 내부 공제 영역 다각형 */}
                  {zone.deductionPolygonsPt.map((ded) => {
                    const dedVp = ded.pointsPt.map((pt) =>
                      pdfPointToViewportPx(
                        pt,
                        pageWidthPt,
                        pageHeightPt,
                        zoom,
                        viewRotation
                      )
                    );
                    const dCent = getPolygonCentroid(dedVp);
                    return (
                      <g key={ded.id}>
                        <polygon
                          points={dedVp.map((p) => `${p.x},${p.y}`).join(" ")}
                          fill="rgba(239, 68, 68, 0.28)"
                          stroke="#dc2626"
                          strokeWidth={2}
                        />
                        <text
                          x={dCent.x}
                          y={dCent.y}
                          textAnchor="middle"
                          fill="#991b1b"
                          fontSize={10}
                          fontWeight="bold"
                        >
                          [공제] {ded.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* 구역 번호 및 측정/채택 면적 라벨 */}
                  <rect
                    x={centroidVp.x - 58}
                    y={centroidVp.y - 18}
                    width={116}
                    height={34}
                    rx={4}
                    fill="rgba(255, 255, 255, 0.92)"
                    stroke={isSelected ? "#047857" : "#10b981"}
                    strokeWidth={1.2}
                  />
                  <text
                    x={centroidVp.x}
                    y={centroidVp.y - 4}
                    textAnchor="middle"
                    fill="#065f46"
                    fontSize={11}
                    fontWeight="bold"
                  >
                    [Z-{zIdx + 1}] {zone.name}
                  </text>
                  <text
                    x={centroidVp.x}
                    y={centroidVp.y + 10}
                    textAnchor="middle"
                    fill="#047857"
                    fontSize={10}
                  >
                    {zone.measuredNetAreaSqm !== null
                      ? `측정 ${zone.measuredNetAreaSqm.toFixed(2)}㎡`
                      : "축척 미보정"}
                  </text>

                  {/* 선택된 구역의 꼭짓점 편집 핸들 (드래그 이동 / 우클릭 삭제 / 변 중점 클릭 추가) */}
                  {isSelected &&
                    toolMode === "pan" &&
                    outerViewportPts.map((vp, vIdx) => {
                      const nextVp =
                        outerViewportPts[(vIdx + 1) % outerViewportPts.length]!;
                      const midVp = {
                        x: (vp.x + nextVp.x) / 2,
                        y: (vp.y + nextVp.y) / 2,
                      };
                      const ptA = zone.outerPolygonPt[vIdx]!;
                      const ptB =
                        zone.outerPolygonPt[
                          (vIdx + 1) % zone.outerPolygonPt.length
                        ]!;
                      const midPdfPt = {
                        x: (ptA.x + ptB.x) / 2,
                        y: (ptA.y + ptB.y) / 2,
                      };

                      return (
                        <g key={`v-${vIdx}`}>
                          {/* 변 중점 클릭 시 꼭짓점 추가 */}
                          <circle
                            cx={midVp.x}
                            cy={midVp.y}
                            r={4}
                            fill="#a7f3d0"
                            stroke="#047857"
                            strokeWidth={1}
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextPts = [...zone.outerPolygonPt];
                              nextPts.splice(vIdx + 1, 0, midPdfPt);
                              void updateZoneVertices(zone.id, nextPts);
                            }}
                          >
                            <title>클릭하여 꼭짓점 추가</title>
                          </circle>

                          {/* 꼭짓점 드래그 이동 또는 더블클릭 삭제 */}
                          <circle
                            cx={vp.x}
                            cy={vp.y}
                            r={5.5}
                            fill="#ffffff"
                            stroke="#047857"
                            strokeWidth={2}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setDraggingVertex({
                                zoneId: zone.id,
                                vertexIndex: vIdx,
                              });
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              if (zone.outerPolygonPt.length <= 3) {
                                alert(
                                  "다각형은 최소 3개의 꼭짓점이 필요합니다."
                                );
                                return;
                              }
                              const nextPts = zone.outerPolygonPt.filter(
                                (_, idx) => idx !== vIdx
                              );
                              void updateZoneVertices(zone.id, nextPts);
                            }}
                          >
                            <title>
                              드래그하여 꼭짓점 이동 / 더블클릭하여 꼭짓점 삭제
                            </title>
                          </circle>
                        </g>
                      );
                    })}
                </g>
              );
            })}

            {/* 5. 현재 작성 중인 다각형/선분 미리보기 */}
            {draftPointsPt.length > 0 && (
              <g>
                <polyline
                  points={[...draftPointsPt, ...(cursorPt ? [cursorPt] : [])]
                    .map((pt) => {
                      const vp = pdfPointToViewportPx(
                        pt,
                        pageWidthPt,
                        pageHeightPt,
                        zoom,
                        viewRotation
                      );
                      return `${vp.x},${vp.y}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                />
                {draftPointsPt.map((pt, idx) => {
                  const vp = pdfPointToViewportPx(
                    pt,
                    pageWidthPt,
                    pageHeightPt,
                    zoom,
                    viewRotation
                  );
                  return (
                    <circle
                      key={idx}
                      cx={vp.x}
                      cy={vp.y}
                      r={idx === 0 ? 6 : 4}
                      fill={idx === 0 ? "#10b981" : "#2563eb"}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                  );
                })}
              </g>
            )}

            {/* 꼭짓점 스냅 인디케이터 */}
            {snappedIndicatorPt && (
              <circle
                cx={
                  pdfPointToViewportPx(
                    snappedIndicatorPt,
                    pageWidthPt,
                    pageHeightPt,
                    zoom,
                    viewRotation
                  ).x
                }
                cy={
                  pdfPointToViewportPx(
                    snappedIndicatorPt,
                    pageWidthPt,
                    pageHeightPt,
                    zoom,
                    viewRotation
                  ).y
                }
                r={7}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2}
              />
            )}
          </svg>
        </div>
      </div>

      {/* 하단 법적 고지 바 */}
      <div className="bg-white border-t border-slate-200 px-3.5 py-1.5 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
          <span>
            수동 경계는 사용자가 지정한 산정선입니다(벽 중심선·법정 산정선 자동 확정 아님). 단일 축척 보정은 심한 스캔 왜곡을 자동 복구하지 않습니다.
          </span>
        </div>
        <span>
          꼭짓점 드래그: 이동 · 변 중점 클릭: 꼭짓점 추가 · 꼭짓점 더블클릭: 삭제
        </span>
      </div>

      {/* 모달 1: 작업 도면 영역 생성 */}
      {pendingRegionRectPt && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              새 작업 도면 영역 등록 (페이지별 복수 축척 지원)
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  작업 영역 이름
                </label>
                <input
                  type="text"
                  value={newRegionName}
                  onChange={(e) => setNewRegionName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  연결할 층(선택)
                </label>
                <select
                  value={newRegionFloorId}
                  onChange={(e) => setNewRegionFloorId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">층 미지정</option>
                  {bundle.floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label} ({f.mainUse})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRegionRectPt(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  void createDrawingRegion({
                    pageIndex: activePageIndex,
                    name: newRegionName,
                    floorId: newRegionFloorId || null,
                    boundsPt: pendingRegionRectPt,
                  });
                  setPendingRegionRectPt(null);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
              >
                작업영역 생성 후 축척 보정
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모달 2: 축척 보정 또는 검산 치수 입력 */}
      {pendingScalePairPt && activeRegion && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              {pendingScalePairPt.isVerification
                ? `[${activeRegion.name}] 다른 치수로 축척 검산`
                : `[${activeRegion.name}] 두 점 실제 길이 입력 (축척 보정)`}
            </h3>
            <p className="text-xs text-slate-600">
              도면 기재 축척({activePage?.statedScaleText || "미기재"})은 참고 정보로만 표시하며, 사용자가 입력한 두 점 보정값으로 미터 좌표를 계산합니다.
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  실제 치수 수치
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={scaleInputLength}
                  onChange={(e) => setScaleInputLength(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  단위
                </label>
                <select
                  value={scaleInputUnit}
                  onChange={(e) =>
                    setScaleInputUnit(e.target.value as "mm" | "m")
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="mm">mm</option>
                  <option value="m">m</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingScalePairPt(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const val = Number(scaleInputLength);
                  if (!val || val <= 0) return;
                  if (pendingScalePairPt.isVerification) {
                    const expectedM =
                      scaleInputUnit === "mm" ? val / 1000 : val;
                    void applyRegionVerificationMeasurement({
                      regionId: activeRegion.id,
                      p1: pendingScalePairPt.p1,
                      p2: pendingScalePairPt.p2,
                      expectedLengthM: expectedM,
                    });
                  } else {
                    void applyRegionCalibration({
                      regionId: activeRegion.id,
                      p1: pendingScalePairPt.p1,
                      p2: pendingScalePairPt.p2,
                      realLengthInput: val,
                      unit: scaleInputUnit,
                    });
                  }
                  setPendingScalePairPt(null);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모달 3: 다각형 측정 구역 생성 */}
      {pendingZonePolyPt && activeRegion && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              기하 측정 구역 등록
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  구역 이름 (실명)
                </label>
                <input
                  type="text"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  소속 층
                </label>
                <select
                  value={newZoneFloorId}
                  onChange={(e) => setNewZoneFloorId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  {bundle.floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label} ({f.mainUse})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  용도 분류
                </label>
                <input
                  type="text"
                  value={newZoneUsage}
                  onChange={(e) => setNewZoneUsage(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingZonePolyPt(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  void createMeasuredZoneFromPolygon({
                    name: newZoneName,
                    floorId: newZoneFloorId || (bundle.floors[0]?.id ?? ""),
                    usage: newZoneUsage,
                    regionId: activeRegion.id,
                    pageIndex: activePageIndex,
                    outerPolygonPt: pendingZonePolyPt,
                  });
                  setPendingZonePolyPt(null);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
              >
                구역 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모달 4: 내부 공제 다각형 추가 */}
      {pendingDeductionPolyPt && selectedZoneId && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              외곽 내부 공제 영역 등록 (겹치는 공제는 합집합 차감)
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  공제 명칭
                </label>
                <input
                  type="text"
                  value={newDeductionLabel}
                  onChange={(e) => setNewDeductionLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  공제 사유
                </label>
                <input
                  type="text"
                  value={newDeductionReason}
                  onChange={(e) => setNewDeductionReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeductionPolyPt(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  void addDeductionToZone({
                    zoneId: selectedZoneId,
                    label: newDeductionLabel,
                    reason: newDeductionReason,
                    pointsPt: pendingDeductionPolyPt,
                  });
                  setPendingDeductionPolyPt(null);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold"
              >
                공제 반영
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
