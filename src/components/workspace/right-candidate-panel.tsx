"use client";

import React, { useMemo, useState } from "react";
import {
  Check,
  Edit3,
  XCircle,
  MapPin,
  Sparkles,
  Filter,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace-store";
import {
  CANDIDATE_FIELD_LABELS,
  REVIEW_STATUS_LABELS,
  ROW_TYPE_LABELS,
  type ExtractionCandidate,
  type ReviewStatus,
} from "@/types/domain";

export function RightCandidatePanel() {
  const bundle = useWorkspaceStore((s) => s.bundle);
  const activePageIndex = useWorkspaceStore((s) => s.activePageIndex);
  const selectedCandidateId = useWorkspaceStore((s) => s.selectedCandidateId);
  const focusCandidateEvidence = useWorkspaceStore(
    (s) => s.focusCandidateEvidence
  );
  const reviewCandidate = useWorkspaceStore((s) => s.reviewCandidate);

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
    <aside className="w-80 xl:w-96 bg-white border-l border-slate-200 flex flex-col shrink-0">
      {/* 상단 헤더 및 필터 */}
      <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-slate-50/70">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900">
            AI 추출 후보 및 근거 검토 ({candidates.length})
          </span>
          <span className="text-[11px] text-slate-500">
            미검토{" "}
            <strong className="text-amber-700">
              {
                bundle.candidates.filter((c) => c.reviewStatus === "pending")
                  .length
              }
            </strong>
            건
          </span>
        </div>

        <p className="text-[11px] text-slate-500 leading-snug">
          동일 항목의 서로 다른 페이지 수치는 각각 후보로 보존됩니다. 신뢰도는 참고값이며 자동 확정 기준으로 사용하지 않습니다.
        </p>

        <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-1" />
          <button
            type="button"
            onClick={() => setFilterScope("all")}
            className={`flex-1 py-1 rounded font-medium ${
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
            className={`flex-1 py-1 rounded font-medium ${
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
            className={`flex-1 py-1 rounded font-medium ${
              filterScope === "pending"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600"
            }`}
          >
            미검토만
          </button>
        </div>
      </div>

      {/* 후보 카드 리스트 */}
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
                {/* 상단: 필드명 + 출처 페이지 + 예제 표시 + 검토 상태 */}
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

                {/* 도면 기재값 & 정규화 수치 */}
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div>
                    <div className="text-[10px] text-slate-500">도면 기재 원문값</div>
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

                {/* 원문 전체 및 부가 메타 */}
                <div className="text-[11px] text-slate-600 bg-slate-50/60 px-2.5 py-1.5 rounded border border-slate-100">
                  <span className="font-semibold text-slate-700">원문: </span>
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

                {/* 수정 입력 폼 */}
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

                {/* 확정 / 수정 / 반려 액션 버튼 */}
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
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px]"
                  >
                    <Check className="w-3 h-3" />
                    <span>확정·반영</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => startEditing(cand)}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-[11px]"
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
                    className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-[11px]"
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
    </aside>
  );
}
