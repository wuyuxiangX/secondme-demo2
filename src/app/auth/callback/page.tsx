"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { handleCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const errorParam = searchParams.get("error");

      if (errorParam) {
        setError(`授权失败: ${errorParam}`);
        setProcessing(false);
        return;
      }

      if (!code || !state) {
        setError("缺少授权码或状态参数");
        setProcessing(false);
        return;
      }

      try {
        await handleCallback(code, state);
        router.push("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : "认证失败");
        setProcessing(false);
      }
    };

    processCallback();
  }, [searchParams, handleCallback, router]);

  return (
    <>
      {error ? (
        <>
          <div className="error">{error}</div>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => router.push("/")}>
            返回首页
          </button>
        </>
      ) : processing ? (
        <>
          <div className="loading">
            <div className="spinner"></div>
          </div>
          <p className="text-center mt-4" style={{ color: "#666" }}>
            正在处理授权...
          </p>
        </>
      ) : null}
    </>
  );
}

function LoadingFallback() {
  return (
    <>
      <div className="loading">
        <div className="spinner"></div>
      </div>
      <p className="text-center mt-4" style={{ color: "#666" }}>
        加载中...
      </p>
    </>
  );
}

export default function AuthCallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="card" style={{ minWidth: "400px" }}>
        <h1 className="text-center mb-4" style={{ fontSize: "24px", color: "#333" }}>
          OAuth 认证
        </h1>
        <Suspense fallback={<LoadingFallback />}>
          <CallbackContent />
        </Suspense>
      </div>
    </div>
  );
}
