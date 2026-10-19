import ExcelJS from "exceljs";
import { roundToDecimals } from "@/lib/geometry/planar";
import {
  AREA_BASIS_LABELS,
  REVIEW_STATUS_LABELS,
  ROW_TYPE_LABELS,
  type AreaZone,
  type Building,
  type DrawingDocument,
  type Floor,
  type Project,
  type ProjectAggregationResult,
  type ValidationIssue,
} from "@/types/domain";

/**
 * 외부 텍스트 수식 주입(Formula Injection / CSV-XLSX Injection) 및 제어문자 방지
 * - '=', '+', '-', '@', 탭(\t), 개행(\r) 등으로 시작하는 문자열 앞에 작은따옴표(')를 붙이거나 안전하게 정제
 * - 제어문자(\x00-\x08, \x0B, \x0C, \x0E-\x1F) 제거
 */
export function sanitizeSpreadsheetText(input: string | null | undefined): string {
  if (!input) return "";
  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  if (/^[=+\-@\t\r]/.test(cleaned)) {
    return `'${cleaned}`;
  }
  return cleaned;
}

/**
 * 숫자는 숫자 셀로 기록하고, null은 절대 0으로 바꾸지 않고 빈 셀(null)로 유지한다.
 */
function toExcelNumberOrNull(val: number | null | undefined): number | null {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return null;
  }
  return roundToDecimals(val, 2);
}

export interface ExcelExportOptions {
  project: Project;
  building: Building;
  floors: Floor[];
  documents: DrawingDocument[];
  zones: AreaZone[];
  aggregation: ProjectAggregationResult;
  issues: ValidationIssue[];
  isConfirmedSnapshot: boolean;
  snapshotVersion?: number;
  includeSections?: {
    overview?: boolean;
    zoneDetails?: boolean;
    floorUsageSummary?: boolean;
    buildingSummary?: boolean;
    adjustmentBasis?: boolean;
    validationItems?: boolean;
  };
}

export async function generateAreaReportExcelBytes(
  options: ExcelExportOptions
): Promise<Uint8Array> {
  const {
    project,
    building,
    floors,
    documents,
    zones,
    aggregation,
    issues,
    isConfirmedSnapshot,
    snapshotVersion,
  } = options;

  const isReviewOnly =
    !isConfirmedSnapshot ||
    aggregation.isReviewOnly ||
    issues.some((i) => i.blockingSnapshot);

  const statusTag = isReviewOnly
    ? "[검토용 - 미확정 항목 또는 검토 필요 사항 포함]"
    : `[확정본 v${snapshotVersion ?? 1} - 설계자 확인 스냅샷]`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "면적노트 (Myeonjeok Note)";
  workbook.created = new Date();

  const activeDoc =
    documents.find((d) => d.id === project.activeDocumentId) ??
    documents[documents.length - 1] ??
    null;

  // =========================================================================
  // 1. 프로젝트 개요
  // =========================================================================
  const s1 = workbook.addWorksheet("1. 프로젝트 개요");
  s1.columns = [
    { header: "항목", key: "label", width: 28 },
    { header: "값 / 수치", key: "value", width: 42 },
    { header: "단위 / 비고", key: "note", width: 45 },
  ];

  s1.addRow({
    label: "문서 상태 구분",
    value: sanitizeSpreadsheetText(statusTag),
    note: "본 자료는 인허가 도면 면적 비교·검토 보조 자료이며 법적 적합성을 자동 보증하지 않습니다.",
  });
  s1.addRow({
    label: "프로젝트명",
    value: sanitizeSpreadsheetText(project.name),
    note: project.isDemoProject ? "데모 예제 프로젝트" : "일반 프로젝트",
  });
  s1.addRow({
    label: "대지 위치",
    value: sanitizeSpreadsheetText(project.siteLocation),
    note: "",
  });
  s1.addRow({
    label: "대지면적",
    value: toExcelNumberOrNull(project.siteArea),
    note: project.siteArea === null ? "미입력" : "㎡",
  });
  s1.addRow({
    label: "사용자 확인 건축면적",
    value: toExcelNumberOrNull(project.userConfirmedBuildingArea),
    note:
      project.userConfirmedBuildingArea === null
        ? "미입력 (1층 바닥면적을 자동 가정하지 않음)"
        : "㎡",
  });
  s1.addRow({
    label: "확정 집계 연면적",
    value: toExcelNumberOrNull(aggregation.totalGrossFloorAreaSqm),
    note: "㎡ (상세 행 합계)",
  });
  s1.addRow({
    label: "확정 집계 용적률 산정용 연면적",
    value: toExcelNumberOrNull(aggregation.totalFarGrossFloorAreaSqm),
    note: "㎡",
  });
  s1.addRow({
    label: "산출 건폐율",
    value: toExcelNumberOrNull(aggregation.calculatedBuildingCoverageRatio),
    note:
      aggregation.calculatedBuildingCoverageRatio !== null
        ? `% (법정 한도 입력값: ${
            project.statutoryCoverageLimit !== null
              ? `${project.statutoryCoverageLimit}%`
              : "미입력"
          })`
        : sanitizeSpreadsheetText(aggregation.coverageRatioUnavailableReason),
  });
  s1.addRow({
    label: "산출 용적률",
    value: toExcelNumberOrNull(aggregation.calculatedFloorAreaRatio),
    note:
      aggregation.calculatedFloorAreaRatio !== null
        ? `% (법정 한도 입력값: ${
            project.statutoryFarLimit !== null
              ? `${project.statutoryFarLimit}%`
              : "미입력"
          })`
        : sanitizeSpreadsheetText(aggregation.farRatioUnavailableReason),
  });
  s1.addRow({
    label: "동 이름 / 주용도 / 주구조",
    value: sanitizeSpreadsheetText(
      `${building.name} / ${building.mainUse} / ${building.mainStructure}`
    ),
    note: `지하 ${building.floorsBelowGround ?? 0}층, 지상 ${
      building.floorsAboveGround ?? 0
    }층`,
  });
  s1.addRow({
    label: "기준 도면 파일 및 버전",
    value: sanitizeSpreadsheetText(
      activeDoc
        ? `${activeDoc.originalFileName} (v${activeDoc.version})`
        : "업로드된 도면 없음"
    ),
    note: activeDoc ? `SHA-256: ${activeDoc.documentHash.slice(0, 16)}...` : "",
  });
  s1.addRow({
    label: "적용 법규 및 조례 메모",
    value: sanitizeSpreadsheetText(project.regulationMemo),
    note: sanitizeSpreadsheetText(
      `건폐율 근거: ${project.statutoryCoverageBasis || "-"} / 용적률 근거: ${
        project.statutoryFarBasis || "-"
      }`
    ),
  });

  // =========================================================================
  // 2. 구역별 산출내역
  // =========================================================================
  const s2 = workbook.addWorksheet("2. 구역별 산출내역");
  s2.columns = [
    { header: "구역 ID", key: "id", width: 20 },
    { header: "동", key: "building", width: 16 },
    { header: "층", key: "floor", width: 10 },
    { header: "구역명", key: "name", width: 22 },
    { header: "용도", key: "usage", width: 24 },
    { header: "행 구분", key: "rowType", width: 12 },
    { header: "산정 근거 유형", key: "basisType", width: 15 },
    { header: "문서 기재 면적(㎡)", key: "statedArea", width: 18 },
    { header: "기하 측정 면적(㎡)", key: "measuredArea", width: 18 },
    { header: "채택 기준 면적(㎡)", key: "adoptedArea", width: 18 },
    { header: "바닥면적 반영값(㎡)", key: "floorArea", width: 18 },
    { header: "용적률 반영값(㎡)", key: "farArea", width: 18 },
    { header: "제외·조정 사유", key: "reason", width: 32 },
    { header: "법령 링크 또는 메모", key: "statute", width: 28 },
    { header: "근거 문서와 페이지", key: "source", width: 24 },
    { header: "검토 상태", key: "status", width: 14 },
  ];

  for (const z of zones) {
    const floor = floors.find((f) => f.id === z.floorId);
    const srcDoc = documents.find((d) => d.id === z.sourceDocumentId);
    const sourceLabel = srcDoc
      ? `${srcDoc.originalFileName} (v${z.sourceDocumentVersion ?? srcDoc.version}) p.${z.sourcePageIndex ?? "-"}`
      : z.sourcePageIndex
      ? `p.${z.sourcePageIndex}`
      : "-";

    s2.addRow({
      id: sanitizeSpreadsheetText(z.id),
      building: sanitizeSpreadsheetText(building.name),
      floor: sanitizeSpreadsheetText(floor?.label ?? "미지정"),
      name: sanitizeSpreadsheetText(z.name),
      usage: sanitizeSpreadsheetText(z.usage),
      rowType: ROW_TYPE_LABELS[z.rowType],
      basisType: AREA_BASIS_LABELS[z.basisType],
      statedArea: toExcelNumberOrNull(z.statedAreaSqm),
      measuredArea: toExcelNumberOrNull(z.measuredNetAreaSqm),
      adoptedArea: toExcelNumberOrNull(z.adoptedBaseAreaSqm),
      floorArea: toExcelNumberOrNull(z.includedFloorAreaSqm),
      farArea: toExcelNumberOrNull(z.includedFarAreaSqm),
      reason: sanitizeSpreadsheetText(z.exclusionOrAdjustmentReason),
      statute: sanitizeSpreadsheetText(z.statuteLinkOrMemo),
      source: sanitizeSpreadsheetText(sourceLabel),
      status: REVIEW_STATUS_LABELS[z.reviewStatus],
    });
  }

  // =========================================================================
  // 3. 층별·용도별 집계 (세움터 입력 참고표 포함)
  // =========================================================================
  const s3 = workbook.addWorksheet("3. 층별·용도별 집계");
  s3.columns = [
    { header: "구분", key: "section", width: 18 },
    { header: "층 / 용도 명칭", key: "label", width: 24 },
    { header: "도면 기재 면적(㎡)", key: "stated", width: 18 },
    { header: "기하 측정 합계(㎡)", key: "measured", width: 18 },
    { header: "확정 바닥면적 합계(㎡)", key: "confirmedFloor", width: 22 },
    { header: "용적률 산정 반영(㎡)", key: "confirmedFar", width: 20 },
    { header: "기재값 대비 차이(㎡)", key: "diff", width: 18 },
    { header: "검토 상태", key: "status", width: 18 },
  ];

  for (const f of aggregation.floors) {
    s3.addRow({
      section: "층별 집계 (세움터 입력 참고표)",
      label: sanitizeSpreadsheetText(f.floorLabel),
      stated: toExcelNumberOrNull(f.statedFloorAreaSqm),
      measured: toExcelNumberOrNull(f.measuredFloorAreaSqm),
      confirmedFloor: toExcelNumberOrNull(f.confirmedFloorAreaSqm),
      confirmedFar: toExcelNumberOrNull(f.confirmedFarAreaSqm),
      diff: toExcelNumberOrNull(f.diffFromStatedSqm),
      status: f.hasUnconfirmedItems ? "검토용(미확정 포함)" : "확인 완료",
    });
  }

  for (const u of aggregation.usages) {
    s3.addRow({
      section: "용도별 집계",
      label: sanitizeSpreadsheetText(u.usage),
      stated: null,
      measured: null,
      confirmedFloor: toExcelNumberOrNull(u.floorAreaSqm),
      confirmedFar: toExcelNumberOrNull(u.farAreaSqm),
      diff: null,
      status: `상세 구역 ${u.zoneCount}개`,
    });
  }

  // =========================================================================
  // 4. 동별 집계
  // =========================================================================
  const s4 = workbook.addWorksheet("4. 동별 집계");
  s4.columns = [
    { header: "동 ID", key: "id", width: 18 },
    { header: "동 명칭", key: "name", width: 22 },
    { header: "확정 집계 연면적(㎡)", key: "totalFloor", width: 22 },
    { header: "도면 기재 연면적(㎡)", key: "statedFloor", width: 22 },
    { header: "연면적 차이(㎡)", key: "diffFloor", width: 18 },
    { header: "확정 용적률산정 연면적(㎡)", key: "totalFar", width: 24 },
    { header: "도면 기재 용적률연면적(㎡)", key: "statedFar", width: 24 },
    { header: "용적률연면적 차이(㎡)", key: "diffFar", width: 18 },
  ];

  for (const b of aggregation.buildings) {
    s4.addRow({
      id: sanitizeSpreadsheetText(b.buildingId),
      name: sanitizeSpreadsheetText(b.buildingName),
      totalFloor: toExcelNumberOrNull(b.totalFloorAreaSqm),
      statedFloor: toExcelNumberOrNull(b.statedGrossFloorAreaSqm),
      diffFloor: toExcelNumberOrNull(b.diffGrossFloorAreaSqm),
      totalFar: toExcelNumberOrNull(b.totalFarAreaSqm),
      statedFar: toExcelNumberOrNull(b.statedFarFloorAreaSqm),
      diffFar: toExcelNumberOrNull(b.diffFarFloorAreaSqm),
    });
  }

  // =========================================================================
  // 5. 제외·조정 근거
  // =========================================================================
  const s5 = workbook.addWorksheet("5. 제외·조정 근거");
  s5.columns = [
    { header: "구역명", key: "zoneName", width: 22 },
    { header: "층", key: "floor", width: 12 },
    { header: "채택 기준 면적(㎡)", key: "baseArea", width: 18 },
    { header: "바닥면적 반영(㎡)", key: "floorArea", width: 18 },
    { header: "바닥면적 제외분(㎡)", key: "floorExcluded", width: 18 },
    { header: "용적률 반영(㎡)", key: "farArea", width: 18 },
    { header: "용적률 제외분(㎡)", key: "farExcluded", width: 18 },
    { header: "제외·조정 사유", key: "reason", width: 35 },
    { header: "법령 근거 및 메모", key: "statute", width: 35 },
  ];

  for (const z of zones) {
    const base = z.adoptedBaseAreaSqm ?? 0;
    const incFloor = z.includedFloorAreaSqm ?? 0;
    const incFar = z.includedFarAreaSqm ?? 0;
    const hasExclusion =
      z.isAdjustedOrExcluded ||
      !z.includeInFloorArea ||
      !z.includeInFarArea ||
      Math.abs(base - incFloor) > 1e-4 ||
      Math.abs(base - incFar) > 1e-4 ||
      z.deductionPolygonsPt.length > 0;

    if (!hasExclusion) continue;
    const floor = floors.find((f) => f.id === z.floorId);

    s5.addRow({
      zoneName: sanitizeSpreadsheetText(z.name),
      floor: sanitizeSpreadsheetText(floor?.label ?? "-"),
      baseArea: toExcelNumberOrNull(z.adoptedBaseAreaSqm),
      floorArea: toExcelNumberOrNull(z.includedFloorAreaSqm),
      floorExcluded: toExcelNumberOrNull(Math.max(0, base - incFloor)),
      farArea: toExcelNumberOrNull(z.includedFarAreaSqm),
      farExcluded: toExcelNumberOrNull(Math.max(0, base - incFar)),
      reason: sanitizeSpreadsheetText(
        z.exclusionOrAdjustmentReason || "(사유 미입력 - 검토 필요)"
      ),
      statute: sanitizeSpreadsheetText(z.statuteLinkOrMemo),
    });
  }

  // =========================================================================
  // 6. 검토 필요 항목
  // =========================================================================
  const s6 = workbook.addWorksheet("6. 검토 필요 항목");
  s6.columns = [
    { header: "심각도", key: "severity", width: 12 },
    { header: "확정본 차단 여부", key: "blocking", width: 16 },
    { header: "검사 항목 코드", key: "code", width: 28 },
    { header: "제목", key: "title", width: 30 },
    { header: "상세 설명 및 차이", key: "message", width: 55 },
    { header: "관련 페이지", key: "page", width: 12 },
  ];

  if (issues.length === 0) {
    s6.addRow({
      severity: "INFO",
      blocking: "없음",
      code: "NONE",
      title: "검출된 오류·불일치 항목 없음",
      message: "현재 설정된 허용오차 기준 내에서 검출된 불일치 항목이 없습니다.",
      page: null,
    });
  } else {
    for (const iss of issues) {
      s6.addRow({
        severity: iss.severity.toUpperCase(),
        blocking: iss.blockingSnapshot ? "확정 차단" : "참고/경고",
        code: sanitizeSpreadsheetText(iss.code),
        title: sanitizeSpreadsheetText(iss.title),
        message: sanitizeSpreadsheetText(iss.message),
        page: iss.pageIndex,
      });
    }
  }

  // 헤더 스타일 지정
  for (const sheet of workbook.worksheets) {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
