"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useAppAuth } from "@/components/providers/auth-provider";
import { getPdfJs, MAX_ANALYSIS_SELECTED_PAGES } from "@/lib/pdf/pdf-engine";
import {
  PAGE_CLASSIFICATION_LABELS,
  RUN_STATUS_LABELS,
  type PageClassification,
} from "@/types/domain";

export function LeftPageSidebar() {
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

  return (
    <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 select-none">
      {/* 상단: PDF 문서 정보 및 새 버전 업로드 */}
      <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-slate-50/70">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">
            도면 문서 관리 (20MB·30p 이하)
          </span>
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
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[11px] font-semibold"
          >
            <Upload className="w-3 h-3" />
            <span>{uploading ? "검증 중..." : "새 PDF 업로드"}</span>
          </button>
        </div>

        {activeDoc ? (
          <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] space-y-1">
            <div className="flex items-center justify-between font-semibold text-slate-800">
              <span className="truncate max-w-[165px]" title={activeDoc.originalFileName}>
                {activeDoc.originalFileName}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                v{activeDoc.version}
              </span>
            </div>
            <div className="text-slate-500 flex items-center justify-between">
              <span>총 {activeDoc.pageCount}페이지</span>
              <span>{(activeDoc.fileSize / 1024).toFixed(0)} KB</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono truncate">
              SHA256: {activeDoc.documentHash.slice(0, 18)}...
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            업로드된 PDF가 없습니다. PDF를 업로드하세요.
          </div>
        )}

        {/* 선택 페이지 AI 추출 실행 버튼 */}
        <div className="space-y-1.5">
          <button
            type="button"
            disabled={runningAi || !activeDoc}
            onClick={() => void handleRunExtraction()}
            className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition"
          >
            {runningAi ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>페이지별 추출 진행 중...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {envConfig.mode === "demo"
                    ? `선택 페이지(${selectedPagesCount}/${MAX_ANALYSIS_SELECTED_PAGES}) 예제 추출 불러오기`
                    : `선택 페이지(${selectedPagesCount}/${MAX_ANALYSIS_SELECTED_PAGES}) Gemini 분석`}
                </span>
              </>
            )}
          </button>

          {latestRun && (
            <div className="px-2 py-1 rounded bg-slate-100 text-[11px] text-slate-600 flex items-center justify-between">
              <span>
                최근 작업: <strong>{RUN_STATUS_LABELS[latestRun.status]}</strong>
              </span>
              {latestRun.isDemoFixtureRun ? (
                <span className="text-amber-700 font-semibold">예제 추출 결과</span>
              ) : (
                <span>
                  {latestRun.totalTokensUsed !== null
                    ? `${latestRun.totalTokensUsed} tok`
                    : latestRun.modelId}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 페이지 썸네일 및 분류·상태 목록 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {currentDocPages.map((pg) => {
          const isActive = pg.pageIndex === activePageIndex;
          const thumbUrl = thumbnails[pg.pageIndex];

          return (
            <div
              key={pg.id}
              onClick={() => setActivePageIndex(pg.pageIndex)}
              className={`p-2.5 rounded-xl border transition cursor-pointer space-y-2 ${
                isActive
                  ? "border-blue-600 bg-blue-50/40 ring-1 ring-blue-600"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <label
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 font-bold text-slate-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={pg.selectedForAnalysis}
                    onChange={() => void togglePageForAnalysis(pg.pageIndex)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>P.{pg.pageIndex}</span>
                </label>

                <div className="flex items-center gap-1">
                  {pg.analysisStatus === "completed" && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" />
                      완료
                    </span>
                  )}
                  {pg.analysisStatus === "running" && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      분석 중
                    </span>
                  )}
                  {pg.analysisStatus === "failed" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRunExtraction([pg.pageIndex]);
                      }}
                      className="inline-flex items-center gap-1 text-[10px] text-red-700 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded border border-red-200"
                      title={pg.analysisError || "실패 페이지 재시도"}
                    >
                      <RefreshCw className="w-3 h-3" />
                      실패·재시도
                    </button>
                  )}
                </div>
              </div>

              {/* 썸네일 미리보기 */}
              <div className="w-full h-28 bg-slate-100 rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center">
                {thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbUrl}
                    alt={`Page ${pg.pageIndex}`}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-400">
                    페이지 {pg.pageIndex} 미리보기
                  </span>
                )}
              </div>

              {/* 페이지 종류 분류 드롭다운 (사용자 수정 시 재분석이 덮어쓰지 않음) */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-between gap-1.5"
              >
                <select
                  value={pg.classification}
                  onChange={(e) =>
                    void updatePageClassification(
                      pg.pageIndex,
                      e.target.value as PageClassification
                    )
                  }
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white font-medium text-slate-800"
                >
                  {Object.entries(PAGE_CLASSIFICATION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                {pg.classificationModifiedByUser && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 shrink-0"
                    title="사용자가 직접 수정한 분류 (재분석 시 보존됨)"
                  >
                    수동고정
                  </span>
                )}
              </div>

              {pg.analysisError && (
                <div className="p-1.5 rounded bg-red-50 border border-red-200 text-[10px] text-red-700 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{pg.analysisError}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
