"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useAppAuth } from "@/components/providers/auth-provider";
import { getPdfJs, MAX_ANALYSIS_SELECTED_PAGES } from "@/lib/pdf/pdf-engine";
import {
  PAGE_CLASSIFICATION_LABELS,
  RUN_STATUS_LABELS,
  type DrawingPage,
  type PageClassification,
} from "@/types/domain";

function PageStatusDot({ page }: { page: DrawingPage }) {
  if (page.analysisStatus === "running" || page.analysisStatus === "queued") {
    return <Loader2 className="w-3 h-3 animate-spin text-blue-600" />;
  }
  if (page.analysisStatus === "failed") {
    return <span className="w-2 h-2 rounded-full bg-red-500" title="분석 실패" />;
  }
  if (page.analysisStatus === "completed") {
    return (
      <span className="w-2 h-2 rounded-full bg-emerald-500" title="분석 완료" />
    );
  }
  return null;
}

export function LeftPageSidebar({
  compact = false,
  onToggleCompact,
}: {
  compact?: boolean;
  onToggleCompact?: () => void;
}) {
  const { getIdToken, envConfig } = useAppAuth();
  const bundle = useWorkspaceStore((s) => s.bundle);
  const pdfBytes = useWorkspaceStore((s) => s.pdfBytes);
  const activePageIndex = useWorkspaceStore((s) => s.activePageIndex);
  const setActivePageIndex = useWorkspaceStore((s) => s.setActivePageIndex);
  const uploadNewPdfDocument = useWorkspaceStore((s) => s.uploadNewPdfDocument);
  const updatePageClassification = useWorkspaceStore(
    (s) => s.updatePageClassification
  );
  const togglePageForAnalysis = useWorkspaceStore(
    (s) => s.togglePageForAnalysis
  );
  const runSelectedPagesExtraction = useWorkspaceStore(
    (s) => s.runSelectedPagesExtraction
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [uploading, setUploading] = useState(false);
  const [runningAi, setRunningAi] = useState(false);

  // PDF 썸네일 렌더링
  useEffect(() => {
    let cancelled = false;
    if (!pdfBytes || pdfBytes.byteLength === 0) {
      setThumbnails({});
      return;
    }

    async function renderThumbs() {
      try {
        const pdfjs = await getPdfJs();
        const task = pdfjs.getDocument({ data: pdfBytes!.slice() });
        const doc = await task.promise;
        const map: Record<number, string> = {};

        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) break;
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 0.22, rotation: 0 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(vp.width));
          canvas.height = Math.max(1, Math.floor(vp.height));
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            map[i] = canvas.toDataURL("image/jpeg", 0.7);
          }
        }
        await doc.destroy();
        if (!cancelled) {
          setThumbnails(map);
        }
      } catch {
        // 썸네일 생성 실패 시 기본 번호로 표시
      }
    }

    void renderThumbs();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  if (!bundle) return null;

  const activeDoc =
    bundle.documents.find((d) => d.id === bundle.project.activeDocumentId) ??
    bundle.documents[bundle.documents.length - 1] ??
    null;

  const currentDocPages = bundle.pages.filter(
    (p) => !activeDoc || p.documentId === activeDoc.id
  );
  const selectedPagesCount = currentDocPages.filter(
    (p) => p.selectedForAnalysis
  ).length;
  const latestRun = bundle.runs[0] ?? null;

  const aiAvailable = envConfig.mode !== "demo";
  const extractionLabel = aiAvailable
    ? `선택 페이지(${selectedPagesCount}/${MAX_ANALYSIS_SELECTED_PAGES}) Gemini 분석`
    : "AI 추출 · 실제(live) 모드 전용";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadNewPdfDocument(file);
    } catch {
      // store.errorMessage로 안내됨
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRunExtraction = async (onlyPageIndices?: number[]) => {
    setRunningAi(true);
    try {
      await runSelectedPagesExtraction(getIdToken, onlyPageIndices);
    } finally {
      setRunningAi(false);
    }
  };

  // 접힌 상태: 썸네일만 보이는 얇은 페이지 레일
  if (compact) {
    return (
      <aside className="w-[84px] bg-white border-r border-slate-200 flex flex-col shrink-0 select-none">
        <div className="p-2 border-b border-slate-200 flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleCompact}
            className="w-full inline-flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            title="페이지 목록 펼치기 (문서 관리 · 페이지 분류)"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
            <span>펼치기</span>
          </button>
          <button
            type="button"
            disabled={runningAi || !activeDoc || !aiAvailable}
            onClick={() => void handleRunExtraction()}
            className="w-full inline-flex items-center justify-center gap-1 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-semibold cursor-pointer"
            title={extractionLabel}
          >
            {runningAi ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>추출 {selectedPagesCount}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
          {currentDocPages.map((pg) => {
            const isActive = pg.pageIndex === activePageIndex;
            const thumbUrl = thumbnails[pg.pageIndex];
            return (
              <button
                key={pg.id}
                type="button"
                onClick={() => setActivePageIndex(pg.pageIndex)}
                title={`P.${pg.pageIndex} · ${PAGE_CLASSIFICATION_LABELS[pg.classification]}${
                  pg.selectedForAnalysis ? " · 분석 대상" : ""
                }${pg.analysisError ? ` · 오류: ${pg.analysisError}` : ""}`}
                className={`relative w-full rounded-lg border p-1 transition cursor-pointer ${
                  isActive
                    ? "border-blue-600 ring-1 ring-blue-600 bg-blue-50/50"
                    : "border-slate-200 hover:border-slate-400 bg-white"
                }`}
              >
                <div className="h-14 bg-slate-100 rounded flex items-center justify-center overflow-hidden">
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl}
                      alt={`Page ${pg.pageIndex}`}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-400">미리보기</span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between px-0.5">
                  <span
                    className={`text-[11px] font-bold ${
                      isActive ? "text-blue-700" : "text-slate-700"
                    }`}
                  >
                    P.{pg.pageIndex}
                  </span>
                  <PageStatusDot page={pg} />
                </div>
                {pg.selectedForAnalysis && (
                  <span
                    className="absolute top-1.5 left-1.5 w-3 h-3 rounded-sm bg-blue-600 text-white flex items-center justify-center"
                    aria-label="분석 대상"
                  >
                    <CheckCircle2 className="w-2.5 h-2.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 select-none">
      {/* 상단: PDF 문서 정보 및 새 버전 업로드 */}
      <div className="p-3 border-b border-slate-200 space-y-2.5 bg-slate-50/70">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onToggleCompact}
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-xs font-bold text-slate-800 hover:bg-slate-200/70 cursor-pointer"
            title="페이지 목록 접기"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
            <span>도면 페이지</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-[11px] font-semibold cursor-pointer"
            title="20MB · 30페이지 이하 PDF"
          >
            <Upload className="w-3 h-3" />
            <span>{uploading ? "검증 중..." : "새 PDF"}</span>
          </button>
        </div>

        {activeDoc ? (
          <div
            className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-[11px] flex items-center justify-between gap-2"
            title={`SHA256: ${activeDoc.documentHash}`}
          >
            <span
              className="truncate font-semibold text-slate-800"
              title={activeDoc.originalFileName}
            >
              {activeDoc.originalFileName}
            </span>
            <span className="shrink-0 text-slate-500">
              {activeDoc.pageCount}p ·{" "}
              <span className="text-blue-700 font-semibold">v{activeDoc.version}</span>
            </span>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            업로드된 PDF가 없습니다. PDF를 업로드하세요.
          </div>
        )}

        {/* 선택 페이지 AI 추출 실행 버튼 */}
        <div className="space-y-1">
          <button
            type="button"
            disabled={runningAi || !activeDoc || !aiAvailable}
            onClick={() => void handleRunExtraction()}
            className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
            title={
              aiAvailable
                ? undefined
                : "로컬(데모) 모드에서는 외부 AI를 호출하지 않습니다. 수동 측정과 직접 입력은 그대로 사용할 수 있습니다."
            }
          >
            {runningAi ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>페이지별 추출 진행 중...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>{extractionLabel}</span>
              </>
            )}
          </button>

          {latestRun && (
            <div className="px-1 text-[11px] text-slate-500 flex items-center justify-between">
              <span>
                최근 작업: <strong>{RUN_STATUS_LABELS[latestRun.status]}</strong>
              </span>
              <span>
                {latestRun.totalTokensUsed !== null
                  ? `${latestRun.totalTokensUsed} tok`
                  : latestRun.modelId}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 페이지 썸네일 및 분류·상태 목록 */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        <p className="px-1 text-[10px] text-slate-400">
          체크한 페이지만 AI 추출 대상이 됩니다.
        </p>
        {currentDocPages.map((pg) => {
          const isActive = pg.pageIndex === activePageIndex;
          const thumbUrl = thumbnails[pg.pageIndex];

          return (
            <div
              key={pg.id}
              onClick={() => setActivePageIndex(pg.pageIndex)}
              className={`p-2 rounded-xl border transition cursor-pointer flex gap-2.5 ${
                isActive
                  ? "border-blue-600 bg-blue-50/40 ring-1 ring-blue-600"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              {/* 썸네일 미리보기 */}
              <div className="w-20 h-16 shrink-0 bg-slate-100 rounded-md border border-slate-200 overflow-hidden flex items-center justify-center">
                {thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbUrl}
                    alt={`Page ${pg.pageIndex}`}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] text-slate-400">P.{pg.pageIndex}</span>
                )}
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-between gap-1">
                <div className="flex items-center justify-between text-xs">
                  <label
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 font-bold text-slate-800 cursor-pointer"
                    title="AI 추출 대상으로 선택"
                  >
                    <input
                      type="checkbox"
                      checked={pg.selectedForAnalysis}
                      onChange={() => void togglePageForAnalysis(pg.pageIndex)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>P.{pg.pageIndex}</span>
                  </label>

                  {pg.analysisStatus === "failed" ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRunExtraction([pg.pageIndex]);
                      }}
                      className="inline-flex items-center gap-1 text-[10px] text-red-700 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded border border-red-200 cursor-pointer"
                      title={pg.analysisError || "실패 페이지 재시도"}
                    >
                      <RefreshCw className="w-3 h-3" />
                      재시도
                    </button>
                  ) : (
                    <PageStatusDot page={pg} />
                  )}
                </div>

                {/* 페이지 종류 분류 (사용자 수정 시 재분석이 덮어쓰지 않음) */}
                {isActive ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <select
                      value={pg.classification}
                      onChange={(e) =>
                        void updatePageClassification(
                          pg.pageIndex,
                          e.target.value as PageClassification
                        )
                      }
                      className="w-full px-1.5 py-0.5 text-[11px] border border-slate-300 rounded bg-white font-medium text-slate-800"
                      title={
                        pg.classificationModifiedByUser
                          ? "사용자가 직접 수정한 분류 (재분석 시 보존됨)"
                          : "페이지 종류"
                      }
                    >
                      {Object.entries(PAGE_CLASSIFICATION_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                          {pg.classificationModifiedByUser &&
                          k === pg.classification
                            ? " (수동)"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-500 truncate">
                    {PAGE_CLASSIFICATION_LABELS[pg.classification]}
                    {pg.classificationModifiedByUser && " · 수동"}
                  </span>
                )}

                {pg.analysisError && (
                  <div
                    className="text-[10px] text-red-700 flex items-center gap-1 truncate"
                    title={pg.analysisError}
                  >
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span className="truncate">{pg.analysisError}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
