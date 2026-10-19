import type {
  AreaZone,
  Building,
  DrawingDocument,
  DrawingPage,
  DrawingRegion,
  ExportSnapshot,
  ExtractionCandidate,
  ExtractionRun,
  Floor,
  Project,
  ProjectWorkspaceBundle,
} from "@/types/domain";

export interface ProjectSummaryCard {
  project: Project;
  documentCount: number;
  unconfirmedCount: number;
  snapshotCount: number;
}

export interface StorageRepository {
  listProjects(ownerId: string): Promise<ProjectSummaryCard[]>;
  getProjectBundle(
    ownerId: string,
    projectId: string
  ): Promise<ProjectWorkspaceBundle | null>;
  saveProjectBundle(
    ownerId: string,
    bundle: ProjectWorkspaceBundle
  ): Promise<void>;
  createBlankProject(
    ownerId: string,
    name: string,
    siteLocation: string
  ): Promise<ProjectWorkspaceBundle>;
  loadOrResetDemoProject(ownerId: string): Promise<ProjectWorkspaceBundle>;
  deleteProjectCompletely(ownerId: string, projectId: string): Promise<void>;

  // 파일 바이너리 저장 및 로드 (PDF 원본 및 스냅샷 출력 파일)
  savePdfBlob(
    ownerId: string,
    projectId: string,
    documentId: string,
    fileName: string,
    bytes: Uint8Array
  ): Promise<string>;
  loadPdfBytes(
    ownerId: string,
    doc: DrawingDocument
  ): Promise<Uint8Array>;

  saveSnapshotExportFile(
    ownerId: string,
    projectId: string,
    snapshotId: string,
    fileType: "xlsx" | "pdf",
    bytes: Uint8Array
  ): Promise<string>;
  loadSnapshotExportFile(
    ownerId: string,
    storagePath: string
  ): Promise<Uint8Array | null>;

  // 세부 엔티티 저장 (자동 저장 및 페이지별 AI 분석 업데이트용)
  saveProjectAndBuilding(
    ownerId: string,
    project: Project,
    building: Building,
    floors: Floor[]
  ): Promise<void>;
  saveDrawingPage(ownerId: string, page: DrawingPage): Promise<void>;
  saveDrawingRegion(ownerId: string, region: DrawingRegion): Promise<void>;
  deleteDrawingRegion(
    ownerId: string,
    projectId: string,
    regionId: string
  ): Promise<void>;
  saveAreaZone(ownerId: string, zone: AreaZone): Promise<void>;
  deleteAreaZone(
    ownerId: string,
    projectId: string,
    zoneId: string
  ): Promise<void>;
  saveExtractionRunAndCandidates(
    ownerId: string,
    run: ExtractionRun,
    newCandidates: ExtractionCandidate[],
    updatedPage: DrawingPage
  ): Promise<void>;
  saveCandidate(ownerId: string, candidate: ExtractionCandidate): Promise<void>;
  saveSnapshot(ownerId: string, snapshot: ExportSnapshot): Promise<void>;
}
