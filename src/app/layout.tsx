import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "我的漫画人生 - 个人自传连环画生成器",
  description: "根据你的人生故事，生成专属于你的连环画自传",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
