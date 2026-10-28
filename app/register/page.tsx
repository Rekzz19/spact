"use client";

import { useRef, useState } from "react";
import AuthShell, {
  authInputClass,
  authButtonClass,
} from "@/app/components/AuthShell";

export default function Register() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const trimmedEmail = email.trim();
    setMessage("");
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    submitting.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to register. Please try again.");
      }
      setEmail(trimmedEmail);
      setMessage(
        data.message ||
          "Check your email and follow the confirmation link to complete registration.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to register. Please try again.",
      );
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="register">
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
          placeholder="you@example.com"
          className={authInputClass}
          aria-describedby={
            error ? "register-error" : message ? "register-status" : undefined
          }
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError("");
            setMessage("");
          }}
          required
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || Boolean(message)}
          className={authButtonClass}
        >
          {loading
            ? "Sending confirmation link..."
            : message
              ? "Check your inbox"
              : "Create account"}
        </button>
        {message && (
          <p
            id="register-status"
            role="status"
            className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm leading-relaxed text-blue-700 dark:text-blue-300"
          >
            {message}
          </p>
        )}
        {error && (
          <p id="register-error" role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
      </form>
    </AuthShell>
  );
}
