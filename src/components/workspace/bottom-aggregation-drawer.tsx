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

export function BottomAggregationDrawer() {
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

  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneFloorId, setNewZoneFloorId] = useState("");
  const [newZoneUsage, setNewZoneUsage] = useState("제1종근린생활시설");
  const [newZoneBasis, setNewZoneBasis] = useState<AreaBasisType>("manual");
  const [newZoneArea, setNewZoneArea] = useState("");

  if (!bundle || !aggregation) return null;

  const blockingCount = validationIssues.filter(
    (i) => i.blockingSnapshot
  ).length;

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
  };

  return (
    <div className="h-72 bg-white border-t border-slate-200 flex flex-col shrink-0">
      {/* 하단 탭 바 */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab("zones")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition ${
              activeSubTab === "zones"
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-200"
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>구역 목록·산입/제외 관리 ({bundle.zones.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("floors_usages")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition ${
              activeSubTab === "floors_usages"
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>층별·용도별 집계</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("buildings")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition ${
              activeSubTab === "buildings"
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-200"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>동별 집계·건폐율/용적률</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("issues")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition ${
              activeSubTab === "issues"
                ? "bg-slate-900 text-white"
                : validationIssues.length > 0
                ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                : "text-slate-700 hover:bg-slate-200"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>
              불일치·오류 목록 ({validationIssues.length}건 / 확정차단{" "}
              {blockingCount}건)
            </span>
          </button>
        </div>

        {/* 실시간 요약 지표 */}
        <div className="flex items-center gap-4 text-xs">
          <span>
            확정 집계 연면적:{" "}
            <strong className="text-blue-700">
              {formatAreaSqm(aggregation.totalGrossFloorAreaSqm)}
            </strong>
          </span>
          <span>
            용적률산정 연면적:{" "}
            <strong className="text-indigo-700">
              {formatAreaSqm(aggregation.totalFarGrossFloorAreaSqm)}
            </strong>
          </span>
          {aggregation.isReviewOnly ? (
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold border border-amber-300">
              검토용 집계 (미확정 포함)
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold border border-emerald-300">
              모든 구역·후보 확인 완료
            </span>
          )}
        </div>
      </div>

      {/* 탭 컨텐츠 영역 */}
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {/* 1. 구역 목록 및 산입·제외 관리 탭 */}
        {activeSubTab === "zones" && (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2 px-2">층</th>
                    <th className="py-2 px-2">구역명</th>
                    <th className="py-2 px-2">용도</th>
                    <th className="py-2 px-2">행 구분</th>
                    <th className="py-2 px-2">산정 근거 선택</th>
                    <th className="py-2 px-2 text-right">A. 문서기재(㎡)</th>
                    <th className="py-2 px-2 text-right">B. 기하측정(㎡)</th>
                    <th className="py-2 px-2 text-right">C. 채택기준(㎡)</th>
                    <th className="py-2 px-2 text-right">바닥면적 반영(㎡)</th>
                    <th className="py-2 px-2 text-right">용적률 반영(㎡)</th>
                    <th className="py-2 px-2">제외·조정 사유 및 법령 메모</th>
                    <th className="py-2 px-2">검토 상태</th>
                    <th className="py-2 px-2 text-center">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bundle.zones.map((z) => {
                    const isSelected = z.id === selectedZoneId;
                    return (
                      <tr
                        key={z.id}
                        onClick={() => {
                          setSelectedZoneId(z.id);
                          if (z.sourcePageIndex) {
                            setActivePageIndex(z.sourcePageIndex);
                          }
                        }}
                        className={`cursor-pointer ${
                          isSelected ? "bg-emerald-50/70" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-1.5 px-2">
                          <select
                            value={z.floorId}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              void updateZoneMetaAndInclusion(z.id, {
                                floorId: e.target.value,
                              })
                            }
                            className="px-1.5 py-1 border border-slate-300 rounded bg-white"
                          >
                            {bundle.floors.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            value={z.name}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              void updateZoneMetaAndInclusion(z.id, {
                                name: e.target.value,
                              })
                            }
                            className="w-28 px-1.5 py-1 border border-slate-300 rounded font-semibold"
                          />
                          {z.deductionPolygonsPt.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {z.deductionPolygonsPt.map((d) => (
                                <div
                                  key={d.id}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] mr-1"
                                >
                                  <span>공제: {d.label}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void removeDeductionFromZone(z.id, d.id);
                                    }}
                                    className="text-rose-500 hover:text-rose-800 font-bold"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            value={z.usage}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              void updateZoneMetaAndInclusion(z.id, {
                                usage: e.target.value,
                              })
                            }
                            className="w-36 px-1.5 py-1 border border-slate-300 rounded"
                          />
                        </td>

                        <td className="py-1.5 px-2">
                          <select
                            value={z.rowType}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              void updateZoneMetaAndInclusion(z.id, {
                                rowType: e.target.value as RowType,
                              })
                            }
                            className="px-1.5 py-1 border border-slate-300 rounded bg-white"
                          >
                            {Object.entries(ROW_TYPE_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 채택 기준 면적 선택: 문서 기재 / 기하 측정 / 사용자 직접 입력 (하나만 채택하며 합산하지 않음) */}
                        <td className="py-1.5 px-2">
                          <select
                            value={z.basisType}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              void updateZoneMetaAndInclusion(z.id, {
                                basisType: e.target.value as AreaBasisType,
                              })
                            }
                            className="px-1.5 py-1 border border-slate-300 rounded bg-white font-medium"
                          >
                            {Object.entries(AREA_BASIS_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* A. 문서 기재 면적 */}
                        <td className="py-1.5 px-2 text-right font-mono">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="-"
                            value={z.statedAreaSqm ?? ""}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              void updateZoneMetaAndInclusion(z.id, {
                                statedAreaSqm:
                                  raw === "" ? null : Number(raw),
                              });
                            }}
                            className="w-20 px-1.5 py-1 text-right border border-slate-200 rounded"
                          />
                        </td>

                        {/* B. 기하 측정 면적 */}
                        <td className="py-1.5 px-2 text-right font-mono text-emerald-700 font-semibold">
                          {z.measuredNetAreaSqm !== null
                            ? roundToDecimals(z.measuredNetAreaSqm).toFixed(2)
                            : "-"}
                        </td>

                        {/* C. 채택 기준 면적 */}
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-blue-700">
                          {z.basisType === "manual" ? (
                            <input
                              type="number"
                              step="0.01"
                              value={z.manualAreaSqm ?? ""}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                void updateZoneMetaAndInclusion(z.id, {
                                  manualAreaSqm:
                                    raw === "" ? null : Number(raw),
                                });
                              }}
                              className="w-20 px-1.5 py-1 text-right border border-blue-300 rounded"
                            />
                          ) : z.adoptedBaseAreaSqm !== null ? (
                            roundToDecimals(z.adoptedBaseAreaSqm).toFixed(2)
                          ) : (
                            "미산출"
                          )}
                        </td>

                        {/* 바닥면적 산입 여부 및 부분 조정 수치 */}
                        <td
                          className="py-1.5 px-2 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
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
                              className="w-20 px-1.5 py-1 text-right font-mono border border-slate-300 rounded disabled:bg-slate-100"
                            />
                          </div>
                        </td>

                        {/* 용적률 산입 여부 및 부분 조정 수치 (B1이라고 자동 제외 확정하지 않고 사용자 선택으로 관리) */}
                        <td
                          className="py-1.5 px-2 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="checkbox"
                              checked={z.includeInFarArea}
                              onChange={(e) =>
                                void updateZoneMetaAndInclusion(z.id, {
                                  includeInFarArea: e.target.checked,
                                  isAdjustedOrExcluded:
                                    !e.target.checked || !z.includeInFloorArea,
                                })
                              }
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
                              className="w-20 px-1.5 py-1 text-right font-mono border border-slate-300 rounded disabled:bg-slate-100"
                            />
                          </div>
                        </td>

                        {/* 제외·조정 사유 및 법령 근거 */}
                        <td
                          className="py-1.5 px-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              placeholder="제외·조정 사유 입력 (필수)"
                              value={z.exclusionOrAdjustmentReason}
                              onChange={(e) =>
                                void updateZoneMetaAndInclusion(z.id, {
                                  exclusionOrAdjustmentReason: e.target.value,
                                })
                              }
                              className={`w-44 px-1.5 py-1 border rounded ${
                                (z.isAdjustedOrExcluded ||
                                  !z.includeInFloorArea ||
                                  !z.includeInFarArea) &&
                                !z.exclusionOrAdjustmentReason.trim()
                                  ? "border-red-400 bg-red-50"
                                  : "border-slate-300"
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
                              className="w-36 px-1.5 py-1 border border-slate-300 rounded"
                            />
                          </div>
                        </td>

                        {/* 검토 상태 */}
                        <td
                          className="py-1.5 px-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={z.reviewStatus}
                            onChange={(e) =>
                              void updateZoneMetaAndInclusion(z.id, {
                                reviewStatus: e.target.value as ReviewStatus,
                              })
                            }
                            className={`px-2 py-1 rounded font-semibold border ${
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
                          className="py-1.5 px-2 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => void deleteZone(z.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
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

            {/* 수동/기재 구역 빠른 추가 폼 */}
            <form
              onSubmit={handleAddManualZone}
              className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2"
            >
              <span className="font-semibold text-slate-700">
                직접/문서기재 구역 추가:
              </span>
              <select
                value={newZoneFloorId || (bundle.floors[0]?.id ?? "")}
                onChange={(e) => setNewZoneFloorId(e.target.value)}
                className="px-2 py-1 border border-slate-300 rounded"
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
                className="px-2 py-1 border border-slate-300 rounded w-36"
              />
              <input
                type="text"
                placeholder="용도"
                value={newZoneUsage}
                onChange={(e) => setNewZoneUsage(e.target.value)}
                className="px-2 py-1 border border-slate-300 rounded w-40"
              />
              <select
                value={newZoneBasis}
                onChange={(e) =>
                  setNewZoneBasis(e.target.value as AreaBasisType)
                }
                className="px-2 py-1 border border-slate-300 rounded"
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
                className="px-2 py-1 border border-slate-300 rounded w-24"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1 rounded bg-slate-900 text-white font-semibold"
              >
                <Plus className="w-3 h-3" />
                추가
              </button>
            </form>
          </div>
        )}

        {/* 2. 층별·용도별 집계 탭 */}
        {activeSubTab === "floors_usages" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
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

            <div>
              <h4 className="font-bold text-slate-800 mb-2">용도별 집계</h4>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="py-1.5 px-2">용도 명칭</th>
                    <th className="py-1.5 px-2 text-right">구역 수</th>
                    <th className="py-1.5 px-2 text-right">바닥면적 합계(㎡)</th>
                    <th className="py-1.5 px-2 text-right">용적률 반영 합계(㎡)</th>
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
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
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
                      <span className="text-slate-600">기재 대비 연면적 차이:</span>
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

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
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
              <div className="p-6 text-center text-emerald-700 flex items-center justify-center gap-2 font-semibold">
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
                  className={`p-2.5 rounded-lg border flex items-start justify-between gap-3 cursor-pointer ${
                    iss.severity === "error"
                      ? "bg-red-50/70 border-red-200 text-red-900"
                      : iss.severity === "warning"
                      ? "bg-amber-50/70 border-amber-200 text-amber-900"
                      : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}
                >
                  <div className="flex items-start gap-2">
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
                      <p className="text-[11px] leading-relaxed">{iss.message}</p>
                      {iss.comparison && (
                        <div className="text-[11px] font-mono bg-white/80 px-2 py-1 rounded border border-slate-200 inline-block mt-1">
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
    </div>
  );
}
