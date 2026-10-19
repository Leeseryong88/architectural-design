import {
  calculateOverlapAreaBetweenPolygonsSqm,
  calculateUnaccountedEnvelopeAreaSqm,
  evaluateZoneGeometry,
} from "@/lib/geometry/planar";
import type {
  AreaZone,
  Building,
  BuildingAggregationSummary,
  DrawingDocument,
  DrawingRegion,
  ExtractionCandidate,
  Floor,
  FloorAggregationSummary,
  Project,
  ProjectAggregationResult,
  UsageAggregationSummary,
  ValidationIssue,
} from "@/types/domain";

/**
 * 구역(AreaZone)의 기하 면적과 채택 기준 면적, 바닥/용적률 반영값을 재계산한다.
 * - 구역마다 채택된 기준 면적은 하나만 둔다 (문서 기재 / 기하 측정 / 사용자 직접 입력)
 * - 같은 공간의 문서 기재값과 측정값은 비교 자료로 보존하되 둘을 합산하지 않는다.
 */
export function recalculateZoneValues(
  zone: AreaZone,
  region: DrawingRegion | undefined
): AreaZone {
  let measuredGrossAreaSqm: number | null = zone.measuredGrossAreaSqm;
  let measuredDeductionAreaSqm: number | null = zone.measuredDeductionAreaSqm;
  let measuredNetAreaSqm: number | null = zone.measuredNetAreaSqm;

  if (zone.outerPolygonPt.length >= 3) {
    const metersPerPt = region?.metersPerPdfPoint ?? null;
    if (metersPerPt && metersPerPt > 0) {
      const evalRes = evaluateZoneGeometry(
        zone.outerPolygonPt,
        zone.deductionPolygonsPt,
        metersPerPt
      );
      measuredGrossAreaSqm = evalRes.grossAreaSqm;
      measuredDeductionAreaSqm = evalRes.deductionUnionAreaSqm;
      measuredNetAreaSqm = evalRes.netAreaSqm;
    } else {
      measuredGrossAreaSqm = null;
      measuredDeductionAreaSqm = null;
      measuredNetAreaSqm = null;
    }
  }

  let adoptedBaseAreaSqm: number | null = null;
  if (zone.basisType === "stated") {
    adoptedBaseAreaSqm = zone.statedAreaSqm;
  } else if (zone.basisType === "measured") {
    adoptedBaseAreaSqm = measuredNetAreaSqm;
  } else if (zone.basisType === "manual") {
    adoptedBaseAreaSqm = zone.manualAreaSqm;
  }

  let includedFloorAreaSqm: number | null = zone.includedFloorAreaSqm;
  let includedFarAreaSqm: number | null = zone.includedFarAreaSqm;

  if (adoptedBaseAreaSqm !== null) {
    if (!zone.includeInFloorArea) {
      includedFloorAreaSqm = 0;
    } else if (!zone.isAdjustedOrExcluded || includedFloorAreaSqm === null) {
      includedFloorAreaSqm = adoptedBaseAreaSqm;
    }

    if (!zone.includeInFarArea) {
      includedFarAreaSqm = 0;
    } else if (!zone.isAdjustedOrExcluded || includedFarAreaSqm === null) {
      includedFarAreaSqm = adoptedBaseAreaSqm;
    }
  } else {
    includedFloorAreaSqm = null;
    includedFarAreaSqm = null;
  }

  return {
    ...zone,
    measuredGrossAreaSqm,
    measuredDeductionAreaSqm,
    measuredNetAreaSqm,
    adoptedBaseAreaSqm,
    includedFloorAreaSqm,
    includedFarAreaSqm,
  };
}

/**
 * 프로젝트의 층별·용도별·동별 집계 및 건폐율/용적률 계산
 * - 층별 합계에는 상세 행(detail)만 반영한다. 소계(subtotal)·총계(total) 및 동 전체 연면적은 비교값으로 관리한다.
 * - B1이라는 이름만으로 법정 지하층 여부를 자동 제외 확정하지 않는다(사용자의 산입/제외 설정에 따름).
 * - 대지면적이 없거나 0이면 비율을 계산하지 않고 사유를 표시한다.
 * - 건축면적을 1층 바닥면적과 동일하게 가정하지 않는다.
 */
export function computeProjectAggregation(params: {
  project: Project;
  building: Building;
  floors: Floor[];
  zones: AreaZone[];
  candidates: ExtractionCandidate[];
}): ProjectAggregationResult {
  const { project, building, floors, zones, candidates } = params;

  const sortedFloors = [...floors].sort((a, b) => a.orderIndex - b.orderIndex);

  const floorSummaries: FloorAggregationSummary[] = sortedFloors.map((floor) => {
    const floorZones = zones.filter((z) => z.floorId === floor.id);
    const detailZones = floorZones.filter((z) => z.rowType === "detail");
    const subtotalZones = floorZones.filter((z) => z.rowType === "subtotal");

    let measuredFloorAreaSqm = 0;
    let confirmedFloorAreaSqm = 0;
    let confirmedFarAreaSqm = 0;
    let excludedFloorAreaSqm = 0;
    let excludedFarAreaSqm = 0;
    let hasUnconfirmedItems = false;

    for (const z of detailZones) {
      if (z.reviewStatus === "pending") {
        hasUnconfirmedItems = true;
      }
      if (z.reviewStatus === "rejected") {
        continue;
      }

      if (z.measuredNetAreaSqm !== null) {
        measuredFloorAreaSqm += z.measuredNetAreaSqm;
      }

      const base = z.adoptedBaseAreaSqm ?? 0;
      const incFloor = z.includedFloorAreaSqm ?? 0;
      const incFar = z.includedFarAreaSqm ?? 0;

      confirmedFloorAreaSqm += incFloor;
      confirmedFarAreaSqm += incFar;
      excludedFloorAreaSqm += Math.max(0, base - incFloor);
      excludedFarAreaSqm += Math.max(0, base - incFar);
    }

    let subtotalComparisonSqm: number | null = null;
    if (subtotalZones.length > 0) {
      subtotalComparisonSqm = subtotalZones.reduce(
        (acc, sz) => acc + (sz.statedAreaSqm ?? sz.adoptedBaseAreaSqm ?? 0),
        0
      );
    }

    const referenceStated =
      floor.statedFloorArea !== null
        ? floor.statedFloorArea
        : subtotalComparisonSqm;

    const diffFromStatedSqm =
      referenceStated !== null ? confirmedFloorAreaSqm - referenceStated : null;

    return {
      floorId: floor.id,
      floorLabel: floor.label,
      floorCategory: floor.category,
      orderIndex: floor.orderIndex,
      statedFloorAreaSqm: referenceStated,
      measuredFloorAreaSqm,
      confirmedFloorAreaSqm,
      confirmedFarAreaSqm,
      excludedFloorAreaSqm,
      excludedFarAreaSqm,
      subtotalComparisonSqm,
      diffFromStatedSqm,
      hasUnconfirmedItems,
    };
  });

  // 용도별 집계 (상세 행 & 반려 제외)
  const usageMap = new Map<
    string,
    { floorAreaSqm: number; farAreaSqm: number; zoneCount: number }
  >();
  for (const z of zones) {
    if (z.rowType !== "detail" || z.reviewStatus === "rejected") continue;
    const key = z.usage.trim() || "용도 미지정";
    const cur = usageMap.get(key) ?? {
      floorAreaSqm: 0,
      farAreaSqm: 0,
      zoneCount: 0,
    };
    cur.floorAreaSqm += z.includedFloorAreaSqm ?? 0;
    cur.farAreaSqm += z.includedFarAreaSqm ?? 0;
    cur.zoneCount += 1;
    usageMap.set(key, cur);
  }

  const usages: UsageAggregationSummary[] = Array.from(usageMap.entries()).map(
    ([usage, val]) => ({
      usage,
      floorAreaSqm: val.floorAreaSqm,
      farAreaSqm: val.farAreaSqm,
      zoneCount: val.zoneCount,
    })
  );

  // 동별 집계
  const totalGrossFloorAreaSqm = floorSummaries.reduce(
    (acc, f) => acc + f.confirmedFloorAreaSqm,
    0
  );
  const totalFarGrossFloorAreaSqm = floorSummaries.reduce(
    (acc, f) => acc + f.confirmedFarAreaSqm,
    0
  );

  const statedGross =
    building.statedTotalFloorArea ?? project.statedGrossFloorArea;
  const statedFar =
    building.statedFarFloorArea ?? project.statedFarGrossFloorArea;

  const buildingSummary: BuildingAggregationSummary = {
    buildingId: building.id,
    buildingName: building.name || "주건축물 제1동",
    totalFloorAreaSqm: totalGrossFloorAreaSqm,
    totalFarAreaSqm: totalFarGrossFloorAreaSqm,
    statedGrossFloorAreaSqm: statedGross,
    statedFarFloorAreaSqm: statedFar,
    diffGrossFloorAreaSqm:
      statedGross !== null ? totalGrossFloorAreaSqm - statedGross : null,
    diffFarFloorAreaSqm:
      statedFar !== null ? totalFarGrossFloorAreaSqm - statedFar : null,
  };

  // 건폐율 및 용적률 계산 규칙
  const siteAreaSqm = project.siteArea;
  const userConfirmedBuildingAreaSqm = project.userConfirmedBuildingArea;

  let calculatedBuildingCoverageRatio: number | null = null;
  let coverageRatioUnavailableReason: string | null = null;

  if (siteAreaSqm === null) {
    coverageRatioUnavailableReason = "대지면적이 미입력 상태여서 건폐율을 계산하지 않습니다.";
  } else if (siteAreaSqm <= 0) {
    coverageRatioUnavailableReason = "대지면적이 0 ㎡ 이하이므로 건폐율을 계산할 수 없습니다.";
  } else if (userConfirmedBuildingAreaSqm === null) {
    coverageRatioUnavailableReason =
      "사용자 확인 건축면적이 미입력 상태입니다 (1층 바닥면적을 건축면적으로 자동 가정하지 않음).";
  } else {
    calculatedBuildingCoverageRatio =
      (userConfirmedBuildingAreaSqm / siteAreaSqm) * 100;
  }

  let calculatedFloorAreaRatio: number | null = null;
  let farRatioUnavailableReason: string | null = null;

  if (siteAreaSqm === null) {
    farRatioUnavailableReason = "대지면적이 미입력 상태여서 용적률을 계산하지 않습니다.";
  } else if (siteAreaSqm <= 0) {
    farRatioUnavailableReason = "대지면적이 0 ㎡ 이하이므로 용적률을 계산할 수 없습니다.";
  } else {
    calculatedFloorAreaRatio = (totalFarGrossFloorAreaSqm / siteAreaSqm) * 100;
  }

  const unconfirmedCandidateCount = candidates.filter(
    (c) => c.reviewStatus === "pending"
  ).length;
  const unconfirmedZoneCount = zones.filter(
    (z) => z.rowType === "detail" && z.reviewStatus === "pending"
  ).length;

  const isReviewOnly =
    unconfirmedCandidateCount > 0 ||
    unconfirmedZoneCount > 0 ||
    siteAreaSqm === null ||
    siteAreaSqm <= 0;

  return {
    floors: floorSummaries,
    usages,
    buildings: [buildingSummary],
    totalGrossFloorAreaSqm,
    totalFarGrossFloorAreaSqm,
    siteAreaSqm,
    userConfirmedBuildingAreaSqm,
    calculatedBuildingCoverageRatio,
    coverageRatioUnavailableReason,
    calculatedFloorAreaRatio,
    farRatioUnavailableReason,
    unconfirmedCandidateCount,
    unconfirmedZoneCount,
    isReviewOnly,
  };
}

/**
 * 12. 서비스 내 오류·불일치 검사 (17개 항목 전체 검사)
 */
export function runProjectValidations(params: {
  project: Project;
  building: Building;
  floors: Floor[];
  documents: DrawingDocument[];
  regions: DrawingRegion[];
  candidates: ExtractionCandidate[];
  zones: AreaZone[];
  aggregation: ProjectAggregationResult;
}): ValidationIssue[] {
  const {
    project,
    building,
    floors,
    documents,
    regions,
    candidates,
    zones,
    aggregation,
  } = params;

  const issues: ValidationIssue[] = [];
  const tolerance =
    project.comparisonToleranceSqm >= 0 ? project.comparisonToleranceSqm : 0.05;

  const activeDoc =
    documents.find((d) => d.id === project.activeDocumentId) ??
    documents[documents.length - 1] ??
    null;

  // 1. AI 후보 미검토 (UNREVIEWED_CANDIDATE)
  for (const cand of candidates) {
    if (cand.reviewStatus === "pending") {
      issues.push({
        id: `issue-cand-pending-${cand.id}`,
        projectId: project.id,
        code: "UNREVIEWED_CANDIDATE",
        severity: "warning",
        title: "AI 추출 후보 미검토",
        message: `페이지 ${cand.pageIndex}의 추출 후보 [${cand.rawText}] 항목이 아직 검토(확정/수정/반려)되지 않았습니다.`,
        blockingSnapshot: true,
        targetType: "candidate",
        targetId: cand.id,
        pageIndex: cand.pageIndex,
      });
    }

    // 6. 잘못된 숫자나 단위 검사 (INVALID_NUMBER_OR_UNIT)
    const numericFields = new Set([
      "site_area",
      "building_area",
      "gross_floor_area",
      "far_gross_floor_area",
      "building_coverage_ratio",
      "floor_area_ratio",
      "floors_above_ground",
      "floors_below_ground",
      "floor_area_entry",
    ]);
    if (
      cand.reviewStatus !== "rejected" &&
      numericFields.has(cand.fieldKey)
    ) {
      const valToCheck =
        cand.reviewStatus === "edited" && cand.reviewerValue !== null
          ? Number(cand.reviewerValue)
          : typeof cand.normalizedValue === "number"
          ? cand.normalizedValue
          : Number.NaN;
      if (Number.isNaN(valToCheck) || !Number.isFinite(valToCheck)) {
        issues.push({
          id: `issue-cand-num-${cand.id}`,
          projectId: project.id,
          code: "INVALID_NUMBER_OR_UNIT",
          severity: "error",
          title: "잘못된 숫자 또는 단위",
          message: `페이지 ${cand.pageIndex} 후보 [${cand.rawText}]의 정규화 수치 또는 단위가 유효하지 않습니다.`,
          blockingSnapshot: true,
          targetType: "candidate",
          targetId: cand.id,
          pageIndex: cand.pageIndex,
        });
      }
    }
  }

  // 작업 영역(DrawingRegion) 관련 검사
  for (const region of regions) {
    const regionZones = zones.filter(
      (z) => z.regionId === region.id && z.reviewStatus !== "rejected"
    );

    // 14. 축척 미확인 (UNVERIFIED_SCALE)
    if (
      (!region.metersPerPdfPoint || !region.isScaleVerified) &&
      regionZones.some((z) => z.basisType === "measured" || z.outerPolygonPt.length >= 3)
    ) {
      issues.push({
        id: `issue-region-scale-${region.id}`,
        projectId: project.id,
        code: "UNVERIFIED_SCALE",
        severity: "error",
        title: "작업 영역 축척 보정 미확인",
        message: `페이지 ${region.pageIndex} 작업 영역 [${region.name}]의 두 점 거리 축척 보정이 완료되지 않아 측정 면적을 확정할 수 없습니다.`,
        blockingSnapshot: true,
        targetType: "region",
        targetId: region.id,
        pageIndex: region.pageIndex,
      });
    }

    // 11. 같은 작업 영역의 면적 구역 기하 중복 (OVERLAPPING_ZONES_IN_REGION)
    if (region.metersPerPdfPoint && region.metersPerPdfPoint > 0) {
      const detailPolygonZones = regionZones.filter(
        (z) => z.rowType === "detail" && z.outerPolygonPt.length >= 3
      );
      for (let i = 0; i < detailPolygonZones.length; i++) {
        for (let j = i + 1; j < detailPolygonZones.length; j++) {
          const zA = detailPolygonZones[i]!;
          const zB = detailPolygonZones[j]!;
          const overlapSqm = calculateOverlapAreaBetweenPolygonsSqm(
            zA.outerPolygonPt,
            zB.outerPolygonPt,
            region.metersPerPdfPoint
          );
          if (overlapSqm > tolerance) {
            issues.push({
              id: `issue-overlap-${zA.id}-${zB.id}`,
              projectId: project.id,
              code: "OVERLAPPING_ZONES_IN_REGION",
              severity: "error",
              title: "작업 영역 내 구역 경계 중복",
              message: `페이지 ${region.pageIndex} 작업 영역 [${region.name}] 내 구역 [${zA.name}]와(과) [${zB.name}]의 경계가 ${overlapSqm.toFixed(2)} ㎡ 겹칩니다.`,
              blockingSnapshot: true,
              targetType: "region",
              targetId: region.id,
              pageIndex: region.pageIndex,
              comparison: {
                referenceLabel: "허용 중첩 기준",
                referenceValue: 0,
                actualLabel: `${zA.name} ∩ ${zB.name}`,
                actualValue: overlapSqm,
                diffValue: overlapSqm,
                toleranceValue: tolerance,
              },
            });
          }
        }
      }

      // 공간 누락 검사 (기준 외곽을 지정한 경우에만 수행, 미지정 시 안내)
      if (!region.referenceEnvelopePolygonPt || region.referenceEnvelopePolygonPt.length < 3) {
        issues.push({
          id: `issue-envelope-missing-${region.id}`,
          projectId: project.id,
          code: "ENVELOPE_OMISSION_OR_MISSING_ENVELOPE",
          severity: "info",
          title: "검사 기준 외곽 미지정",
          message: `페이지 ${region.pageIndex} 작업 영역 [${region.name}]에 공간 누락 검사용 기준 외곽이 지정되지 않았습니다 (검사 기준 외곽 미지정).`,
          blockingSnapshot: false,
          targetType: "region",
          targetId: region.id,
          pageIndex: region.pageIndex,
        });
      } else {
        const unaccountedSqm = calculateUnaccountedEnvelopeAreaSqm(
          region.referenceEnvelopePolygonPt,
          detailPolygonZones.map((z) => z.outerPolygonPt),
          region.metersPerPdfPoint
        );
        if (unaccountedSqm > tolerance) {
          issues.push({
            id: `issue-envelope-gap-${region.id}`,
            projectId: project.id,
            code: "ENVELOPE_OMISSION_OR_MISSING_ENVELOPE",
            severity: "warning",
            title: "기준 외곽 내 공간 누락 의심",
            message: `페이지 ${region.pageIndex} 작업 영역 [${region.name}]의 기준 외곽 내부 중 구역으로 지정되지 않은 면적이 ${unaccountedSqm.toFixed(2)} ㎡ 존재합니다.`,
            blockingSnapshot: false,
            targetType: "region",
            targetId: region.id,
            pageIndex: region.pageIndex,
            comparison: {
              referenceLabel: "기준 외곽 미산정 잔여 면적",
              referenceValue: 0,
              actualLabel: "누락 의심 면적",
              actualValue: unaccountedSqm,
              diffValue: unaccountedSqm,
              toleranceValue: tolerance,
            },
          });
        }
      }
    }
  }

  // 구역(AreaZone) 단위 검사
  const seenNameFloorKeys = new Map<string, AreaZone>();
  const seenCandidateLinks = new Map<string, AreaZone>();

  for (const zone of zones) {
    if (zone.reviewStatus === "rejected") continue;
    const region = regions.find((r) => r.id === zone.regionId);
    const floor = floors.find((f) => f.id === zone.floorId);

    // 2. 기준 면적 미선택 또는 값 없음 (MISSING_ADOPTED_AREA)
    if (zone.adoptedBaseAreaSqm === null || Number.isNaN(zone.adoptedBaseAreaSqm)) {
      issues.push({
        id: `issue-zone-missing-area-${zone.id}`,
        projectId: project.id,
        code: "MISSING_ADOPTED_AREA",
        severity: "error",
        title: "기준 면적 미선택 또는 미산출",
        message: `구역 [${zone.name}]의 채택 기준 면적(${zone.basisType}) 수치가 없습니다.`,
        blockingSnapshot: true,
        targetType: "zone",
        targetId: zone.id,
        pageIndex: zone.sourcePageIndex,
      });
    }

    // 3. 동·층·용도 누락 (MISSING_BUILDING_FLOOR_USAGE)
    if (!zone.buildingId || !zone.floorId || !floor || !zone.usage.trim()) {
      issues.push({
        id: `issue-zone-meta-${zone.id}`,
        projectId: project.id,
        code: "MISSING_BUILDING_FLOOR_USAGE",
        severity: "error",
        title: "동·층·용도 정보 누락",
        message: `구역 [${zone.name}]에 동, 층 또는 용도 지정이 누락되었습니다.`,
        blockingSnapshot: true,
        targetType: "zone",
        targetId: zone.id,
        pageIndex: zone.sourcePageIndex,
      });
    }

    // 4. 근거 없는 제외·조정 (UNJUSTIFIED_EXCLUSION_OR_ADJUSTMENT)
    const baseVal = zone.adoptedBaseAreaSqm ?? 0;
    const floorDiffers =
      zone.includedFloorAreaSqm !== null &&
      Math.abs(zone.includedFloorAreaSqm - baseVal) > 1e-4;
    const farDiffers =
      zone.includedFarAreaSqm !== null &&
      Math.abs(zone.includedFarAreaSqm - baseVal) > 1e-4;
    if (
      (zone.isAdjustedOrExcluded ||
        !zone.includeInFloorArea ||
        !zone.includeInFarArea ||
        floorDiffers ||
        farDiffers) &&
      !zone.exclusionOrAdjustmentReason.trim()
    ) {
      issues.push({
        id: `issue-zone-unjustified-${zone.id}`,
        projectId: project.id,
        code: "UNJUSTIFIED_EXCLUSION_OR_ADJUSTMENT",
        severity: "error",
        title: "근거 없는 면적 제외·조정",
        message: `구역 [${zone.name}]의 바닥면적 또는 용적률 산입 면적이 기준 면적에서 제외·조정되었으나 사유 및 근거가 입력되지 않았습니다.`,
        blockingSnapshot: true,
        targetType: "zone",
        targetId: zone.id,
        pageIndex: zone.sourcePageIndex,
      });
    }

    // 5. 음수 면적 (NEGATIVE_AREA)
    if (
      (zone.adoptedBaseAreaSqm !== null && zone.adoptedBaseAreaSqm < 0) ||
      (zone.includedFloorAreaSqm !== null && zone.includedFloorAreaSqm < 0) ||
      (zone.includedFarAreaSqm !== null && zone.includedFarAreaSqm < 0)
    ) {
      issues.push({
        id: `issue-zone-negative-${zone.id}`,
        projectId: project.id,
        code: "NEGATIVE_AREA",
        severity: "error",
        title: "음수 면적 오류",
        message: `구역 [${zone.name}]의 면적 수치에 음수가 포함되어 있습니다.`,
        blockingSnapshot: true,
        targetType: "zone",
        targetId: zone.id,
        pageIndex: zone.sourcePageIndex,
      });
    }

    // 7. 같은 구역 중복 집계 (DUPLICATE_ZONE_AGGREGATION)
    if (zone.rowType === "detail") {
      if (zone.linkedCandidateId) {
        const prev = seenCandidateLinks.get(zone.linkedCandidateId);
        if (prev) {
          issues.push({
            id: `issue-zone-dup-cand-${zone.id}`,
            projectId: project.id,
            code: "DUPLICATE_ZONE_AGGREGATION",
            severity: "error",
            title: "동일 추출 후보 중복 구역 등록",
            message: `구역 [${zone.name}]와(과) [${prev.name}]이 동일한 추출 후보를 중복 참조하여 집계되고 있습니다.`,
            blockingSnapshot: true,
            targetType: "zone",
            targetId: zone.id,
            pageIndex: zone.sourcePageIndex,
          });
        } else {
          seenCandidateLinks.set(zone.linkedCandidateId, zone);
        }
      }

      const dupKey = `${zone.floorId}::${zone.name.trim().toLowerCase()}::${zone.usage.trim().toLowerCase()}`;
      const prevSameName = seenNameFloorKeys.get(dupKey);
      if (
        prevSameName &&
        prevSameName.adoptedBaseAreaSqm !== null &&
        zone.adoptedBaseAreaSqm !== null &&
        Math.abs(prevSameName.adoptedBaseAreaSqm - zone.adoptedBaseAreaSqm) < 1e-3
      ) {
        issues.push({
          id: `issue-zone-dup-name-${zone.id}`,
          projectId: project.id,
          code: "DUPLICATE_ZONE_AGGREGATION",
          severity: "warning",
          title: "같은 층 내 동일 이름·면적 구역 중복 의심",
          message: `${floor?.label ?? ""}의 [${zone.name}] 구역이 동일한 이름·용도·면적으로 중복 등록되어 있습니다.`,
          blockingSnapshot: false,
          targetType: "zone",
          targetId: zone.id,
          pageIndex: zone.sourcePageIndex,
        });
      } else {
        seenNameFloorKeys.set(dupKey, zone);
      }
    }

    // 8. 상세 행과 소계 중복 집계 검사 (DETAIL_SUBTOTAL_OVERLAP)
    if (
      zone.rowType === "detail" &&
      /소계|합계|총계|계$/i.test(zone.name.trim())
    ) {
      issues.push({
        id: `issue-zone-subtotal-as-detail-${zone.id}`,
        projectId: project.id,
        code: "DETAIL_SUBTOTAL_OVERLAP",
        severity: "error",
        title: "소계·합계 행이 상세 행으로 분류됨 (중복 합산 위험)",
        message: `구역 [${zone.name}]의 이름에 소계/합계가 포함되어 있으나 '상세 행'으로 설정되어 층별 합계에 중복 합산될 수 있습니다.`,
        blockingSnapshot: true,
        targetType: "zone",
        targetId: zone.id,
        pageIndex: zone.sourcePageIndex,
      });
    }

    // 9 & 10. 도형 자기 교차 및 공제 영역 외곽 이탈 검사
    if (zone.outerPolygonPt.length >= 3) {
      const evalGeom = evaluateZoneGeometry(
        zone.outerPolygonPt,
        zone.deductionPolygonsPt,
        region?.metersPerPdfPoint ?? 0.01
      );
      if (
        evalGeom.hasSelfIntersectingOuter ||
        evalGeom.selfIntersectingDeductionIds.length > 0
      ) {
        issues.push({
          id: `issue-zone-self-intersect-${zone.id}`,
          projectId: project.id,
          code: "SELF_INTERSECTING_POLYGON",
          severity: "error",
          title: "산정선 또는 공제 다각형 자기 교차",
          message: `구역 [${zone.name}]의 외곽 산정선 또는 공제 다각형 선분이 자기 교차하고 있어 확정할 수 없습니다.`,
          blockingSnapshot: true,
          targetType: "zone",
          targetId: zone.id,
          pageIndex: zone.sourcePageIndex,
        });
      }

      if (evalGeom.deductionsOutsideOuterIds.length > 0) {
        issues.push({
          id: `issue-zone-deduction-outside-${zone.id}`,
          projectId: project.id,
          code: "DEDUCTION_OUTSIDE_OUTER",
          severity: "error",
          title: "공제 영역이 외곽 산정선 밖으로 이탈",
          message: `구역 [${zone.name}]의 내부 공제 영역이 외곽 다각형 경계 밖으로 벗어나 있습니다.`,
          blockingSnapshot: true,
          targetType: "zone",
          targetId: zone.id,
          pageIndex: zone.sourcePageIndex,
        });
      }
    }

    // 15. 축척 변경 후 미검토 (SCALE_CHANGED_UNREVIEWED)
    if (zone.needsScaleReverification) {
      issues.push({
        id: `issue-zone-scale-changed-${zone.id}`,
        projectId: project.id,
        code: "SCALE_CHANGED_UNREVIEWED",
        severity: "warning",
        title: "축척 변경 후 재검토 필요",
        message: `구역 [${zone.name}]이 속한 작업 영역의 축척이 변경되어 면적이 재계산되었습니다. 수치를 다시 확인하고 확정하세요.`,
        blockingSnapshot: true,
        targetType: "zone",
        targetId: zone.id,
        pageIndex: zone.sourcePageIndex,
      });
    }

    // 16. 이전 PDF 버전의 근거 연결 (STALE_DOCUMENT_VERSION_LINK)
    if (
      activeDoc &&
      zone.sourceDocumentId &&
      zone.sourceDocumentVersion !== null &&
      (zone.sourceDocumentId !== activeDoc.id ||
        zone.sourceDocumentVersion !== activeDoc.version)
    ) {
      issues.push({
        id: `issue-zone-stale-doc-${zone.id}`,
        projectId: project.id,
        code: "STALE_DOCUMENT_VERSION_LINK",
        severity: "warning",
        title: "이전 도면(PDF) 버전의 근거가 연결됨",
        message: `구역 [${zone.name}]의 출처가 이전 도면 버전(v${zone.sourceDocumentVersion})에 연결되어 있습니다. 현재 활성 도면은 v${activeDoc.version}입니다.`,
        blockingSnapshot: true,
        targetType: "zone",
        targetId: zone.id,
        pageIndex: zone.sourcePageIndex,
      });
    }
  }

  // 12. 문서 기재 연면적과 확정 집계 연면적 차이 (GROSS_AREA_MISMATCH_WITH_STATED)
  const statedGross =
    building.statedTotalFloorArea ?? project.statedGrossFloorArea;
  if (statedGross !== null) {
    const diff = aggregation.totalGrossFloorAreaSqm - statedGross;
    if (Math.abs(diff) > tolerance) {
      issues.push({
        id: `issue-project-gross-mismatch`,
        projectId: project.id,
        code: "GROSS_AREA_MISMATCH_WITH_STATED",
        severity: "warning",
        title: "문서 기재 연면적과 확정 집계 연면적 불일치",
        message: `도면 기재 연면적(${statedGross.toFixed(2)} ㎡)과 구역 집계 연면적(${aggregation.totalGrossFloorAreaSqm.toFixed(2)} ㎡) 사이에 ${diff > 0 ? "+" : ""}${diff.toFixed(2)} ㎡ 차이가 있습니다.`,
        blockingSnapshot: false,
        targetType: "project",
        targetId: project.id,
        pageIndex: null,
        comparison: {
          referenceLabel: "도면 기재 연면적",
          referenceValue: statedGross,
          actualLabel: "확정 집계 연면적",
          actualValue: aggregation.totalGrossFloorAreaSqm,
          diffValue: diff,
          toleranceValue: tolerance,
        },
      });
    }
  }

  const statedFarGross =
    building.statedFarFloorArea ?? project.statedFarGrossFloorArea;
  if (statedFarGross !== null) {
    const diffFar = aggregation.totalFarGrossFloorAreaSqm - statedFarGross;
    if (Math.abs(diffFar) > tolerance) {
      issues.push({
        id: `issue-project-far-mismatch`,
        projectId: project.id,
        code: "GROSS_AREA_MISMATCH_WITH_STATED",
        severity: "warning",
        title: "문서 기재 용적률 산정용 연면적과 집계값 불일치",
        message: `도면 기재 용적률 산정용 연면적(${statedFarGross.toFixed(2)} ㎡)과 확정 집계값(${aggregation.totalFarGrossFloorAreaSqm.toFixed(2)} ㎡) 사이에 ${diffFar > 0 ? "+" : ""}${diffFar.toFixed(2)} ㎡ 차이가 있습니다.`,
        blockingSnapshot: false,
        targetType: "project",
        targetId: project.id,
        pageIndex: null,
        comparison: {
          referenceLabel: "도면 기재 용적률산정 연면적",
          referenceValue: statedFarGross,
          actualLabel: "확정 집계 용적률산정 연면적",
          actualValue: aggregation.totalFarGrossFloorAreaSqm,
          diffValue: diffFar,
          toleranceValue: tolerance,
        },
      });
    }
  }

  // 13. 문서 기재 층별 합계와 집계값 차이 (FLOOR_OR_BUILDING_SUM_MISMATCH)
  for (const fSum of aggregation.floors) {
    if (fSum.statedFloorAreaSqm !== null && fSum.diffFromStatedSqm !== null) {
      if (Math.abs(fSum.diffFromStatedSqm) > tolerance) {
        issues.push({
          id: `issue-floor-mismatch-${fSum.floorId}`,
          projectId: project.id,
          code: "FLOOR_OR_BUILDING_SUM_MISMATCH",
          severity: "warning",
          title: `${fSum.floorLabel} 기재 합계와 상세 구역 집계값 불일치`,
          message: `${fSum.floorLabel}의 도면 기재 면적(${fSum.statedFloorAreaSqm.toFixed(2)} ㎡)과 상세 행 집계 바닥면적(${fSum.confirmedFloorAreaSqm.toFixed(2)} ㎡)의 차이가 ${fSum.diffFromStatedSqm > 0 ? "+" : ""}${fSum.diffFromStatedSqm.toFixed(2)} ㎡입니다.`,
          blockingSnapshot: false,
          targetType: "floor",
          targetId: fSum.floorId,
          pageIndex: null,
          comparison: {
            referenceLabel: `${fSum.floorLabel} 도면 기재 면적`,
            referenceValue: fSum.statedFloorAreaSqm,
            actualLabel: `${fSum.floorLabel} 상세 행 집계`,
            actualValue: fSum.confirmedFloorAreaSqm,
            diffValue: fSum.diffFromStatedSqm,
            toleranceValue: tolerance,
          },
        });
      }
    }
  }

  return issues;
}
