"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function handleLogout() {
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const data = await response.json();
      if (!response.ok || data.success !== true) {
        throw new Error(data.error || "Unable to log out. Please try again.");
      }
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to log out. Please try again.",
      );
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-4 py-2 text-sm hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-900"
      >
        {loading ? "Logging out..." : "Log out"}
      </button>
      {error && (
        <p role="alert" className="max-w-xs text-right text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
