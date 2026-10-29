"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthShell, {
  authInputClass,
  authButtonClass,
} from "@/app/components/AuthShell";

export default function SetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        setError("Your session has expired. Please sign in.");
        return;
      }

      const session = await response.json();
      if (!session.authenticated || session.anonymous) {
        setError("Verify your email before setting a password.");
        return;
      }
      setAuthenticated(true);
    }

    checkSession().catch(() => {
      setError("Unable to verify your session.");
    });
  }, []);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
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
    <AuthShell mode="set-password">
      <form
        onSubmit={handleSubmit}
        aria-busy={loading}
        className="flex flex-col gap-4"
      >
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          disabled={loading}
          aria-describedby={error ? "password-error" : undefined}
          placeholder="Password (12+ characters)"
          value={password}
          minLength={12}
          maxLength={128}
          required
          onChange={(e) => setPassword(e.target.value)}
          className={authInputClass}
        />
        <label htmlFor="confirm-password" className="text-sm font-medium">
          Confirm password
        </label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          disabled={loading}
          aria-describedby={error ? "password-error" : undefined}
          placeholder="Confirm password"
          value={confirmPassword}
          required
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={authInputClass}
        />

        {error && (
          <p id="password-error" role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!authenticated || loading}
          className={authButtonClass}
        >
          {loading ? "Saving..." : "Set password"}
        </button>
      </form>
    </AuthShell>
  );
}
