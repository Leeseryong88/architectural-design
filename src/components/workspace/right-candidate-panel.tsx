"use client";

import React, { useMemo, useState } from "react";
import {
  Check,
  Edit3,
  XCircle,
  MapPin,
  Sparkles,
  Filter,
  Layers,
  ListChecks,
  Trash2,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { roundToDecimals } from "@/lib/geometry/planar";
import {
  AREA_BASIS_LABELS,
  CANDIDATE_FIELD_LABELS,
  REVIEW_STATUS_LABELS,
  ROW_TYPE_LABELS,
  type AreaBasisType,
  type ExtractionCandidate,
  type ReviewStatus,
} from "@/types/domain";

export function RightCandidatePanel() {
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

  const [rightTab, setRightTab] = useState<"candidates" | "zones">("zones");
  const [filterScope, setFilterScope] = useState<"all" | "page" | "pending">(
    "all"
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValueStr, setEditValueStr] = useState<string>("");
  const [targetFloorId, setTargetFloorId] = useState<string>("");

  const candidates = useMemo(() => {
    const list = bundle?.candidates ?? [];
    return list.filter((c) => {
      if (filterScope === "page" && c.pageIndex !== activePageIndex) {
        return false;
      }
      if (filterScope === "pending" && c.reviewStatus !== "pending") {
        return false;
      }
      return true;
    });
  }, [bundle, filterScope, activePageIndex]);

  if (!bundle) return null;

  const pendingCandCount = bundle.candidates.filter(
    (c) => c.reviewStatus === "pending"
  ).length;
  const pendingZoneCount = bundle.zones.filter(
    (z) => z.reviewStatus === "pending"
  ).length;

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

  const statusBadgeColor: Record<ReviewStatus, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-300",
    confirmed: "bg-emerald-100 text-emerald-800 border-emerald-300",
    edited: "bg-blue-100 text-blue-800 border-blue-300",
    rejected: "bg-slate-200 text-slate-600 border-slate-300",
  };

  return (
    <aside className="w-84 xl:w-96 bg-white border-l border-slate-200 flex flex-col shrink-0 h-full overflow-hidden">
      {/* 상단: 우측 패널 모드 스위처 (구역 빠른 편집 vs AI 추출 후보) */}
      <div className="p-2.5 border-b border-slate-200 bg-slate-900 text-white shrink-0">
        <div className="grid grid-cols-2 gap-1 bg-slate-800 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setRightTab("zones")}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg font-bold transition cursor-pointer ${
              rightTab === "zones"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>구역·산입 편집 ({bundle.zones.length})</span>
            {pendingZoneCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold">
                {pendingZoneCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setRightTab("candidates")}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg font-bold transition cursor-pointer ${
              rightTab === "candidates"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>AI 추출 후보 ({bundle.candidates.length})</span>
            {pendingCandCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold">
                {pendingCandCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 탭 1: 구역·산입 빠른 편집 카드 (스크롤 없이 도면 옆에서 즉시 선택·수정) */}
      {rightTab === "zones" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/50">
          <div className="text-[11px] text-slate-500 px-1 flex items-center justify-between">
            <span>카드를 클릭하면 해당 도면 페이지로 이동합니다.</span>
            <span className="font-semibold text-slate-700">
              미검토 {pendingZoneCount}건
            </span>
          </div>

          {bundle.zones.map((z) => {
            const isSelected = z.id === selectedZoneId;
            const floorObj = bundle.floors.find((f) => f.id === z.floorId);
            const needsReason =
              (z.isAdjustedOrExcluded ||
                !z.includeInFloorArea ||
                !z.includeInFarArea) &&
              !z.exclusionOrAdjustmentReason.trim();

            return (
              <div
                key={z.id}
                onClick={() => {
                  setSelectedZoneId(z.id);
                  if (z.sourcePageIndex) {
                    setActivePageIndex(z.sourcePageIndex);
                  }
                }}
                className={`p-3 rounded-xl border transition cursor-pointer space-y-2.5 text-xs ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/40 ring-1 ring-blue-600 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                {/* 구역 카드 상단: 층 배지 + 구역명 + 검토 상태 */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white font-bold text-[11px] shrink-0">
                      {floorObj?.label ?? "층미지정"}
                    </span>
                    <span className="font-bold text-slate-900 truncate text-sm">
                      {z.name}
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <select
                      value={z.reviewStatus}
                      onChange={(e) =>
                        void updateZoneMetaAndInclusion(z.id, {
                          reviewStatus: e.target.value as ReviewStatus,
                        })
                      }
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold border cursor-pointer ${
                        statusBadgeColor[z.reviewStatus]
                      }`}
                    >
                      {Object.entries(REVIEW_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void deleteZone(z.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                      title="구역 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 용도 및 공제 칩 */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                    {z.usage}
                  </span>
                  {z.sourcePageIndex && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono text-[10px]">
                      P.{z.sourcePageIndex}
                    </span>
                  )}
                  {z.deductionPolygonsPt.map((d) => (
                    <span
                      key={d.id}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold"
                    >
                      <span>공제: {d.label}</span>
                      <button
                        type="button"
                        onClick={() => void removeDeductionFromZone(z.id, d.id)}
                        className="text-rose-500 hover:text-rose-800 font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                {/* 산정 근거 원클릭 선택 버튼 그룹 (A. 문서기재 vs B. 기하측정 vs 직접입력) */}
                <div
                  className="grid grid-cols-3 gap-1.5 pt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() =>
                      void updateZoneMetaAndInclusion(z.id, {
                        basisType: "stated",
                      })
                    }
                    className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                      z.basisType === "stated"
                        ? "bg-blue-50 border-blue-500 ring-1 ring-blue-500"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <div className="text-[10px] text-slate-500 font-semibold">
                      A. 문서기재
                    </div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5">
                      {z.statedAreaSqm !== null
                        ? `${z.statedAreaSqm.toFixed(2)}㎡`
                        : "미기재"}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void updateZoneMetaAndInclusion(z.id, {
                        basisType: "measured",
                      })
                    }
                    className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                      z.basisType === "measured"
                        ? "bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <div className="text-[10px] text-slate-500 font-semibold">
                      B. 기하측정
                    </div>
                    <div className="font-mono font-bold text-emerald-700 mt-0.5">
                      {z.measuredNetAreaSqm !== null
                        ? `${roundToDecimals(z.measuredNetAreaSqm).toFixed(2)}㎡`
                        : "미측정"}
                    </div>
                  </button>

                  <div
                    onClick={() =>
                      void updateZoneMetaAndInclusion(z.id, {
                        basisType: "manual",
                      })
                    }
                    className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                      z.basisType === "manual"
                        ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <div className="text-[10px] text-slate-500 font-semibold">
                      {AREA_BASIS_LABELS.manual.slice(0, 4)}
                    </div>
                    <div className="font-mono font-bold text-blue-700 mt-0.5">
                      {z.adoptedBaseAreaSqm !== null
                        ? `${roundToDecimals(z.adoptedBaseAreaSqm).toFixed(2)}㎡`
                        : "미산출"}
                    </div>
                  </div>
                </div>

                {/* 바닥면적 / 용적률 산입 토글 및 제외 사유 빠른 입력 */}
                <div
                  className="pt-1 border-t border-slate-100 space-y-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
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
                      <span>
                        바닥면적 산입 (
                        {z.includedFloorAreaSqm !== null
                          ? `${roundToDecimals(z.includedFloorAreaSqm).toFixed(2)}㎡`
                          : "0㎡"}
                        )
                      </span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
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
                      <span>
                        용적률 산입 (
                        {z.includedFarAreaSqm !== null
                          ? `${roundToDecimals(z.includedFarAreaSqm).toFixed(2)}㎡`
                          : "0㎡"}
                        )
                      </span>
                    </label>
                  </div>

                  {/* 제외 또는 조정이 있거나 사유가 필요한 경우 바로 입력창 노출 */}
                  {(z.isAdjustedOrExcluded ||
                    !z.includeInFloorArea ||
                    !z.includeInFarArea ||
                    z.exclusionOrAdjustmentReason) && (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        placeholder="제외·조정 사유 입력 (필수 — 예: 지하층 기계실 용적률 산정 제외)"
                        value={z.exclusionOrAdjustmentReason}
                        onChange={(e) =>
                          void updateZoneMetaAndInclusion(z.id, {
                            exclusionOrAdjustmentReason: e.target.value,
                          })
                        }
                        className={`w-full px-2.5 py-1.5 text-[11px] border rounded-lg ${
                          needsReason
                            ? "border-red-400 bg-red-50 placeholder:text-red-500"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      />
                      <input
                        type="text"
                        placeholder="법령 근거/메모 (예: 건축법 시행령 제119조 제1항 제4호)"
                        value={z.statuteLinkOrMemo}
                        onChange={(e) =>
                          void updateZoneMetaAndInclusion(z.id, {
                            statuteLinkOrMemo: e.target.value,
                          })
                        }
                        className="w-full px-2.5 py-1 text-[11px] border border-slate-200 rounded-lg bg-slate-50"
                      />
                    </div>
                  )}

                  {/* 미검토 상태일 때 원클릭 확정 버튼 */}
                  {z.reviewStatus !== "confirmed" && (
                    <button
                      type="button"
                      onClick={() =>
                        void updateZoneMetaAndInclusion(z.id, {
                          reviewStatus: "confirmed",
                        })
                      }
                      className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>이 구역 검토 확정하기</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 탭 2: AI 추출 후보 및 근거 검토 */}
      {rightTab === "candidates" && (
        <>
          <div className="p-3 border-b border-slate-200 space-y-2 bg-slate-50/70 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">
                AI 추출 후보 ({candidates.length})
              </span>
              <span className="text-[11px] text-slate-500">
                미검토{" "}
                <strong className="text-amber-700">{pendingCandCount}</strong>건
              </span>
            </div>

            <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-1" />
              <button
                type="button"
                onClick={() => setFilterScope("all")}
                className={`flex-1 py-1 rounded font-medium cursor-pointer ${
                  filterScope === "all"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                전체 ({bundle.candidates.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterScope("page")}
                className={`flex-1 py-1 rounded font-medium cursor-pointer ${
                  filterScope === "page"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                현재 P.{activePageIndex}
              </button>
              <button
                type="button"
                onClick={() => setFilterScope("pending")}
                className={`flex-1 py-1 rounded font-medium cursor-pointer ${
                  filterScope === "pending"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                미검토만
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {candidates.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                조건에 해당하는 추출 후보가 없습니다. 왼쪽에서 페이지를 선택하고 추출을 실행하세요.
              </div>
            ) : (
              candidates.map((cand) => {
                const isSelected = cand.id === selectedCandidateId;
                const isEditing = cand.id === editingId;

                return (
                  <div
                    key={cand.id}
                    onClick={() => focusCandidateEvidence(cand)}
                    className={`p-3 rounded-xl border transition cursor-pointer space-y-2 text-xs ${
                      isSelected
                        ? "border-amber-500 bg-amber-50/30 ring-1 ring-amber-500"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900">
                          {CANDIDATE_FIELD_LABELS[cand.fieldKey]}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                          P.{cand.pageIndex} (v{cand.documentVersion})
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                          {ROW_TYPE_LABELS[cand.rowType]}
                        </span>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          statusBadgeColor[cand.reviewStatus]
                        }`}
                      >
                        {REVIEW_STATUS_LABELS[cand.reviewStatus]}
                      </span>
                    </div>

                    {cand.isDemoFixture && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100/80 text-amber-900 text-[10px] font-semibold">
                        <Sparkles className="w-3 h-3" />
                        <span>예제 추출 결과 (가상 도면 고정 Fixture)</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <div>
                        <div className="text-[10px] text-slate-500">
                          도면 기재 원문값
                        </div>
                        <div className="font-semibold text-slate-800">
                          {cand.rawValue}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">
                          {cand.reviewStatus === "edited"
                            ? "설계자 수정 확정값"
                            : "정규화 수치"}
                        </div>
                        <div className="font-bold text-blue-700">
                          {cand.reviewStatus === "edited" &&
                          cand.reviewerValue !== null
                            ? `${cand.reviewerValue} ${cand.unit || ""}`
                            : cand.normalizedValue !== null
                            ? `${cand.normalizedValue} ${cand.unit || ""}`
                            : "미확인(null)"}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-600 bg-slate-50/60 px-2.5 py-1.5 rounded border border-slate-100">
                      <span className="font-semibold text-slate-700">
                        원문:{" "}
                      </span>
                      {cand.rawText}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                        <MapPin className="w-3 h-3" />
                        {cand.pdfBboxPt
                          ? "클릭 시 도면 근거 bbox 강조"
                          : "bbox 없음 (클릭 시 페이지 이동·원문 검색)"}
                      </span>
                      <span>
                        참고 신뢰도:{" "}
                        {cand.confidence !== null
                          ? `${Math.round(cand.confidence * 100)}%`
                          : "미제공"}
                      </span>
                    </div>

                    {isEditing && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 space-y-2"
                      >
                        <div>
                          <label className="block text-[10px] font-semibold text-blue-900 mb-1">
                            수정할 확정값 입력
                          </label>
                          <input
                            type="text"
                            value={editValueStr}
                            onChange={(e) => setEditValueStr(e.target.value)}
                            className="w-full px-2.5 py-1 text-xs border border-blue-300 rounded bg-white"
                          />
                        </div>
                        {cand.fieldKey === "floor_area_entry" && (
                          <div>
                            <label className="block text-[10px] font-semibold text-blue-900 mb-1">
                              적용 대상 층 선택
                            </label>
                            <select
                              value={targetFloorId}
                              onChange={(e) =>
                                setTargetFloorId(e.target.value)
                              }
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
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 text-[11px]"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => void submitEdit(cand)}
                            className="px-2.5 py-1 rounded bg-blue-600 text-white font-semibold text-[11px]"
                          >
                            수정 확정 및 반영
                          </button>
                        </div>
                      </div>
                    )}

                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="pt-1 flex items-center gap-1.5"
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
                        className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>확정·반영</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => startEditing(cand)}
                        className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-[11px] cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>수정</span>
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
                        className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-[11px] cursor-pointer"
                      >
                        <XCircle className="w-3 h-3" />
                        <span>반려</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </aside>
  );
}
