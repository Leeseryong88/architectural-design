import { z } from "zod";

export const AppModeSchema = z.enum(["demo", "live"]);
export type AppMode = z.infer<typeof AppModeSchema>;

export const PageClassificationSchema = z.enum([
  "overview",       // 건축개요
  "floor_plan",     // 평면도
  "section",        // 단면도
  "area_table",     // 면적산출표
  "other",          // 기타
  "unclassified",   // 분류 미확정
]);
export type PageClassification = z.infer<typeof PageClassificationSchema>;

export const PAGE_CLASSIFICATION_LABELS: Record<PageClassification, string> = {
  overview: "건축개요",
  floor_plan: "평면도",
  section: "단면도",
  area_table: "면적산출표",
  other: "기타",
  unclassified: "분류 미확정",
};

export const PageAnalysisStatusSchema = z.enum([
  "idle",
  "queued",
  "running",
  "completed",
  "failed",
]);
export type PageAnalysisStatus = z.infer<typeof PageAnalysisStatusSchema>;

export const RunStatusSchema = z.enum([
  "queued",         // 대기
  "running",        // 분석 중
  "completed",      // 완료
  "partial_failed", // 일부 실패
  "failed",         // 실패
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: "대기",
  running: "분석 중",
  completed: "완료",
  partial_failed: "일부 실패",
  failed: "실패",
};

export const ReviewStatusSchema = z.enum([
  "pending",
  "confirmed",
  "edited",
  "rejected",
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "미검토",
  confirmed: "확정",
  edited: "수정 확정",
  rejected: "반려",
};

export const RowTypeSchema = z.enum([
  "detail",   // 상세 행
  "subtotal", // 소계
  "total",    // 총계
]);
export type RowType = z.infer<typeof RowTypeSchema>;

export const ROW_TYPE_LABELS: Record<RowType, string> = {
  detail: "상세 행",
  subtotal: "소계",
  total: "총계",
};

export const FloorCategorySchema = z.enum([
  "basement", // 지하
  "ground",   // 지상
  "rooftop",  // 옥상/옥탑
  "other",    // 기타
]);
export type FloorCategory = z.infer<typeof FloorCategorySchema>;

export const FLOOR_CATEGORY_LABELS: Record<FloorCategory, string> = {
  basement: "지하",
  ground: "지상",
  rooftop: "옥상",
  other: "기타",
};

export const AreaBasisTypeSchema = z.enum([
  "stated",   // 문서 기재
  "measured", // 기하 측정
  "manual",   // 사용자 직접 입력
]);
export type AreaBasisType = z.infer<typeof AreaBasisTypeSchema>;

export const AREA_BASIS_LABELS: Record<AreaBasisType, string> = {
  stated: "문서 기재",
  measured: "기하 측정",
  manual: "사용자 직접 입력",
};

export const AutoSaveStatusSchema = z.enum([
  "idle",
  "saving",
  "saved",
  "error",
]);
export type AutoSaveStatus = z.infer<typeof AutoSaveStatusSchema>;

export const Point2DSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Point2D = z.infer<typeof Point2DSchema>;

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const ImageTransformMetaSchema = z.object({
  originalPageWidthPt: z.number(),
  originalPageHeightPt: z.number(),
  pdfNativeRotation: z.number(),
  renderRotation: z.number(),
  imageWidthPx: z.number(),
  imageHeightPx: z.number(),
  cropBoxPt: BoundingBoxSchema,
});
export type ImageTransformMeta = z.infer<typeof ImageTransformMetaSchema>;

export const CandidateFieldKeySchema = z.enum([
  "project_name",
  "site_Location",
  "site_area",
  "building_area",
  "gross_floor_area",
  "far_gross_floor_area",
  "building_coverage_ratio",
  "floor_area_ratio",
  "building_name",
  "main_structure",
  "main_use",
  "floors_above_ground",
  "floors_below_ground",
  "floor_area_entry",
  "room_stated_area",
  "aux_room_name",
  "aux_dimension",
  "aux_stated_scale",
  "aux_area_note",
]);
export type CandidateFieldKey = z.infer<typeof CandidateFieldKeySchema>;

export const CANDIDATE_FIELD_LABELS: Record<CandidateFieldKey, string> = {
  project_name: "프로젝트명",
  site_Location: "대지 위치",
  site_area: "대지면적",
  building_area: "건축면적",
  gross_floor_area: "연면적",
  far_gross_floor_area: "용적률 산정용 연면적",
  building_coverage_ratio: "건폐율",
  floor_area_ratio: "용적률",
  building_name: "동 이름",
  main_structure: "주구조",
  main_use: "주용도",
  floors_above_ground: "지상 층수",
  floors_below_ground: "지하 층수",
  floor_area_entry: "층별/구역 기재 면적",
  room_stated_area: "실별 기재 면적",
  aux_room_name: "보조: 실명",
  aux_dimension: "보조: 치수",
  aux_stated_scale: "보조: 기재 축척",
  aux_area_note: "보조: 면적 주석",
};

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  siteLocation: string;
  /** 대지면적 (㎡). null이면 미입력, 0이면 0 입력 */
  siteArea: number | null;
  /** 사용자 확인 건축면적 (㎡). null이면 미입력 */
  userConfirmedBuildingArea: number | null;
  /** 도면 기재 연면적 비교용 참고값 (㎡) */
  statedGrossFloorArea: number | null;
  /** 도면 기재 용적률 산정용 연면적 비교용 참고값 (㎡) */
  statedFarGrossFloorArea: number | null;
  /** 도면 기재 건폐율 참고값 (%) */
  statedCoverageRatio: number | null;
  /** 도면 기재 용적률 참고값 (%) */
  statedFarRatio: number | null;
  /** 선택 입력: 법정 건폐율 한도 (%) */
  statutoryCoverageLimit: number | null;
  /** 선택 입력: 법정 건폐율 근거 메모 */
  statutoryCoverageBasis: string;
  /** 선택 입력: 법정 용적률 한도 (%) */
  statutoryFarLimit: number | null;
  /** 선택 입력: 법정 용적률 근거 메모 */
  statutoryFarBasis: string;
  /** 적용 법규 메모 */
  regulationMemo: string;
  /** 수치 비교 허용 오차 (㎡, 기본 0.05) */
  comparisonToleranceSqm: number;
  reviewProgressStatus: "draft" | "in_review" | "ready_for_snapshot";
  activeDocumentId: string | null;
  isDemoProject?: boolean;
  deletionStatus?: "active" | "deleting" | "delete_failed";
  createdAt: string;
  updatedAt: string;
}

export interface Building {
  id: string;
  projectId: string;
  ownerId: string;
  name: string; // 예: "주건축물 제1동"
  mainUse: string; // 예: "제1종·제2종 근린생활시설"
  mainStructure: string; // 예: "철근콘크리트조"
  floorsAboveGround: number | null;
  floorsBelowGround: number | null;
  statedTotalFloorArea: number | null;
  statedFarFloorArea: number | null;
  updatedAt: string;
}

export interface Floor {
  id: string;
  projectId: string;
  buildingId: string;
  ownerId: string;
  label: string; // 예: "B1", "1F", "2F", "옥탑1층"
  orderIndex: number; // 예: -1, 1, 2, 99
  category: FloorCategory;
  mainUse: string;
  structure: string;
  statedFloorArea: number | null;
  statedAreaCategory: string;
  updatedAt: string;
}

export interface DrawingDocument {
  id: string;
  ownerId: string;
  projectId: string;
  originalFileName: string;
  storagePath: string;
  fileSize: number;
  documentHash: string;
  version: number;
  pageCount: number;
  uploadedAt: string;
  isDemoFixturePdf?: boolean;
}

export interface DrawingPage {
  id: string;
  ownerId: string;
  projectId: string;
  documentId: string;
  documentVersion: number;
  pageIndex: number; // 1-based page number
  classification: PageClassification;
  classificationModifiedByUser: boolean;
  selectedForAnalysis: boolean;
  analysisStatus: PageAnalysisStatus;
  analysisError: string | null;
  widthPt: number;
  heightPt: number;
  nativeRotation: number;
  viewRotation: number; // 0, 90, 180, 270
  statedScaleText: string | null;
  updatedAt: string;
}

export interface ScaleCalibrationPointPair {
  p1: Point2D; // 원본 PDF pt 좌표
  p2: Point2D; // 원본 PDF pt 좌표
  realLengthInput: number;
  unit: "mm" | "m";
}

export interface DrawingRegion {
  id: string;
  ownerId: string;
  projectId: string;
  documentId: string;
  documentVersion: number;
  pageIndex: number;
  name: string;
  floorId: string | null;
  /** 작업 도면 영역 경계 (원본 PDF pt 좌표) */
  boundsPt: BoundingBox;
  statedScaleText: string | null;
  /** 축척 보정 정보 */
  calibration: ScaleCalibrationPointPair | null;
  /** 보조 확인 치수 측정값 */
  verificationMeasurement: {
    p1: Point2D;
    p2: Point2D;
    expectedLengthM: number;
    measuredLengthM: number;
    diffM: number;
  } | null;
  /** 1 PDF pt 당 실제 미터(m) */
  metersPerPdfPoint: number | null;
  isScaleVerified: boolean;
  scaleUpdatedAt: string | null;
  /** 공간 누락 검사용 기준 외곽 (원본 PDF pt 좌표 다각형) */
  referenceEnvelopePolygonPt: Point2D[] | null;
  updatedAt: string;
}

export interface PageRunResult {
  pageIndex: number;
  status: PageAnalysisStatus;
  errorMessage: string | null;
  promptTokens?: number;
  ResponseTokens?: number;
  totalTokens?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface ExtractionRun {
  id: string;
  ownerId: string;
  projectId: string;
  documentId: string;
  documentVersion: number;
  documentHash: string;
  modelId: string;
  promptVersion: string;
  status: RunStatus;
  isDemoFixtureRun: boolean;
  pageResults: Record<number, PageRunResult>;
  totalTokensUsed: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractionCandidate {
  id: string;
  ownerId: string;
  projectId: string;
  runId: string;
  fieldKey: CandidateFieldKey;
  rawText: string;
  rawValue: string;
  normalizedValue: number | string | null;
  unit: string | null;
  documentId: string;
  documentVersion: number;
  pageIndex: number;
  buildingLabel: string | null;
  floorLabel: string | null;
  usageLabel: string | null;
  structureLabel: string | null;
  areaCategoryLabel: string | null;
  rowType: RowType;
  sourceType: "ai_gemini" | "demo_fixture" | "pdf_text";
  /** AI가 반환한 정규화 [0~1000] bbox */
  normalizedBbox: BoundingBox | null;
  /** 원본 PDF 좌표(pt)로 변환된 bbox */
  pdfBboxPt: BoundingBox | null;
  transformMeta: ImageTransformMeta | null;
  confidence: number | null;
  reviewStatus: ReviewStatus;
  reviewerValue: number | string | null;
  reviewedAt: string | null;
  appliedTargetId: string | null; // 반영된 프로젝트/동/층/구역 ID
  isDemoFixture: boolean;
  createdAt: string;
}

export interface AreaDeductionPolygon {
  id: string;
  label: string;
  reason: string;
  /** 원본 PDF pt 좌표 다각형 */
  pointsPt: Point2D[];
}

export interface AreaAdjustmentRecord {
  id: string;
  adjustedAt: string;
  previousFloorAreaSqm: number | null;
  newFloorAreaSqm: number | null;
  previousFarAreaSqm: number | null;
  newFarAreaSqm: number | null;
  reason: string;
  statuteNote: string;
}

export interface AreaZone {
  id: string;
  ownerId: string;
  projectId: string;
  buildingId: string;
  floorId: string;
  name: string;
  usage: string;
  rowType: RowType;
  basisType: AreaBasisType;
  /** 연결된 추출 후보 ID (문서 기재 근거) */
  linkedCandidateId: string | null;
  /** 출처 문서 ID 및 버전 */
  sourceDocumentId: string | null;
  sourceDocumentVersion: number | null;
  sourcePageIndex: number | null;
  regionId: string | null;
  /** 외곽 산정선 다각형 (원본 PDF pt 좌표) */
  outerPolygonPt: Point2D[];
  /** 내부 공제 영역 목록 (원본 PDF pt 좌표) */
  deductionPolygonsPt: AreaDeductionPolygon[];
  /** A. 문서 기재 면적 (㎡) */
  statedAreaSqm: number | null;
  /** B. 기하 측정 면적 (㎡) - 공제 차감 후 순면적 */
  measuredGrossAreaSqm: number | null;
  measuredDeductionAreaSqm: number | null;
  measuredNetAreaSqm: number | null;
  /** 사용자 직접 입력 기준 면적 (㎡) */
  manualAreaSqm: number | null;
  /** C-1. 채택한 기준 면적 (㎡) */
  adoptedBaseAreaSqm: number | null;
  /** 바닥면적 산입 여부 및 비율/직접 조정 */
  includeInFloorArea: boolean;
  /** 바닥면적 반영값 (㎡) */
  includedFloorAreaSqm: number | null;
  /** 용적률 산정용 연면적 산입 여부 */
  includeInFarArea: boolean;
  /** 용적률 반영값 (㎡) */
  includedFarAreaSqm: number | null;
  /** 제외·조정 여부 */
  isAdjustedOrExcluded: boolean;
  /** 제외·조정 사유 */
  exclusionOrAdjustmentReason: string;
  /** 법령 링크 또는 메모 */
  statuteLinkOrMemo: string;
  /** 조정 이력 */
  adjustmentHistory: AreaAdjustmentRecord[];
  /** 축척 변경 후 재검토 필요 여부 */
  needsScaleReverification: boolean;
  reviewStatus: ReviewStatus;
  updatedAt: string;
}

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationIssueCode =
  | "UNREVIEWED_CANDIDATE"
  | "MISSING_ADOPTED_AREA"
  | "MISSING_BUILDING_FLOOR_USAGE"
  | "UNJUSTIFIED_EXCLUSION_OR_ADJUSTMENT"
  | "NEGATIVE_AREA"
  | "INVALID_NUMBER_OR_UNIT"
  | "DUPLICATE_ZONE_AGGREGATION"
  | "DETAIL_SUBTOTAL_OVERLAP"
  | "SELF_INTERSECTING_POLYGON"
  | "DEDUCTION_OUTSIDE_OUTER"
  | "OVERLAPPING_ZONES_IN_REGION"
  | "GROSS_AREA_MISMATCH_WITH_STATED"
  | "FLOOR_OR_BUILDING_SUM_MISMATCH"
  | "UNVERIFIED_SCALE"
  | "SCALE_CHANGED_UNREVIEWED"
  | "STALE_DOCUMENT_VERSION_LINK"
  | "ENVELOPE_OMISSION_OR_MISSING_ENVELOPE";

export interface ValidationIssue {
  id: string;
  projectId: string;
  code: ValidationIssueCode;
  severity: ValidationSeverity;
  title: string;
  message: string;
  blockingSnapshot: boolean;
  targetType: "project" | "page" | "region" | "candidate" | "zone" | "floor";
  targetId: string;
  pageIndex: number | null;
  comparison?: {
    referenceLabel: string;
    referenceValue: number;
    actualLabel: string;
    actualValue: number;
    diffValue: number;
    toleranceValue: number;
  };
}

export interface FloorAggregationSummary {
  floorId: string;
  floorLabel: string;
  floorCategory: FloorCategory;
  orderIndex: number;
  statedFloorAreaSqm: number | null;
  measuredFloorAreaSqm: number;
  confirmedFloorAreaSqm: number;
  confirmedFarAreaSqm: number;
  excludedFloorAreaSqm: number;
  excludedFarAreaSqm: number;
  subtotalComparisonSqm: number | null;
  diffFromStatedSqm: number | null;
  hasUnconfirmedItems: boolean;
}

export interface UsageAggregationSummary {
  usage: string;
  floorAreaSqm: number;
  farAreaSqm: number;
  zoneCount: number;
}

export interface BuildingAggregationSummary {
  buildingId: string;
  buildingName: string;
  totalFloorAreaSqm: number; // 동별 연면적
  totalFarAreaSqm: number;   // 동별 용적률 산정용 연면적
  statedGrossFloorAreaSqm: number | null;
  statedFarFloorAreaSqm: number | null;
  diffGrossFloorAreaSqm: number | null;
  diffFarFloorAreaSqm: number | null;
}

export interface ProjectAggregationResult {
  floors: FloorAggregationSummary[];
  usages: UsageAggregationSummary[];
  buildings: BuildingAggregationSummary[];
  totalGrossFloorAreaSqm: number;
  totalFarGrossFloorAreaSqm: number;
  siteAreaSqm: number | null;
  userConfirmedBuildingAreaSqm: number | null;
  calculatedBuildingCoverageRatio: number | null;
  coverageRatioUnavailableReason: string | null;
  calculatedFloorAreaRatio: number | null;
  farRatioUnavailableReason: string | null;
  unconfirmedCandidateCount: number;
  unconfirmedZoneCount: number;
  isReviewOnly: boolean;
}

export interface ExportSnapshot {
  id: string;
  ownerId: string;
  projectId: string;
  versionNumber: number;
  label: string;
  isImmutableConfirmed: boolean; // true: 확정본, false: 검토용 스냅샷
  createdByUid: string;
  createdByEmail: string;
  createdAt: string;
  sourceDocument: {
    id: string;
    originalFileName: string;
    documentHash: string;
    version: number;
  } | null;
  projectSnapshot: Project;
  buildingSnapshot: Building;
  floorsSnapshot: Floor[];
  regionsSnapshot: DrawingRegion[];
  zonesSnapshot: AreaZone[];
  aggregationSnapshot: ProjectAggregationResult;
  issuesSnapshot: ValidationIssue[];
  excelStoragePath: string | null;
  pdfStoragePath: string | null;
}

export interface ProjectWorkspaceBundle {
  project: Project;
  building: Building;
  floors: Floor[];
  documents: DrawingDocument[];
  pages: DrawingPage[];
  regions: DrawingRegion[];
  runs: ExtractionRun[];
  candidates: ExtractionCandidate[];
  zones: AreaZone[];
  snapshots: ExportSnapshot[];
}
