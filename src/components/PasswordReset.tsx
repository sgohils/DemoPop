"use client";
import { useState } from "react";
import Link from "next/link";
import { Brand } from "./Brand";

export function PasswordReset({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirm")) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: data.get("password") }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error);
      setDone(true);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="site-header">
        <Brand />
        <Link href="/auth">Back to sign-in</Link>
      </header>
      <main className="recovery-page auth-card">
        <h1>{done ? "Password updated." : "Choose a new password"}</h1>
        {done ? (
          <>
            <p>Your account is ready to use.</p>
            <Link href="/projects" className="button primary">
              Open projects
            </Link>
          </>
        ) : (
          <>
            <p>
              Open the password reset link in your email, then enter and confirm
              your new password.
            </p>
            {!configured && (
              <p className="notice">
                Password resets are currently unavailable. Please try again
                later.
              </p>
            )}
            <form onSubmit={submit}>
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  disabled={!configured || busy}
                />
              </label>
              <label>
                Confirm new password
                <input
                  name="confirm"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  disabled={!configured || busy}
                />
              </label>
              {error && (
                <p role="alert" className="error">
                  {error} <Link href="/auth">Request a new reset link</Link>
                </p>
              )}
              <button className="button primary" disabled={!configured || busy}>
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </main>
    </>
  );
}
