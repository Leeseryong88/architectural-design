"use client";

import React, { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
  AlertTriangle,
  CheckCircle2,
  History,
  Loader2,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { generateAreaReportExcelBytes } from "@/lib/export/excel-exporter";
import { generateReviewPdfBytes } from "@/lib/export/pdf-exporter";
import { getStorageRepository } from "@/lib/storage";
import type { ExportSnapshot } from "@/types/domain";

function triggerBrowserDownload(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string
) {
  const blob = new Blob([bytes.slice().buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportAndSnapshotTab() {
  const bundle = useWorkspaceStore((s) => s.bundle);
  const pdfBytes = useWorkspaceStore((s) => s.pdfBytes);
  const aggregation = useWorkspaceStore((s) => s.aggregation);
  const validationIssues = useWorkspaceStore((s) => s.validationIssues);
  const ownerId = useWorkspaceStore((s) => s.ownerId);
  const createImmutableSnapshot = useWorkspaceStore(
    (s) => s.createImmutableSnapshot
  );

  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [includeSections, setIncludeSections] = useState({
    overview: true,
    zoneDetails: true,
    floorUsageSummary: true,
    buildingSummary: true,
    adjustmentBasis: true,
    validationItems: true,
  });

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewingSnapshot, setViewingSnapshot] =
    useState<ExportSnapshot | null>(null);

  if (!bundle || !aggregation) return null;

  const activeDoc =
    bundle.documents.find((d) => d.id === bundle.project.activeDocumentId) ??
    bundle.documents[bundle.documents.length - 1] ??
    null;

  const blockingIssues = validationIssues.filter((i) => i.blockingSnapshot);
  const canCreateConfirmedSnapshot =
    !aggregation.isReviewOnly && blockingIssues.length === 0;

  const handleDownloadReviewExcel = async () => {
    setBusyAction("review_excel");
    setActionError(null);
    try {
      const excelBytes = await generateAreaReportExcelBytes({
        project: bundle.project,
        building: bundle.building,
        floors: bundle.floors,
        documents: bundle.documents,
        zones: bundle.zones,
        aggregation,
        issues: validationIssues,
        isConfirmedSnapshot: false,
        includeSections,
      });
      triggerBrowserDownload(
        excelBytes,
        `[검토용]_면적산출표_${bundle.project.name}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "엑셀 출력 생성 중 오류 발생"
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadReviewPdf = async () => {
    setBusyAction("review_pdf");
    setActionError(null);
    try {
      const outPdfBytes = await generateReviewPdfBytes({
        originalPdfBytes: pdfBytes,
        project: bundle.project,
        building: bundle.building,
        floors: bundle.floors,
        documentItem: activeDoc,
        pages: bundle.pages,
        regions: bundle.regions,
        zones: bundle.zones,
        aggregation,
        issues: validationIssues,
        isConfirmedSnapshot: false,
      });
      triggerBrowserDownload(
        outPdfBytes,
        `[검토용]_도면산정선합성_검토보고서_${bundle.project.name}.pdf`,
        "application/pdf"
      );
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "검토용 PDF 출력 생성 중 오류 발생"
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateSnapshot = async (isConfirmed: boolean) => {
    setBusyAction(isConfirmed ? "confirm_snap" : "review_snap");
    setActionError(null);
    try {
      const nextVer =
        bundle.snapshots.reduce((max, s) => Math.max(max, s.versionNumber), 0) +
        1;

      const [excelBytes, reportPdfBytes] = await Promise.all([
        generateAreaReportExcelBytes({
          project: bundle.project,
          building: bundle.building,
          floors: bundle.floors,
          documents: bundle.documents,
          zones: bundle.zones,
          aggregation,
          issues: validationIssues,
          isConfirmedSnapshot: isConfirmed,
          snapshotVersion: nextVer,
          includeSections,
        }),
        generateReviewPdfBytes({
          originalPdfBytes: pdfBytes,
          project: bundle.project,
          building: bundle.building,
          floors: bundle.floors,
          documentItem: activeDoc,
          pages: bundle.pages,
          regions: bundle.regions,
          zones: bundle.zones,
          aggregation,
          issues: validationIssues,
          isConfirmedSnapshot: isConfirmed,
          snapshotVersion: nextVer,
        }),
      ]);

      await createImmutableSnapshot({
        label: snapshotLabel,
        isImmutableConfirmed: isConfirmed,
        excelBytes,
        pdfBytes: reportPdfBytes,
      });

      setSnapshotLabel("");
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "스냅샷 생성 중 오류가 발생했습니다."
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadSnapshotFile = async (
    snap: ExportSnapshot,
    fileType: "xlsx" | "pdf"
  ) => {
    setBusyAction(`dl_${snap.id}_${fileType}`);
    setActionError(null);
    try {
      const repo = getStorageRepository();
      const path =
        fileType === "xlsx" ? snap.excelStoragePath : snap.pdfStoragePath;

      if (path) {
        const storedBytes = await repo.loadSnapshotExportFile(ownerId, path);
        if (storedBytes) {
          triggerBrowserDownload(
            storedBytes,
            `${snap.isImmutableConfirmed ? "[확정본]" : "[검토본]"}_v${
              snap.versionNumber
            }_${snap.projectSnapshot.name}.${fileType}`,
            fileType === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "application/pdf"
          );
          return;
        }
      }

      // 만약 로컬 캐시가 비어 있으면 스냅샷의 불변 데이터로 즉시 재생성
      if (fileType === "xlsx") {
        const bytes = await generateAreaReportExcelBytes({
          project: snap.projectSnapshot,
          building: snap.buildingSnapshot,
          floors: snap.floorsSnapshot,
          documents: bundle.documents,
          zones: snap.zonesSnapshot,
          aggregation: snap.aggregationSnapshot,
          issues: snap.issuesSnapshot,
          isConfirmedSnapshot: snap.isImmutableConfirmed,
          snapshotVersion: snap.versionNumber,
        });
        triggerBrowserDownload(
          bytes,
          `${snap.label}.xlsx`,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
      } else {
        const bytes = await generateReviewPdfBytes({
          originalPdfBytes: pdfBytes,
          project: snap.projectSnapshot,
          building: snap.buildingSnapshot,
          floors: snap.floorsSnapshot,
          documentItem: activeDoc,
          pages: bundle.pages,
          regions: snap.regionsSnapshot,
          zones: snap.zonesSnapshot,
          aggregation: snap.aggregationSnapshot,
          issues: snap.issuesSnapshot,
          isConfirmedSnapshot: snap.isImmutableConfirmed,
          snapshotVersion: snap.versionNumber,
        });
        triggerBrowserDownload(bytes, `${snap.label}.pdf`, "application/pdf");
      }
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "스냅샷 파일 다운로드 실패"
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 overflow-y-auto">
      {/* 1. 미확정 항목 및 확정 가능 여부 요약 카드 */}
      <div
        className={`rounded-xl border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          canCreateConfirmedSnapshot
            ? "bg-emerald-50 border-emerald-200 text-emerald-950"
            : "bg-amber-50 border-amber-200 text-amber-950"
        }`}
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-base">
            {canCreateConfirmedSnapshot ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>모든 필수 항목 확인 완료 — 불변 확정본 생성 가능</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span>
                  미확정 항목 또는 차단 오류 존재 — 현재는 &apos;검토용 출력&apos;만 허용됩니다
                </span>
              </>
            )}
          </div>
          <p className="text-xs leading-relaxed">
            미확정 AI 추출 후보:{" "}
            <strong>{aggregation.unconfirmedCandidateCount}건</strong> · 미확정 구역:{" "}
            <strong>{aggregation.unconfirmedZoneCount}건</strong> · 확정 차단 오류:{" "}
            <strong>{blockingIssues.length}건</strong>
          </p>
          <p className="text-[11px] opacity-80">
            ※ 사용자 확인이 완료되어 확정본을 생성하더라도 건축법령 및 지자체 조례상 법적 적합성이 자동 보증되지 않습니다. &apos;세움터 입력 참고표&apos;는 검토용 집계 출력물입니다.
          </p>
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          {actionError}
        </div>
      )}

      {/* 2. 출력 포함 항목 선택 및 즉시 출력 / 불변 확정본 생성 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
        <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
          1. 출력 포함 항목 선택 및 검토용·확정본 출력
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {(
            [
              ["overview", "1. 프로젝트 개요 시트"],
              ["zoneDetails", "2. 구역별 산출내역 시트"],
              ["floorUsageSummary", "3. 층별·용도별 집계 (세움터 참고표)"],
              ["buildingSummary", "4. 동별 집계 시트"],
              ["adjustmentBasis", "5. 제외·조정 근거 시트"],
              ["validationItems", "6. 검토 필요 항목 시트"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={includeSections[key] ?? true}
                onChange={(e) =>
                  setIncludeSections({
                    ...includeSections,
                    [key]: e.target.checked,
                  })
                }
                className="rounded border-slate-300 text-blue-600"
              />
              <span className="font-medium text-slate-800">{label}</span>
            </label>
          ))}
        </div>

        {/* 즉시 검토용 다운로드 버튼 */}
        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleDownloadReviewExcel()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold transition"
          >
            {busyAction === "review_excel" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            <span>검토용 엑셀(6개 시트) 즉시 다운로드 (.xlsx)</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleDownloadReviewPdf()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-semibold transition"
          >
            {busyAction === "review_pdf" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            <span>검토용 PDF (도면 위 산정선·공제·구역번호 합성) 즉시 다운로드 (.pdf)</span>
          </button>
        </div>

        {/* 불변 확정본(스냅샷) 생성 영역 */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">
            불변 확정본(Snapshot) 생성 및 보관
          </h3>
          <p className="text-xs text-slate-600">
            확정본은 생성 당시의 프로젝트·동·층·산정선·축척·출처 문서 해시·집계 결과 및 출력 파일을 불변 스냅샷으로 보존합니다. 이후 프로젝트를 수정해도 이전 확정본은 변경되지 않습니다.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={snapshotLabel}
              onChange={(e) => setSnapshotLabel(e.target.value)}
              placeholder="스냅샷 메모/이름 (예: 인허가 1차 접수 전 검토 완료본)"
              className="flex-1 min-w-[240px] px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />

            <button
              type="button"
              disabled={!canCreateConfirmedSnapshot || busyAction !== null}
              onClick={() => void handleCreateSnapshot(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold transition"
              title={
                !canCreateConfirmedSnapshot
                  ? "미확정 후보·구역 또는 차단 오류를 모두 해결한 뒤 확정본을 생성할 수 있습니다."
                  : "불변 확정본 생성"
              }
            >
              <Lock className="w-3.5 h-3.5" />
              <span>확정본 생성 (불변 스냅샷)</span>
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleCreateSnapshot(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-semibold transition"
            >
              <History className="w-3.5 h-3.5" />
              <span>현재 상태로 검토용 스냅샷 보관</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. 이전 확정본 및 스냅샷 목록과 재조회/다운로드 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
          2. 이전 확정본 및 스냅샷 이력 ({bundle.snapshots.length}건)
        </h2>

        {bundle.snapshots.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            생성된 확정본 또는 스냅샷 이력이 없습니다.
          </p>
        ) : (
          <div className="divide-y divide-slate-200">
            {bundle.snapshots.map((snap) => (
              <div
                key={snap.id}
                className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                        snap.isImmutableConfirmed
                          ? "bg-blue-100 text-blue-800 border border-blue-300"
                          : "bg-amber-100 text-amber-800 border border-amber-300"
                      }`}
                    >
                      {snap.isImmutableConfirmed ? "불변 확정본" : "검토용 스냅샷"}{" "}
                      v{snap.versionNumber}
                    </span>
                    <strong className="text-sm text-slate-900">
                      {snap.label}
                    </strong>
                  </div>
                  <p className="text-slate-500">
                    생성 시각: {new Date(snap.createdAt).toLocaleString("ko-KR")}{" "}
                    · 생성자: {snap.createdByEmail} · 도면:{" "}
                    {snap.sourceDocument
                      ? `${snap.sourceDocument.originalFileName} (v${snap.sourceDocument.version}, 해시 ${snap.sourceDocument.documentHash.slice(0, 10)}...)`
                      : "없음"}
                  </p>
                  <p className="text-slate-700 font-medium">
                    스냅샷 당시 집계 연면적:{" "}
                    <strong className="font-mono text-blue-700">
                      {snap.aggregationSnapshot.totalGrossFloorAreaSqm.toFixed(2)} ㎡
                    </strong>{" "}
                    · 용적률산정 연면적:{" "}
                    <strong className="font-mono text-indigo-700">
                      {snap.aggregationSnapshot.totalFarGrossFloorAreaSqm.toFixed(
                        2
                      )}{" "}
                      ㎡
                    </strong>{" "}
                    · 구역 {snap.zonesSnapshot.length}개 보존됨
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setViewingSnapshot(
                        viewingSnapshot?.id === snap.id ? null : snap
                      )
                    }
                    className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold"
                  >
                    {viewingSnapshot?.id === snap.id
                      ? "상세 닫기"
                      : "스냅샷 상세 재조회"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDownloadSnapshotFile(snap, "xlsx")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>엑셀 다운로드</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDownloadSnapshotFile(snap, "pdf")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>산정선 합성 PDF 다운로드</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 선택된 스냅샷 불변 데이터 재조회 뷰 */}
        {viewingSnapshot && (
          <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900">
                [{viewingSnapshot.label}] 불변 스냅샷 재조회 (현재 프로젝트 편집과 독립 보존됨)
              </h4>
              <span className="text-slate-500 font-mono">
                ID: {viewingSnapshot.id}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-2.5 bg-white rounded border border-slate-200">
                <div className="text-slate-500">대지면적 / 확인 건축면적</div>
                <div className="font-bold mt-0.5">
                  {viewingSnapshot.projectSnapshot.siteArea ?? "미입력"} ㎡ /{" "}
                  {viewingSnapshot.projectSnapshot.userConfirmedBuildingArea ??
                    "미입력"}{" "}
                  ㎡
                </div>
              </div>
              <div className="p-2.5 bg-white rounded border border-slate-200">
                <div className="text-slate-500">스냅샷 연면적 / 용적률연면적</div>
                <div className="font-bold mt-0.5 text-blue-700">
                  {viewingSnapshot.aggregationSnapshot.totalGrossFloorAreaSqm.toFixed(
                    2
                  )}{" "}
                  ㎡ /{" "}
                  {viewingSnapshot.aggregationSnapshot.totalFarGrossFloorAreaSqm.toFixed(
                    2
                  )}{" "}
                  ㎡
                </div>
              </div>
              <div className="p-2.5 bg-white rounded border border-slate-200">
                <div className="text-slate-500">보존된 구역 및 산정선 수</div>
                <div className="font-bold mt-0.5">
                  총 {viewingSnapshot.zonesSnapshot.length}개 구역 / 작업영역{" "}
                  {viewingSnapshot.regionsSnapshot.length}개
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
