"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CloudOff,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useAppAuth } from "@/components/providers/auth-provider";
import { useWorkspaceStore } from "@/store/workspace-store";

export function ModeAndAuthGate({ children }: { children: React.ReactNode }) {
  const {
    envConfig,
    user,
    ownerEmail,
    authLoading,
    signInEmail,
    signUpEmail,
    sendResetEmail,
    logout,
  } = useAppAuth();

  const autoSaveStatus = useWorkspaceStore((s) => s.autoSaveStatus);
  const autoSaveError = useWorkspaceStore((s) => s.autoSaveError);
  const retrySave = useWorkspaceStore((s) => s.retrySave);

  const [authTab, setAuthTab] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 1. 환경변수 설정 오류 화면 (실제 모드에서 설정 누락 시 데모 모드로 자동 전환하지 않음)
  if (!envConfig.isValid) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-slate-900 border border-red-500/40 rounded-xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle className="w-7 h-7 shrink-0" />
            <h1 className="text-lg font-bold">
              실행 모드({envConfig.mode.toUpperCase()}) 환경변수 설정 오류
            </h1>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            현재 <code className="text-amber-300">NEXT_PUBLIC_APP_MODE={envConfig.mode}</code>로
            설정되어 있으나 필수 외부 서비스 설정값이 누락되었습니다. 보안 원칙에 따라 실제 모드에서 데모 모드로 자동 우회하지 않습니다.
          </p>
          <ul className="bg-slate-950/90 border border-slate-800 rounded-lg p-4 space-y-1.5 text-xs text-red-300 font-mono">
            {envConfig.errors.map((err, i) => (
              <li key={i}>• {err}</li>
            ))}
          </ul>
          <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-800">
            <p>
              • 외부 서비스 없이 즉시 실행하려면 <code>.env.local</code>에서{" "}
              <code>NEXT_PUBLIC_APP_MODE=demo</code>로 설정하세요.
            </p>
            <p>
              • 실제 Firebase 및 Gemini API를 연결하려면 <code>.env.example</code>과{" "}
              <code>README.md</code>를 참고하여 환경변수를 입력하세요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. 실제 모드(live) 인증 대기 및 로그인 화면
  if (envConfig.mode === "live") {
    if (authLoading) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="flex items-center gap-2 text-slate-600 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span>Firebase 인증 세션 확인 중...</span>
          </div>
        </div>
      );
    }

    if (!user) {
      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        setFormNotice(null);
        setSubmitting(true);
        try {
          if (authTab === "login") {
            await signInEmail(email.trim(), password);
          } else if (authTab === "signup") {
            await signUpEmail(email.trim(), password);
          } else {
            await sendResetEmail(email.trim());
            setFormNotice(
              "비밀번호 재설정 안내 메일을 발송했습니다. 받은편지함을 확인하세요."
            );
          }
        } catch (err: unknown) {
          setFormError(
            err instanceof Error
              ? err.message
              : "인증 요청 처리 중 오류가 발생했습니다."
          );
        } finally {
          setSubmitting(false);
        }
      };

      return (
        <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-6">
          <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                  면
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900">면적노트</h1>
                  <p className="text-xs text-slate-500">
                    건축사사무소 인허가 면적 검토 워크스페이스
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                실제 모드 (LIVE)
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setAuthTab("login")}
                className={`py-1.5 rounded-md ${
                  authTab === "login"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                로그인
              </button>
              <button
                type="button"
                onClick={() => setAuthTab("signup")}
                className={`py-1.5 rounded-md ${
                  authTab === "signup"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                회원가입
              </button>
              <button
                type="button"
                onClick={() => setAuthTab("reset")}
                className={`py-1.5 rounded-md ${
                  authTab === "reset"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                비밀번호 재설정
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  이메일 주소
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="architect@office.kr"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {authTab !== "reset" && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    비밀번호 (6자 이상)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {formError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {formError}
                </div>
              )}
              {formNotice && (
                <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
                  {formNotice}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
              >
                {submitting
                  ? "처리 중..."
                  : authTab === "login"
                  ? "이메일로 로그인"
                  : authTab === "signup"
                  ? "새 계정 생성"
                  : "비밀번호 재설정 메일 보내기"}
              </button>
            </form>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 상단 글로벌 헤더: 현재 모드(DEMO/LIVE), 자동 저장 상태, 핵심 가치 안내 표시 */}
      <header className="h-13 bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-base tracking-tight hover:text-blue-300 transition"
          >
            <Building2 className="w-5 h-5 text-blue-400" />
            <span>면적노트</span>
          </Link>

          {envConfig.mode === "demo" ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/40">
              데모 모드 (DEMO · 브라우저 IndexedDB 저장 · 외부 AI 미호출)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
              <ShieldCheck className="w-3.5 h-3.5" />
              실제 모드 (LIVE · Firebase 격리 · Gemini 서버 분석)
            </span>
          )}

          <span className="hidden xl:inline text-xs text-slate-400">
            도면의 정보를 자동으로 옮겨 적고, 서로 다른 자료의 면적값을 비교하여 검토 시간을 줄입니다 (법정 면적 자동 확정 아님)
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {/* 자동 저장 상태 표시: 저장 중 / 저장 완료 / 저장 실패 / 다시 시도 */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800 border border-slate-700">
            {autoSaveStatus === "saving" && (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                <span className="text-blue-300">저장 중...</span>
              </>
            )}
            {(autoSaveStatus === "saved" || autoSaveStatus === "idle") && (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-300">저장 완료</span>
              </>
            )}
            {autoSaveStatus === "error" && (
              <div className="flex items-center gap-2">
                <CloudOff className="w-3.5 h-3.5 text-red-400" />
                <span className="text-red-300" title={autoSaveError || ""}>
                  저장 실패
                </span>
                <button
                  type="button"
                  onClick={() => void retrySave()}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-semibold"
                >
                  <RefreshCw className="w-3 h-3" />
                  다시 시도
                </button>
              </div>
            )}
          </div>

          <div className="text-slate-300 hidden sm:block">{ownerEmail}</div>

          {envConfig.mode === "live" && user && (
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>로그아웃</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0">{children}</main>
    </div>
  );
}
