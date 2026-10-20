import { create } from "zustand";
import { getStorageRepository } from "@/lib/storage";
import {
  computeProjectAggregation,
  recalculateZoneValues,
  runProjectValidations,
} from "@/lib/services/aggregation-validator";
import {
  extractPageTextAndPositions,
  MAX_ANALYSIS_SELECTED_PAGES,
  renderPageForAiAnalysis,
  validateAndInspectPdfFile,
} from "@/lib/pdf/pdf-engine";
import { calculateMetersPerPdfPoint, distance2D } from "@/lib/geometry/planar";
import type {
  AreaBasisType,
  AreaDeductionPolygon,
  AreaZone,
  AutoSaveStatus,
  BoundingBox,
  Building,
  DrawingDocument,
  DrawingPage,
  DrawingRegion,
  ExportSnapshot,
  ExtractionCandidate,
  ExtractionRun,
  Floor,
  PageClassification,
  Point2D,
  Project,
  ProjectAggregationResult,
  ProjectWorkspaceBundle,
  ReviewStatus,
  ValidationIssue,
} from "@/types/domain";

export type DrawingToolMode =
  | "pan"
  | "draw_region"
  | "calibrate_scale"
  | "verify_scale"
  | "draw_envelope"
  | "draw_zone_outer"
  | "draw_zone_deduction";

interface GeometryHistorySnapshot {
  regions: DrawingRegion[];
  zones: AreaZone[];
}

interface WorkspaceStoreState {
  ownerId: string;
  ownerEmail: string;
  bundle: ProjectWorkspaceBundle | null;
  pdfBytes: Uint8Array | null;
  isLoading: boolean;
  errorMessage: string | null;

  // 자동 저장 상태: 저장 중 / 저장 완료 / 저장 실패 / 다시 시도
  autoSaveStatus: AutoSaveStatus;
  autoSaveError: string | null;
  hasUnsavedChanges: boolean;

  // 뷰어 상태
  activePageIndex: number;
  zoom: number;
  toolMode: DrawingToolMode;
  orthogonalLock: boolean;
  snapEnabled: boolean;
  searchQuery: string;
  highlightedBboxPt: BoundingBox | null;
  selectedRegionId: string | null;
  selectedZoneId: string | null;
  selectedCandidateId: string | null;

  // 실행 취소 / 다시 실행 스택
  undoStack: GeometryHistorySnapshot[];
  redoStack: GeometryHistorySnapshot[];

  // 파생 계산 결과
  aggregation: ProjectAggregationResult | null;
  validationIssues: ValidationIssue[];

  // 액션
  setAuthIdentity: (ownerId: string, ownerEmail: string) => void;
  loadWorkspace: (projectId: string) => Promise<void>;
  retrySave: () => Promise<void>;
  setActivePageIndex: (pageIndex: number) => void;
  setZoom: (zoom: number) => void;
  rotateActivePage: (deltaDeg: number) => Promise<void>;
  setToolMode: (mode: DrawingToolMode) => void;
  setOrthogonalLock: (locked: boolean) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setSearchQuery: (q: string) => void;
  focusCandidateEvidence: (candidate: ExtractionCandidate) => void;
  setSelectedRegionId: (regionId: string | null) => void;
  setSelectedZoneId: (zoneId: string | null) => void;

  // 기본정보 및 층 편집
  updateProjectAndBuilding: (
    projectPatch: Partial<Project>,
    buildingPatch: Partial<Building>,
    updatedFloors?: Floor[]
  ) => Promise<void>;
  addFloor: (floor: Omit<Floor, "id" | "projectId" | "buildingId" | "ownerId" | "updatedAt">) => Promise<void>;
  removeFloor: (floorId: string) => Promise<void>;

  // PDF 업로드 (새 문서 버전 관리)
  uploadNewPdfDocument: (file: File) => Promise<void>;

  // 페이지 분류 및 분석 선택
  updatePageClassification: (
    pageIndex: number,
    classification: PageClassification
  ) => Promise<void>;
  togglePageForAnalysis: (pageIndex: number) => Promise<void>;

  // AI 분석 실행 및 재시도
  runSelectedPagesExtraction: (
    getIdTokenFn?: () => Promise<string | null>,
    onlyPageIndices?: number[]
  ) => Promise<void>;

  // 추출 후보 검토 (수정·확정·반려 및 공식 데이터 반영)
  reviewCandidate: (params: {
    candidateId: string;
    status: ReviewStatus;
    editedValue?: number | string | null;
    applyToOfficialData?: boolean;
    targetFloorId?: string;
  }) => Promise<void>;

  // 작업 영역 & 축척 보정
  createDrawingRegion: (params: {
    pageIndex: number;
    name: string;
    floorId: string | null;
    boundsPt: BoundingBox;
  }) => Promise<void>;
  applyRegionCalibration: (params: {
    regionId: string;
    p1: Point2D;
    p2: Point2D;
    realLengthInput: number;
    unit: "mm" | "m";
  }) => Promise<void>;
  applyRegionVerificationMeasurement: (params: {
    regionId: string;
    p1: Point2D;
    p2: Point2D;
    expectedLengthM: number;
  }) => Promise<void>;
  setRegionReferenceEnvelope: (
    regionId: string,
    polygonPt: Point2D[] | null
  ) => Promise<void>;
  deleteRegion: (regionId: string) => Promise<void>;

  // 구역 및 다각형 경계 편집 (Undo / Redo 지원)
  pushGeometryHistory: () => void;
  undoGeometry: () => Promise<void>;
  redoGeometry: () => Promise<void>;
  createMeasuredZoneFromPolygon: (params: {
    name: string;
    floorId: string;
    usage: string;
    regionId: string;
    pageIndex: number;
    outerPolygonPt: Point2D[];
  }) => Promise<void>;
  addDeductionToZone: (params: {
    zoneId: string;
    label: string;
    reason: string;
    pointsPt: Point2D[];
  }) => Promise<void>;
  removeDeductionFromZone: (
    zoneId: string,
    deductionId: string
  ) => Promise<void>;
  updateZoneVertices: (
    zoneId: string,
    outerPolygonPt: Point2D[],
    deductionPolygonsPt?: AreaDeductionPolygon[]
  ) => Promise<void>;
  createManualOrStatedZone: (params: {
    name: string;
    floorId: string;
    usage: string;
    basisType: AreaBasisType;
    areaValueSqm: number;
  }) => Promise<void>;
  updateZoneMetaAndInclusion: (
    zoneId: string,
    patch: Partial<AreaZone>,
    adjustmentReasonIfChanged?: string
  ) => Promise<void>;
  deleteZone: (zoneId: string) => Promise<void>;

  // 불변 확정본(스냅샷) 저장
  createImmutableSnapshot: (params: {
    label: string;
    isImmutableConfirmed: boolean;
    excelBytes: Uint8Array;
    pdfBytes: Uint8Array;
  }) => Promise<ExportSnapshot>;
}

function recomputeDerived(bundle: ProjectWorkspaceBundle): {
  bundle: ProjectWorkspaceBundle;
  aggregation: ProjectAggregationResult;
  validationIssues: ValidationIssue[];
} {
  const recalculatedZones = bundle.zones.map((z) => {
    const reg = bundle.regions.find((r) => r.id === z.regionId);
    return recalculateZoneValues(z, reg);
  });

  const nextBundle: ProjectWorkspaceBundle = {
    ...bundle,
    zones: recalculatedZones,
  };

  const aggregation = computeProjectAggregation({
    project: nextBundle.project,
    building: nextBundle.building,
    floors: nextBundle.floors,
    zones: nextBundle.zones,
    candidates: nextBundle.candidates,
  });

  const validationIssues = runProjectValidations({
    project: nextBundle.project,
    building: nextBundle.building,
    floors: nextBundle.floors,
    documents: nextBundle.documents,
    regions: nextBundle.regions,
    candidates: nextBundle.candidates,
    zones: nextBundle.zones,
    aggregation,
  });

  return { bundle: nextBundle, aggregation, validationIssues };
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  ownerId: "demo-local-architect",
  ownerEmail: "demo@myeonjeok.local",
  bundle: null,
  pdfBytes: null,
  isLoading: false,
  errorMessage: null,

  autoSaveStatus: "idle",
  autoSaveError: null,
  hasUnsavedChanges: false,

  activePageIndex: 1,
  zoom: 1.0,
  toolMode: "pan",
  orthogonalLock: false,
  snapEnabled: true,
  searchQuery: "",
  highlightedBboxPt: null,
  selectedRegionId: null,
  selectedZoneId: null,
  selectedCandidateId: null,

  undoStack: [],
  redoStack: [],

  aggregation: null,
  validationIssues: [],

  setAuthIdentity: (ownerId, ownerEmail) => {
    set({ ownerId, ownerEmail });
  },

  loadWorkspace: async (projectId) => {
    set({ isLoading: true, errorMessage: null });
    try {
      const repo = getStorageRepository();
      const { ownerId } = get();
      const loaded = await repo.getProjectBundle(ownerId, projectId);
      if (!loaded) {
        throw new Error("프로젝트 데이터를 찾을 수 없습니다.");
      }

      const { bundle, aggregation, validationIssues } =
        recomputeDerived(loaded);

      let pdfBytes: Uint8Array | null = null;
      const activeDoc =
        bundle.documents.find((d) => d.id === bundle.project.activeDocumentId) ??
        bundle.documents[bundle.documents.length - 1] ??
        null;

      let pdfLoadError: string | null = null;
      if (activeDoc) {
        try {
          pdfBytes = await repo.loadPdfBytes(ownerId, activeDoc);
        } catch (err: unknown) {
          pdfBytes = null;
          pdfLoadError =
            err instanceof Error
              ? err.message
              : "도면 PDF를 불러오지 못했습니다.";
        }
      }

      const firstPageRegion = bundle.regions.find((r) => r.pageIndex === 1);

      set({
        bundle,
        pdfBytes,
        aggregation,
        validationIssues,
        activePageIndex: 1,
        selectedRegionId: firstPageRegion?.id ?? bundle.regions[0]?.id ?? null,
        selectedZoneId: null,
        isLoading: false,
        autoSaveStatus: "saved",
        hasUnsavedChanges: false,
        errorMessage: pdfLoadError,
      });
    } catch (err: unknown) {
      set({
        isLoading: false,
        errorMessage:
          err instanceof Error
            ? err.message
            : "워크스페이스를 불러오지 못했습니다.",
      });
    }
  },

  retrySave: async () => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    set({ autoSaveStatus: "saving", autoSaveError: null });
    try {
      const repo = getStorageRepository();
      await repo.saveProjectBundle(ownerId, bundle);
      set({
        autoSaveStatus: "saved",
        autoSaveError: null,
        hasUnsavedChanges: false,
      });
    } catch (err: unknown) {
      set({
        autoSaveStatus: "error",
        autoSaveError:
          err instanceof Error ? err.message : "자동 저장에 실패했습니다.",
        hasUnsavedChanges: true,
      });
    }
  },

  setActivePageIndex: (pageIndex) => {
    const { bundle } = get();
    const pageRegion = bundle?.regions.find((r) => r.pageIndex === pageIndex);
    set({
      activePageIndex: pageIndex,
      highlightedBboxPt: null,
      selectedRegionId: pageRegion?.id ?? null,
    });
  },

  setZoom: (zoom) => {
    const clamped = Math.max(0.4, Math.min(2.8, zoom));
    set({ zoom: clamped });
  },

  rotateActivePage: async (deltaDeg) => {
    const { bundle, activePageIndex, ownerId } = get();
    if (!bundle) return;
    const page = bundle.pages.find((p) => p.pageIndex === activePageIndex);
    if (!page) return;

    const nextRot = (((page.viewRotation + deltaDeg) % 360) + 360) % 360;
    const updatedPage: DrawingPage = {
      ...page,
      viewRotation: nextRot,
      updatedAt: new Date().toISOString(),
    };

    const nextPages = bundle.pages.map((p) =>
      p.id === updatedPage.id ? updatedPage : p
    );
    const nextBundle = { ...bundle, pages: nextPages };
    set({ bundle: nextBundle, autoSaveStatus: "saving" });

    try {
      await getStorageRepository().saveDrawingPage(ownerId, updatedPage);
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch (err: unknown) {
      set({
        autoSaveStatus: "error",
        autoSaveError: err instanceof Error ? err.message : "페이지 회전 저장 실패",
        hasUnsavedChanges: true,
      });
    }
  },

  setToolMode: (toolMode) => set({ toolMode }),
  setOrthogonalLock: (orthogonalLock) => set({ orthogonalLock }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  focusCandidateEvidence: (candidate) => {
    set({
      activePageIndex: candidate.pageIndex,
      selectedCandidateId: candidate.id,
      highlightedBboxPt: candidate.pdfBboxPt,
      searchQuery: candidate.pdfBboxPt ? "" : candidate.rawValue,
    });
  },

  setSelectedRegionId: (selectedRegionId) => set({ selectedRegionId }),
  setSelectedZoneId: (selectedZoneId) => set({ selectedZoneId }),

  updateProjectAndBuilding: async (projectPatch, buildingPatch, updatedFloors) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;

    const now = new Date().toISOString();
    const nextProject: Project = {
      ...bundle.project,
      ...projectPatch,
      updatedAt: now,
    };
    const nextBuilding: Building = {
      ...bundle.building,
      ...buildingPatch,
      updatedAt: now,
    };
    const nextFloors = updatedFloors ?? bundle.floors;

    const recomputed = recomputeDerived({
      ...bundle,
      project: nextProject,
      building: nextBuilding,
      floors: nextFloors,
    });

    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveProjectAndBuilding(
        ownerId,
        recomputed.bundle.project,
        recomputed.bundle.building,
        recomputed.bundle.floors
      );
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch (err: unknown) {
      set({
        autoSaveStatus: "error",
        autoSaveError: err instanceof Error ? err.message : "기본정보 저장 실패",
        hasUnsavedChanges: true,
      });
    }
  },

  addFloor: async (floorInput) => {
    const { bundle } = get();
    if (!bundle) return;
    const now = new Date().toISOString();
    const newFloor: Floor = {
      ...floorInput,
      id: `floor-${bundle.project.id}-${Date.now()}`,
      projectId: bundle.project.id,
      buildingId: bundle.building.id,
      ownerId: bundle.project.ownerId,
      updatedAt: now,
    };
    await get().updateProjectAndBuilding(
      {},
      {},
      [...bundle.floors, newFloor].sort((a, b) => a.orderIndex - b.orderIndex)
    );
  },

  removeFloor: async (floorId) => {
    const { bundle } = get();
    if (!bundle) return;
    const nextFloors = bundle.floors.filter((f) => f.id !== floorId);
    await get().updateProjectAndBuilding({}, {}, nextFloors);
  },

  uploadNewPdfDocument: async (file) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;

    set({ isLoading: true, errorMessage: null, autoSaveStatus: "saving" });
    try {
      const inspected = await validateAndInspectPdfFile(file);
      const repo = getStorageRepository();

      const nextVersion =
        bundle.documents.reduce((max, d) => Math.max(max, d.version), 0) + 1;
      const docId = `doc-${bundle.project.id}-v${nextVersion}-${Date.now()}`;
      const now = new Date().toISOString();

      const storagePath = await repo.savePdfBlob(
        ownerId,
        bundle.project.id,
        docId,
        file.name,
        inspected.bytes
      );

      const newDoc: DrawingDocument = {
        id: docId,
        ownerId,
        projectId: bundle.project.id,
        originalFileName: file.name,
        storagePath,
        fileSize: file.size,
        documentHash: inspected.documentHash,
        version: nextVersion,
        pageCount: inspected.pageCount,
        uploadedAt: now,
      };

      // 새 PDF는 새 문서 버전으로 관리하며 이전 근거와 산정선을 새 PDF에 자동 이식하지 않는다.
      const newPages: DrawingPage[] = inspected.pagesMeta.map((pm) => ({
        id: `page-${docId}-${pm.pageIndex}`,
        ownerId,
        projectId: bundle.project.id,
        documentId: docId,
        documentVersion: nextVersion,
        pageIndex: pm.pageIndex,
        classification: "unclassified",
        classificationModifiedByUser: false,
        selectedForAnalysis: pm.pageIndex <= MAX_ANALYSIS_SELECTED_PAGES,
        analysisStatus: "idle",
        analysisError: null,
        widthPt: pm.widthPt,
        heightPt: pm.heightPt,
        nativeRotation: pm.nativeRotation,
        viewRotation: 0,
        statedScaleText: null,
        updatedAt: now,
      }));

      const nextProject: Project = {
        ...bundle.project,
        activeDocumentId: docId,
        updatedAt: now,
      };

      const recomputed = recomputeDerived({
        ...bundle,
        project: nextProject,
        documents: [...bundle.documents, newDoc],
        pages: newPages,
      });

      await repo.saveProjectBundle(ownerId, recomputed.bundle);

      set({
        bundle: recomputed.bundle,
        pdfBytes: inspected.bytes,
        aggregation: recomputed.aggregation,
        validationIssues: recomputed.validationIssues,
        activePageIndex: 1,
        isLoading: false,
        autoSaveStatus: "saved",
        hasUnsavedChanges: false,
      });
    } catch (err: unknown) {
      set({
        isLoading: false,
        autoSaveStatus: "error",
        errorMessage:
          err instanceof Error
            ? err.message
            : "PDF 업로드 및 검증 중 오류가 발생했습니다.",
      });
      throw err;
    }
  },

  updatePageClassification: async (pageIndex, classification) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    const page = bundle.pages.find((p) => p.pageIndex === pageIndex);
    if (!page) return;

    const updatedPage: DrawingPage = {
      ...page,
      classification,
      classificationModifiedByUser: true, // 재분석 시 덮어쓰기 방지 플래그
      updatedAt: new Date().toISOString(),
    };

    const nextBundle = {
      ...bundle,
      pages: bundle.pages.map((p) =>
        p.id === updatedPage.id ? updatedPage : p
      ),
    };
    set({ bundle: nextBundle, autoSaveStatus: "saving" });

    try {
      await getStorageRepository().saveDrawingPage(ownerId, updatedPage);
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch (err: unknown) {
      set({
        autoSaveStatus: "error",
        autoSaveError: err instanceof Error ? err.message : "페이지 분류 저장 실패",
        hasUnsavedChanges: true,
      });
    }
  },

  togglePageForAnalysis: async (pageIndex) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    const page = bundle.pages.find((p) => p.pageIndex === pageIndex);
    if (!page) return;

    const currentlySelectedCount = bundle.pages.filter(
      (p) => p.selectedForAnalysis
    ).length;

    if (
      !page.selectedForAnalysis &&
      currentlySelectedCount >= MAX_ANALYSIS_SELECTED_PAGES
    ) {
      set({
        errorMessage: `한 분석 작업에서는 최대 ${MAX_ANALYSIS_SELECTED_PAGES}페이지까지만 선택할 수 있습니다.`,
      });
      return;
    }

    const updatedPage: DrawingPage = {
      ...page,
      selectedForAnalysis: !page.selectedForAnalysis,
      updatedAt: new Date().toISOString(),
    };

    const nextBundle = {
      ...bundle,
      pages: bundle.pages.map((p) =>
        p.id === updatedPage.id ? updatedPage : p
      ),
    };
    set({ bundle: nextBundle, autoSaveStatus: "saving" });

    try {
      await getStorageRepository().saveDrawingPage(ownerId, updatedPage);
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  runSelectedPagesExtraction: async (getIdTokenFn, onlyPageIndices) => {
    const { bundle, pdfBytes, ownerId } = get();
    if (!bundle) return;

    const activeDoc =
      bundle.documents.find((d) => d.id === bundle.project.activeDocumentId) ??
      bundle.documents[bundle.documents.length - 1];

    if (!activeDoc) {
      set({ errorMessage: "먼저 건축도면 PDF를 업로드하세요." });
      return;
    }

    const targetPages = bundle.pages.filter((p) =>
      onlyPageIndices
        ? onlyPageIndices.includes(p.pageIndex)
        : p.selectedForAnalysis
    );

    if (targetPages.length === 0) {
      set({ errorMessage: "분석할 대상 페이지를 1페이지 이상 선택하세요." });
      return;
    }
    if (targetPages.length > MAX_ANALYSIS_SELECTED_PAGES) {
      set({
        errorMessage: `한 번에 최대 ${MAX_ANALYSIS_SELECTED_PAGES}페이지까지만 분석할 수 있습니다.`,
      });
      return;
    }

    const appMode = process.env.NEXT_PUBLIC_APP_MODE || "demo";
    const repo = getStorageRepository();
    const runId = `run-${Date.now()}`;
    const now = new Date().toISOString();

    // 로컬(demo) 모드에서는 외부 AI를 호출하지 않으므로 수동 측정·직접 입력만 지원
    if (appMode === "demo") {
      set({
        errorMessage:
          "로컬(데모) 모드에서는 AI 추출을 사용할 수 없습니다. 수동 면적 측정 및 직접 입력은 그대로 사용할 수 있으며, Gemini AI 추출을 사용하려면 .env.local에서 NEXT_PUBLIC_APP_MODE=live 및 Firebase·Gemini 환경변수를 설정하세요.",
      });
      return;
    }

    // =========================================================================
    // 실제 모드 (live): 페이지별 서버 요청 & 제한된 동시성(최대 2페이지 병렬)
    // =========================================================================
    if (!pdfBytes) {
      set({ errorMessage: "PDF 바이트 데이터가 메모리에 로드되지 않았습니다." });
      return;
    }

    const idToken = getIdTokenFn ? await getIdTokenFn() : null;
    if (!idToken) {
      set({ errorMessage: "실제 모드 AI 분석을 위해 Firebase 로그인이 필요합니다." });
      return;
    }

    const initialPageResults: ExtractionRun["pageResults"] = {};
    for (const tp of targetPages) {
      initialPageResults[tp.pageIndex] = {
        pageIndex: tp.pageIndex,
        status: "queued",
        errorMessage: null,
      };
    }

    let currentRun: ExtractionRun = {
      id: runId,
      ownerId,
      projectId: bundle.project.id,
      documentId: activeDoc.id,
      documentVersion: activeDoc.version,
      documentHash: activeDoc.documentHash,
      modelId: "gemini-live",
      promptVersion: "v1.3-room-stated-area",
      status: "running",
      isDemoFixtureRun: false,
      pageResults: initialPageResults,
      totalTokensUsed: 0,
      createdAt: now,
      updatedAt: now,
    };

    set({
      bundle: {
        ...bundle,
        runs: [currentRun, ...bundle.runs],
        pages: bundle.pages.map((p) =>
          targetPages.some((tp) => tp.pageIndex === p.pageIndex)
            ? { ...p, analysisStatus: "queued", analysisError: null }
            : p
        ),
      },
    });

    // 순차 또는 최대 2개 동시 요청으로 페이지별 실행 및 즉시 저장
    let completedCount = 0;
    let failedCount = 0;
    let accumulatedTokens = 0;

    for (const pageItem of targetPages) {
      const pIdx = pageItem.pageIndex;
      const latestBundle = get().bundle;
      if (!latestBundle) break;

      // 페이지 상태를 running으로 갱신
      set({
        bundle: {
          ...latestBundle,
          pages: latestBundle.pages.map((p) =>
            p.pageIndex === pIdx
              ? { ...p, analysisStatus: "running", analysisError: null }
              : p
          ),
        },
      });

      try {
        const [extractedTextItems, rendered] = await Promise.all([
          extractPageTextAndPositions(pdfBytes, pIdx),
          renderPageForAiAnalysis(pdfBytes, pIdx),
        ]);

        const res = await fetch("/api/ai/analyze-page", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            projectId: latestBundle.project.id,
            documentId: activeDoc.id,
            documentVersion: activeDoc.version,
            documentHash: activeDoc.documentHash,
            runId,
            pageIndex: pIdx,
            imageBase64: rendered.imageBase64,
            imageMimeType: rendered.imageMimeType,
            extractedTextItems,
            transformMeta: rendered.transformMeta,
          }),
        });

        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error || `페이지 ${pIdx} 분석 실패`);
        }

        completedCount += 1;
        const pageTokens = Number(payload.usage?.totalTokenCount || 0);
        accumulatedTokens += pageTokens;

        const updatedPage: DrawingPage = {
          ...pageItem,
          classification: pageItem.classificationModifiedByUser
            ? pageItem.classification
            : payload.pageClassification,
          statedScaleText: payload.statedScaleText ?? pageItem.statedScaleText,
          analysisStatus: "completed",
          analysisError: null,
          updatedAt: new Date().toISOString(),
        };

        currentRun = {
          ...currentRun,
          modelId: payload.modelId || currentRun.modelId,
          promptVersion: payload.promptVersion || currentRun.promptVersion,
          totalTokensUsed: accumulatedTokens,
          pageResults: {
            ...currentRun.pageResults,
            [pIdx]: {
              pageIndex: pIdx,
              status: "completed",
              errorMessage: null,
              totalTokens: pageTokens,
              completedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date().toISOString(),
        };

        const newCandidates: ExtractionCandidate[] = payload.candidates || [];
        await repo.saveExtractionRunAndCandidates(
          ownerId,
          currentRun,
          newCandidates,
          updatedPage
        );

        const curBundle = get().bundle!;
        const recomputed = recomputeDerived({
          ...curBundle,
          pages: curBundle.pages.map((p) =>
            p.pageIndex === pIdx ? updatedPage : p
          ),
          runs: curBundle.runs.map((r) =>
            r.id === currentRun.id ? currentRun : r
          ),
          candidates: [...curBundle.candidates, ...newCandidates],
        });

        set({
          bundle: recomputed.bundle,
          aggregation: recomputed.aggregation,
          validationIssues: recomputed.validationIssues,
        });
      } catch (err: unknown) {
        failedCount += 1;
        const errMsg =
          err instanceof Error ? err.message : "AI 분석 요청 실패";

        const failedPage: DrawingPage = {
          ...pageItem,
          analysisStatus: "failed",
          analysisError: errMsg,
          updatedAt: new Date().toISOString(),
        };

        currentRun = {
          ...currentRun,
          pageResults: {
            ...currentRun.pageResults,
            [pIdx]: {
              pageIndex: pIdx,
              status: "failed",
              errorMessage: errMsg,
              completedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date().toISOString(),
        };

        await repo.saveExtractionRunAndCandidates(
          ownerId,
          currentRun,
          [],
          failedPage
        );

        const curBundle = get().bundle!;
        set({
          bundle: {
            ...curBundle,
            pages: curBundle.pages.map((p) =>
              p.pageIndex === pIdx ? failedPage : p
            ),
            runs: curBundle.runs.map((r) =>
              r.id === currentRun.id ? currentRun : r
            ),
          },
        });
      }
    }

    const finalStatus: ExtractionRun["status"] =
      failedCount === 0
        ? "completed"
        : completedCount > 0
        ? "partial_failed"
        : "failed";

    currentRun = {
      ...currentRun,
      status: finalStatus,
      updatedAt: new Date().toISOString(),
    };

    const finalBundle = get().bundle;
    if (finalBundle) {
      const nextBundle = {
        ...finalBundle,
        runs: finalBundle.runs.map((r) =>
          r.id === currentRun.id ? currentRun : r
        ),
      };
      await repo.saveProjectBundle(ownerId, nextBundle);
      set({ bundle: nextBundle, autoSaveStatus: "saved" });
    }
  },

  reviewCandidate: async ({
    candidateId,
    status,
    editedValue,
    applyToOfficialData = true,
    targetFloorId,
  }) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;

    const cand = bundle.candidates.find((c) => c.id === candidateId);
    if (!cand) return;

    const now = new Date().toISOString();
    const effectiveValue =
      status === "edited" && editedValue !== undefined
        ? editedValue
        : cand.normalizedValue;

    const updatedCandidate: ExtractionCandidate = {
      ...cand,
      reviewStatus: status,
      reviewerValue: status === "edited" ? (editedValue ?? null) : cand.reviewerValue,
      reviewedAt: now,
    };

    let nextProject = { ...bundle.project };
    let nextBuilding = { ...bundle.building };
    let nextFloors = [...bundle.floors];
    let nextZones = [...bundle.zones];

    // 사용자가 확정(confirmed) 또는 수정 확정(edited)하고 공식 데이터에 반영하도록 선택한 경우
    if (
      applyToOfficialData &&
      (status === "confirmed" || status === "edited") &&
      effectiveValue !== null
    ) {
      const numVal =
        typeof effectiveValue === "number"
          ? effectiveValue
          : Number(effectiveValue);

      switch (cand.fieldKey) {
        case "project_name":
          nextProject.name = String(effectiveValue);
          updatedCandidate.appliedTargetId = nextProject.id;
          break;
        case "site_Location":
          nextProject.siteLocation = String(effectiveValue);
          updatedCandidate.appliedTargetId = nextProject.id;
          break;
        case "site_area":
          if (!Number.isNaN(numVal)) {
            nextProject.siteArea = numVal;
            updatedCandidate.appliedTargetId = nextProject.id;
          }
          break;
        case "building_area":
          if (!Number.isNaN(numVal)) {
            nextProject.userConfirmedBuildingArea = numVal;
            updatedCandidate.appliedTargetId = nextProject.id;
          }
          break;
        case "gross_floor_area":
          if (!Number.isNaN(numVal)) {
            nextProject.statedGrossFloorArea = numVal;
            nextBuilding.statedTotalFloorArea = numVal;
            updatedCandidate.appliedTargetId = nextBuilding.id;
          }
          break;
        case "far_gross_floor_area":
          if (!Number.isNaN(numVal)) {
            nextProject.statedFarGrossFloorArea = numVal;
            nextBuilding.statedFarFloorArea = numVal;
            updatedCandidate.appliedTargetId = nextBuilding.id;
          }
          break;
        case "building_name":
          nextBuilding.name = String(effectiveValue);
          updatedCandidate.appliedTargetId = nextBuilding.id;
          break;
        case "main_structure":
          nextBuilding.mainStructure = String(effectiveValue);
          updatedCandidate.appliedTargetId = nextBuilding.id;
          break;
        case "main_use":
          nextBuilding.mainUse = String(effectiveValue);
          updatedCandidate.appliedTargetId = nextBuilding.id;
          break;
        case "floors_above_ground":
          if (!Number.isNaN(numVal)) {
            nextBuilding.floorsAboveGround = Math.round(numVal);
          }
          break;
        case "floors_below_ground":
          if (!Number.isNaN(numVal)) {
            nextBuilding.floorsBelowGround = Math.round(numVal);
          }
          break;
        case "room_stated_area":
        case "floor_area_entry": {
          if (!Number.isNaN(numVal)) {
            const isRoomArea = cand.fieldKey === "room_stated_area";
            const matchedFloor =
              nextFloors.find((f) => f.id === targetFloorId) ??
              nextFloors.find(
                (f) =>
                  cand.floorLabel &&
                  f.label.toLowerCase() === cand.floorLabel.toLowerCase()
              ) ??
              nextFloors[0];

            if (!isRoomArea && cand.rowType === "subtotal" && matchedFloor) {
              nextFloors = nextFloors.map((f) =>
                f.id === matchedFloor.id
                  ? { ...f, statedFloorArea: numVal, updatedAt: now }
                  : f
              );
              updatedCandidate.appliedTargetId = matchedFloor.id;
            } else if (matchedFloor) {
              // 기존 연결 구역이 있으면 statedAreaSqm 갱신, 없으면 문서 기재 기반 구역 생성
              const existingZoneIdx = nextZones.findIndex(
                (z) =>
                  z.linkedCandidateId === cand.id ||
                  z.id === cand.appliedTargetId
              );
              if (existingZoneIdx >= 0) {
                const ez = nextZones[existingZoneIdx]!;
                nextZones[existingZoneIdx] = {
                  ...ez,
                  name: isRoomArea
                    ? cand.usageLabel || ez.name
                    : ez.name,
                  usage: isRoomArea
                    ? cand.usageLabel || ez.usage
                    : ez.usage,
                  statedAreaSqm: numVal,
                  reviewStatus: "confirmed",
                  updatedAt: now,
                };
                updatedCandidate.appliedTargetId = ez.id;
              } else {
                const newZoneId = `zone-cand-${Date.now()}`;
                const newZone: AreaZone = {
                  id: newZoneId,
                  ownerId,
                  projectId: nextProject.id,
                  buildingId: nextBuilding.id,
                  floorId: matchedFloor.id,
                  name:
                    cand.usageLabel ||
                    (isRoomArea
                      ? "기재 실"
                      : `${matchedFloor.label} 기재 구역`),
                  usage: cand.usageLabel || matchedFloor.mainUse || "근린생활시설",
                  rowType: isRoomArea ? "detail" : cand.rowType,
                  basisType: "stated",
                  linkedCandidateId: cand.id,
                  sourceDocumentId: cand.documentId,
                  sourceDocumentVersion: cand.documentVersion,
                  sourcePageIndex: cand.pageIndex,
                  regionId: null,
                  outerPolygonPt: [],
                  deductionPolygonsPt: [],
                  statedAreaSqm: numVal,
                  measuredGrossAreaSqm: null,
                  measuredDeductionAreaSqm: null,
                  measuredNetAreaSqm: null,
                  manualAreaSqm: null,
                  adoptedBaseAreaSqm: numVal,
                  includeInFloorArea: true,
                  includedFloorAreaSqm: numVal,
                  includeInFarArea: matchedFloor.category !== "basement",
                  includedFarAreaSqm:
                    matchedFloor.category !== "basement" ? numVal : 0,
                  isAdjustedOrExcluded: matchedFloor.category === "basement",
                  exclusionOrAdjustmentReason:
                    matchedFloor.category === "basement"
                      ? "지하층 용적률 산정 제외 여부 설계자 검토 필요"
                      : "",
                  statuteLinkOrMemo: "",
                  adjustmentHistory: [],
                  needsScaleReverification: false,
                  reviewStatus: "confirmed",
                  updatedAt: now,
                };
                nextZones.push(newZone);
                updatedCandidate.appliedTargetId = newZoneId;
              }
            }
          }
          break;
        }
        default:
          break;
      }
    }

    const nextCandidates = bundle.candidates.map((c) =>
      c.id === updatedCandidate.id ? updatedCandidate : c
    );

    const recomputed = recomputeDerived({
      ...bundle,
      project: nextProject,
      building: nextBuilding,
      floors: nextFloors,
      candidates: nextCandidates,
      zones: nextZones,
    });

    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveProjectBundle(
        ownerId,
        recomputed.bundle
      );
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch (err: unknown) {
      set({
        autoSaveStatus: "error",
        autoSaveError: err instanceof Error ? err.message : "후보 검토 저장 실패",
        hasUnsavedChanges: true,
      });
    }
  },

  createDrawingRegion: async ({ pageIndex, name, floorId, boundsPt }) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    get().pushGeometryHistory();

    const activeDoc =
      bundle.documents.find((d) => d.id === bundle.project.activeDocumentId) ??
      bundle.documents[bundle.documents.length - 1];
    const now = new Date().toISOString();

    const newRegion: DrawingRegion = {
      id: `region-${Date.now()}`,
      ownerId,
      projectId: bundle.project.id,
      documentId: activeDoc?.id ?? "doc-unknown",
      documentVersion: activeDoc?.version ?? 1,
      pageIndex,
      name: name.trim() || `P${pageIndex} 작업영역`,
      floorId,
      boundsPt,
      statedScaleText: null,
      calibration: null,
      verificationMeasurement: null,
      metersPerPdfPoint: null,
      isScaleVerified: false,
      scaleUpdatedAt: null,
      referenceEnvelopePolygonPt: null,
      updatedAt: now,
    };

    const recomputed = recomputeDerived({
      ...bundle,
      regions: [...bundle.regions, newRegion],
    });

    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      selectedRegionId: newRegion.id,
      toolMode: "calibrate_scale",
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveDrawingRegion(ownerId, newRegion);
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  applyRegionCalibration: async ({
    regionId,
    p1,
    p2,
    realLengthInput,
    unit,
  }) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    const region = bundle.regions.find((r) => r.id === regionId);
    if (!region) return;

    const metersPerPt = calculateMetersPerPdfPoint(
      p1,
      p2,
      realLengthInput,
      unit
    );
    if (!metersPerPt) {
      set({
        errorMessage:
          "두 점 사이의 거리가 너무 가깝거나 입력한 실제 길이가 올바르지 않습니다.",
      });
      return;
    }

    get().pushGeometryHistory();
    const now = new Date().toISOString();
    const hadPreviousScale =
      region.metersPerPdfPoint !== null &&
      Math.abs(region.metersPerPdfPoint - metersPerPt) > 1e-7;

    const updatedRegion: DrawingRegion = {
      ...region,
      calibration: { p1, p2, realLengthInput, unit },
      metersPerPdfPoint: metersPerPt,
      isScaleVerified: true,
      scaleUpdatedAt: now,
      updatedAt: now,
    };

    // 요구사항 10.1: 축척 변경 시 연결 구역 재계산 및 재검토(needsScaleReverification) 표시
    const updatedZones = bundle.zones.map((z) => {
      if (z.regionId !== regionId) return z;
      return {
        ...z,
        needsScaleReverification: hadPreviousScale ? true : z.needsScaleReverification,
        reviewStatus: hadPreviousScale ? ("pending" as const) : z.reviewStatus,
        updatedAt: now,
      };
    });

    const recomputed = recomputeDerived({
      ...bundle,
      regions: bundle.regions.map((r) =>
        r.id === regionId ? updatedRegion : r
      ),
      zones: updatedZones,
    });

    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      toolMode: "pan",
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveProjectBundle(
        ownerId,
        recomputed.bundle
      );
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  applyRegionVerificationMeasurement: async ({
    regionId,
    p1,
    p2,
    expectedLengthM,
  }) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    const region = bundle.regions.find((r) => r.id === regionId);
    if (!region || !region.metersPerPdfPoint) return;

    const distPt = distance2D(p1, p2);
    const measuredLengthM = distPt * region.metersPerPdfPoint;
    const diffM = measuredLengthM - expectedLengthM;
    const now = new Date().toISOString();

    const updatedRegion: DrawingRegion = {
      ...region,
      verificationMeasurement: {
        p1,
        p2,
        expectedLengthM,
        measuredLengthM,
        diffM,
      },
      isScaleVerified: true,
      updatedAt: now,
    };

    const recomputed = recomputeDerived({
      ...bundle,
      regions: bundle.regions.map((r) =>
        r.id === regionId ? updatedRegion : r
      ),
    });

    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      toolMode: "pan",
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveDrawingRegion(ownerId, updatedRegion);
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  setRegionReferenceEnvelope: async (regionId, polygonPt) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    const region = bundle.regions.find((r) => r.id === regionId);
    if (!region) return;

    get().pushGeometryHistory();
    const updatedRegion: DrawingRegion = {
      ...region,
      referenceEnvelopePolygonPt: polygonPt,
      updatedAt: new Date().toISOString(),
    };

    const recomputed = recomputeDerived({
      ...bundle,
      regions: bundle.regions.map((r) =>
        r.id === regionId ? updatedRegion : r
      ),
    });

    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      toolMode: "pan",
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveDrawingRegion(ownerId, updatedRegion);
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  deleteRegion: async (regionId) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    get().pushGeometryHistory();

    const recomputed = recomputeDerived({
      ...bundle,
      regions: bundle.regions.filter((r) => r.id !== regionId),
    });

    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      selectedRegionId: recomputed.bundle.regions[0]?.id ?? null,
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().deleteDrawingRegion(
        ownerId,
        bundle.project.id,
        regionId
      );
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  pushGeometryHistory: () => {
    const { bundle, undoStack } = get();
    if (!bundle) return;
    const snapshot: GeometryHistorySnapshot = {
      regions: structuredClone(bundle.regions),
      zones: structuredClone(bundle.zones),
    };
    set({
      undoStack: [...undoStack.slice(-24), snapshot],
      redoStack: [],
    });
  },

  undoGeometry: async () => {
    const { bundle, undoStack, redoStack, ownerId } = get();
    if (!bundle || undoStack.length === 0) return;

    const prev = undoStack[undoStack.length - 1]!;
    const currentSnap: GeometryHistorySnapshot = {
      regions: structuredClone(bundle.regions),
      zones: structuredClone(bundle.zones),
    };

    const recomputed = recomputeDerived({
      ...bundle,
      regions: prev.regions,
      zones: prev.zones,
    });

    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, currentSnap],
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveProjectBundle(
        ownerId,
        recomputed.bundle
      );
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  redoGeometry: async () => {
    const { bundle, undoStack, redoStack, ownerId } = get();
    if (!bundle || redoStack.length === 0) return;

    const nextSnap = redoStack[redoStack.length - 1]!;
    const currentSnap: GeometryHistorySnapshot = {
      regions: structuredClone(bundle.regions),
      zones: structuredClone(bundle.zones),
    };

    const recomputed = recomputeDerived({
      ...bundle,
      regions: nextSnap.regions,
      zones: nextSnap.zones,
    });

    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      undoStack: [...undoStack, currentSnap],
      redoStack: redoStack.slice(0, -1),
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveProjectBundle(
        ownerId,
        recomputed.bundle
      );
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  createMeasuredZoneFromPolygon: async ({
    name,
    floorId,
    usage,
    regionId,
    pageIndex,
    outerPolygonPt,
  }) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;

    get().pushGeometryHistory();
    const activeDoc =
      bundle.documents.find((d) => d.id === bundle.project.activeDocumentId) ??
      bundle.documents[bundle.documents.length - 1];
    const region = bundle.regions.find((r) => r.id === regionId);
    const now = new Date().toISOString();

    // 축척 보정 전에는 면적 확정(confirmed) 금지 -> pending 상태로 생성
    const newZone: AreaZone = recalculateZoneValues(
      {
        id: `zone-meas-${Date.now()}`,
        ownerId,
        projectId: bundle.project.id,
        buildingId: bundle.building.id,
        floorId,
        name: name.trim() || "신규 측정 구역",
        usage: usage.trim() || "제1종근린생활시설",
        rowType: "detail",
        basisType: "measured",
        linkedCandidateId: null,
        sourceDocumentId: activeDoc?.id ?? null,
        sourceDocumentVersion: activeDoc?.version ?? null,
        sourcePageIndex: pageIndex,
        regionId,
        outerPolygonPt,
        deductionPolygonsPt: [],
        statedAreaSqm: null,
        measuredGrossAreaSqm: null,
        measuredDeductionAreaSqm: null,
        measuredNetAreaSqm: null,
        manualAreaSqm: null,
        adoptedBaseAreaSqm: null,
        includeInFloorArea: true,
        includedFloorAreaSqm: null,
        includeInFarArea: true,
        includedFarAreaSqm: null,
        isAdjustedOrExcluded: false,
        exclusionOrAdjustmentReason: "",
        statuteLinkOrMemo: "",
        adjustmentHistory: [],
        needsScaleReverification: false,
        reviewStatus:
          region?.metersPerPdfPoint && region.isScaleVerified
            ? "confirmed"
            : "pending",
        updatedAt: now,
      },
      region
    );

    const recomputed = recomputeDerived({
      ...bundle,
      zones: [...bundle.zones, newZone],
    });

    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      selectedZoneId: newZone.id,
      toolMode: "pan",
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveAreaZone(ownerId, newZone);
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  addDeductionToZone: async ({ zoneId, label, reason, pointsPt }) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    const zone = bundle.zones.find((z) => z.id === zoneId);
    if (!zone) return;

    get().pushGeometryHistory();
    const newDed: AreaDeductionPolygon = {
      id: `ded-${Date.now()}`,
      label: label.trim() || "내부 공제",
      reason: reason.trim() || "샤프트/보이드 공제",
      pointsPt,
    };

    const updatedZone: AreaZone = {
      ...zone,
      deductionPolygonsPt: [...zone.deductionPolygonsPt, newDed],
      updatedAt: new Date().toISOString(),
    };

    const recomputed = recomputeDerived({
      ...bundle,
      zones: bundle.zones.map((z) => (z.id === zoneId ? updatedZone : z)),
    });

    const savedZone = recomputed.bundle.zones.find((z) => z.id === zoneId)!;
    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      toolMode: "pan",
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveAreaZone(ownerId, savedZone);
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  removeDeductionFromZone: async (zoneId, deductionId) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    const zone = bundle.zones.find((z) => z.id === zoneId);
    if (!zone) return;

    get().pushGeometryHistory();
    const updatedZone: AreaZone = {
      ...zone,
      deductionPolygonsPt: zone.deductionPolygonsPt.filter(
        (d) => d.id !== deductionId
      ),
      updatedAt: new Date().toISOString(),
    };

    const recomputed = recomputeDerived({
      ...bundle,
      zones: bundle.zones.map((z) => (z.id === zoneId ? updatedZone : z)),
    });

    const savedZone = recomputed.bundle.zones.find((z) => z.id === zoneId)!;
    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveAreaZone(ownerId, savedZone);
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  updateZoneVertices: async (zoneId, outerPolygonPt, deductionPolygonsPt) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    const zone = bundle.zones.find((z) => z.id === zoneId);
    if (!zone) return;

    get().pushGeometryHistory();
    const updatedZone: AreaZone = {
      ...zone,
      outerPolygonPt,
      deductionPolygonsPt: deductionPolygonsPt ?? zone.deductionPolygonsPt,
      updatedAt: new Date().toISOString(),
    };

    const recomputed = recomputeDerived({
      ...bundle,
      zones: bundle.zones.map((z) => (z.id === zoneId ? updatedZone : z)),
    });

    const savedZone = recomputed.bundle.zones.find((z) => z.id === zoneId)!;
    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveAreaZone(ownerId, savedZone);
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  createManualOrStatedZone: async ({
    name,
    floorId,
    usage,
    basisType,
    areaValueSqm,
  }) => {
    const { bundle, ownerId, activePageIndex } = get();
    if (!bundle) return;

    const activeDoc =
      bundle.documents.find((d) => d.id === bundle.project.activeDocumentId) ??
      bundle.documents[bundle.documents.length - 1];
    const now = new Date().toISOString();

    const newZone: AreaZone = {
      id: `zone-man-${Date.now()}`,
      ownerId,
      projectId: bundle.project.id,
      buildingId: bundle.building.id,
      floorId,
      name: name.trim() || "직접 입력 구역",
      usage: usage.trim() || "근린생활시설",
      rowType: "detail",
      basisType,
      linkedCandidateId: null,
      sourceDocumentId: activeDoc?.id ?? null,
      sourceDocumentVersion: activeDoc?.version ?? null,
      sourcePageIndex: activePageIndex,
      regionId: null,
      outerPolygonPt: [],
      deductionPolygonsPt: [],
      statedAreaSqm: basisType === "stated" ? areaValueSqm : null,
      measuredGrossAreaSqm: null,
      measuredDeductionAreaSqm: null,
      measuredNetAreaSqm: null,
      manualAreaSqm: basisType === "manual" ? areaValueSqm : null,
      adoptedBaseAreaSqm: areaValueSqm,
      includeInFloorArea: true,
      includedFloorAreaSqm: areaValueSqm,
      includeInFarArea: true,
      includedFarAreaSqm: areaValueSqm,
      isAdjustedOrExcluded: false,
      exclusionOrAdjustmentReason: "",
      statuteLinkOrMemo: "",
      adjustmentHistory: [],
      needsScaleReverification: false,
      reviewStatus: "confirmed",
      updatedAt: now,
    };

    const recomputed = recomputeDerived({
      ...bundle,
      zones: [...bundle.zones, newZone],
    });

    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      selectedZoneId: newZone.id,
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveAreaZone(ownerId, newZone);
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  updateZoneMetaAndInclusion: async (
    zoneId,
    patch,
    adjustmentReasonIfChanged
  ) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    const existing = bundle.zones.find((z) => z.id === zoneId);
    if (!existing) return;

    const region = bundle.regions.find(
      (r) => r.id === (patch.regionId ?? existing.regionId)
    );

    // 축척 미보정 상태에서 측정 면적을 확정(confirmed)하려고 하면 차단
    if (
      patch.reviewStatus === "confirmed" &&
      (patch.basisType ?? existing.basisType) === "measured" &&
      (!region || !region.metersPerPdfPoint || !region.isScaleVerified)
    ) {
      set({
        errorMessage:
          "작업 영역의 축척 보정이 완료되기 전에는 측정 면적 구역을 확정할 수 없습니다.",
      });
      return;
    }

    const now = new Date().toISOString();
    const merged: AreaZone = recalculateZoneValues(
      {
        ...existing,
        ...patch,
        needsScaleReverification:
          patch.reviewStatus === "confirmed"
            ? false
            : existing.needsScaleReverification,
        updatedAt: now,
      },
      region
    );

    // 조정 전·후 값과 사유 추적 이력 기록
    const floorAreaChanged =
      existing.includedFloorAreaSqm !== merged.includedFloorAreaSqm;
    const farAreaChanged =
      existing.includedFarAreaSqm !== merged.includedFarAreaSqm;

    if (floorAreaChanged || farAreaChanged || adjustmentReasonIfChanged) {
      merged.adjustmentHistory = [
        ...existing.adjustmentHistory,
        {
          id: `adj-${Date.now()}`,
          adjustedAt: now,
          previousFloorAreaSqm: existing.includedFloorAreaSqm,
          newFloorAreaSqm: merged.includedFloorAreaSqm,
          previousFarAreaSqm: existing.includedFarAreaSqm,
          newFarAreaSqm: merged.includedFarAreaSqm,
          reason:
            adjustmentReasonIfChanged ??
            merged.exclusionOrAdjustmentReason ??
            "사용자 산입·제외 조정",
          statuteNote: merged.statuteLinkOrMemo,
        },
      ];
    }

    const recomputed = recomputeDerived({
      ...bundle,
      zones: bundle.zones.map((z) => (z.id === zoneId ? merged : z)),
    });

    const finalZone = recomputed.bundle.zones.find((z) => z.id === zoneId)!;
    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().saveAreaZone(ownerId, finalZone);
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  deleteZone: async (zoneId) => {
    const { bundle, ownerId } = get();
    if (!bundle) return;
    get().pushGeometryHistory();

    const recomputed = recomputeDerived({
      ...bundle,
      zones: bundle.zones.filter((z) => z.id !== zoneId),
    });

    set({
      bundle: recomputed.bundle,
      aggregation: recomputed.aggregation,
      validationIssues: recomputed.validationIssues,
      selectedZoneId: null,
      autoSaveStatus: "saving",
    });

    try {
      await getStorageRepository().deleteAreaZone(
        ownerId,
        bundle.project.id,
        zoneId
      );
      set({ autoSaveStatus: "saved", hasUnsavedChanges: false });
    } catch {
      set({ autoSaveStatus: "error", hasUnsavedChanges: true });
    }
  },

  createImmutableSnapshot: async ({
    label,
    isImmutableConfirmed,
    excelBytes,
    pdfBytes: reportPdfBytes,
  }) => {
    const { bundle, aggregation, validationIssues, ownerId, ownerEmail } =
      get();
    if (!bundle || !aggregation) {
      throw new Error("프로젝트 집계 데이터가 준비되지 않았습니다.");
    }

    const hasBlockingIssues = validationIssues.some((i) => i.blockingSnapshot);
    if (
      isImmutableConfirmed &&
      (aggregation.isReviewOnly || hasBlockingIssues)
    ) {
      throw new Error(
        "미확정 필수 항목이나 확정 차단 오류가 남아 있어 확정본을 생성할 수 없습니다. 먼저 검토용 출력을 사용하거나 오류를 해결하세요."
      );
    }

    const repo = getStorageRepository();
    const nextVersion =
      bundle.snapshots.reduce((max, s) => Math.max(max, s.versionNumber), 0) +
      1;
    const snapshotId = `snap-v${nextVersion}-${Date.now()}`;
    const now = new Date().toISOString();

    const activeDoc =
      bundle.documents.find((d) => d.id === bundle.project.activeDocumentId) ??
      bundle.documents[bundle.documents.length - 1] ??
      null;

    const [excelStoragePath, pdfStoragePath] = await Promise.all([
      repo.saveSnapshotExportFile(
        ownerId,
        bundle.project.id,
        snapshotId,
        "xlsx",
        excelBytes
      ),
      repo.saveSnapshotExportFile(
        ownerId,
        bundle.project.id,
        snapshotId,
        "pdf",
        reportPdfBytes
      ),
    ]);

    // 현재 프로젝트 편집으로 이전 스냅샷이 절대 변경되지 않도록 깊은 복사본(Immutable Clone) 저장
    const snapshot: ExportSnapshot = {
      id: snapshotId,
      ownerId,
      projectId: bundle.project.id,
      versionNumber: nextVersion,
      label:
        label.trim() ||
        (isImmutableConfirmed
          ? `확정본 v${nextVersion}`
          : `검토용 스냅샷 v${nextVersion}`),
      isImmutableConfirmed,
      createdByUid: ownerId,
      createdByEmail: ownerEmail,
      createdAt: now,
      sourceDocument: activeDoc
        ? {
            id: activeDoc.id,
            originalFileName: activeDoc.originalFileName,
            documentHash: activeDoc.documentHash,
            version: activeDoc.version,
          }
        : null,
      projectSnapshot: structuredClone(bundle.project),
      buildingSnapshot: structuredClone(bundle.building),
      floorsSnapshot: structuredClone(bundle.floors),
      regionsSnapshot: structuredClone(bundle.regions),
      zonesSnapshot: structuredClone(bundle.zones),
      aggregationSnapshot: structuredClone(aggregation),
      issuesSnapshot: structuredClone(validationIssues),
      excelStoragePath,
      pdfStoragePath,
    };

    await repo.saveSnapshot(ownerId, snapshot);

    set({
      bundle: {
        ...bundle,
        snapshots: [snapshot, ...bundle.snapshots],
      },
      autoSaveStatus: "saved",
    });

    return snapshot;
  },
}));
