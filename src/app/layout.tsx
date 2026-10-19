import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ModeAndAuthGate } from "@/components/layout/mode-and-auth-gate";

export const metadata: Metadata = {
  title: "면적노트 | 건축사사무소 인허가 면적 비교·검토 SaaS",
  description:
    "도면의 정보를 자동으로 옮겨 적고, 서로 다른 자료의 면적값을 비교하여 검토 시간을 줄이는 건축 인허가 면적 검토 워크스페이스",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <AuthProvider>
          <ModeAndAuthGate>{children}</ModeAndAuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
