"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  MousePointer2,
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
  MoreHorizontal,
  Hexagon,
  CircleCheck,
  AlertTriangle,
  Info,
  PanelRightOpen,
  FileUp,
  Loader2,
} from "lucide-react";
import { useWorkspaceStore, type DrawingToolMode } from "@/store/workspace-store";
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

interface ToolDef {
  mode: DrawingToolMode;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  activeClass: string;
  title: string;
}

const PRIMARY_TOOLS: ToolDef[] = [
  {
    mode: "pan",
    label: "선택",
    shortcut: "V",
    icon: <MousePointer2 className="w-3.5 h-3.5" />,
    activeClass: "bg-slate-900 text-white",
    title: "선택·이동 — 구역 선택 및 꼭짓점 편집",
  },
  {
    mode: "draw_region",
    label: "작업영역",
    shortcut: "1",
    icon: <Square className="w-3.5 h-3.5" />,
    activeClass: "bg-blue-600 text-white",
    title: "1단계: 작업영역 지정 (페이지별 복수 축척 지원)",
  },
  {
    mode: "calibrate_scale",
    label: "축척 보정",
    shortcut: "2",
    icon: <Ruler className="w-3.5 h-3.5" />,
    activeClass: "bg-blue-600 text-white",
    title: "2단계: 두 점을 찍고 실제 길이를 입력해 축척 보정",
  },
  {
    mode: "draw_zone_outer",
    label: "구역 작성",
    shortcut: "3",
    icon: <PenTool className="w-3.5 h-3.5" />,
    activeClass: "bg-emerald-600 text-white",
    title: "3단계: 구역 산정선(외곽 다각형) 작성",
  },
  {
    mode: "draw_zone_deduction",
    label: "공제",
    shortcut: "4",
    icon: <Scissors className="w-3.5 h-3.5" />,
    activeClass: "bg-rose-600 text-white",
    title: "4단계: 선택한 구역 내부 공제 영역 작성",
  },
];

const SECONDARY_TOOLS: ToolDef[] = [
  {
    mode: "verify_scale",
    label: "축척 검산",
    shortcut: "",
    icon: <Crosshair className="w-3.5 h-3.5" />,
    activeClass: "bg-indigo-600 text-white",
    title: "다른 치수로 축척 확인",
  },
  {
    mode: "draw_envelope",
    label: "기준 외곽 지정",
    shortcut: "",
    icon: <Hexagon className="w-3.5 h-3.5" />,
    activeClass: "bg-purple-600 text-white",
    title: "공간 누락 검사용 기준 외곽 다각형 지정",
  },
];

function EmptyDrawingDropzone() {
  const uploadNewPdfDocument = useWorkspaceStore((s) => s.uploadNewPdfDocument);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadNewPdfDocument(file);
    } catch {
      // 상단 오류 배너(store.errorMessage)로 안내됨
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-slate-100">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`w-full max-w-xl flex flex-col items-center gap-3 px-8 py-14 rounded-3xl border-2 border-dashed transition cursor-pointer ${
          dragOver
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/30"
        }`}
      >
        <span className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/25">
          {uploading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <FileUp className="w-6 h-6" />
          )}
        </span>
        <span className="text-base font-bold text-slate-900">
          {uploading ? "도면을 확인하고 있습니다..." : "도면 PDF를 올려 작업을 시작하세요"}
        </span>
        <span className="text-xs text-slate-500">
          끌어다 놓거나 클릭해서 선택 · 20MB · 30페이지 이하
        </span>
      </button>
    </div>
  );
}

const LEGAL_NOTICE =
  "수동 경계는 사용자가 지정한 산정선입니다(벽 중심선·법정 산정선 자동 확정 아님). 단일 축척 보정은 심한 스캔 왜곡을 자동 복구하지 않습니다.";

export function CenterCanvasEditor({
  showRightPanel = true,
  onOpenRightPanel,
}: {
  showRightPanel?: boolean;
  onOpenRightPanel?: () => void;
}) {
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

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!moreMenuRef.current?.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [moreMenuOpen]);

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

  const hasOpenDialog =
    pendingRegionRectPt !== null ||
    pendingScalePairPt !== null ||
    pendingZonePolyPt !== null ||
    pendingDeductionPolyPt !== null;

  keyHandlerRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return;
    }
    if (hasOpenDialog) return;

    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === "z") {
      e.preventDefault();
      void (e.shiftKey ? redoGeometry() : undoGeometry());
      return;
    }
    if (mod && key === "y") {
      e.preventDefault();
      void redoGeometry();
      return;
    }
    if (mod || e.altKey) return;

    switch (key) {
      case "escape":
        if (draftPointsPt.length > 0) setDraftPointsPt([]);
        else setToolMode("pan");
        break;
      case "enter":
        if (draftPointsPt.length >= 3) finishPolygonDraft();
        break;
      case "v":
        setToolMode("pan");
        break;
      case "1":
        setToolMode("draw_region");
        break;
      case "2":
        setToolMode("calibrate_scale");
        break;
      case "3":
        setToolMode("draw_zone_outer");
        break;
      case "4":
        setToolMode("draw_zone_deduction");
        break;
      case "+":
      case "=":
        setZoom(zoom + 0.15);
        break;
      case "-":
        setZoom(zoom - 0.15);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const selectedZone =
    pageZones.find((z) => z.id === selectedZoneId) ?? null;

  const stepDone: Partial<Record<DrawingToolMode, boolean>> = {
    draw_region: pageRegions.length > 0,
    calibrate_scale: Boolean(activeRegion?.metersPerPdfPoint),
    draw_zone_outer: pageZones.some((z) => z.outerPolygonPt.length >= 3),
  };

  const isDrawingTool =
    toolMode === "draw_zone_outer" ||
    toolMode === "draw_zone_deduction" ||
    toolMode === "draw_envelope" ||
    toolMode === "calibrate_scale" ||
    toolMode === "verify_scale";

  const toolGuide = (() => {
    const n = draftPointsPt.length;
    switch (toolMode) {
      case "pan":
        return selectedZone
          ? `[${selectedZone.name}] 선택됨 · 꼭짓점 드래그: 이동 · 변 중점 클릭: 추가 · 꼭짓점 더블클릭: 삭제`
          : "구역을 클릭해 선택하세요. 숫자키 1~4로 작업 단계를 바로 고를 수 있습니다.";
      case "draw_region":
        return n === 0
          ? "작업영역의 첫 번째 모서리를 클릭하세요."
          : "반대쪽 모서리를 클릭하면 작업영역이 만들어집니다.";
      case "calibrate_scale":
        if (!activeRegion) return "먼저 1단계 작업영역을 지정하세요.";
        return n === 0
          ? "실제 길이를 아는 치수선의 시작점을 클릭하세요."
          : "치수선의 끝점을 클릭하면 실제 길이를 입력합니다.";
      case "verify_scale":
        if (!activeRegion) return "먼저 1단계 작업영역을 지정하세요.";
        return n === 0
          ? "검산할 다른 치수선의 시작점을 클릭하세요."
          : "끝점을 클릭하면 기대 길이를 입력합니다.";
      case "draw_zone_outer":
        if (!activeRegion) return "먼저 1단계 작업영역을 지정하세요.";
        return n < 3
          ? "구역 외곽 꼭짓점을 차례로 클릭하세요."
          : "시작점을 다시 클릭하거나 Enter로 다각형을 닫습니다.";
      case "draw_zone_deduction":
        if (!selectedZoneId)
          return "공제할 대상 구역을 먼저 클릭해 선택하세요.";
        return n < 3
          ? "공제할 영역의 꼭짓점을 차례로 클릭하세요."
          : "시작점을 다시 클릭하거나 Enter로 공제 영역을 닫습니다.";
      case "draw_envelope":
        return n < 3
          ? "공간 누락 검사용 기준 외곽 꼭짓점을 차례로 클릭하세요."
          : "시작점을 다시 클릭하거나 Enter로 닫습니다.";
      default:
        return "";
    }
  })();

  const activeSecondaryTool = SECONDARY_TOOLS.find((t) => t.mode === toolMode);

  const renderToolButton = (tool: ToolDef) => {
    const isActive = toolMode === tool.mode;
    const done = stepDone[tool.mode];
    return (
      <button
        key={tool.mode}
        type="button"
        onClick={() => setToolMode(tool.mode)}
        title={`${tool.title}${tool.shortcut ? ` (단축키 ${tool.shortcut})` : ""}`}
        className={`relative inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
          isActive ? tool.activeClass : "text-slate-600 hover:bg-white hover:text-slate-900"
        }`}
      >
        {tool.icon}
        <span>{tool.label}</span>
        {done && !isActive && (
          <CircleCheck className="w-3 h-3 text-emerald-600" aria-label="완료" />
        )}
      </button>
    );
  };

  return (
    <section className="flex-1 flex flex-col bg-slate-100 min-w-0 relative overflow-hidden">
      {/* 상단 도면 편집 툴바 (한 줄: 단계별 도구 · 보기 조절) */}
      <div className="bg-white border-b border-slate-200 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
            {PRIMARY_TOOLS.map(renderToolButton)}
          </div>

          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeSecondaryTool
                  ? activeSecondaryTool.activeClass
                  : moreMenuOpen
                  ? "bg-slate-200 text-slate-900"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              title="추가 도구 및 보조 설정"
            >
              {activeSecondaryTool ? (
                <>
                  {activeSecondaryTool.icon}
                  <span>{activeSecondaryTool.label}</span>
                </>
              ) : (
                <MoreHorizontal className="w-4 h-4" />
              )}
            </button>

            {moreMenuOpen && (
              <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-30 text-xs">
                <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold text-slate-400">
                  추가 도구
                </div>
                {SECONDARY_TOOLS.map((tool) => (
                  <button
                    key={tool.mode}
                    type="button"
                    onClick={() => {
                      setToolMode(tool.mode);
                      setMoreMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left cursor-pointer ${
                      toolMode === tool.mode
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                    title={tool.title}
                  >
                    {tool.icon}
                    <span className="font-semibold">{tool.label}</span>
                  </button>
                ))}

                <div className="my-1.5 border-t border-slate-100" />
                <div className="px-2 pb-1.5 text-[10px] font-semibold text-slate-400">
                  작성 보조
                </div>
                <label className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-100 cursor-pointer text-slate-700">
                  <span>직교 보조 (Shift 누른 채 작성)</span>
                  <input
                    type="checkbox"
                    checked={orthogonalLock}
                    onChange={(e) => setOrthogonalLock(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                </label>
                <label
                  className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-100 cursor-pointer text-slate-700"
                  title="사용자가 작성한 꼭짓점에 스냅 (원본 PDF 선 자동 스냅은 제외)"
                >
                  <span>꼭짓점 스냅</span>
                  <input
                    type="checkbox"
                    checked={snapEnabled}
                    onChange={(e) => setSnapEnabled(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void rotateActivePage(90)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-slate-700 hover:bg-slate-100 cursor-pointer"
                  title="화면 표시만 회전합니다 (저장 좌표 불변)"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>화면 90° 회전</span>
                </button>

                <div className="my-1.5 border-t border-slate-100" />
                <div className="px-2 py-1 text-[10px] leading-relaxed text-slate-400">
                  단축키: V 선택 · 1~4 단계 도구 · Enter 닫기 · Esc 취소 · Ctrl+Z / Ctrl+Y · +/- 확대·축소
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
            <button
              type="button"
              disabled={undoStack.length === 0}
              onClick={() => void undoGeometry()}
              className="p-1.5 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 cursor-pointer"
              title="실행 취소 (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={redoStack.length === 0}
              onClick={() => void redoGeometry()}
              className="p-1.5 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 border-l border-slate-200 cursor-pointer"
              title="다시 실행 (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setZoom(zoom - 0.15)}
              className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="축소 (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-1.5 font-mono text-[11px] text-slate-700 hover:bg-slate-100 min-w-[44px] cursor-pointer"
              title="100%로 되돌리기"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom(zoom + 0.15)}
              className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="확대 (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {searchOpen || searchQuery ? (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => setSearchOpen(false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchQuery("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="페이지 내 원문 검색"
                className="pl-7 pr-12 py-1 text-xs border border-slate-300 rounded-lg w-48 focus:outline-none focus:border-blue-500"
              />
              {searchQuery && (
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                  {matchedSearchItems.length}건
                </span>
              )}
              {searchQuery && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title="검색어 지우기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="페이지 내 원문 검색"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          )}

          {!showRightPanel && onOpenRightPanel && (
            <button
              type="button"
              onClick={onOpenRightPanel}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="우측 검토 패널 열기"
            >
              <PanelRightOpen className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 작업 맥락 & 다음 행동 안내 바 */}
      <div
        className={`px-3 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 shrink-0 border-b ${
          toolMode === "pan"
            ? "bg-slate-50 border-slate-200 text-slate-600"
            : "bg-blue-50 border-blue-200 text-blue-900"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="px-1.5 py-0.5 rounded bg-slate-900 text-white font-bold text-[11px] shrink-0"
            title={`도면 기재 축척 참고값: ${activePage?.statedScaleText || "미기재"}`}
          >
            P.{activePageIndex}
          </span>

          {pageRegions.length > 1 ? (
            <select
              value={activeRegion?.id ?? ""}
              onChange={(e) => setSelectedRegionId(e.target.value || null)}
              className="px-1.5 py-0.5 border border-slate-300 rounded bg-white text-[11px] font-medium text-slate-800 max-w-[160px]"
              title="작업영역 선택"
            >
              {pageRegions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : activeRegion ? (
            <span className="text-[11px] font-medium text-slate-700 truncate max-w-[160px]">
              {activeRegion.name}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setToolMode("draw_region")}
              className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer shrink-0"
            >
              + 작업영역 지정
            </button>
          )}

          {activeRegion &&
            (activeRegion.metersPerPdfPoint ? (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold shrink-0"
                title={`1 pt = ${activeRegion.metersPerPdfPoint.toFixed(4)} m${
                  activeRegion.verificationMeasurement
                    ? ` · 검산 오차 ${activeRegion.verificationMeasurement.diffM.toFixed(3)} m`
                    : ""
                }`}
              >
                <CircleCheck className="w-3 h-3" />
                축척 보정됨
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setToolMode("calibrate_scale")}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-semibold hover:bg-amber-100 shrink-0 cursor-pointer"
                title="보정 전에는 측정 면적을 확정할 수 없습니다. 클릭하여 축척 보정 시작"
              >
                <AlertTriangle className="w-3 h-3" />
                축척 미보정 · 보정하기
              </button>
            ))}

          <span className="text-slate-300 shrink-0">|</span>
          <span className="truncate" title={toolGuide}>
            {toolGuide}
            {isDrawingTool && draftPointsPt.length > 0 && " (Shift: 직교 · Esc: 취소)"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {draftPointsPt.length > 0 && (
            <>
              <span className="font-semibold text-amber-700">
                점 {draftPointsPt.length}개
                {draftPreviewAreaSqm !== null &&
                  ` · 예상 ${draftPreviewAreaSqm.toFixed(2)} ㎡`}
              </span>
              {draftPointsPt.length >= 3 && (
                <button
                  type="button"
                  onClick={finishPolygonDraft}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  닫기·완료
                </button>
              )}
              <button
                type="button"
                onClick={() => setDraftPointsPt([])}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                <X className="w-3 h-3" />
                취소
              </button>
            </>
          )}
          <span className="text-slate-400 cursor-help" title={LEGAL_NOTICE}>
            <Info className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>

      {!pdfBytes && <EmptyDrawingDropzone />}

      {/* 중앙 캔버스 + SVG 산정선·근거 오버레이 영역 */}
      <div
        className={`flex-1 overflow-auto p-6 flex items-start justify-center bg-slate-200/70 ${
          pdfBytes ? "" : "hidden"
        }`}
      >
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
