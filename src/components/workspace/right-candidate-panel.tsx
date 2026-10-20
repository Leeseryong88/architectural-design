"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Edit3,
  XCircle,
  MapPin,
  Layers,
  ListChecks,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { roundToDecimals } from "@/lib/geometry/planar";
import {
  CANDIDATE_FIELD_LABELS,
  REVIEW_STATUS_LABELS,
  ROW_TYPE_LABELS,
  type ExtractionCandidate,
  type ReviewStatus,
  type RowType,
} from "@/types/domain";

const statusBadgeColor: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  edited: "bg-blue-100 text-blue-800 border-blue-300",
  rejected: "bg-slate-200 text-slate-600 border-slate-300",
};

const statusDotColor: Record<ReviewStatus, string> = {
  pending: "bg-amber-400",
  confirmed: "bg-emerald-500",
  edited: "bg-blue-500",
  rejected: "bg-slate-300",
};

function SegmentedFilter<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <div className="flex items-center gap-0.5 bg-slate-200/70 p-0.5 rounded-lg text-[11px]">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`flex-1 py-1 rounded-md font-semibold cursor-pointer transition ${
            value === opt.key
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function RightCandidatePanel({ onClose }: { onClose?: () => void }) {
  const bundle = useWorkspaceStore((s) => s.bundle);
  const activePageIndex = useWorkspaceStore((s) => s.activePageIndex);
  const setActivePageIndex = useWorkspaceStore((s) => s.setActivePageIndex);
  const selectedCandidateId = useWorkspaceStore((s) => s.selectedCandidateId);
  const focusCandidateEvidence = useWorkspaceStore(
    (s) => s.focusCandidateEvidence
  );
  const reviewCandidate = useWorkspaceStore((s) => s.reviewCandidate);

  const selectedZoneId = useWorkspaceStore((s) => s.selectedZoneId);
  const setSelectedZoneId = useWorkspaceStore((s) => s.setSelectedZoneId);
  const updateZoneMetaAndInclusion = useWorkspaceStore(
    (s) => s.updateZoneMetaAndInclusion
  );
  const removeDeductionFromZone = useWorkspaceStore(
    (s) => s.removeDeductionFromZone
  );
  const deleteZone = useWorkspaceStore((s) => s.deleteZone);

  const [rightTab, setRightTab] = useState<"candidates" | "zones">(() => {
    const b = useWorkspaceStore.getState().bundle;
    return b?.candidates.some((c) => c.reviewStatus === "pending")
      ? "candidates"
      : "zones";
  });
  const [candScope, setCandScope] = useState<"pending" | "page" | "all">(
    "pending"
  );
  const [zoneScope, setZoneScope] = useState<"page" | "pending" | "all">(
    "page"
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValueStr, setEditValueStr] = useState<string>("");
  const [targetFloorId, setTargetFloorId] = useState<string>("");

  // 도면이나 집계표에서 구역을 선택하면 구역 상세 탭으로 자동 전환
  useEffect(() => {
    if (selectedZoneId) setRightTab("zones");
  }, [selectedZoneId]);

  const candidates = useMemo(() => {
    const list = bundle?.candidates ?? [];
    return list.filter((c) => {
      if (candScope === "page") return c.pageIndex === activePageIndex;
      if (candScope === "pending") return c.reviewStatus === "pending";
      return true;
    });
  }, [bundle, candScope, activePageIndex]);

  const zones = useMemo(() => {
    const list = bundle?.zones ?? [];
    return list.filter((z) => {
      if (zoneScope === "page") return z.sourcePageIndex === activePageIndex;
      if (zoneScope === "pending") return z.reviewStatus === "pending";
      return true;
    });
  }, [bundle, zoneScope, activePageIndex]);

  if (!bundle) return null;

  const totalCandCount = bundle.candidates.length;
  const pendingCandCount = bundle.candidates.filter(
    (c) => c.reviewStatus === "pending"
  ).length;
  const pendingZoneCount = bundle.zones.filter(
    (z) => z.reviewStatus === "pending"
  ).length;
  const pageZoneCount = bundle.zones.filter(
    (z) => z.sourcePageIndex === activePageIndex
  ).length;
  const reviewedRatio =
    totalCandCount > 0
      ? ((totalCandCount - pendingCandCount) / totalCandCount) * 100
      : 0;

  const selectedZone = bundle.zones.find((z) => z.id === selectedZoneId) ?? null;

  const startEditing = (cand: ExtractionCandidate) => {
    setEditingId(cand.id);
    setEditValueStr(
      String(cand.reviewerValue ?? cand.normalizedValue ?? cand.rawValue)
    );
    const matchedFloor = bundle.floors.find(
      (f) =>
        cand.floorLabel &&
        f.label.toLowerCase() === cand.floorLabel.toLowerCase()
    );
    setTargetFloorId(matchedFloor?.id ?? bundle.floors[0]?.id ?? "");
  };

  const submitEdit = async (cand: ExtractionCandidate) => {
    const isNumeric = typeof cand.normalizedValue === "number";
    const parsedVal = isNumeric ? Number(editValueStr) : editValueStr.trim();
    if (isNumeric && Number.isNaN(parsedVal)) {
      alert("유효한 숫자를 입력하세요.");
      return;
    }

    await reviewCandidate({
      candidateId: cand.id,
      status: "edited",
      editedValue: parsedVal,
      applyToOfficialData: true,
      targetFloorId: targetFloorId || undefined,
    });
    setEditingId(null);
  };

  const candidateDisplayValue = (cand: ExtractionCandidate) => {
    if (cand.reviewStatus === "edited" && cand.reviewerValue !== null) {
      return `${cand.reviewerValue} ${cand.unit || ""}`;
    }
    if (cand.normalizedValue !== null) {
      return `${cand.normalizedValue} ${cand.unit || ""}`;
    }
    return cand.rawValue || "미확인";
  };

  const renderZoneDetail = () => {
    if (!selectedZone) return null;
    const z = selectedZone;
    const needsReason =
      (z.isAdjustedOrExcluded || !z.includeInFloorArea || !z.includeInFarArea) &&
      !z.exclusionOrAdjustmentReason.trim();

    const basisOptions = [
      {
        key: "stated" as const,
        label: "A. 문서기재",
        value: z.statedAreaSqm,
        activeClass: "bg-blue-50 border-blue-500 ring-1 ring-blue-500",
        valueClass: "text-slate-900",
      },
      {
        key: "measured" as const,
        label: "B. 기하측정",
        value: z.measuredNetAreaSqm,
        activeClass: "bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500",
        valueClass: "text-emerald-700",
      },
      {
        key: "manual" as const,
        label: "직접 입력",
        value: z.manualAreaSqm,
        activeClass: "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500",
        valueClass: "text-indigo-700",
      },
    ];

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between bg-white sticky top-0 z-10">
          <button
            type="button"
            onClick={() => setSelectedZoneId(null)}
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            구역 목록
          </button>
          <div className="flex items-center gap-1">
            {z.sourcePageIndex && z.sourcePageIndex !== activePageIndex && (
              <button
                type="button"
                onClick={() => setActivePageIndex(z.sourcePageIndex!)}
                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-mono text-[10px] cursor-pointer"
              >
                P.{z.sourcePageIndex}로 이동
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirm(`[${z.name}] 구역을 삭제할까요?`)) {
                  void deleteZone(z.id);
                }
              }}
              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
              title="구역 삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-3 space-y-4 text-xs">
          {/* 기본 정보 */}
          <section className="space-y-2">
            <input
              type="text"
              value={z.name}
              onChange={(e) =>
                void updateZoneMetaAndInclusion(z.id, { name: e.target.value })
              }
              className="w-full px-2 py-1.5 text-sm font-bold text-slate-900 border border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none rounded-md"
              title="구역 이름"
            />
            <div className="grid grid-cols-3 gap-1.5">
              <select
                value={z.floorId}
                onChange={(e) =>
                  void updateZoneMetaAndInclusion(z.id, {
                    floorId: e.target.value,
                  })
                }
                className="px-1.5 py-1 border border-slate-300 rounded-md bg-white font-bold text-slate-800"
                title="소속 층"
              >
                {bundle.floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={z.usage}
                onChange={(e) =>
                  void updateZoneMetaAndInclusion(z.id, {
                    usage: e.target.value,
                  })
                }
                className="col-span-2 px-2 py-1 border border-slate-300 rounded-md bg-white"
                title="용도"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <select
                value={z.rowType}
                onChange={(e) =>
                  void updateZoneMetaAndInclusion(z.id, {
                    rowType: e.target.value as RowType,
                  })
                }
                className="px-1.5 py-1 border border-slate-300 rounded-md bg-white text-[11px]"
                title="행 구분"
              >
                {Object.entries(ROW_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={z.reviewStatus}
                onChange={(e) =>
                  void updateZoneMetaAndInclusion(z.id, {
                    reviewStatus: e.target.value as ReviewStatus,
                  })
                }
                className={`px-2 py-1 rounded-full text-[11px] font-bold border cursor-pointer ${
                  statusBadgeColor[z.reviewStatus]
                }`}
                title="검토 상태"
              >
                {Object.entries(REVIEW_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* 산정 근거 선택 */}
          <section className="space-y-1.5">
            <h4 className="text-[11px] font-bold text-slate-500">
              산정 근거 (클릭하여 채택)
            </h4>
            <div className="grid grid-cols-3 gap-1.5">
              {basisOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() =>
                    void updateZoneMetaAndInclusion(z.id, {
                      basisType: opt.key,
                    })
                  }
                  className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                    z.basisType === opt.key
                      ? opt.activeClass
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="text-[10px] text-slate-500 font-semibold">
                    {opt.label}
                  </div>
                  <div className={`font-mono font-bold mt-0.5 ${opt.valueClass}`}>
                    {opt.value !== null
                      ? roundToDecimals(opt.value).toFixed(2)
                      : "—"}
                  </div>
                </button>
              ))}
            </div>
            {z.basisType === "stated" && (
              <label className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                <span>문서 기재 면적(㎡)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="미기재"
                  value={z.statedAreaSqm ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    void updateZoneMetaAndInclusion(z.id, {
                      statedAreaSqm: raw === "" ? null : Number(raw),
                    });
                  }}
                  className="w-28 px-2 py-1 text-right font-mono border border-slate-300 rounded-md"
                />
              </label>
            )}
            {z.basisType === "manual" && (
              <label className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                <span>직접 입력 면적(㎡)</span>
                <input
                  type="number"
                  step="0.01"
                  value={z.manualAreaSqm ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    void updateZoneMetaAndInclusion(z.id, {
                      manualAreaSqm: raw === "" ? null : Number(raw),
                    });
                  }}
                  className="w-28 px-2 py-1 text-right font-mono border border-indigo-300 rounded-md"
                />
              </label>
            )}
          </section>

          {/* 산입 여부 */}
          <section className="space-y-1.5">
            <h4 className="text-[11px] font-bold text-slate-500">산입 여부</h4>
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              <label className="flex items-center justify-between px-2.5 py-2 cursor-pointer">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
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
                    className="rounded border-slate-300 text-blue-600"
                  />
                  바닥면적 산입
                </span>
                <span className="font-mono font-bold text-blue-700">
                  {z.includedFloorAreaSqm !== null
                    ? `${roundToDecimals(z.includedFloorAreaSqm).toFixed(2)} ㎡`
                    : "0 ㎡"}
                </span>
              </label>
              <label className="flex items-center justify-between px-2.5 py-2 cursor-pointer">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
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
                    className="rounded border-slate-300 text-blue-600"
                  />
                  용적률 산입
                </span>
                <span className="font-mono font-bold text-indigo-700">
                  {z.includedFarAreaSqm !== null
                    ? `${roundToDecimals(z.includedFarAreaSqm).toFixed(2)} ㎡`
                    : "0 ㎡"}
                </span>
              </label>
            </div>
            <input
              type="text"
              placeholder={
                needsReason
                  ? "제외·조정 사유 입력 (필수)"
                  : "제외·조정 사유 (해당 시)"
              }
              value={z.exclusionOrAdjustmentReason}
              onChange={(e) =>
                void updateZoneMetaAndInclusion(z.id, {
                  exclusionOrAdjustmentReason: e.target.value,
                })
              }
              className={`w-full px-2.5 py-1.5 text-[11px] border rounded-lg ${
                needsReason
                  ? "border-red-400 bg-red-50 placeholder:text-red-500"
                  : "border-slate-200 bg-white"
              }`}
            />
            <input
              type="text"
              placeholder="법령 근거/메모 (예: 건축법 시행령 제119조)"
              value={z.statuteLinkOrMemo}
              onChange={(e) =>
                void updateZoneMetaAndInclusion(z.id, {
                  statuteLinkOrMemo: e.target.value,
                })
              }
              className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg bg-white"
            />
          </section>

          {/* 내부 공제 */}
          {z.deductionPolygonsPt.length > 0 && (
            <section className="space-y-1.5">
              <h4 className="text-[11px] font-bold text-slate-500">
                내부 공제 ({z.deductionPolygonsPt.length})
              </h4>
              <div className="flex flex-wrap gap-1">
                {z.deductionPolygonsPt.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold"
                    title={d.reason}
                  >
                    {d.label}
                    <button
                      type="button"
                      onClick={() => void removeDeductionFromZone(z.id, d.id)}
                      className="text-rose-500 hover:text-rose-800 font-bold cursor-pointer"
                      title="공제 영역 삭제"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}

          {z.reviewStatus !== "confirmed" && (
            <button
              type="button"
              onClick={() =>
                void updateZoneMetaAndInclusion(z.id, {
                  reviewStatus: "confirmed",
                })
              }
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>이 구역 검토 확정</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderZoneList = () => (
    <>
      <div className="p-2.5 border-b border-slate-200 bg-slate-50/70 shrink-0">
        <SegmentedFilter
          value={zoneScope}
          onChange={setZoneScope}
          options={[
            { key: "page", label: `현재 P.${activePageIndex} (${pageZoneCount})` },
            { key: "pending", label: `미검토 (${pendingZoneCount})` },
            { key: "all", label: `전체 (${bundle.zones.length})` },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {zones.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 leading-relaxed">
            {zoneScope === "page"
              ? "이 페이지에 작성된 구역이 없습니다. 도구 모음의 '구역 작성'으로 산정선을 그리거나 하단 집계표에서 직접 추가하세요."
              : "조건에 해당하는 구역이 없습니다."}
          </div>
        ) : (
          zones.map((z) => {
            const floorObj = bundle.floors.find((f) => f.id === z.floorId);
            const needsReason =
              (z.isAdjustedOrExcluded ||
                !z.includeInFloorArea ||
                !z.includeInFarArea) &&
              !z.exclusionOrAdjustmentReason.trim();
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => {
                  setSelectedZoneId(z.id);
                  if (z.sourcePageIndex) setActivePageIndex(z.sourcePageIndex);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-white text-left text-xs cursor-pointer group"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor[z.reviewStatus]}`}
                  title={REVIEW_STATUS_LABELS[z.reviewStatus]}
                />
                <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white font-bold text-[10px] shrink-0">
                  {floorObj?.label ?? "층미지정"}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-slate-900 truncate">
                    {z.name}
                  </span>
                  <span className="block text-[10px] text-slate-500 truncate">
                    {z.usage}
                    {needsReason && (
                      <span className="text-red-600 font-semibold"> · 사유 필요</span>
                    )}
                  </span>
                </span>
                <span className="font-mono font-bold text-blue-700 shrink-0">
                  {z.adoptedBaseAreaSqm !== null
                    ? roundToDecimals(z.adoptedBaseAreaSqm).toFixed(2)
                    : "—"}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 shrink-0" />
              </button>
            );
          })
        )}
      </div>
    </>
  );

  const renderCandidates = () => (
    <>
      <div className="p-2.5 border-b border-slate-200 space-y-2 bg-slate-50/70 shrink-0">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-700">검토 진행</span>
            <span className="text-slate-500">
              {totalCandCount - pendingCandCount} / {totalCandCount}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${reviewedRatio}%` }}
            />
          </div>
        </div>
        <SegmentedFilter
          value={candScope}
          onChange={setCandScope}
          options={[
            { key: "pending", label: `미검토 (${pendingCandCount})` },
            { key: "page", label: `현재 P.${activePageIndex}` },
            { key: "all", label: `전체 (${totalCandCount})` },
          ]}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {candidates.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 leading-relaxed">
            {candScope === "pending" && totalCandCount > 0
              ? "모든 추출 후보를 검토했습니다."
              : "조건에 해당하는 추출 후보가 없습니다. 왼쪽에서 페이지를 선택하고 추출을 실행하세요."}
          </div>
        ) : (
          candidates.map((cand) => {
            const isSelected = cand.id === selectedCandidateId;
            const isEditing = cand.id === editingId;
            const isPending = cand.reviewStatus === "pending";

            return (
              <div
                key={cand.id}
                onClick={() => focusCandidateEvidence(cand)}
                className={`px-2.5 py-2 rounded-lg border transition cursor-pointer space-y-1.5 text-xs ${
                  isSelected
                    ? "border-amber-500 bg-amber-50/40 ring-1 ring-amber-500"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-semibold text-slate-600 truncate">
                    {CANDIDATE_FIELD_LABELS[cand.fieldKey]}
                    {cand.fieldKey === "room_stated_area" && cand.usageLabel && (
                      <span className="text-slate-800"> · {cand.usageLabel}</span>
                    )}
                    {cand.floorLabel && (
                      <span className="text-slate-400"> · {cand.floorLabel}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono text-[10px]">
                      P.{cand.pageIndex}
                    </span>
                    {!isPending && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                          statusBadgeColor[cand.reviewStatus]
                        }`}
                      >
                        {REVIEW_STATUS_LABELS[cand.reviewStatus]}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 truncate">
                    {candidateDisplayValue(cand)}
                  </span>
                  {cand.confidence !== null && (
                    <span className="text-[10px] text-slate-400 shrink-0">
                      신뢰도 {Math.round(cand.confidence * 100)}%
                    </span>
                  )}
                </div>

                {/* 선택한 후보만 근거 세부 정보 표시 */}
                {isSelected && (
                  <div className="space-y-1.5 pt-0.5">
                    <div className="text-[11px] text-slate-600 bg-slate-50 px-2 py-1.5 rounded border border-slate-100 space-y-0.5">
                      <div>
                        <span className="font-semibold text-slate-700">기재값: </span>
                        {cand.rawValue}
                        <span className="text-slate-400">
                          {" "}
                          · {ROW_TYPE_LABELS[cand.rowType]} · v{cand.documentVersion}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">원문: </span>
                        {cand.rawText}
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-medium">
                      <MapPin className="w-3 h-3" />
                      {cand.pdfBboxPt
                        ? "도면에 근거 위치를 강조 표시했습니다"
                        : "bbox 없음 — 페이지 이동 후 원문 검색으로 표시"}
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 rounded-lg bg-blue-50 border border-blue-200 space-y-2"
                  >
                    <div>
                      <label className="block text-[10px] font-semibold text-blue-900 mb-1">
                        수정할 확정값
                      </label>
                      <input
                        type="text"
                        autoFocus
                        value={editValueStr}
                        onChange={(e) => setEditValueStr(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitEdit(cand);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-full px-2.5 py-1 text-xs border border-blue-300 rounded bg-white"
                      />
                    </div>
                    {(cand.fieldKey === "floor_area_entry" ||
                      cand.fieldKey === "room_stated_area") && (
                      <div>
                        <label className="block text-[10px] font-semibold text-blue-900 mb-1">
                          적용 대상 층
                        </label>
                        <select
                          value={targetFloorId}
                          onChange={(e) => setTargetFloorId(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-blue-300 rounded bg-white"
                        >
                          {bundle.floors.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label} ({f.mainUse})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 text-[11px] cursor-pointer"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitEdit(cand)}
                        className="px-2.5 py-1 rounded bg-blue-600 text-white font-semibold text-[11px] cursor-pointer"
                      >
                        수정 확정·반영
                      </button>
                    </div>
                  </div>
                )}

                {/* 미검토 후보는 항상, 검토된 후보는 선택 시에만 작업 버튼 표시 */}
                {!isEditing && (isPending || isSelected) && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        void reviewCandidate({
                          candidateId: cand.id,
                          status: "confirmed",
                          applyToOfficialData: true,
                        })
                      }
                      className="flex-1 inline-flex items-center justify-center gap-1 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      확정
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditing(cand)}
                      className="flex-1 inline-flex items-center justify-center gap-1 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-[11px] cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void reviewCandidate({
                          candidateId: cand.id,
                          status: "rejected",
                          applyToOfficialData: false,
                        })
                      }
                      className="inline-flex items-center justify-center gap-1 py-1 px-2 rounded-md text-rose-600 hover:bg-rose-50 font-semibold text-[11px] cursor-pointer"
                      title="반려"
                    >
                      <XCircle className="w-3 h-3" />
                      반려
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );

  return (
    <aside className="w-80 xl:w-[360px] bg-white border-l border-slate-200 flex flex-col shrink-0 h-full overflow-hidden">
      {/* 상단: 검토 패널 탭 (AI 후보 검토 / 구역) */}
      <div className="px-2 pt-2 border-b border-slate-200 flex items-end justify-between gap-1 shrink-0">
        <div className="flex items-end gap-0.5 text-xs">
          <button
            type="button"
            onClick={() => setRightTab("candidates")}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border-b-2 font-bold transition cursor-pointer ${
              rightTab === "candidates"
                ? "border-blue-600 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>AI 후보 검토</span>
            {pendingCandCount > 0 && (
              <span className="px-1.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold">
                {pendingCandCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setRightTab("zones")}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border-b-2 font-bold transition cursor-pointer ${
              rightTab === "zones"
                ? "border-blue-600 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>구역</span>
            {pendingZoneCount > 0 && (
              <span className="px-1.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold">
                {pendingZoneCount}
              </span>
            )}
          </button>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mb-1.5 p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            title="검토 패널 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {rightTab === "candidates" && renderCandidates()}
      {rightTab === "zones" &&
        (selectedZone ? renderZoneDetail() : renderZoneList())}
    </aside>
  );
}
