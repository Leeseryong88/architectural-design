"use client";

import React, { useState } from "react";
import { Plus, Trash2, Info } from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { FLOOR_CATEGORY_LABELS, type FloorCategory } from "@/types/domain";

/**
 * 숫자 입력과 미입력(null)을 명확히 구분하는 헬퍼:
 * 빈 문자열("")이면 null, "0"이면 숫자 0을 반환한다.
 */
function parseNullableNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
}

function formatNullableInput(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return "";
  return String(val);
}

export function ProjectBasicInfoTab() {
  const bundle = useWorkspaceStore((s) => s.bundle);
  const aggregation = useWorkspaceStore((s) => s.aggregation);
  const updateProjectAndBuilding = useWorkspaceStore(
    (s) => s.updateProjectAndBuilding
  );
  const addFloor = useWorkspaceStore((s) => s.addFloor);
  const removeFloor = useWorkspaceStore((s) => s.removeFloor);

  const [newFloorLabel, setNewFloorLabel] = useState("");
  const [newFloorOrder, setNewFloorOrder] = useState("3");
  const [newFloorCategory, setNewFloorCategory] =
    useState<FloorCategory>("ground");
  const [newFloorUse, setNewFloorUse] = useState("제2종근린생활시설");

  if (!bundle || !aggregation) return null;
  const { project, building, floors } = bundle;

  const handleAddFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFloorLabel.trim()) return;
    await addFloor({
      label: newFloorLabel.trim(),
      orderIndex: Number(newFloorOrder) || 1,
      category: newFloorCategory,
      mainUse: newFloorUse.trim() || "근린생활시설",
      structure: building.mainStructure || "철근콘크리트조",
      statedFloorArea: null,
      statedAreaCategory: "바닥면적",
    });
    setNewFloorLabel("");
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 overflow-y-auto">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3 text-xs text-blue-900">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">
            설계자 확인 원칙: 대지면적·건축면적은 미입력(빈칸)과 0을 엄격히 구분하며, 법정 건폐율·용적률 한도를 시스템이 임의로 기본 입력하지 않습니다.
          </p>
          <p className="text-blue-800">
            1층 바닥면적을 건축면적으로 자동 가정하지 않습니다. 건폐율 산출을 위해서는 도면 검토 후 확인된 건축면적을 아래에 직접 입력하거나 건축개요 추출 후보를 확정하세요.
          </p>
        </div>
      </div>

      {/* 1. 프로젝트 및 대지 정보 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
          1. 프로젝트 및 대지 기본정보
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              프로젝트 이름
            </label>
            <input
              type="text"
              value={project.name}
              onChange={(e) =>
                void updateProjectAndBuilding({ name: e.target.value }, {})
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              대지 위치
            </label>
            <input
              type="text"
              value={project.siteLocation}
              onChange={(e) =>
                void updateProjectAndBuilding(
                  { siteLocation: e.target.value },
                  {}
                )
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              확정 대지면적 (㎡) —{" "}
              <span className="text-slate-500 font-normal">
                현재 상태:{" "}
                {project.siteArea === null
                  ? "미입력 (비율 계산 보류)"
                  : `${project.siteArea} ㎡`}
              </span>
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="미입력 (빈칸 유지 시 미입력 처리)"
              value={formatNullableInput(project.siteArea)}
              onChange={(e) =>
                void updateProjectAndBuilding(
                  { siteArea: parseNullableNumber(e.target.value) },
                  {}
                )
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              선택 입력: 사용자 확인 건축면적 (㎡) —{" "}
              <span className="text-slate-500 font-normal">
                현재 상태:{" "}
                {project.userConfirmedBuildingArea === null
                  ? "미입력"
                  : `${project.userConfirmedBuildingArea} ㎡`}
              </span>
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="미입력 (확인된 건축면적만 입력)"
              value={formatNullableInput(project.userConfirmedBuildingArea)}
              onChange={(e) =>
                void updateProjectAndBuilding(
                  {
                    userConfirmedBuildingArea: parseNullableNumber(
                      e.target.value
                    ),
                  },
                  {}
                )
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              수치 비교 허용오차 (㎡, 사용자 설정)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={project.comparisonToleranceSqm}
              onChange={(e) =>
                void updateProjectAndBuilding(
                  {
                    comparisonToleranceSqm: Math.max(
                      0,
                      Number(e.target.value) || 0
                    ),
                  },
                  {}
                )
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              ※ 문서 간 면적 비교 시 경고를 표시하는 검토용 기준값이며, 법정 허용오차가 아닙니다.
            </p>
          </div>
        </div>
      </div>

      {/* 2. 동(Building) 기본정보 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
          2. 건축물 동(Building) 정보 (단일 동 지원 · 독립 엔티티)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              동 이름
            </label>
            <input
              type="text"
              value={building.name}
              onChange={(e) =>
                void updateProjectAndBuilding({}, { name: e.target.value })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              주용도
            </label>
            <input
              type="text"
              value={building.mainUse}
              onChange={(e) =>
                void updateProjectAndBuilding({}, { mainUse: e.target.value })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              주구조
            </label>
            <input
              type="text"
              value={building.mainStructure}
              onChange={(e) =>
                void updateProjectAndBuilding(
                  {},
                  { mainStructure: e.target.value }
                )
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              도면 기재 연면적 (비교 기준값, ㎡)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="미입력"
              value={formatNullableInput(building.statedTotalFloorArea)}
              onChange={(e) => {
                const v = parseNullableNumber(e.target.value);
                void updateProjectAndBuilding(
                  { statedGrossFloorArea: v },
                  { statedTotalFloorArea: v }
                );
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              도면 기재 용적률 산정용 연면적 (비교 기준값, ㎡)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="미입력"
              value={formatNullableInput(building.statedFarFloorArea)}
              onChange={(e) => {
                const v = parseNullableNumber(e.target.value);
                void updateProjectAndBuilding(
                  { statedFarGrossFloorArea: v },
                  { statedFarFloorArea: v }
                );
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* 3. 선택 입력: 법정 건폐율·용적률 한도와 근거 & 적용 법규 메모 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
          3. 법정 건폐율·용적률 한도(선택 입력) 및 적용 법규 메모
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              선택 입력: 법정 건폐율 한도 (%)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="미입력 (관할 조례 확인 후 직접 입력)"
              value={formatNullableInput(project.statutoryCoverageLimit)}
              onChange={(e) =>
                void updateProjectAndBuilding(
                  {
                    statutoryCoverageLimit: parseNullableNumber(e.target.value),
                  },
                  {}
                )
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              건폐율 한도 근거 (조례 조항 등)
            </label>
            <input
              type="text"
              placeholder="예: 서울특별시 도시계획 조례 제54조 (제2종일반주거지역 60%)"
              value={project.statutoryCoverageBasis}
              onChange={(e) =>
                void updateProjectAndBuilding(
                  { statutoryCoverageBasis: e.target.value },
                  {}
                )
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              선택 입력: 법정 용적률 한도 (%)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="미입력 (관할 조례 확인 후 직접 입력)"
              value={formatNullableInput(project.statutoryFarLimit)}
              onChange={(e) =>
                void updateProjectAndBuilding(
                  { statutoryFarLimit: parseNullableNumber(e.target.value) },
                  {}
                )
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              용적률 한도 근거 (조례 조항 등)
            </label>
            <input
              type="text"
              placeholder="예: 서울특별시 도시계획 조례 제55조 (제2종일반주거지역 200%)"
              value={project.statutoryFarBasis}
              onChange={(e) =>
                void updateProjectAndBuilding(
                  { statutoryFarBasis: e.target.value },
                  {}
                )
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              적용 법규 및 특이사항 메모
            </label>
            <textarea
              rows={3}
              value={project.regulationMemo}
              onChange={(e) =>
                void updateProjectAndBuilding(
                  { regulationMemo: e.target.value },
                  {}
                )
              }
              placeholder="인허가 검토 시 참고할 법령/조례 메모를 기록하세요."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* 4. 층(Floor) 목록 관리 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
          4. 층별 목록 및 도면 기재 바닥면적(비교용) 관리
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <th className="py-2.5 px-3 text-left">층 명칭</th>
                <th className="py-2.5 px-3 text-left">구분</th>
                <th className="py-2.5 px-3 text-left">층 순서(정렬)</th>
                <th className="py-2.5 px-3 text-left">주용도</th>
                <th className="py-2.5 px-3 text-left">도면 기재 바닥면적(㎡)</th>
                <th className="py-2.5 px-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {floors.map((fl) => (
                <tr key={fl.id}>
                  <td className="py-2 px-3 font-semibold">{fl.label}</td>
                  <td className="py-2 px-3">
                    <select
                      value={fl.category}
                      onChange={(e) => {
                        const updated = floors.map((f) =>
                          f.id === fl.id
                            ? {
                                ...f,
                                category: e.target.value as FloorCategory,
                              }
                            : f
                        );
                        void updateProjectAndBuilding({}, {}, updated);
                      }}
                      className="px-2 py-1 border border-slate-300 rounded"
                    >
                      {Object.entries(FLOOR_CATEGORY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      value={fl.orderIndex}
                      onChange={(e) => {
                        const updated = floors.map((f) =>
                          f.id === fl.id
                            ? { ...f, orderIndex: Number(e.target.value) || 0 }
                            : f
                        );
                        void updateProjectAndBuilding({}, {}, updated);
                      }}
                      className="w-20 px-2 py-1 border border-slate-300 rounded"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={fl.mainUse}
                      onChange={(e) => {
                        const updated = floors.map((f) =>
                          f.id === fl.id ? { ...f, mainUse: e.target.value } : f
                        );
                        void updateProjectAndBuilding({}, {}, updated);
                      }}
                      className="w-full px-2 py-1 border border-slate-300 rounded"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="미입력"
                      value={formatNullableInput(fl.statedFloorArea)}
                      onChange={(e) => {
                        const updated = floors.map((f) =>
                          f.id === fl.id
                            ? {
                                ...f,
                                statedFloorArea: parseNullableNumber(
                                  e.target.value
                                ),
                              }
                            : f
                        );
                        void updateProjectAndBuilding({}, {}, updated);
                      }}
                      className="w-32 px-2 py-1 border border-slate-300 rounded"
                    />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => void removeFloor(fl.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                      title="층 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form
          onSubmit={handleAddFloor}
          className="pt-3 border-t border-slate-200 flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              새 층 명칭 (예: 3F, 옥탑1층)
            </label>
            <input
              type="text"
              required
              value={newFloorLabel}
              onChange={(e) => setNewFloorLabel(e.target.value)}
              placeholder="3F"
              className="w-28 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              층 구분
            </label>
            <select
              value={newFloorCategory}
              onChange={(e) =>
                setNewFloorCategory(e.target.value as FloorCategory)
              }
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            >
              {Object.entries(FLOOR_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              정렬 순서 (지하 음수, 지상 양수)
            </label>
            <input
              type="number"
              value={newFloorOrder}
              onChange={(e) => setNewFloorOrder(e.target.value)}
              className="w-24 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              층 주용도
            </label>
            <input
              type="text"
              value={newFloorUse}
              onChange={(e) => setNewFloorUse(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>층 추가</span>
          </button>
        </form>
      </div>
    </div>
  );
}
