"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Plus, ArrowUpRight, Film, LogOut, ArrowRight } from "lucide-react";
import { Brand } from "./Brand";
export function Projects({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [projects, setProjects] = useState<
    { id: string; name: string; updated_at: string }[]
  >([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!configured) return;
    fetch("/api/projects")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setProjects(data.projects);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [configured]);
  async function signOut() {
    setError("");
    try {
      const r = await fetch("/api/auth/logout", { method: "POST" });
      if (!r.ok) throw new Error("Sign out failed. Please retry.");
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <header className="site-header">
        <Brand />
        <nav>
          <Link href="/editor/new" className="text-link">
            New video <Plus size={16} />
          </Link>
          {configured ? (
            <button className="icon-text" onClick={signOut}>
              Sign out <LogOut size={16} />
            </button>
          ) : (
            <Link href="/auth">
              Sign in <ArrowUpRight size={15} />
            </Link>
          )}
        </nav>
      </header>
      <main className="projects-page">
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR CREATIVE CORNER</div>
            <h1>
              Your projects<span className="heading-dot">.</span>
            </h1>
            <p>Every transformation starts here.</p>
          </div>
          <Link href="/editor/new" className="button primary">
            <Plus size={17} /> Create a video
          </Link>
        </div>
        {!configured && (
          <div className="notice">
            Cloud project saving needs Supabase configuration. The local editor
            and sample rendering are ready to use.
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error} <Link href="/auth">Sign in →</Link>
          </div>
        )}
        {loading ? (
          <p role="status">Loading your projects…</p>
        ) : projects.length ? (
          <div className="project-list">
            {projects.map((p, i) => (
              <Link className="project-row" key={p.id} href={`/editor/${p.id}`}>
                <div className="project-icon">
                  <Film size={23} />
                </div>
                <div>
                  <span className="project-index">
                    PROJECT {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2>{p.name}</h2>
                  <span className="muted">
                    Updated{" "}
                    {new Date(p.updated_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <span className="row-end">
                  Open project <ArrowUpRight size={18} />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Film size={30} />
            </div>
            <h2>Your first reveal is waiting.</h2>
            <p>Start with our sample, or bring your own before and after.</p>
            <Link href="/editor/new" className="text-link">
              Create your first video <ArrowRight size={17} />
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
