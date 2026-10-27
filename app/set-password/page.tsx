"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const response = await fetch("/api/auth/anonymous", {
        method: "POST",
      });

      if (!response.ok) {
        setError("Your session has expired. Please sign in.");
        return;
      }

      setAuthenticated(true);
    }

    checkSession().catch(() => {
      setError("Unable to verify your session.");
    });
  }, []);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    //could this potentially cuase an error.
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Password setup failed");
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-2 text-3xl font-bold">Welcome to Spact</h1>
      <p className="mb-6">Create a password to secure your account.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="password"
          placeholder="Password (12+ characters)"
          value={password}
          minLength={12}
          maxLength={128}
          required
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border p-3"
        />

        <input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          required
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="rounded-lg border p-3"
        />

        {error && <p className="text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={!authenticated || loading}
          className="rounded-lg bg-blue-600 p-3 text-white disabled:opacity-50"
        >
          {loading ? "Saving..." : "Set password"}
        </button>
      </form>
    </main>
  );
}
