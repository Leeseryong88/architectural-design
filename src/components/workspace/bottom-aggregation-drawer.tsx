"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Layers,
  Building2,
  ShieldAlert,
  ListChecks,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  Check,
  Filter,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { formatAreaSqm, roundToDecimals } from "@/lib/geometry/planar";
import {
  AREA_BASIS_LABELS,
  REVIEW_STATUS_LABELS,
  ROW_TYPE_LABELS,
  type AreaBasisType,
  type ReviewStatus,
  type RowType,
} from "@/types/domain";

export type DrawerHeightMode = "collapsed" | "normal" | "expanded";

export function BottomAggregationDrawer({
  heightMode = "normal",
  onChangeHeightMode,
}: {
  heightMode?: DrawerHeightMode;
  onChangeHeightMode?: (mode: DrawerHeightMode) => void;
}) {
  const bundle = useWorkspaceStore((s) => s.bundle);
  const aggregation = useWorkspaceStore((s) => s.aggregation);
  const validationIssues = useWorkspaceStore((s) => s.validationIssues);
  const selectedZoneId = useWorkspaceStore((s) => s.selectedZoneId);
  const setSelectedZoneId = useWorkspaceStore((s) => s.setSelectedZoneId);
  const setActivePageIndex = useWorkspaceStore((s) => s.setActivePageIndex);
  const createManualOrStatedZone = useWorkspaceStore(
    (s) => s.createManualOrStatedZone
  );
  const updateZoneMetaAndInclusion = useWorkspaceStore(
    (s) => s.updateZoneMetaAndInclusion
  );
  const removeDeductionFromZone = useWorkspaceStore(
    (s) => s.removeDeductionFromZone
  );
  const deleteZone = useWorkspaceStore((s) => s.deleteZone);

  const [activeSubTab, setActiveSubTab] = useState<
    "zones" | "floors_usages" | "buildings" | "issues"
  >("zones");
  const [floorFilter, setFloorFilter] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneFloorId, setNewZoneFloorId] = useState("");
  const [newZoneUsage, setNewZoneUsage] = useState("제1종근린생활시설");
  const [newZoneBasis, setNewZoneBasis] = useState<AreaBasisType>("manual");
  const [newZoneArea, setNewZoneArea] = useState("");

  if (!bundle || !aggregation) return null;

  const blockingCount = validationIssues.filter(
    (i) => i.blockingSnapshot
  ).length;

  const filteredZones = bundle.zones.filter((z) =>
    floorFilter === "all" ? true : z.floorId === floorFilter
  );

  const handleAddManualZone = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(newZoneArea);
    if (!newZoneName.trim() || Number.isNaN(val) || val < 0) return;

    await createManualOrStatedZone({
      name: newZoneName.trim(),
      floorId: newZoneFloorId || (bundle.floors[0]?.id ?? ""),
      usage: newZoneUsage.trim() || "근린생활시설",
      basisType: newZoneBasis,
      areaValueSqm: val,
    });
    setNewZoneName("");
    setNewZoneArea("");
    setShowAddForm(false);
  };

  const heightClass =
    heightMode === "collapsed"
      ? "h-11"
      : heightMode === "expanded"
      ? "h-[58vh]"
      : "h-[34vh] min-h-[250px] max-h-[380px]";

  const handleSelectTab = (
    tab: "zones" | "floors_usages" | "buildings" | "issues"
  ) => {
    setActiveSubTab(tab);
    if (heightMode === "collapsed" && onChangeHeightMode) {
      onChangeHeightMode("normal");
    }
  };

  return (
    <div
      className={`${heightClass} bg-white border-t-2 border-slate-300 flex flex-col shrink-0 transition-all duration-200 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] z-20`}
    >
      {/* 상단 고정 컨트롤/탭 헤더 바 */}
      <div className="h-11 px-3 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0 select-none">
        <div className="flex items-center gap-1 text-xs overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => handleSelectTab("zones")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition shrink-0 cursor-pointer ${
              activeSubTab === "zones" && heightMode !== "collapsed"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>구역·산입/제외 관리 ({bundle.zones.length})</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab("floors_usages")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition shrink-0 cursor-pointer ${
              activeSubTab === "floors_usages" && heightMode !== "collapsed"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>층별·용도별 집계</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab("buildings")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition shrink-0 cursor-pointer ${
              activeSubTab === "buildings" && heightMode !== "collapsed"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>동별 집계·건폐율/용적률</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab("issues")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition shrink-0 cursor-pointer ${
              activeSubTab === "issues" && heightMode !== "collapsed"
                ? "bg-amber-500 text-slate-950 shadow-xs"
                : validationIssues.length > 0
                ? "bg-amber-500/20 text-amber-300 border border-amber-400/40 hover:bg-amber-500/30"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>
              불일치·오류 ({validationIssues.length}건 / 차단 {blockingCount}건)
            </span>
          </button>
        </div>

        {/* 우측: 실시간 집계 요약 & 패널 높이 조절 버튼 */}
        <div className="flex items-center gap-3 text-xs shrink-0">
          <div className="hidden md:flex items-center gap-3 bg-slate-800/90 px-3 py-1 rounded-lg border border-slate-700">
            <span>
              확정 연면적:{" "}
              <strong className="text-blue-300 font-mono">
                {formatAreaSqm(aggregation.totalGrossFloorAreaSqm)}
              </strong>
            </span>
            <span className="text-slate-600">|</span>
            <span>
              용적률 연면적:{" "}
              <strong className="text-cyan-300 font-mono">
                {formatAreaSqm(aggregation.totalFarGrossFloorAreaSqm)}
              </strong>
            </span>
            {aggregation.isReviewOnly ? (
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-400/30 text-[11px]">
                검토용 (미확정 포함)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-400/30 text-[11px]">
                확인 완료
              </span>
            )}
          </div>

          {/* 패널 크기 조절 버튼 그룹 */}
          {onChangeHeightMode && (
            <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700">
              <button
                type="button"
                onClick={() =>
                  onChangeHeightMode(
                    heightMode === "expanded" ? "normal" : "expanded"
                  )
                }
                className="px-2 py-1 rounded hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                title={
                  heightMode === "expanded"
                    ? "기본 크기로 복원"
                    : "집계표를 크게 펼치기"
                }
              >
                {heightMode === "expanded" ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-blue-400" />
                    <span className="hidden sm:inline">기본 크기</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
                    <span className="hidden sm:inline">크게 보기</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeHeightMode(
                    heightMode === "collapsed" ? "normal" : "collapsed"
                  )
                }
                className="p-1 rounded hover:bg-slate-700 text-slate-300 cursor-pointer"
                title={
                  heightMode === "collapsed"
                    ? "하단 집계 시트 펼치기"
                    : "하단 집계 시트 접기 (도면 크게 보기)"
                }
              >
                {heightMode === "collapsed" ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 접힘 상태면 본문 숨김 */}
      {heightMode !== "collapsed" && (
        <div className="flex-1 overflow-y-auto p-3 text-xs bg-slate-50/40">
          {/* 1. 구역 목록 및 산입·제외 관리 탭 */}
          {activeSubTab === "zones" && (
            <div className="space-y-2.5">
              {/* 층별 빠른 필터 칩 + 구역 추가 토글 바 */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 mr-1">
                    <Filter className="w-3 h-3" />
                    층별 보기:
                  </span>
                  <button
                    type="button"
                    onClick={() => setFloorFilter("all")}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                      floorFilter === "all"
                        ? "bg-slate-900 text-white"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    전체 ({bundle.zones.length})
                  </button>
                  {bundle.floors.map((f) => {
                    const count = bundle.zones.filter(
                      (z) => z.floorId === f.id
                    ).length;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFloorFilter(f.id)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                          floorFilter === f.id
                            ? "bg-blue-600 text-white"
                            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {f.label} ({count})
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showAddForm ? "추가 폼 닫기" : "구역 직접 추가"}</span>
                </button>
              </div>

              {/* 수동/기재 구역 빠른 추가 폼 (토글 시 상단에 바로 표시) */}
              {showAddForm && (
                <form
                  onSubmit={handleAddManualZone}
                  className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-wrap items-center gap-2"
                >
                  <span className="font-bold text-blue-900 text-[11px]">
                    신규 구역 등록:
                  </span>
                  <select
                    value={newZoneFloorId || (bundle.floors[0]?.id ?? "")}
                    onChange={(e) => setNewZoneFloorId(e.target.value)}
                    className="px-2 py-1 border border-slate-300 rounded-lg bg-white font-semibold"
                  >
                    {bundle.floors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    placeholder="구역명 (예: 1F 계단실)"
                    value={newZoneName}
                    onChange={(e) => setNewZoneName(e.target.value)}
                    className="px-2.5 py-1 border border-slate-300 rounded-lg bg-white w-36"
                  />
                  <input
                    type="text"
                    placeholder="용도"
                    value={newZoneUsage}
                    onChange={(e) => setNewZoneUsage(e.target.value)}
                    className="px-2.5 py-1 border border-slate-300 rounded-lg bg-white w-40"
                  />
                  <select
                    value={newZoneBasis}
                    onChange={(e) =>
                      setNewZoneBasis(e.target.value as AreaBasisType)
                    }
                    className="px-2 py-1 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="manual">사용자 직접 입력</option>
                    <option value="stated">문서 기재</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="면적(㎡)"
                    value={newZoneArea}
                    onChange={(e) => setNewZoneArea(e.target.value)}
                    className="px-2.5 py-1 border border-slate-300 rounded-lg bg-white w-24 font-mono"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    추가
                  </button>
                </form>
              )}

              {/* 구역 테이블 (공제 칩 깨짐 방지 및 원클릭 산정근거 전환 지원) */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-2xs">
                <table className="w-full border-collapse text-left min-w-[1100px]">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 text-[11px]">
                      <th className="py-2 px-2.5 w-16">층</th>
                      <th className="py-2 px-2.5 min-w-[150px]">구역명 · 공제내역</th>
                      <th className="py-2 px-2.5 min-w-[140px]">용도</th>
                      <th className="py-2 px-2 w-24">행 구분</th>
                      <th className="py-2 px-2.5 min-w-[230px]">
                        산정 근거 선택 (클릭 시 즉시 채택)
                      </th>
                      <th className="py-2 px-2.5 text-right w-28">
                        C. 채택기준(㎡)
                      </th>
                      <th className="py-2 px-2.5 text-right w-32">
                        바닥면적 반영(㎡)
                      </th>
                      <th className="py-2 px-2.5 text-right w-32">
                        용적률 반영(㎡)
                      </th>
                      <th className="py-2 px-2.5 min-w-[260px]">
                        제외·조정 사유 및 법령 메모
                      </th>
                      <th className="py-2 px-2.5 w-28">검토 상태</th>
                      <th className="py-2 px-2 text-center w-12">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredZones.map((z) => {
                      const isSelected = z.id === selectedZoneId;
                      const needsReason =
                        (z.isAdjustedOrExcluded ||
                          !z.includeInFloorArea ||
                          !z.includeInFarArea) &&
                        !z.exclusionOrAdjustmentReason.trim();

                      return (
                        <tr
                          key={z.id}
                          onClick={() => {
                            setSelectedZoneId(z.id);
                            if (z.sourcePageIndex) {
                              setActivePageIndex(z.sourcePageIndex);
                            }
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-blue-50/70"
                              : "hover:bg-slate-50/90"
                          }`}
                        >
                          {/* 층 선택 */}
                          <td className="py-2 px-2.5 align-top">
                            <select
                              value={z.floorId}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                void updateZoneMetaAndInclusion(z.id, {
                                  floorId: e.target.value,
                                })
                              }
                              className="px-1.5 py-1 border border-slate-300 rounded-md bg-white font-bold text-slate-800"
                            >
                              {bundle.floors.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* 구역명 + 깨지지 않는 공제 배지 */}
                          <td className="py-2 px-2.5 align-top">
                            <input
                              type="text"
                              value={z.name}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                void updateZoneMetaAndInclusion(z.id, {
                                  name: e.target.value,
                                })
                              }
                              className="w-full min-w-[130px] px-2 py-1 border border-slate-300 rounded-md font-semibold text-slate-900 bg-white"
                            />
                            {z.deductionPolygonsPt.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {z.deductionPolygonsPt.map((d) => (
                                  <span
                                    key={d.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-medium whitespace-nowrap"
                                  >
                                    <span>공제: {d.label}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void removeDeductionFromZone(
                                          z.id,
                                          d.id
                                        );
                                      }}
                                      className="text-rose-500 hover:text-rose-800 font-bold ml-0.5 cursor-pointer"
                                      title="공제 영역 삭제"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* 용도 */}
                          <td className="py-2 px-2.5 align-top">
                            <input
                              type="text"
                              value={z.usage}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                void updateZoneMetaAndInclusion(z.id, {
                                  usage: e.target.value,
                                })
                              }
                              className="w-full min-w-[130px] px-2 py-1 border border-slate-300 rounded-md bg-white"
                            />
                          </td>

                          {/* 행 구분 */}
                          <td className="py-2 px-2 align-top">
                            <select
                              value={z.rowType}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                void updateZoneMetaAndInclusion(z.id, {
                                  rowType: e.target.value as RowType,
                                })
                              }
                              className="px-1.5 py-1 border border-slate-300 rounded-md bg-white"
                            >
                              {Object.entries(ROW_TYPE_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* A. 문서기재 vs B. 기하측정 vs 직접입력 원클릭 비교·선택 셀 */}
                          <td
                            className="py-2 px-2.5 align-top"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-1.5">
                              {/* A. 문서기재 버튼/입력 */}
                              <div
                                onClick={() =>
                                  void updateZoneMetaAndInclusion(z.id, {
                                    basisType: "stated",
                                  })
                                }
                                className={`flex-1 p-1.5 rounded-lg border transition cursor-pointer ${
                                  z.basisType === "stated"
                                    ? "bg-blue-50 border-blue-500 ring-1 ring-blue-500"
                                    : "bg-slate-50 border-slate-200 hover:border-slate-300"
                                }`}
                                title="클릭하여 A. 문서 기재 면적을 기준 면적으로 채택"
                              >
                                <div className="text-[10px] text-slate-500 font-semibold flex items-center justify-between">
                                  <span>A. 문서기재</span>
                                  {z.basisType === "stated" && (
                                    <span className="text-blue-600 font-bold">
                                      채택됨
                                    </span>
                                  )}
                                </div>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="미기재"
                                  value={z.statedAreaSqm ?? ""}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const raw = e.target.value.trim();
                                    void updateZoneMetaAndInclusion(z.id, {
                                      statedAreaSqm:
                                        raw === "" ? null : Number(raw),
                                    });
                                  }}
                                  className="w-full mt-0.5 px-1 py-0.5 text-right font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded text-[11px]"
                                />
                              </div>

                              {/* B. 기하측정 원클릭 선택 카드 */}
                              <button
                                type="button"
                                onClick={() =>
                                  void updateZoneMetaAndInclusion(z.id, {
                                    basisType: "measured",
                                  })
                                }
                                className={`flex-1 p-1.5 rounded-lg border text-left transition cursor-pointer ${
                                  z.basisType === "measured"
                                    ? "bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500"
                                    : "bg-slate-50 border-slate-200 hover:border-slate-300"
                                }`}
                                title="클릭하여 B. 기하 측정 면적을 기준 면적으로 채택"
                              >
                                <div className="text-[10px] text-slate-500 font-semibold flex items-center justify-between">
                                  <span>B. 기하측정</span>
                                  {z.basisType === "measured" && (
                                    <span className="text-emerald-700 font-bold">
                                      채택됨
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 text-right font-mono font-bold text-emerald-700 text-xs">
                                  {z.measuredNetAreaSqm !== null
                                    ? `${roundToDecimals(z.measuredNetAreaSqm).toFixed(2)}`
                                    : "미측정"}
                                </div>
                              </button>

                              {/* 직접 입력 전환 버튼 */}
                              <button
                                type="button"
                                onClick={() =>
                                  void updateZoneMetaAndInclusion(z.id, {
                                    basisType: "manual",
                                  })
                                }
                                className={`px-2 py-2 rounded-lg border text-[10px] font-semibold transition cursor-pointer ${
                                  z.basisType === "manual"
                                    ? "bg-indigo-600 text-white border-indigo-600"
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                                }`}
                                title={AREA_BASIS_LABELS.manual}
                              >
                                직접
                              </button>
                            </div>
                          </td>

                          {/* C. 채택 기준 면적 */}
                          <td
                            className="py-2 px-2.5 text-right font-mono font-bold text-blue-700 align-top"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {z.basisType === "manual" ? (
                              <input
                                type="number"
                                step="0.01"
                                value={z.manualAreaSqm ?? ""}
                                onChange={(e) => {
                                  const raw = e.target.value.trim();
                                  void updateZoneMetaAndInclusion(z.id, {
                                    manualAreaSqm:
                                      raw === "" ? null : Number(raw),
                                  });
                                }}
                                className="w-20 px-1.5 py-1 text-right border border-blue-400 rounded-md bg-white"
                              />
                            ) : (
                              <div className="pt-1.5 text-xs">
                                {z.adoptedBaseAreaSqm !== null
                                  ? `${roundToDecimals(z.adoptedBaseAreaSqm).toFixed(2)}`
                                  : "미산출"}
                              </div>
                            )}
                          </td>

                          {/* 바닥면적 산입 여부 및 부분 조정 수치 */}
                          <td
                            className="py-2 px-2.5 text-right align-top"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="checkbox"
                                checked={z.includeInFloorArea}
                                onChange={(e) =>
                                  void updateZoneMetaAndInclusion(z.id, {
                                    includeInFloorArea: e.target.checked,
                                    isAdjustedOrExcluded:
                                      !e.target.checked || !z.includeInFarArea,
                                  })
                                }
                                className="rounded border-slate-300 text-blue-600 cursor-pointer"
                                title="바닥면적 산입 여부"
                              />
                              <input
                                type="number"
                                step="0.01"
                                disabled={!z.includeInFloorArea}
                                value={
                                  z.includedFloorAreaSqm !== null
                                    ? roundToDecimals(z.includedFloorAreaSqm)
                                    : ""
                                }
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  void updateZoneMetaAndInclusion(z.id, {
                                    includedFloorAreaSqm: Number.isNaN(val)
                                      ? 0
                                      : val,
                                    isAdjustedOrExcluded: true,
                                  });
                                }}
                                className="w-20 px-1.5 py-1 text-right font-mono border border-slate-300 rounded-md bg-white disabled:bg-slate-100 disabled:text-slate-400"
                              />
                            </div>
                          </td>

                          {/* 용적률 산입 여부 및 부분 조정 수치 */}
                          <td
                            className="py-2 px-2.5 text-right align-top"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="checkbox"
                                checked={z.includeInFarArea}
                                onChange={(e) =>
                                  void updateZoneMetaAndInclusion(z.id, {
                                    includeInFarArea: e.target.checked,
                                    isAdjustedOrExcluded:
                                      !e.target.checked ||
                                      !z.includeInFloorArea,
                                  })
                                }
                                className="rounded border-slate-300 text-blue-600 cursor-pointer"
                                title="용적률 산정용 연면적 산입 여부"
                              />
                              <input
                                type="number"
                                step="0.01"
                                disabled={!z.includeInFarArea}
                                value={
                                  z.includedFarAreaSqm !== null
                                    ? roundToDecimals(z.includedFarAreaSqm)
                                    : ""
                                }
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  void updateZoneMetaAndInclusion(z.id, {
                                    includedFarAreaSqm: Number.isNaN(val)
                                      ? 0
                                      : val,
                                    isAdjustedOrExcluded: true,
                                  });
                                }}
                                className="w-20 px-1.5 py-1 text-right font-mono border border-slate-300 rounded-md bg-white disabled:bg-slate-100 disabled:text-slate-400"
                              />
                            </div>
                          </td>

                          {/* 제외·조정 사유 및 법령 근거 */}
                          <td
                            className="py-2 px-2.5 align-top"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                placeholder="제외·조정 사유 입력 (필수)"
                                value={z.exclusionOrAdjustmentReason}
                                onChange={(e) =>
                                  void updateZoneMetaAndInclusion(z.id, {
                                    exclusionOrAdjustmentReason: e.target.value,
                                  })
                                }
                                className={`flex-1 min-w-[140px] px-2 py-1 border rounded-md ${
                                  needsReason
                                    ? "border-red-400 bg-red-50 placeholder:text-red-400"
                                    : "border-slate-300 bg-white"
                                }`}
                              />
                              <input
                                type="text"
                                placeholder="법령 조항/메모"
                                value={z.statuteLinkOrMemo}
                                onChange={(e) =>
                                  void updateZoneMetaAndInclusion(z.id, {
                                    statuteLinkOrMemo: e.target.value,
                                  })
                                }
                                className="w-32 px-2 py-1 border border-slate-300 rounded-md bg-white"
                              />
                            </div>
                          </td>

                          {/* 검토 상태 (원클릭 토글 + 선택) */}
                          <td
                            className="py-2 px-2.5 align-top"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={z.reviewStatus}
                              onChange={(e) =>
                                void updateZoneMetaAndInclusion(z.id, {
                                  reviewStatus: e.target.value as ReviewStatus,
                                })
                              }
                              className={`w-full px-2 py-1 rounded-md font-bold border cursor-pointer ${
                                z.reviewStatus === "confirmed"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                  : z.reviewStatus === "pending"
                                  ? "bg-amber-50 text-amber-800 border-amber-300"
                                  : "bg-slate-100 text-slate-700 border-slate-300"
                              }`}
                            >
                              {Object.entries(REVIEW_STATUS_LABELS).map(
                                ([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                )
                              )}
                            </select>
                          </td>

                          <td
                            className="py-2 px-2 text-center align-top"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => void deleteZone(z.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                              title="구역 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. 층별·용도별 집계 탭 */}
          {activeSubTab === "floors_usages" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-800 mb-2">
                  층별 집계 (상세 행만 합산 · 소계/총계는 비교값으로만 관리)
                </h4>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="py-1.5 px-2">층</th>
                      <th className="py-1.5 px-2 text-right">A. 도면기재(㎡)</th>
                      <th className="py-1.5 px-2 text-right">B. 기하측정(㎡)</th>
                      <th className="py-1.5 px-2 text-right">C. 확정바닥(㎡)</th>
                      <th className="py-1.5 px-2 text-right">용적률산입(㎡)</th>
                      <th className="py-1.5 px-2 text-right">기재대비 차이</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {aggregation.floors.map((f) => (
                      <tr key={f.floorId}>
                        <td className="py-1.5 px-2 font-bold">{f.floorLabel}</td>
                        <td className="py-1.5 px-2 text-right font-mono">
                          {f.statedFloorAreaSqm !== null
                            ? f.statedFloorAreaSqm.toFixed(2)
                            : "-"}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-emerald-700">
                          {f.measuredFloorAreaSqm.toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-blue-700">
                          {f.confirmedFloorAreaSqm.toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-indigo-700">
                          {f.confirmedFarAreaSqm.toFixed(2)}
                        </td>
                        <td
                          className={`py-1.5 px-2 text-right font-mono font-semibold ${
                            f.diffFromStatedSqm &&
                            Math.abs(f.diffFromStatedSqm) >
                              bundle.project.comparisonToleranceSqm
                              ? "text-red-600"
                              : "text-slate-600"
                          }`}
                        >
                          {f.diffFromStatedSqm !== null
                            ? `${f.diffFromStatedSqm > 0 ? "+" : ""}${f.diffFromStatedSqm.toFixed(2)} ㎡`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-800 mb-2">용도별 집계</h4>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="py-1.5 px-2">용도 명칭</th>
                      <th className="py-1.5 px-2 text-right">구역 수</th>
                      <th className="py-1.5 px-2 text-right">
                        바닥면적 합계(㎡)
                      </th>
                      <th className="py-1.5 px-2 text-right">
                        용적률 반영 합계(㎡)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {aggregation.usages.map((u) => (
                      <tr key={u.usage}>
                        <td className="py-1.5 px-2 font-semibold">{u.usage}</td>
                        <td className="py-1.5 px-2 text-right">{u.zoneCount}</td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold">
                          {u.floorAreaSqm.toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono">
                          {u.farAreaSqm.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. 동별 집계 및 건폐율/용적률 탭 */}
          {activeSubTab === "buildings" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-900">
                  동별 연면적 비교 ({bundle.building.name})
                </h4>
                {aggregation.buildings.map((b) => (
                  <div key={b.buildingId} className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-600">확정 집계 연면적:</span>
                      <strong className="font-mono text-blue-700">
                        {b.totalFloorAreaSqm.toFixed(2)} ㎡
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        도면 기재 연면적 (비교 기준):
                      </span>
                      <span className="font-mono">
                        {b.statedGrossFloorAreaSqm !== null
                          ? `${b.statedGrossFloorAreaSqm.toFixed(2)} ㎡`
                          : "미입력"}
                      </span>
                    </div>
                    {b.diffGrossFloorAreaSqm !== null && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">
                          기재 대비 연면적 차이:
                        </span>
                        <strong
                          className={`font-mono ${
                            Math.abs(b.diffGrossFloorAreaSqm) >
                            bundle.project.comparisonToleranceSqm
                              ? "text-red-600"
                              : "text-emerald-700"
                          }`}
                        >
                          {b.diffGrossFloorAreaSqm > 0 ? "+" : ""}
                          {b.diffGrossFloorAreaSqm.toFixed(2)} ㎡
                        </strong>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-slate-200">
                      <span className="text-slate-600">
                        확정 용적률 산정용 연면적:
                      </span>
                      <strong className="font-mono text-indigo-700">
                        {b.totalFarAreaSqm.toFixed(2)} ㎡
                      </strong>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-900">
                  건폐율 · 용적률 산출 (확정 대지면적 및 사용자 확인 건축면적 기준)
                </h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-600">확정 대지면적:</span>
                    <span className="font-mono font-semibold">
                      {formatAreaSqm(aggregation.siteAreaSqm)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">사용자 확인 건축면적:</span>
                    <span className="font-mono font-semibold">
                      {formatAreaSqm(aggregation.userConfirmedBuildingAreaSqm)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">산출 건폐율:</span>
                    {aggregation.calculatedBuildingCoverageRatio !== null ? (
                      <strong className="font-mono text-blue-700">
                        {aggregation.calculatedBuildingCoverageRatio.toFixed(2)} %
                        {bundle.project.statutoryCoverageLimit !== null &&
                          ` (입력 법정한도 ${bundle.project.statutoryCoverageLimit}%)`}
                      </strong>
                    ) : (
                      <span className="text-amber-700">
                        {aggregation.coverageRatioUnavailableReason}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">산출 용적률:</span>
                    {aggregation.calculatedFloorAreaRatio !== null ? (
                      <strong className="font-mono text-indigo-700">
                        {aggregation.calculatedFloorAreaRatio.toFixed(2)} %
                        {bundle.project.statutoryFarLimit !== null &&
                          ` (입력 법정한도 ${bundle.project.statutoryFarLimit}%)`}
                      </strong>
                    ) : (
                      <span className="text-amber-700">
                        {aggregation.farRatioUnavailableReason}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. 서비스 내 오류·불일치 검사 목록 탭 */}
          {activeSubTab === "issues" && (
            <div className="space-y-2">
              {validationIssues.length === 0 ? (
                <div className="p-6 bg-white rounded-xl border border-slate-200 text-center text-emerald-700 flex items-center justify-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    검출된 불일치·오류 항목이 없습니다. 출력 탭에서 불변 확정본을 생성할 수 있습니다.
                  </span>
                </div>
              ) : (
                validationIssues.map((iss) => (
                  <div
                    key={iss.id}
                    onClick={() => {
                      if (iss.pageIndex) {
                        setActivePageIndex(iss.pageIndex);
                      }
                      if (iss.targetType === "zone") {
                        setSelectedZoneId(iss.targetId);
                      }
                    }}
                    className={`p-3 rounded-xl border flex items-start justify-between gap-3 cursor-pointer transition ${
                      iss.severity === "error"
                        ? "bg-red-50/80 border-red-200 text-red-900 hover:bg-red-100/70"
                        : iss.severity === "warning"
                        ? "bg-amber-50/80 border-amber-200 text-amber-900 hover:bg-amber-100/70"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-bold flex items-center gap-2">
                          <span>{iss.title}</span>
                          {iss.blockingSnapshot && (
                            <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px]">
                              확정본 생성 차단
                            </span>
                          )}
                          {iss.pageIndex && (
                            <span className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-slate-700 font-mono text-[10px]">
                              P.{iss.pageIndex} 이동
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          {iss.message}
                        </p>
                        {iss.comparison && (
                          <div className="text-[11px] font-mono bg-white/90 px-2 py-1 rounded border border-slate-200 inline-block mt-1">
                            비교 대상: [{iss.comparison.referenceLabel}:{" "}
                            {iss.comparison.referenceValue.toFixed(2)}㎡] vs [
                            {iss.comparison.actualLabel}:{" "}
                            {iss.comparison.actualValue.toFixed(2)}㎡] → 실제 차이:{" "}
                            {iss.comparison.diffValue > 0 ? "+" : ""}
                            {iss.comparison.diffValue.toFixed(2)}㎡ (설정 허용오차:{" "}
                            ±{iss.comparison.toleranceValue}㎡)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
