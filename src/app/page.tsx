"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  FolderPlus,
  RotateCcw,
  Trash2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useAppAuth } from "@/components/providers/auth-provider";
import { getStorageRepository } from "@/lib/storage";
import type { ProjectSummaryCard } from "@/lib/storage/types";

export default function ProjectListPage() {
  const router = useRouter();
  const { ownerId, envConfig } = useAppAuth();

  const [cards, setCards] = useState<ProjectSummaryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchProjects = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setError(null);
    try {
      const repo = getStorageRepository();
      const list = await repo.listProjects(ownerId);
      setCards(list);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "프로젝트 목록을 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const repo = getStorageRepository();
      const created = await repo.createBlankProject(
        ownerId,
        newName.trim(),
        newLocation.trim()
      );
      setNewName("");
      setNewLocation("");
      router.push(`/projects/${created.project.id}`);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "프로젝트 생성 중 오류 발생"
      );
    } finally {
      setCreating(false);
    }
  };

  const handleLoadOrResetDemo = async () => {
    setLoading(true);
    try {
      const repo = getStorageRepository();
      const demo = await repo.loadOrResetDemoProject(ownerId);
      router.push(`/projects/${demo.project.id}`);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "예제 프로젝트 초기화 실패"
      );
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string, name: string) => {
    if (
      !window.confirm(
        `[${name}] 프로젝트와 연결된 도면·산정선·확정본 파일을 모두 삭제하시겠습니까?`
      )
    ) {
      return;
    }
    try {
      const repo = getStorageRepository();
      await repo.deleteProjectCompletely(ownerId, projectId);
      await fetchProjects();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? `삭제 중 일부 실패 (재시도 가능): ${err.message}`
          : "프로젝트 삭제 중 오류가 발생했습니다."
      );
      await fetchProjects();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl w-full mx-auto p-6 space-y-6">
        {/* 상단 소개 및 데모 시나리오 안내 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">
              인허가 면적 검토 프로젝트 목록
            </h1>
            {envConfig.mode === "demo" && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800 border border-amber-300">
                데모 시나리오 활성
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            건축개요·평면도·단면도·면적산출표 PDF를 업로드하여 기재 수치를 추출하고, 축척 보정 후 다각형 면적을 측정하여 불일치를 검사합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleLoadOrResetDemo()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold transition"
          >
            <RotateCcw className="w-4 h-4 text-amber-700" />
            <span>예제 프로젝트 불러오기 / 초기화 (가상 도면 6p)</span>
          </button>
        </div>
      </div>

      {/* 신규 프로젝트 생성 폼 */}
      <form
        onSubmit={handleCreateProject}
        className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
      >
        <div className="md:col-span-5">
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            새 프로젝트 이름 (단일 동 · 근린생활시설 신축 우선)
          </label>
          <input
            type="text"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="예: 역삼동 제1·2종 근린생활시설 신축공사"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="md:col-span-5">
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            대지 위치 (선택)
          </label>
          <input
            type="text"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            placeholder="예: 서울특별시 강남구 역삼동 000-00"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={creating}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition"
          >
            <FolderPlus className="w-4 h-4" />
            <span>프로젝트 생성</span>
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 프로젝트 카드 테이블 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            저장된 프로젝트 ({cards.length})
          </span>
          <span className="text-xs text-slate-500">
            새로고침 시에도 {envConfig.mode === "demo" ? "브라우저 IndexedDB" : "Cloud Firestore"}에서 복원됩니다
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            프로젝트 목록을 불러오는 중입니다...
          </div>
        ) : cards.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm text-slate-500">
              생성된 프로젝트가 없습니다. 상단에서 새 프로젝트를 생성하거나 예제 프로젝트를 불러오세요.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {cards.map(({ project, documentCount, unconfirmedCount, snapshotCount }) => (
              <div
                key={project.id}
                className="p-5 hover:bg-slate-50/80 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/projects/${project.id}`)}
                      className="text-base font-bold text-slate-900 hover:text-blue-600 text-left"
                    >
                      {project.name}
                    </button>
                    {project.isDemoProject && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                        <Sparkles className="w-3 h-3" />
                        데모 예제 자료
                      </span>
                    )}
                    {project.deletionStatus === "delete_failed" && (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
                        삭제 일부 실패 (재시도 가능)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    대지 위치: {project.siteLocation || "미입력"} · 대지면적:{" "}
                    {project.siteArea !== null
                      ? `${project.siteArea.toLocaleString("ko-KR")} ㎡`
                      : "미입력"}{" "}
                    · 최종 수정:{" "}
                    {new Date(project.updatedAt).toLocaleString("ko-KR")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-xs text-slate-700">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    <span>도면 {documentCount}건</span>
                  </div>

                  {unconfirmedCount > 0 ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-medium text-amber-800">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>검토 진행 중 (미확정 {unconfirmedCount}건)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>검토 완료 ({snapshotCount}개 확정본)</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => router.push(`/projects/${project.id}`)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
                  >
                    <span>작업실 열기</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void handleDeleteProject(project.id, project.name)
                    }
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                    title="프로젝트 삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
