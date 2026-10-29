"use client";

import AuthShell, {
  authInputClass,
  authButtonClass,
} from "@/app/components/AuthShell";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    submitting.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) {
        throw new Error(data.error || "Unable to log in. Please try again.");
      }
      setPassword("");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to log in. Please try again.",
      );
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="login">
      <form
        onSubmit={handleSubmit}
        aria-busy={loading}
        className="flex flex-col gap-4"
      >
        <label htmlFor="email" className="text-sm font-medium">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Email address"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError("");
          }}
          required
          disabled={loading}
          className={authInputClass}
          aria-describedby={error ? "login-error" : undefined}
        />
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError("");
          }}
          required
          disabled={loading}
          className={authInputClass}
          aria-describedby={error ? "login-error" : undefined}
        />
        {error && (
          <p id="login-error" role="alert" className="text-red-500">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className={authButtonClass}>
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
    </AuthShell>
  );
}
