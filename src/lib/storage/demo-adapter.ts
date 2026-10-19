import { get, set, del, keys } from "idb-keyval";
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
import type { ProjectSummaryCard, StorageRepository } from "./types";

const BUNDLE_KEY_PREFIX = "myeonjeok:demo:bundle:";
const FILE_KEY_PREFIX = "myeonjeok:demo:file:";

function getBundleKey(projectId: string): string {
  return `${BUNDLE_KEY_PREFIX}${projectId}`;
}

export class DemoLocalRepository implements StorageRepository {
  async listProjects(ownerId: string): Promise<ProjectSummaryCard[]> {
    const allKeys = await keys();
    const bundleKeys = allKeys.filter(
      (k): k is string =>
        typeof k === "string" && k.startsWith(BUNDLE_KEY_PREFIX)
    );

    const cards: ProjectSummaryCard[] = [];
    for (const key of bundleKeys) {
      const bundle = await get<ProjectWorkspaceBundle>(key);
      if (bundle?.project.isDemoProject) {
        // 예제 프로젝트 기능 제거 이전에 저장된 가상 도면 예제 데이터 정리
        await this.deleteProjectCompletely(ownerId, bundle.project.id);
        continue;
      }
      if (bundle && bundle.project.deletionStatus !== "deleting") {
        cards.push({
          project: bundle.project,
          documentCount: bundle.documents.length,
          unconfirmedCount:
            bundle.candidates.filter((c) => c.reviewStatus === "pending")
              .length +
            bundle.zones.filter((z) => z.reviewStatus === "pending").length,
          snapshotCount: bundle.snapshots.length,
        });
      }
    }

    cards.sort(
      (a, b) =>
        new Date(b.project.updatedAt).getTime() -
        new Date(a.project.updatedAt).getTime()
    );
    return cards;
  }

  async getProjectBundle(
    _ownerId: string,
    projectId: string
  ): Promise<ProjectWorkspaceBundle | null> {
    const bundle = await get<ProjectWorkspaceBundle>(getBundleKey(projectId));
    return bundle ?? null;
  }

  async saveProjectBundle(
    _ownerId: string,
    bundle: ProjectWorkspaceBundle
  ): Promise<void> {
    const updated: ProjectWorkspaceBundle = {
      ...bundle,
      project: {
        ...bundle.project,
        updatedAt: new Date().toISOString(),
      },
    };
    await set(getBundleKey(bundle.project.id), updated);
  }

  async createBlankProject(
    ownerId: string,
    name: string,
    siteLocation: string
  ): Promise<ProjectWorkspaceBundle> {
    const now = new Date().toISOString();
    const projectId = `proj-${Date.now()}`;
    const buildingId = `bldg-${Date.now()}`;

    const project: Project = {
      id: projectId,
      ownerId,
      name: name.trim() || "신규 근린생활시설 프로젝트",
      siteLocation: siteLocation.trim(),
      siteArea: null,
      userConfirmedBuildingArea: null,
      statedGrossFloorArea: null,
      statedFarGrossFloorArea: null,
      statedCoverageRatio: null,
      statedFarRatio: null,
      statutoryCoverageLimit: null,
      statutoryCoverageBasis: "",
      statutoryFarLimit: null,
      statutoryFarBasis: "",
      regulationMemo: "",
      comparisonToleranceSqm: 0.05,
      reviewProgressStatus: "draft",
      activeDocumentId: null,
      isDemoProject: false,
      deletionStatus: "active",
      createdAt: now,
      updatedAt: now,
    };

    const building: Building = {
      id: buildingId,
      projectId,
      ownerId,
      name: "주건축물 제1동",
      mainUse: "제1종·제2종 근린생활시설",
      mainStructure: "철근콘크리트조",
      floorsAboveGround: 2,
      floorsBelowGround: 1,
      statedTotalFloorArea: null,
      statedFarFloorArea: null,
      updatedAt: now,
    };

    const floors: Floor[] = [
      {
        id: `floor-${projectId}-b1`,
        projectId,
        buildingId,
        ownerId,
        label: "B1",
        orderIndex: -1,
        category: "basement",
        mainUse: "근린생활시설",
        structure: "철근콘크리트조",
        statedFloorArea: null,
        statedAreaCategory: "지하층 바닥면적",
        updatedAt: now,
      },
      {
        id: `floor-${projectId}-1f`,
        projectId,
        buildingId,
        ownerId,
        label: "1F",
        orderIndex: 1,
        category: "ground",
        mainUse: "제1종근린생활시설",
        structure: "철근콘크리트조",
        statedFloorArea: null,
        statedAreaCategory: "지상층 바닥면적",
        updatedAt: now,
      },
      {
        id: `floor-${projectId}-2f`,
        projectId,
        buildingId,
        ownerId,
        label: "2F",
        orderIndex: 2,
        category: "ground",
        mainUse: "제2종근린생활시설",
        structure: "철근콘크리트조",
        statedFloorArea: null,
        statedAreaCategory: "지상층 바닥면적",
        updatedAt: now,
      },
    ];

    const bundle: ProjectWorkspaceBundle = {
      project,
      building,
      floors,
      documents: [],
      pages: [],
      regions: [],
      runs: [],
      candidates: [],
      zones: [],
      snapshots: [],
    };

    await this.saveProjectBundle(ownerId, bundle);
    return bundle;
  }

  async deleteProjectCompletely(
    _ownerId: string,
    projectId: string
  ): Promise<void> {
    const bundle = await this.getProjectBundle(_ownerId, projectId);
    if (bundle) {
      for (const doc of bundle.documents) {
        await del(`${FILE_KEY_PREFIX}${doc.storagePath}`);
      }
      for (const snap of bundle.snapshots) {
        if (snap.excelStoragePath) {
          await del(`${FILE_KEY_PREFIX}${snap.excelStoragePath}`);
        }
        if (snap.pdfStoragePath) {
          await del(`${FILE_KEY_PREFIX}${snap.pdfStoragePath}`);
        }
      }
    }
    await del(getBundleKey(projectId));
  }

  async savePdfBlob(
    _ownerId: string,
    projectId: string,
    documentId: string,
    fileName: string,
    bytes: Uint8Array
  ): Promise<string> {
    const storagePath = `demo://${projectId}/${documentId}/${fileName}`;
    await set(`${FILE_KEY_PREFIX}${storagePath}`, bytes);
    return storagePath;
  }

  async loadPdfBytes(
    _ownerId: string,
    doc: DrawingDocument
  ): Promise<Uint8Array> {
    const cached = await get<Uint8Array>(`${FILE_KEY_PREFIX}${doc.storagePath}`);
    if (cached && cached.byteLength > 0) {
      return cached;
    }

    throw new Error("로컬 저장소에서 해당 도면 PDF 원본을 찾을 수 없습니다.");
  }

  async saveSnapshotExportFile(
    _ownerId: string,
    projectId: string,
    snapshotId: string,
    fileType: "xlsx" | "pdf",
    bytes: Uint8Array
  ): Promise<string> {
    const storagePath = `demo://exports/${projectId}/${snapshotId}/myeonjeok-${snapshotId}.${fileType}`;
    await set(`${FILE_KEY_PREFIX}${storagePath}`, bytes);
    return storagePath;
  }

  async loadSnapshotExportFile(
    _ownerId: string,
    storagePath: string
  ): Promise<Uint8Array | null> {
    const bytes = await get<Uint8Array>(`${FILE_KEY_PREFIX}${storagePath}`);
    return bytes ?? null;
  }

  async saveProjectAndBuilding(
    ownerId: string,
    project: Project,
    building: Building,
    floors: Floor[]
  ): Promise<void> {
    const bundle = await this.getProjectBundle(ownerId, project.id);
    if (!bundle) return;
    bundle.project = { ...project, updatedAt: new Date().toISOString() };
    bundle.building = { ...building, updatedAt: new Date().toISOString() };
    bundle.floors = floors;
    await this.saveProjectBundle(ownerId, bundle);
  }

  async saveDrawingPage(ownerId: string, page: DrawingPage): Promise<void> {
    const bundle = await this.getProjectBundle(ownerId, page.projectId);
    if (!bundle) return;
    const idx = bundle.pages.findIndex((p) => p.id === page.id);
    if (idx >= 0) {
      bundle.pages[idx] = page;
    } else {
      bundle.pages.push(page);
    }
    await this.saveProjectBundle(ownerId, bundle);
  }

  async saveDrawingRegion(
    ownerId: string,
    region: DrawingRegion
  ): Promise<void> {
    const bundle = await this.getProjectBundle(ownerId, region.projectId);
    if (!bundle) return;
    const idx = bundle.regions.findIndex((r) => r.id === region.id);
    if (idx >= 0) {
      bundle.regions[idx] = region;
    } else {
      bundle.regions.push(region);
    }
    await this.saveProjectBundle(ownerId, bundle);
  }

  async deleteDrawingRegion(
    ownerId: string,
    projectId: string,
    regionId: string
  ): Promise<void> {
    const bundle = await this.getProjectBundle(ownerId, projectId);
    if (!bundle) return;
    bundle.regions = bundle.regions.filter((r) => r.id !== regionId);
    await this.saveProjectBundle(ownerId, bundle);
  }

  async saveAreaZone(ownerId: string, zone: AreaZone): Promise<void> {
    const bundle = await this.getProjectBundle(ownerId, zone.projectId);
    if (!bundle) return;
    const idx = bundle.zones.findIndex((z) => z.id === zone.id);
    if (idx >= 0) {
      bundle.zones[idx] = zone;
    } else {
      bundle.zones.push(zone);
    }
    await this.saveProjectBundle(ownerId, bundle);
  }

  async deleteAreaZone(
    ownerId: string,
    projectId: string,
    zoneId: string
  ): Promise<void> {
    const bundle = await this.getProjectBundle(ownerId, projectId);
    if (!bundle) return;
    bundle.zones = bundle.zones.filter((z) => z.id !== zoneId);
    await this.saveProjectBundle(ownerId, bundle);
  }

  async saveExtractionRunAndCandidates(
    ownerId: string,
    run: ExtractionRun,
    newCandidates: ExtractionCandidate[],
    updatedPage: DrawingPage
  ): Promise<void> {
    const bundle = await this.getProjectBundle(ownerId, run.projectId);
    if (!bundle) return;

    const rIdx = bundle.runs.findIndex((r) => r.id === run.id);
    if (rIdx >= 0) {
      bundle.runs[rIdx] = run;
    } else {
      bundle.runs.push(run);
    }

    const pIdx = bundle.pages.findIndex((p) => p.id === updatedPage.id);
    if (pIdx >= 0) {
      // 사용자가 수동으로 수정한 페이지 분류는 재분석으로 덮어쓰지 않음
      const existingPage = bundle.pages[pIdx]!;
      bundle.pages[pIdx] = {
        ...updatedPage,
        classification: existingPage.classificationModifiedByUser
          ? existingPage.classification
          : updatedPage.classification,
        classificationModifiedByUser: existingPage.classificationModifiedByUser,
      };
    }

    for (const c of newCandidates) {
      const cIdx = bundle.candidates.findIndex((item) => item.id === c.id);
      if (cIdx >= 0) {
        bundle.candidates[cIdx] = c;
      } else {
        bundle.candidates.push(c);
      }
    }

    await this.saveProjectBundle(ownerId, bundle);
  }

  async saveCandidate(
    ownerId: string,
    candidate: ExtractionCandidate
  ): Promise<void> {
    const bundle = await this.getProjectBundle(ownerId, candidate.projectId);
    if (!bundle) return;
    const idx = bundle.candidates.findIndex((c) => c.id === candidate.id);
    if (idx >= 0) {
      bundle.candidates[idx] = candidate;
    } else {
      bundle.candidates.push(candidate);
    }
    await this.saveProjectBundle(ownerId, bundle);
  }

  async saveSnapshot(ownerId: string, snapshot: ExportSnapshot): Promise<void> {
    const bundle = await this.getProjectBundle(ownerId, snapshot.projectId);
    if (!bundle) return;
    bundle.snapshots.unshift(snapshot);
    await this.saveProjectBundle(ownerId, bundle);
  }
}
