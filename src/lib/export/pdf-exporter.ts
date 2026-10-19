import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { getPolygonCentroid, roundToDecimals } from "@/lib/geometry/planar";
import {
  REVIEW_STATUS_LABELS,
  type AreaZone,
  type Building,
  type DrawingDocument,
  type DrawingPage,
  type DrawingRegion,
  type Floor,
  type Point2D,
  type Project,
  type ProjectAggregationResult,
  type ValidationIssue,
} from "@/types/domain";

export interface PdfExportOptions {
  originalPdfBytes: Uint8Array | null;
  project: Project;
  building: Building;
  floors: Floor[];
  documentItem: DrawingDocument | null;
  pages: DrawingPage[];
  regions: DrawingRegion[];
  zones: AreaZone[];
  aggregation: ProjectAggregationResult;
  issues: ValidationIssue[];
  isConfirmedSnapshot: boolean;
  snapshotVersion?: number;
}

async function loadKoreanFontBytes(): Promise<Uint8Array> {
  const res = await fetch("/fonts/NanumGothic-Regular.ttf");
  if (!res.ok) {
    throw new Error("한글 임베딩 폰트(/fonts/NanumGothic-Regular.ttf)를 불러올 수 없습니다.");
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * 저장된 원본 PDF 좌상단(Top-Left) pt 좌표를 pdf-lib 페이지의 좌하단(Bottom-Left) 원점 좌표로 변환한다.
 * 페이지 기본 회전(nativeRotation)과 원본 크기를 반영하여 화면과 동일한 위치에 산정선이 출력되도록 한다.
 */
function toPdfLibCoord(
  pt: Point2D,
  pageWidthPt: number,
  pageHeightPt: number
): Point2D {
  return {
    x: pt.x,
    y: pageHeightPt - pt.y,
  };
}

function drawPolygonOutlineOnPdfPage(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any;
  pointsTopLeftPt: Point2D[];
  pageWidthPt: number;
  pageHeightPt: number;
  color: ReturnType<typeof rgb>;
  thickness: number;
}) {
  const { page, pointsTopLeftPt, pageWidthPt, pageHeightPt, color, thickness } =
    params;
  if (pointsTopLeftPt.length < 2) return;

  for (let i = 0; i < pointsTopLeftPt.length; i++) {
    const p1 = toPdfLibCoord(
      pointsTopLeftPt[i]!,
      pageWidthPt,
      pageHeightPt
    );
    const p2 = toPdfLibCoord(
      pointsTopLeftPt[(i + 1) % pointsTopLeftPt.length]!,
      pageWidthPt,
      pageHeightPt
    );
    page.drawLine({
      start: { x: p1.x, y: p1.y },
      end: { x: p2.x, y: p2.y },
      thickness,
      color,
    });
  }
}

export async function generateReviewPdfBytes(
  options: PdfExportOptions
): Promise<Uint8Array> {
  const {
    originalPdfBytes,
    project,
    building,
    floors,
    documentItem,
    regions,
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

  const nowStr = new Date().toLocaleString("ko-KR");
  const fontBytes = await loadKoreanFontBytes();

  const outPdf = await PDFDocument.create();
  outPdf.registerFontkit(fontkit);
  const customFont = await outPdf.embedFont(fontBytes);

  // =========================================================================
  // 1. 표지 및 집계 요약 페이지 (세움터 입력 참고표 + 제외 근거 + 검토 상태)
  // =========================================================================
  const cover = outPdf.addPage([842, 595]);
  const cw = 842;
  const ch = 595;

  cover.drawRectangle({
    x: 30,
    y: 30,
    width: cw - 60,
    height: ch - 60,
    borderColor: rgb(0.15, 0.2, 0.3),
    borderWidth: 1.5,
  });

  // 상단 배너
  cover.drawRectangle({
    x: 30,
    y: ch - 85,
    width: cw - 60,
    height: 55,
    color: isReviewOnly ? rgb(0.99, 0.94, 0.88) : rgb(0.92, 0.96, 0.99),
    borderColor: rgb(0.15, 0.2, 0.3),
    borderWidth: 1,
  });

  const headerTitle = isReviewOnly
    ? `[검토용] 면적노트 산출·검토 보고서 - ${project.name}`
    : `[확정본 v${snapshotVersion ?? 1}] 면적노트 산출·검토 보고서 - ${project.name}`;

  cover.drawText(headerTitle, {
    x: 45,
    y: ch - 62,
    size: 14,
    font: customFont,
    color: isReviewOnly ? rgb(0.75, 0.25, 0.05) : rgb(0.08, 0.2, 0.45),
  });

  cover.drawText(
    `출력 시각: ${nowStr}  |  도면 버전: ${
      documentItem ? `${documentItem.originalFileName} (v${documentItem.version})` : "도면 없음"
    }  |  검토 상태: ${
      isReviewOnly
        ? `검토용 (미확정 후보 ${aggregation.unconfirmedCandidateCount}건 / 미확정 구역 ${aggregation.unconfirmedZoneCount}건)`
        : "설계자 확인 완료"
    }`,
    {
      x: 45,
      y: ch - 78,
      size: 8.5,
      font: customFont,
      color: rgb(0.25, 0.3, 0.35),
    }
  );

  // 좌측: 프로젝트 및 동별 요약 + 세움터 입력 참고표
  let y = ch - 115;
  cover.drawText("1. 프로젝트 및 동별 면적 총괄 (세움터 입력 참고표)", {
    x: 45,
    y,
    size: 11,
    font: customFont,
    color: rgb(0.1, 0.15, 0.25),
  });
  y -= 18;

  const summaryLines = [
    `• 대지 위치: ${project.siteLocation || "-"}`,
    `• 대지면적: ${
      project.siteArea !== null ? `${roundToDecimals(project.siteArea)} ㎡` : "미입력"
    }   |   사용자 확인 건축면적: ${
      project.userConfirmedBuildingArea !== null
        ? `${roundToDecimals(project.userConfirmedBuildingArea)} ㎡`
        : "미입력"
    }`,
    `• 확정 집계 연면적: ${roundToDecimals(aggregation.totalGrossFloorAreaSqm)} ㎡ (도면 기재 비교값: ${
      building.statedTotalFloorArea !== null
        ? `${roundToDecimals(building.statedTotalFloorArea)} ㎡`
        : "미입력"
    })`,
    `• 확정 용적률 산정용 연면적: ${roundToDecimals(
      aggregation.totalFarGrossFloorAreaSqm
    )} ㎡`,
    `• 산출 건폐율: ${
      aggregation.calculatedBuildingCoverageRatio !== null
        ? `${roundToDecimals(aggregation.calculatedBuildingCoverageRatio)} %`
        : aggregation.coverageRatioUnavailableReason || "-"
    }   |   산출 용적률: ${
      aggregation.calculatedFloorAreaRatio !== null
        ? `${roundToDecimals(aggregation.calculatedFloorAreaRatio)} %`
        : aggregation.farRatioUnavailableReason || "-"
    }`,
  ];

  for (const line of summaryLines) {
    cover.drawText(line, {
      x: 50,
      y,
      size: 9,
      font: customFont,
      color: rgb(0.15, 0.15, 0.2),
    });
    y -= 15;
  }

  // 층별 집계 표
  y -= 8;
  cover.drawText("2. 층별 집계 내역 (상세 행 기준 합산)", {
    x: 45,
    y,
    size: 10.5,
    font: customFont,
    color: rgb(0.1, 0.15, 0.25),
  });
  y -= 16;

  for (const f of aggregation.floors) {
    const fLine = `[${f.floorLabel}] 도면기재: ${
      f.statedFloorAreaSqm !== null ? `${roundToDecimals(f.statedFloorAreaSqm)}㎡` : "-"
    }  |  측정합계: ${roundToDecimals(
      f.measuredFloorAreaSqm
    )}㎡  |  확정바닥: ${roundToDecimals(
      f.confirmedFloorAreaSqm
    )}㎡  |  용적률산입: ${roundToDecimals(
      f.confirmedFarAreaSqm
    )}㎡  |  기재대비차이: ${
      f.diffFromStatedSqm !== null
        ? `${f.diffFromStatedSqm > 0 ? "+" : ""}${roundToDecimals(f.diffFromStatedSqm)}㎡`
        : "-"
    }`;
    cover.drawText(fLine, {
      x: 52,
      y,
      size: 8.5,
      font: customFont,
      color: rgb(0.15, 0.2, 0.25),
    });
    y -= 14;
  }

  // 제외·조정 근거 요약
  y -= 8;
  cover.drawText("3. 구역별 산입·제외 및 조정 근거 요약", {
    x: 45,
    y,
    size: 10.5,
    font: customFont,
    color: rgb(0.1, 0.15, 0.25),
  });
  y -= 16;

  for (const z of zones.slice(0, 10)) {
    const floor = floors.find((f) => f.id === z.floorId);
    const zLine = `• [${floor?.label ?? "-"}] ${z.name} (${z.usage}) : 기준 ${
      z.adoptedBaseAreaSqm !== null ? `${roundToDecimals(z.adoptedBaseAreaSqm)}㎡` : "-"
    } → 바닥반영 ${
      z.includedFloorAreaSqm !== null ? `${roundToDecimals(z.includedFloorAreaSqm)}㎡` : "-"
    }, 용적률반영 ${
      z.includedFarAreaSqm !== null ? `${roundToDecimals(z.includedFarAreaSqm)}㎡` : "-"
    } [${REVIEW_STATUS_LABELS[z.reviewStatus]}] 사유: ${
      z.exclusionOrAdjustmentReason || "일반 산입"
    }`;
    cover.drawText(zLine.slice(0, 115), {
      x: 52,
      y,
      size: 8,
      font: customFont,
      color: rgb(0.2, 0.2, 0.25),
    });
    y -= 13;
    if (y < 75) break;
  }

  // 하단 고지사항
  cover.drawText(
    "※ '세움터 입력 참고표'는 설계자 검토용 집계 출력물이며, 공식 업로드 파일이나 자동 접수 기능이 아닙니다. 수동 산정선은 사용자 지정 경계입니다.",
    {
      x: 45,
      y: 42,
      size: 8,
      font: customFont,
      color: rgb(0.45, 0.45, 0.45),
    }
  );

  // =========================================================================
  // 2. 원본 도면 페이지 복사 후 산정선·공제 영역·구역 번호·축척 보정 정보·범례 합성
  // =========================================================================
  if (originalPdfBytes && originalPdfBytes.byteLength > 0) {
    const srcPdf = await PDFDocument.load(originalPdfBytes);
    const totalPages = srcPdf.getPageCount();
    const pageIndicesArr = Array.from({ length: totalPages }, (_, i) => i);
    const copiedPages = await outPdf.copyPages(srcPdf, pageIndicesArr);

    copiedPages.forEach((pdfPage, idx) => {
      outPdf.addPage(pdfPage);
      const pageIndex = idx + 1;
      const { width: pw, height: ph } = pdfPage.getSize();

      const pageRegions = regions.filter((r) => r.pageIndex === pageIndex);
      const pageZones = zones.filter(
        (z) =>
          z.sourcePageIndex === pageIndex &&
          z.outerPolygonPt.length >= 3 &&
          z.reviewStatus !== "rejected"
      );

      // 미확정 데이터 포함 시 페이지 상단에 "검토용" 배지 합성
      if (isReviewOnly) {
        pdfPage.drawRectangle({
          x: pw - 210,
          y: ph - 28,
          width: 180,
          height: 20,
          color: rgb(0.98, 0.9, 0.85),
          borderColor: rgb(0.8, 0.25, 0.1),
          borderWidth: 1,
        });
        pdfPage.drawText("검토용 (미확정/불일치 항목 포함)", {
          x: pw - 202,
          y: ph - 21,
          size: 8.5,
          font: customFont,
          color: rgb(0.8, 0.2, 0.1),
        });
      }

      // 작업 영역 및 축척 보정 정보 표시
      for (const reg of pageRegions) {
        if (reg.calibration && reg.metersPerPdfPoint) {
          const c1 = toPdfLibCoord(reg.calibration.p1, pw, ph);
          const c2 = toPdfLibCoord(reg.calibration.p2, pw, ph);
          pdfPage.drawLine({
            start: { x: c1.x, y: c1.y },
            end: { x: c2.x, y: c2.y },
            thickness: 1.5,
            color: rgb(0.05, 0.45, 0.85),
          });
          pdfPage.drawText(
            `[축척보정] ${reg.name}: ${reg.calibration.realLengthInput}${reg.calibration.unit} (1pt=${reg.metersPerPdfPoint.toFixed(4)}m)`,
            {
              x: Math.min(c1.x, c2.x),
              y: Math.max(c1.y, c2.y) + 6,
              size: 7.5,
              font: customFont,
              color: rgb(0.05, 0.4, 0.8),
            }
          );
        }
      }

      // 구역 산정선(청록/녹색) 및 공제 영역(적색) 합성
      pageZones.forEach((zone, zIdx) => {
        const zoneNumber = `Z-${zIdx + 1}`;
        drawPolygonOutlineOnPdfPage({
          page: pdfPage,
          pointsTopLeftPt: zone.outerPolygonPt,
          pageWidthPt: pw,
          pageHeightPt: ph,
          color: rgb(0.05, 0.55, 0.35),
          thickness: 2.2,
        });

        const centroidTopLeft = getPolygonCentroid(zone.outerPolygonPt);
        const centroidPdf = toPdfLibCoord(centroidTopLeft, pw, ph);

        // 구역 번호 및 측정/채택 면적 라벨 박스
        pdfPage.drawRectangle({
          x: centroidPdf.x - 45,
          y: centroidPdf.y - 12,
          width: 125,
          height: 26,
          color: rgb(0.95, 1, 0.97),
          borderColor: rgb(0.05, 0.55, 0.35),
          borderWidth: 0.9,
        });

        pdfPage.drawText(`[${zoneNumber}] ${zone.name}`, {
          x: centroidPdf.x - 40,
          y: centroidPdf.y + 2,
          size: 8,
          font: customFont,
          color: rgb(0.05, 0.35, 0.2),
        });

        pdfPage.drawText(
          `채택: ${
            zone.adoptedBaseAreaSqm !== null
              ? `${roundToDecimals(zone.adoptedBaseAreaSqm)}㎡`
              : "-"
          }`,
          {
            x: centroidPdf.x - 40,
            y: centroidPdf.y - 8,
            size: 7.5,
            font: customFont,
            color: rgb(0.1, 0.2, 0.15),
          }
        );

        // 내부 공제 다각형 합성
        for (const ded of zone.deductionPolygonsPt) {
          drawPolygonOutlineOnPdfPage({
            page: pdfPage,
            pointsTopLeftPt: ded.pointsPt,
            pageWidthPt: pw,
            pageHeightPt: ph,
            color: rgb(0.85, 0.15, 0.15),
            thickness: 1.8,
          });
          const dCent = toPdfLibCoord(
            getPolygonCentroid(ded.pointsPt),
            pw,
            ph
          );
          pdfPage.drawText(`[공제] ${ded.label}`, {
            x: dCent.x - 28,
            y: dCent.y,
            size: 7,
            font: customFont,
            color: rgb(0.8, 0.1, 0.1),
          });
        }
      });

      // 산정선이나 작업 영역이 있는 페이지 우하단에 범례(Legend) 박스 합성
      if (pageZones.length > 0 || pageRegions.length > 0) {
        pdfPage.drawRectangle({
          x: pw - 235,
          y: 34,
          width: 200,
          height: 44,
          color: rgb(0.98, 0.99, 1),
          borderColor: rgb(0.3, 0.35, 0.45),
          borderWidth: 0.8,
        });
        pdfPage.drawText("■ 범례: [녹색 실선] 사용자 지정 외곽 산정선", {
          x: pw - 228,
          y: 64,
          size: 7,
          font: customFont,
          color: rgb(0.05, 0.5, 0.3),
        });
        pdfPage.drawText("■ 범례: [적색 실선] 내부 공제 영역 (합집합 차감)", {
          x: pw - 228,
          y: 52,
          size: 7,
          font: customFont,
          color: rgb(0.8, 0.15, 0.15),
        });
        pdfPage.drawText("■ 범례: [청색 실선] 축척 보정 기준선", {
          x: pw - 228,
          y: 40,
          size: 7,
          font: customFont,
          color: rgb(0.05, 0.4, 0.8),
        });
      }
    });
  }

  const saved = await outPdf.save();
  return new Uint8Array(saved);
}
