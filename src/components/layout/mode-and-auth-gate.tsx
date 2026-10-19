"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  CloudOff,
  FileCheck2,
  Layers,
  Loader2,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  Ruler,
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
    signInGoogle,
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
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  // 1. 환경변수 설정 오류 화면
  if (!envConfig.isValid) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-slate-900 border border-red-500/40 rounded-xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle className="w-7 h-7 shrink-0" />
            <h1 className="text-lg font-bold">환경변수 설정 확인 필요</h1>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            현재 <code className="text-amber-300">NEXT_PUBLIC_APP_MODE={envConfig.mode}</code>로
            설정되어 있으나 필수 외부 서비스 설정값이 누락되었습니다.
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
              • Firebase 및 Gemini API를 연결하려면 <code>.env.example</code>과{" "}
              <code>README.md</code>를 참고하여 환경변수를 입력하세요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. 인증 대기 및 로그인 화면
  if (envConfig.mode === "live") {
    if (authLoading) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-300 text-sm">
            <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            </div>
            <span className="text-xs tracking-wide text-slate-400">
              워크스페이스 인증 세션을 확인하고 있습니다...
            </span>
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

      const handleGoogleLogin = async () => {
        setFormError(null);
        setFormNotice(null);
        setGoogleSubmitting(true);
        try {
          await signInGoogle();
        } catch (err: unknown) {
          setFormError(
            err instanceof Error
              ? err.message
              : "Google 로그인 중 오류가 발생했습니다."
          );
        } finally {
          setGoogleSubmitting(false);
        }
      };

      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex">
          {/* 좌측 건축 도면 브랜딩 쇼케이스 영역 */}
          <div className="hidden lg:flex lg:w-[54%] relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-12 flex-col justify-between border-r border-slate-800/80">
            {/* 건축 도면 그리드 배경 패턴 */}
            <div
              className="absolute inset-0 opacity-[0.07] pointer-events-none"
              style={{
                backgroundImage:
                  "linear-gradient(to right, #60a5fa 1px, transparent 1px), linear-gradient(to bottom, #60a5fa 1px, transparent 1px)",
                backgroundSize: "36px 36px",
              }}
            />
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/15 blur-3xl pointer-events-none" />
            <div className="absolute bottom-12 right-12 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

            {/* 상단 로고 */}
            <div className="relative z-10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-600/30">
                면
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-white">
                  면적노트
                </span>
                <span className="ml-2 text-xs text-blue-300/80 font-medium">
                  ARCHITECTURAL AREA WORKSPACE
                </span>
              </div>
            </div>

            {/* 중앙 핵심 가치 소개 및 도면 일러스트 카드 */}
            <div className="relative z-10 max-w-xl space-y-8 my-auto">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-300 text-xs font-medium">
                  <Ruler className="w-3.5 h-3.5" />
                  <span>건축사사무소 인허가 면적 산출·검토 솔루션</span>
                </div>
                <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight tracking-tight">
                  도면의 수치를 옮겨 적고,
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
                    근거와 오차를 한눈에 검증하세요.
                  </span>
                </h2>
                <p className="text-sm text-slate-300/90 leading-relaxed">
                  건축개요·평면도·면적산출표 PDF에서 기재 수치를 추출하고,
                  도면 위 다각형 실측 면적과 대조하여 인허가 검토 시간을 줄입니다.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3.5">
                <div className="flex items-start gap-3.5 p-4 rounded-xl bg-slate-900/70 border border-slate-800/90 backdrop-blur-sm">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      도면 기재값 · 기하 실측값 · 확정 집계값 3원 분리
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      원본 도면 위치 근거(BBox) 확인부터 축척 보정·공제 영역 차감까지 하나의 뷰어에서 처리합니다.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-4 rounded-xl bg-slate-900/70 border border-slate-800/90 backdrop-blur-sm">
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0 mt-0.5">
                    <FileCheck2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      불일치 자동 검출 및 산정선 합성 PDF · 엑셀 출력
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      문서 간 연면적 차이와 누락된 제외 근거를 점검하고, 산정선이 합성된 검토용 도면과 산출표를 즉시 생성합니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 하단 안내 문구 */}
            <div className="relative z-10 flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-800/80">
              <span>© 면적노트 (Myeonjeok Note)</span>
              <span>설계자 검토 기반 인허가 면적 워크스페이스</span>
            </div>
          </div>

          {/* 우측 로그인 / 회원가입 폼 영역 */}
          <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 bg-white text-slate-900">
            <div className="w-full max-w-[400px] space-y-6">
              {/* 모바일 로고 헤더 */}
              <div className="flex lg:hidden items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  면
                </div>
                <div>
                  <h1 className="text-base font-bold text-slate-900">면적노트</h1>
                  <p className="text-[11px] text-slate-500">
                    건축사사무소 인허가 면적 검토 워크스페이스
                  </p>
                </div>
              </div>

              {/* 타이틀 */}
              <div className="space-y-1.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {authTab === "login"
                    ? "워크스페이스 로그인"
                    : authTab === "signup"
                    ? "새 계정 만들기"
                    : "비밀번호 재설정"}
                </h1>
                <p className="text-xs text-slate-500">
                  {authTab === "login"
                    ? "Google 계정 또는 이메일로 프로젝트를 불러오세요."
                    : authTab === "signup"
                    ? "건축사사무소 이메일 또는 Google 계정으로 시작하세요."
                    : "가입하신 이메일 주소를 입력하면 재설정 링크를 보내드립니다."}
                </p>
              </div>

              {/* Google 간편 로그인 버튼 */}
              {authTab !== "reset" && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={googleSubmitting || submitting}
                    className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-semibold rounded-xl border border-slate-300 shadow-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    {googleSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                    )}
                    <span>Google 계정으로 계속하기</span>
                  </button>

                  <div className="relative flex items-center justify-center">
                    <div className="border-t border-slate-200 w-full" />
                    <span className="bg-white px-3 text-[11px] font-medium text-slate-400 shrink-0">
                      또는 이메일로 계속
                    </span>
                    <div className="border-t border-slate-200 w-full" />
                  </div>
                </div>
              )}

              {/* 탭 전환 */}
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("login");
                    setFormError(null);
                    setFormNotice(null);
                  }}
                  className={`py-2 rounded-lg transition ${
                    authTab === "login"
                      ? "bg-white text-slate-900 shadow-xs font-semibold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  로그인
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("signup");
                    setFormError(null);
                    setFormNotice(null);
                  }}
                  className={`py-2 rounded-lg transition ${
                    authTab === "signup"
                      ? "bg-white text-slate-900 shadow-xs font-semibold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  회원가입
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("reset");
                    setFormError(null);
                    setFormNotice(null);
                  }}
                  className={`py-2 rounded-lg transition ${
                    authTab === "reset"
                      ? "bg-white text-slate-900 shadow-xs font-semibold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  비밀번호 찾기
                </button>
              </div>

              {/* 이메일 폼 */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    이메일 주소
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="architect@office.kr"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-50/60 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
                    />
                  </div>
                </div>

                {authTab !== "reset" && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      비밀번호
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="6자 이상 입력"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-50/60 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
                      />
                    </div>
                  </div>
                )}

                {formError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 leading-relaxed">
                    {formError}
                  </div>
                )}
                {formNotice && (
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-700 leading-relaxed">
                    {formNotice}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || googleSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm shadow-blue-600/20 transition cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>처리 중...</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {authTab === "login"
                          ? "이메일로 로그인"
                          : authTab === "signup"
                          ? "계정 생성하기"
                          : "재설정 링크 발송"}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* 상단 글로벌 헤더 */}
      <header className="h-13 bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-base tracking-tight hover:text-blue-300 transition"
          >
            <Building2 className="w-5 h-5 text-blue-400" />
            <span>면적노트</span>
          </Link>

          {envConfig.mode === "demo" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/40">
              데모 모드 (DEMO · 브라우저 IndexedDB 저장 · 외부 AI 미호출)
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

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">{children}</main>
    </div>
  );
}
