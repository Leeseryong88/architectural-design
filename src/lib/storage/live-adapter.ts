import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  deleteObject,
  getBytes,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import {
  createInitialDemoWorkspaceBundle,
  DEMO_VIRTUAL_PDF_HASH,
  DEMO_VIRTUAL_PDF_URL,
} from "@/lib/demo/fixture";
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

/**
 * 실제 모드(live)용 Firestore + Firebase Storage 저장 어댑터
 * 요구사항 13:
 * - Firestore에는 페이지·구역·후보 단위로 분리해서 저장한다.
 * - 전체 산정선과 후보를 거대한 문서 하나에 몰아넣지 않는다.
 * - PDF 원본과 출력 파일은 ownerId·projectId와 연결한다.
 * - 프로젝트 삭제 시 관련 하위 문서와 Storage 파일을 정리한다. 중간 실패 시 정리 상태를 남기고 재시도가 가능하게 한다.
 */
export class LiveFirebaseRepository implements StorageRepository {
  private get db() {
    return getFirebaseClientServices().db;
  }

  private get storage() {
    return getFirebaseClientServices().storage;
  }

  async listProjects(ownerId: string): Promise<ProjectSummaryCard[]> {
    const q = query(
      collection(this.db, "projects"),
      where("ownerId", "==", ownerId)
    );
    const snap = await getDocs(q);
    const cards: ProjectSummaryCard[] = [];

    for (const d of snap.docs) {
      const project = d.data() as Project;
      const pid = project.id;
      const [docsSnap, candsSnap, zonesSnap, snapsSnap] = await Promise.all([
        getDocs(collection(this.db, "projects", pid, "documents")),
        getDocs(collection(this.db, "projects", pid, "candidates")),
        getDocs(collection(this.db, "projects", pid, "zones")),
        getDocs(collection(this.db, "projects", pid, "snapshots")),
      ]);

      const pendingCands = candsSnap.docs.filter(
        (c) => (c.data() as ExtractionCandidate).reviewStatus === "pending"
      ).length;
      const pendingZones = zonesSnap.docs.filter(
        (z) => (z.data() as AreaZone).reviewStatus === "pending"
      ).length;

      cards.push({
        project,
        documentCount: docsSnap.size,
        unconfirmedCount: pendingCands + pendingZones,
        snapshotCount: snapsSnap.size,
      });
    }

    cards.sort(
      (a, b) =>
        new Date(b.project.updatedAt).getTime() -
        new Date(a.project.updatedAt).getTime()
    );
    return cards;
  }

  async getProjectBundle(
    ownerId: string,
    projectId: string
  ): Promise<ProjectWorkspaceBundle | null> {
    const projDoc = await getDoc(doc(this.db, "projects", projectId));
    if (!projDoc.exists()) return null;
    const project = projDoc.data() as Project;
    if (project.ownerId !== ownerId) {
      throw new Error("해당 프로젝트에 접근할 권한이 없습니다.");
    }

    const [
      buildingsSnap,
      floorsSnap,
      documentsSnap,
      pagesSnap,
      regionsSnap,
      runsSnap,
      candidatesSnap,
      zonesSnap,
      snapshotsSnap,
    ] = await Promise.all([
      getDocs(collection(this.db, "projects", projectId, "buildings")),
      getDocs(collection(this.db, "projects", projectId, "floors")),
      getDocs(collection(this.db, "projects", projectId, "documents")),
      getDocs(collection(this.db, "projects", projectId, "pages")),
      getDocs(collection(this.db, "projects", projectId, "regions")),
      getDocs(collection(this.db, "projects", projectId, "runs")),
      getDocs(collection(this.db, "projects", projectId, "candidates")),
      getDocs(collection(this.db, "projects", projectId, "zones")),
      getDocs(collection(this.db, "projects", projectId, "snapshots")),
    ]);

    const building = (buildingsSnap.docs[0]?.data() as Building | undefined) ?? {
      id: `bldg-${projectId}`,
      projectId,
      ownerId,
      name: "주건축물 제1동",
      mainUse: "근린생활시설",
      mainStructure: "철근콘크리트조",
      floorsAboveGround: 2,
      floorsBelowGround: 1,
      statedTotalFloorArea: null,
      statedFarFloorArea: null,
      updatedAt: project.updatedAt,
    };

    const floors = floorsSnap.docs
      .map((d) => d.data() as Floor)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const documents = documentsSnap.docs
      .map((d) => d.data() as DrawingDocument)
      .sort((a, b) => a.version - b.version);
    const pages = pagesSnap.docs
      .map((d) => d.data() as DrawingPage)
      .sort((a, b) => a.pageIndex - b.pageIndex);
    const regions = regionsSnap.docs.map((d) => d.data() as DrawingRegion);
    const runs = runsSnap.docs
      .map((d) => d.data() as ExtractionRun)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    const candidates = candidatesSnap.docs.map(
      (d) => d.data() as ExtractionCandidate
    );
    const zones = zonesSnap.docs.map((d) => d.data() as AreaZone);
    const snapshots = snapshotsSnap.docs
      .map((d) => d.data() as ExportSnapshot)
      .sort((a, b) => b.versionNumber - a.versionNumber);

    return {
      project,
      building,
      floors,
      documents,
      pages,
      regions,
      runs,
      candidates,
      zones,
      snapshots,
    };
  }

  async saveProjectBundle(
    ownerId: string,
    bundle: ProjectWorkspaceBundle
  ): Promise<void> {
    const pid = bundle.project.id;
    const now = new Date().toISOString();

    // 1. 부모 프로젝트 문서를 먼저 저장하여 하위 컬렉션 보안 규칙(isProjectOwner)이 즉시 참조할 수 있도록 보장
    await setDoc(doc(this.db, "projects", pid), {
      ...bundle.project,
      ownerId,
      updatedAt: now,
    });

    // 2. 하위 컬렉션 일괄 저장
    const batch = writeBatch(this.db);
    batch.set(
      doc(this.db, "projects", pid, "buildings", bundle.building.id),
      { ...bundle.building, ownerId }
    );

    for (const f of bundle.floors) {
      batch.set(doc(this.db, "projects", pid, "floors", f.id), {
        ...f,
        ownerId,
      });
    }
    for (const d of bundle.documents) {
      batch.set(doc(this.db, "projects", pid, "documents", d.id), {
        ...d,
        ownerId,
      });
    }
    for (const p of bundle.pages) {
      batch.set(doc(this.db, "projects", pid, "pages", p.id), {
        ...p,
        ownerId,
      });
    }
    for (const r of bundle.regions) {
      batch.set(doc(this.db, "projects", pid, "regions", r.id), {
        ...r,
        ownerId,
      });
    }
    for (const run of bundle.runs) {
      batch.set(doc(this.db, "projects", pid, "runs", run.id), {
        ...run,
        ownerId,
      });
    }
    for (const c of bundle.candidates) {
      batch.set(doc(this.db, "projects", pid, "candidates", c.id), {
        ...c,
        ownerId,
      });
    }
    for (const z of bundle.zones) {
      batch.set(doc(this.db, "projects", pid, "zones", z.id), {
        ...z,
        ownerId,
      });
    }
    await batch.commit();
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

  async loadOrResetDemoProject(
    ownerId: string
  ): Promise<ProjectWorkspaceBundle> {
    const demoBundle = createInitialDemoWorkspaceBundle(ownerId);
    await this.saveProjectBundle(ownerId, demoBundle);
    return demoBundle;
  }

  async deleteProjectCompletely(
    ownerId: string,
    projectId: string
  ): Promise<void> {
    const projRef = doc(this.db, "projects", projectId);
    await setDoc(projRef, { deletionStatus: "deleting" }, { merge: true });

    try {
      const bundle = await this.getProjectBundle(ownerId, projectId);
      if (bundle) {
        // Storage 파일 정리
        for (const d of bundle.documents) {
          if (d.storagePath && !d.storagePath.startsWith("demo://")) {
            try {
              await deleteObject(storageRef(this.storage, d.storagePath));
            } catch {
              // 이미 삭제된 경우 무시
            }
          }
        }
        for (const s of bundle.snapshots) {
          for (const path of [s.excelStoragePath, s.pdfStoragePath]) {
            if (path && !path.startsWith("demo://")) {
              try {
                await deleteObject(storageRef(this.storage, path));
              } catch {
                // 이미 삭제된 경우 무시
              }
            }
          }
        }
      }

      const subcollections = [
        "buildings",
        "floors",
        "documents",
        "pages",
        "regions",
        "runs",
        "candidates",
        "zones",
        "snapshots",
      ];

      for (const sub of subcollections) {
        const subSnap = await getDocs(
          collection(this.db, "projects", projectId, sub)
        );
        const batch = writeBatch(this.db);
        for (const d of subSnap.docs) {
          batch.delete(d.ref);
        }
        await batch.commit();
      }

      await deleteDoc(projRef);
    } catch (err) {
      await setDoc(
        projRef,
        { deletionStatus: "delete_failed" },
        { merge: true }
      );
      throw err;
    }
  }

  async savePdfBlob(
    ownerId: string,
    projectId: string,
    documentId: string,
    fileName: string,
    bytes: Uint8Array
  ): Promise<string> {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-가-힣]/g, "_");
    const path = `users/${ownerId}/projects/${projectId}/documents/${documentId}/${safeName}`;
    const ref = storageRef(this.storage, path);
    await uploadBytes(ref, bytes, {
      contentType: "application/pdf",
      customMetadata: {
        ownerId,
        projectId,
        documentId,
      },
    });
    return path;
  }

  async loadPdfBytes(
    _ownerId: string,
    documentItem: DrawingDocument
  ): Promise<Uint8Array> {
    if (
      documentItem.isDemoFixturePdf ||
      documentItem.documentHash === DEMO_VIRTUAL_PDF_HASH ||
      documentItem.storagePath.startsWith("demo://")
    ) {
      const res = await fetch(DEMO_VIRTUAL_PDF_URL);
      if (!res.ok) {
        throw new Error("가상 데모 PDF를 불러오지 못했습니다.");
      }
      return new Uint8Array(await res.arrayBuffer());
    }

    const ref = storageRef(this.storage, documentItem.storagePath);
    const buffer = await getBytes(ref, 20 * 1024 * 1024);
    return new Uint8Array(buffer);
  }

  async saveSnapshotExportFile(
    ownerId: string,
    projectId: string,
    snapshotId: string,
    fileType: "xlsx" | "pdf",
    bytes: Uint8Array
  ): Promise<string> {
    const path = `users/${ownerId}/projects/${projectId}/snapshots/${snapshotId}/myeonjeok-${snapshotId}.${fileType}`;
    const contentType =
      fileType === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const ref = storageRef(this.storage, path);
    await uploadBytes(ref, bytes, {
      contentType,
      customMetadata: {
        ownerId,
        projectId,
        snapshotId,
      },
    });
    return path;
  }

  async loadSnapshotExportFile(
    _ownerId: string,
    path: string
  ): Promise<Uint8Array | null> {
    const ref = storageRef(this.storage, path);
    const buf = await getBytes(ref, 25 * 1024 * 1024);
    return new Uint8Array(buf);
  }

  async saveProjectAndBuilding(
    ownerId: string,
    project: Project,
    building: Building,
    floors: Floor[]
  ): Promise<void> {
    const now = new Date().toISOString();
    const pid = project.id;
    const batch = writeBatch(this.db);
    batch.set(doc(this.db, "projects", pid), {
      ...project,
      ownerId,
      updatedAt: now,
    });
    batch.set(doc(this.db, "projects", pid, "buildings", building.id), {
      ...building,
      ownerId,
      updatedAt: now,
    });
    for (const f of floors) {
      batch.set(doc(this.db, "projects", pid, "floors", f.id), {
        ...f,
        ownerId,
        updatedAt: now,
      });
    }
    await batch.commit();
  }

  async saveDrawingPage(ownerId: string, page: DrawingPage): Promise<void> {
    const now = new Date().toISOString();
    await setDoc(
      doc(this.db, "projects", page.projectId, "pages", page.id),
      { ...page, ownerId, updatedAt: now }
    );
  }

  async saveDrawingRegion(
    ownerId: string,
    region: DrawingRegion
  ): Promise<void> {
    const now = new Date().toISOString();
    await setDoc(
      doc(this.db, "projects", region.projectId, "regions", region.id),
      { ...region, ownerId, updatedAt: now }
    );
  }

  async deleteDrawingRegion(
    _ownerId: string,
    projectId: string,
    regionId: string
  ): Promise<void> {
    await deleteDoc(doc(this.db, "projects", projectId, "regions", regionId));
  }

  async saveAreaZone(ownerId: string, zone: AreaZone): Promise<void> {
    const now = new Date().toISOString();
    await setDoc(doc(this.db, "projects", zone.projectId, "zones", zone.id), {
      ...zone,
      ownerId,
      updatedAt: now,
    });
  }

  async deleteAreaZone(
    _ownerId: string,
    projectId: string,
    zoneId: string
  ): Promise<void> {
    await deleteDoc(doc(this.db, "projects", projectId, "zones", zoneId));
  }

  async saveExtractionRunAndCandidates(
    ownerId: string,
    run: ExtractionRun,
    newCandidates: ExtractionCandidate[],
    updatedPage: DrawingPage
  ): Promise<void> {
    const pid = run.projectId;
    const batch = writeBatch(this.db);
    batch.set(doc(this.db, "projects", pid, "runs", run.id), {
      ...run,
      ownerId,
    });
    batch.set(doc(this.db, "projects", pid, "pages", updatedPage.id), {
      ...updatedPage,
      ownerId,
    });
    for (const c of newCandidates) {
      batch.set(doc(this.db, "projects", pid, "candidates", c.id), {
        ...c,
        ownerId,
      });
    }
    await batch.commit();
  }

  async saveCandidate(
    ownerId: string,
    candidate: ExtractionCandidate
  ): Promise<void> {
    await setDoc(
      doc(this.db, "projects", candidate.projectId, "candidates", candidate.id),
      {
        ...candidate,
        ownerId,
      }
    );
  }

  async saveSnapshot(ownerId: string, snapshot: ExportSnapshot): Promise<void> {
    await setDoc(
      doc(this.db, "projects", snapshot.projectId, "snapshots", snapshot.id),
      {
        ...snapshot,
        ownerId,
      }
    );
  }
}
