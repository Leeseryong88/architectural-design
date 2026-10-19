"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  FileText,
  FileUp,
  Loader2,
  MapPin,
  PenTool,
  Plus,
  Ruler,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAppAuth } from "@/components/providers/auth-provider";
import { getStorageRepository } from "@/lib/storage";
import type { ProjectSummaryCard } from "@/lib/storage/types";
import { useWorkspaceStore } from "@/store/workspace-store";
import {
  MAX_PDF_PAGE_COUNT,
  validateAndInspectPdfFile,
} from "@/lib/pdf/pdf-engine";

const BLUEPRINT_GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, rgba(37,99,235,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(37,99,235,0.09) 1px, transparent 1px)",
  backgroundSize: "16px 16px",
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

function getProjectStatus(card: ProjectSummaryCard): {
  label: string;
  className: string;
} {
  if (card.project.deletionStatus === "delete_failed") {
    return { label: "삭제 일부 실패", className: "bg-red-100 text-red-700" };
  }
  if (card.documentCount === 0) {
    return { label: "도면 업로드 대기", className: "bg-white text-slate-600 border border-slate-200" };
  }
  if (card.unconfirmedCount > 0) {
    return {
      label: `검토 중 · 미확정 ${card.unconfirmedCount}`,
      className: "bg-amber-100 text-amber-800",
    };
  }
  if (card.snapshotCount > 0) {
    return {
      label: `확정본 ${card.snapshotCount}개`,
      className: "bg-emerald-100 text-emerald-800",
    };
  }
  return { label: "작업 중", className: "bg-blue-100 text-blue-700" };
}

const ONBOARDING_STEPS = [
  {
    icon: <Plus className="w-4 h-4" />,
    title: "프로젝트 만들기",
    desc: "이름과 대지 위치만 입력",
  },
  {
    icon: <FileUp className="w-4 h-4" />,
    title: "도면 PDF 올리기",
    desc: "건축개요·평면도·면적표",
  },
  {
    icon: <Ruler className="w-4 h-4" />,
    title: "축척 보정 · 면적 산정",
    desc: "구역을 그리고 집계 확인",
  },
];

function CreateProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const { ownerId } = useAppAuth();
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);
  const uploadNewPdfDocument = useWorkspaceStore((s) => s.uploadNewPdfDocument);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfInfo, setPdfInfo] = useState<{ pageCount: number } | null>(null);
  const [checkingPdf, setCheckingPdf] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setLocation("");
    setPdfFile(null);
    setPdfInfo(null);
    setError(null);
    setSubmitStage("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handlePickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setCheckingPdf(true);
    try {
      const inspected = await validateAndInspectPdfFile(file);
      setPdfFile(file);
      setPdfInfo({ pageCount: inspected.pageCount });
      if (!name.trim()) {
        setName(file.name.replace(/\.pdf$/i, ""));
      }
    } catch (err: unknown) {
      setPdfFile(null);
      setPdfInfo(null);
      setError(err instanceof Error ? err.message : "PDF 파일을 확인할 수 없습니다.");
    } finally {
      setCheckingPdf(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      setSubmitStage("프로젝트 생성 중...");
      const created = await getStorageRepository().createBlankProject(
        ownerId,
        name.trim(),
        location.trim()
      );
      if (pdfFile) {
        setSubmitStage("도면 PDF 등록 중...");
        try {
          await loadWorkspace(created.project.id);
          await uploadNewPdfDocument(pdfFile);
        } catch (uploadErr: unknown) {
          window.alert(
            `프로젝트는 생성되었지만 도면 등록에 실패했습니다. 작업실에서 다시 업로드하세요.\n${
              uploadErr instanceof Error ? uploadErr.message : ""
            }`
          );
        }
      }
      onCreated(created.project.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "프로젝트 생성 중 오류가 발생했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 pt-5 pb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">새 프로젝트</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              도면은 지금 올려도 되고, 작업실에서 나중에 올려도 됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-5 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              프로젝트 이름 <span className="text-blue-600">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 역삼동 근린생활시설 신축공사"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              대지 위치 <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="예: 서울특별시 강남구 역삼동 000-00"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              도면 PDF <span className="font-normal text-slate-400">(선택 · 20MB · {MAX_PDF_PAGE_COUNT}페이지 이하)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                void handlePickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {pdfFile && pdfInfo ? (
              <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-blue-200 bg-blue-50/60">
                <div className="w-9 h-9 rounded-lg bg-white border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {pdfFile.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {pdfInfo.pageCount}페이지 · {(pdfFile.size / 1024 / 1024).toFixed(1)}MB
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPdfFile(null);
                    setPdfInfo(null);
                  }}
                  disabled={submitting}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white cursor-pointer"
                  aria-label="선택한 PDF 제거"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void handlePickFile(e.dataTransfer.files?.[0]);
                }}
                disabled={checkingPdf}
                className={`w-full flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed transition cursor-pointer ${
                  dragOver
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {checkingPdf ? (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                ) : (
                  <FileUp className="w-5 h-5 text-slate-400" />
                )}
                <span className="text-xs font-semibold text-slate-600">
                  {checkingPdf ? "PDF 확인 중..." : "PDF를 끌어다 놓거나 클릭해서 선택"}
                </span>
              </button>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-200/60 cursor-pointer"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!name.trim() || submitting || checkingPdf}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-sm shadow-blue-600/20 transition cursor-pointer"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{submitting ? submitStage : "만들고 작업 시작"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

function ProjectCard({
  card,
  onOpen,
  onDelete,
}: {
  card: ProjectSummaryCard;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { project, documentCount, unconfirmedCount, snapshotCount } = card;
  const status = getProjectStatus(card);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className="group relative flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden text-left cursor-pointer transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5 hover:border-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {/* 도면 느낌의 상단 썸네일 영역 */}
      <div
        className="relative h-28 bg-gradient-to-br from-blue-50 to-slate-50 border-b border-slate-100 flex items-center justify-center"
        style={BLUEPRINT_GRID_STYLE}
      >
        <div className="w-12 h-12 rounded-xl bg-white border border-blue-100 shadow-sm flex items-center justify-center text-blue-600 group-hover:scale-105 transition">
          <Building2 className="w-6 h-6" />
        </div>
        <span
          className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.className}`}
        >
          {status.label}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-white/90 border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 opacity-0 group-hover:opacity-100 focus:opacity-100 transition cursor-pointer"
          title="프로젝트 삭제"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col p-4 gap-3">
        <div className="space-y-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-blue-700 transition">
            {project.name}
          </h3>
          <p className="flex items-center gap-1 text-xs text-slate-500 truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{project.siteLocation || "대지 위치 미입력"}</span>
          </p>
        </div>

        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1" title="도면 문서 수">
              <FileText className="w-3 h-3" />
              {documentCount}
            </span>
            <span className="inline-flex items-center gap-1" title="미확정 항목 수">
              <PenTool className="w-3 h-3" />
              {unconfirmedCount}
            </span>
            {snapshotCount > 0 && (
              <span className="text-emerald-700 font-semibold">확정본 {snapshotCount}</span>
            )}
          </div>
          <span title={new Date(project.updatedAt).toLocaleString("ko-KR")}>
            {formatRelativeTime(project.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ProjectListPage() {
  const router = useRouter();
  const { ownerId, envConfig } = useAppAuth();

  const [cards, setCards] = useState<ProjectSummaryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");

  const fetchProjects = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getStorageRepository().listProjects(ownerId);
      setCards(list);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "프로젝트 목록을 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.project.name.toLowerCase().includes(q) ||
        c.project.siteLocation.toLowerCase().includes(q)
    );
  }, [cards, query]);

  const handleDeleteProject = async (projectId: string, name: string) => {
    if (
      !window.confirm(
        `[${name}] 프로젝트와 연결된 도면·산정선·확정본 파일을 모두 삭제하시겠습니까?`
      )
    ) {
      return;
    }
    try {
      await getStorageRepository().deleteProjectCompletely(ownerId, projectId);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? `삭제 중 일부 실패 (재시도 가능): ${err.message}`
          : "프로젝트 삭제 중 오류가 발생했습니다."
      );
    }
    await fetchProjects();
  };

  const storageLabel =
    envConfig.mode === "demo" ? "이 브라우저(IndexedDB)" : "Cloud Firestore";

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-6xl w-full mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="p-1 rounded text-red-500 hover:bg-red-100 cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pt-14">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-52 rounded-2xl bg-white border border-slate-200 animate-pulse"
              />
            ))}
          </div>
        ) : cards.length === 0 ? (
          /* 첫 화면: 빈 상태 + 큰 플러스 버튼 */
          <div className="min-h-[70vh] flex flex-col items-center justify-center text-center">
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="group relative w-28 h-28 rounded-3xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center transition hover:border-blue-500 hover:bg-blue-50/50 hover:shadow-xl hover:shadow-blue-600/10 cursor-pointer"
              style={BLUEPRINT_GRID_STYLE}
              aria-label="새 프로젝트 만들기"
            >
              <span className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 transition group-hover:scale-110">
                <Plus className="w-7 h-7" />
              </span>
            </button>

            <h1 className="mt-6 text-xl font-bold text-slate-900">
              첫 프로젝트를 만들어 보세요
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              도면 PDF를 올리고 축척을 보정한 뒤, 구역을 그려 면적을 산정합니다.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-stretch gap-2 sm:gap-0">
              {ONBOARDING_STEPS.map((step, idx) => (
                <React.Fragment key={step.title}>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 text-left min-w-[190px]">
                    <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      {step.icon}
                    </span>
                    <span>
                      <span className="block text-xs font-bold text-slate-800">
                        {idx + 1}. {step.title}
                      </span>
                      <span className="block text-[11px] text-slate-500">{step.desc}</span>
                    </span>
                  </div>
                  {idx < ONBOARDING_STEPS.length - 1 && (
                    <div className="hidden sm:flex items-center px-2 text-slate-300">→</div>
                  )}
                </React.Fragment>
              ))}
            </div>

            <p className="mt-8 text-[11px] text-slate-400">
              프로젝트는 {storageLabel}에 저장되며 새로고침해도 유지됩니다.
            </p>
          </div>
        ) : (
          <>
            {/* 상단 헤더: 제목 · 검색 · 새 프로젝트 */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  프로젝트{" "}
                  <span className="text-slate-400 font-semibold">{cards.length}</span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {storageLabel}에 저장됩니다
                </p>
              </div>
              <div className="flex items-center gap-2">
                {cards.length > 3 && (
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="이름·대지 위치 검색"
                      className="pl-9 pr-3 py-2 w-56 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm shadow-blue-600/20 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  새 프로젝트
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* 새 프로젝트 플러스 타일 */}
              {!query && (
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="group min-h-[208px] rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 flex flex-col items-center justify-center gap-3 text-slate-500 transition hover:border-blue-500 hover:bg-blue-50/40 hover:text-blue-700 cursor-pointer"
                >
                  <span className="w-12 h-12 rounded-2xl bg-slate-100 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center transition">
                    <Plus className="w-6 h-6" />
                  </span>
                  <span className="text-sm font-semibold">새 프로젝트</span>
                </button>
              )}

              {filteredCards.map((card) => (
                <ProjectCard
                  key={card.project.id}
                  card={card}
                  onOpen={() => router.push(`/projects/${card.project.id}`)}
                  onDelete={() =>
                    void handleDeleteProject(card.project.id, card.project.name)
                  }
                />
              ))}
            </div>

            {query && filteredCards.length === 0 && (
              <p className="py-12 text-center text-sm text-slate-400">
                &lsquo;{query}&rsquo;에 해당하는 프로젝트가 없습니다.
              </p>
            )}
          </>
        )}
      </div>

      <CreateProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(projectId) => router.push(`/projects/${projectId}`)}
      />
    </div>
  );
}
