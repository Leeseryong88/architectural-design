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
  Maximize,
  PanelRightOpen,
  Table2,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { ProjectBasicInfoTab } from "@/components/workspace/project-basic-info-tab";
import { LeftPageSidebar } from "@/components/workspace/left-page-sidebar";
import { CenterCanvasEditor } from "@/components/workspace/center-canvas-editor";
import { RightCandidatePanel } from "@/components/workspace/right-candidate-panel";
import {
  BottomAggregationDrawer,
  type DrawerHeightMode,
} from "@/components/workspace/bottom-aggregation-drawer";
import { ExportAndSnapshotTab } from "@/components/workspace/export-and-snapshot-tab";

type LayoutPreset = "drawing" | "review" | "table";

interface StudioLayout {
  leftCompact: boolean;
  showRightPanel: boolean;
  drawerHeightMode: DrawerHeightMode;
}

const LAYOUT_PRESETS: Record<LayoutPreset, StudioLayout> = {
  drawing: { leftCompact: true, showRightPanel: false, drawerHeightMode: "collapsed" },
  review: { leftCompact: true, showRightPanel: true, drawerHeightMode: "collapsed" },
  table: { leftCompact: true, showRightPanel: false, drawerHeightMode: "expanded" },
};

const LAYOUT_STORAGE_KEY = "myeonjeok:studio-layout";

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
  const [layout, setLayout] = useState<StudioLayout>(LAYOUT_PRESETS.review);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved) {
        setLayout({ ...LAYOUT_PRESETS.review, ...JSON.parse(saved) });
      }
    } catch {
      // 저장된 레이아웃이 손상된 경우 기본값 사용
    }
  }, []);

  const updateLayout = (patch: Partial<StudioLayout>) => {
    setLayout((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 저장 공간 접근 불가 시 무시
      }
      return next;
    });
  };

  const activePreset: LayoutPreset =
    layout.drawerHeightMode === "expanded"
      ? "table"
      : layout.showRightPanel
      ? "review"
      : "drawing";

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

  const pendingTotal =
    (aggregation?.unconfirmedCandidateCount ?? 0) +
    (aggregation?.unconfirmedZoneCount ?? 0);

  const presetButtons: {
    key: LayoutPreset;
    label: string;
    title: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "drawing",
      label: "도면 집중",
      title: "도면만 크게 보기 (패널 최소화)",
      icon: <Maximize className="w-3.5 h-3.5" />,
    },
    {
      key: "review",
      label: "검토",
      title: "도면 + 우측 검토 패널",
      icon: <PanelRightOpen className="w-3.5 h-3.5" />,
    },
    {
      key: "table",
      label: "집계표",
      title: "하단 구역·집계표를 크게 펼치기",
      icon: <Table2 className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* 상단 프로젝트 워크스페이스 네비게이션 바 */}
      <div className="bg-white border-b border-slate-200 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>목록</span>
          </button>

          <h1 className="text-sm font-bold text-slate-900 truncate">
            {bundle.project.name}
          </h1>
        </div>

        {/* 중앙: 3개 메인 화면 전환 탭 */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setMainTab("basic")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              mainTab === "basic"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>1. 기본정보·법규</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab("studio")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              mainTab === "studio"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileSearch className="w-3.5 h-3.5" />
            <span>2. 도면 검토</span>
            {pendingTotal > 0 && (
              <span
                className="px-1.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold"
                title={`미검토 ${pendingTotal}건`}
              >
                {pendingTotal}
              </span>
            )}
            {validationIssues.length > 0 && (
              <span
                className="px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold"
                title={`불일치·오류 ${validationIssues.length}건`}
              >
                {validationIssues.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMainTab("export")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              mainTab === "export"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileOutput className="w-3.5 h-3.5" />
            <span>3. 출력·확정본 ({bundle.snapshots.length})</span>
          </button>
        </div>

        {/* 우측: 작업실 보기 모드 프리셋 (도면 집중 / 검토 / 집계표) */}
        {mainTab === "studio" && (
          <div className="hidden lg:flex items-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold text-slate-400">보기</span>
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
              {presetButtons.map((btn) => (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => updateLayout(LAYOUT_PRESETS[btn.key])}
                  title={btn.title}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                    activePreset === btn.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {btn.icon}
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 상단 오류/안내 토스트 배너 */}
      {errorMessage && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-800 flex items-center justify-between shrink-0">
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
            <LeftPageSidebar
              compact={layout.leftCompact}
              onToggleCompact={() =>
                updateLayout({ leftCompact: !layout.leftCompact })
              }
            />
            <CenterCanvasEditor
              showRightPanel={layout.showRightPanel}
              onOpenRightPanel={() => updateLayout({ showRightPanel: true })}
            />
            {layout.showRightPanel && (
              <RightCandidatePanel
                onClose={() => updateLayout({ showRightPanel: false })}
              />
            )}
          </div>
          <BottomAggregationDrawer
            heightMode={layout.drawerHeightMode}
            onChangeHeightMode={(mode) =>
              updateLayout({ drawerHeightMode: mode })
            }
          />
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
