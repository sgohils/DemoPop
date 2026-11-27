"use client";
import { useState } from "react";

// Authenticate in place: navigating away to a separate form would lose local
// Files/blob URLs as well as unsaved captions and crop settings.
export function EditorSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    try {
      const result = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = await result.json();
      if (!result.ok || !data.signedIn)
        throw new Error(
          data.error || "We could not sign you in. Please try again.",
        );
      form.reset();
      onSignedIn();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="editor-signin" aria-labelledby="editor-signin-title">
      <div>
        <h2 id="editor-signin-title">Sign in to save and export</h2>
        <p>Your edits stay here while you sign in.</p>
      </div>
      <form onSubmit={submit}>
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            disabled={busy}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            maxLength={128}
            disabled={busy}
          />
        </label>
        <button className="button primary small" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p>
        New here?{" "}
        <a href="/auth" target="_blank" rel="noopener noreferrer">
          Create an account in a new tab
        </a>
        , then return here.
      </p>
    </section>
  );
}
