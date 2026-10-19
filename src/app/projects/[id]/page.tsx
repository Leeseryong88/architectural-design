"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building,
  FileSearch,
  FileOutput,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { ProjectBasicInfoTab } from "@/components/workspace/project-basic-info-tab";
import { LeftPageSidebar } from "@/components/workspace/left-page-sidebar";
import { CenterCanvasEditor } from "@/components/workspace/center-canvas-editor";
import { RightCandidatePanel } from "@/components/workspace/right-candidate-panel";
import { BottomAggregationDrawer } from "@/components/workspace/bottom-aggregation-drawer";
import { ExportAndSnapshotTab } from "@/components/workspace/export-and-snapshot-tab";

export default function ProjectWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params?.id || "";

  const bundle = useWorkspaceStore((s) => s.bundle);
  const isLoading = useWorkspaceStore((s) => s.isLoading);
  const errorMessage = useWorkspaceStore((s) => s.errorMessage);
  const validationIssues = useWorkspaceStore((s) => s.validationIssues);
  const aggregation = useWorkspaceStore((s) => s.aggregation);
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);

  const [mainTab, setMainTab] = useState<"basic" | "studio" | "export">(
    "studio"
  );

  useEffect(() => {
    if (projectId) {
      void loadWorkspace(projectId);
    }
  }, [projectId, loadWorkspace]);

  if (isLoading && !bundle) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>프로젝트 도면 및 면적 데이터를 불러오는 중입니다...</span>
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="max-w-xl mx-auto p-12 text-center space-y-4">
        <p className="text-sm text-red-600">
          {errorMessage || "프로젝트를 찾을 수 없습니다."}
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
        >
          프로젝트 목록으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 상단 프로젝트 워크스페이스 네비게이션 바 */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>목록</span>
          </button>

          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-slate-900">
              {bundle.project.name}
            </h1>
            {bundle.project.isDemoProject && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-semibold">
                <Sparkles className="w-3 h-3" />
                데모 예제 프로젝트
              </span>
            )}
          </div>
        </div>

        {/* 3개 메인 화면 전환 탭: 6.2 기본정보 / 6.3 도면 검토 작업실 / 6.4 출력 및 확정본 */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setMainTab("basic")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold transition ${
              mainTab === "basic"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>1. 프로젝트 기본정보·법규</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab("studio")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold transition ${
              mainTab === "studio"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileSearch className="w-3.5 h-3.5" />
            <span>
              2. 도면 검토 작업실 (미검토 후보{" "}
              {aggregation?.unconfirmedCandidateCount ?? 0} · 오류{" "}
              {validationIssues.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab("export")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold transition ${
              mainTab === "export"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileOutput className="w-3.5 h-3.5" />
            <span>
              3. 출력 및 확정본 ({bundle.snapshots.length})
            </span>
          </button>
        </div>
      </div>

      {/* 상단 오류/안내 토스트 배너 */}
      {errorMessage && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => useWorkspaceStore.setState({ errorMessage: null })}
            className="text-red-700 font-bold px-2"
          >
            닫기
          </button>
        </div>
      )}

      {/* 메인 탭 컨텐츠 */}
      {mainTab === "basic" && (
        <div className="flex-1 overflow-y-auto">
          <ProjectBasicInfoTab />
        </div>
      )}

      {mainTab === "studio" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <LeftPageSidebar />
            <CenterCanvasEditor />
            <RightCandidatePanel />
          </div>
          <BottomAggregationDrawer />
        </div>
      )}

      {mainTab === "export" && (
        <div className="flex-1 overflow-y-auto">
          <ExportAndSnapshotTab />
        </div>
      )}
    </div>
  );
}
