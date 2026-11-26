"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { Brand } from "./Brand";
import { safeAuthNext } from "../shared/auth-next";
export function Auth({
  configured,
  confirmationFailed = false,
  next,
}: {
  configured: boolean;
  confirmationFailed?: boolean;
  next?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "recover">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(
    confirmationFailed
      ? "The confirmation link could not be verified. Check that it is current, then try signing in."
      : "",
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(form),
          ...(mode !== "recover" && safeAuthNext(next) !== "/projects"
            ? { next: safeAuthNext(next) }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.signedIn) router.push(safeAuthNext(next));
      else setMessage(data.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="site-header">
        <Brand />
        <Link
          href={safeAuthNext(next) === "/create" ? "/create" : "/"}
          className="text-link"
        >
          <ArrowLeft size={15} />{" "}
          {safeAuthNext(next) === "/create"
            ? "Back to your video"
            : "Back home"}
        </Link>
      </header>
      <main className="auth-layout">
        <div className="auth-intro">
          <div className="eyebrow">YOUR NEXT GREAT FIRST IMPRESSION</div>
          <h1>
            Your work.
            <br />
            <em>In the spotlight.</em>
          </h1>
          <p>Give every redesign a reveal worth sharing.</p>
          <div className="auth-art">
            <span>before</span>
            <ArrowRight size={32} />
            <strong>after.</strong>
          </div>
        </div>
        <section className="auth-card">
          <div className="eyebrow">WELCOME TO DEMOPOP</div>
          <h2>
            {mode === "recover"
              ? "Get back to your work."
              : mode === "login"
                ? "Welcome back."
                : "Make something pop."}
          </h2>
          <p>
            {mode === "recover"
              ? "Enter your account email to request a password recovery link."
              : mode === "login"
                ? "Sign in to pick up where you left off."
                : "Create an account to save and export your videos."}
          </p>
          {!configured && (
            <div className="notice">
              Account features need Supabase setup.{" "}
              <Link href="/editor/new">Explore the local editor →</Link>
            </div>
          )}
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@yourstudio.com"
                disabled={!configured}
              />
            </label>
            {mode !== "recover" && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  placeholder="At least 8 characters"
                  disabled={!configured}
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
            <button className="button primary" disabled={!configured || busy}>
              {busy
                ? "Please wait…"
                : mode === "recover"
                  ? "Send recovery link"
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
              <ArrowRight size={17} />
            </button>
          </form>
          {mode === "login" && (
            <button
              className="text-link recovery-link"
              onClick={() => {
                setMode("recover");
                setError("");
                setMessage("");
              }}
            >
              Forgot password?
            </button>
          )}
          <p className="auth-switch">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
                setMessage("");
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </section>
      </main>
    </>
  );
}
