"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Plus,
  ArrowUpRight,
  Film,
  LogOut,
  ArrowRight,
  Copy,
  Trash2,
  RotateCcw,
  Search,
  Monitor,
  Smartphone,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";
import { Brand } from "./Brand";
import { TEMPLATES } from "../shared/project";
import styles from "./projects.module.css";

type ProjectSummary = {
  id: string;
  name: string;
  updated_at: string;
  format?: string;
  template?: string;
  client?: string;
  duration?: number;
};
type ProjectError = {
  message: string;
  status?: number;
  source: "load" | "action";
};
class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
function updatedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}
export function Projects({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<ProjectError | null>(null);
  const [trash, setTrash] = useState(false),
    [query, setQuery] = useState(""),
    [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [folder, setFolder] = useState("");
  useEffect(() => {
    if (!configured) return;
    let live = true;
    setLoading(true);
    const controller = new AbortController();
    setError(null);
    fetch(`/api/projects${trash ? "?trash=1" : ""}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok)
          throw new RequestError(
            data.error || "Your projects could not load. Please try again.",
            r.status,
          );
        if (live) setProjects(data.projects);
      })
      .catch((e) => {
        if (live)
          setError({
            message:
              e instanceof RequestError
                ? e.message
                : "Your projects could not load. Check your connection and try again.",
            status: e instanceof RequestError ? e.status : undefined,
            source: "load",
          });
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [configured, trash, revision]);
  async function manage(id: string, action: "duplicate" | "trash" | "restore") {
    if (
      action === "trash" &&
      !window.confirm(
        "Move this project to trash? You can restore it before the retention period ends.",
      )
    )
      return;
    setBusy(id);
    setError(null);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${id}/${action}`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok)
        throw new RequestError(
          data.error || "That change could not be completed. Please try again.",
          response.status,
        );
      setRevision((x) => x + 1);
      setMessage(
        action === "duplicate"
          ? "Project duplicated. The copy is ready to open."
          : action === "trash"
            ? "Project moved to trash."
            : "Project restored.",
      );
    } catch (failure) {
      setError({
        message:
          failure instanceof RequestError
            ? failure.message
            : "Check your connection and try that change again.",
        status: failure instanceof RequestError ? failure.status : undefined,
        source: "action",
      });
    } finally {
      setBusy(null);
    }
  }
  async function signOut() {
    setError(null);
    setSigningOut(true);
    try {
      const r = await fetch("/api/auth/logout", { method: "POST" });
      if (!r.ok)
        throw new RequestError("Sign out failed. Please retry.", r.status);
      router.push("/");
    } catch (e) {
      setError({
        message:
          e instanceof RequestError
            ? e.message
            : "Sign out could not finish. Check your connection and try again.",
        status: e instanceof RequestError ? e.status : undefined,
        source: "action",
      });
    } finally {
      setSigningOut(false);
    }
  }
  const matchingProjects = projects.filter(
    (project) =>
      `${project.name} ${project.client || ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (!folder ||
        (folder === "__unfiled" ? !project.client : project.client === folder)),
  );
  const folders = [
    ...new Set(
      projects
        .map((project) => project.client)
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort((a, b) => a.localeCompare(b));
  return (
    <div className={styles.page}>
      <header className={`site-header ${styles.header}`}>
        <Brand />
        <nav aria-label="Workspace navigation">
          <Link href="/billing" className="text-link">
            Billing <ArrowUpRight size={15} />
          </Link>
          <Link href="/editor/new" className="text-link">
            New video <Plus size={16} />
          </Link>
          {configured ? (
            <button
              className="icon-text"
              onClick={signOut}
              disabled={signingOut}
            >
              Sign out <LogOut size={16} />
            </button>
          ) : (
            <Link href="/auth">
              Sign in <ArrowUpRight size={15} />
            </Link>
          )}
        </nav>
      </header>
      <main className={styles.main}>
        <div className={styles.heading}>
          <div>
            <div className={styles.eyebrow}>
              <span /> YOUR CREATIVE CORNER
            </div>
            <h1>
              Your projects<span className="heading-dot">.</span>
            </h1>
            <p>
              Your client launches, ready for their next version. Or{" "}
              <Link href="/create" className="text-link">
                create a video from a link <ArrowUpRight size={12} />
              </Link>
              .
            </p>
          </div>
          <Link href="/editor/new" className="button primary">
            <Plus size={17} /> Create a video
          </Link>
        </div>
        {!configured && (
          <div className={styles.localNotice}>
            <Film size={20} />
            <div>
              <strong>Your local studio is ready.</strong>
              <p>
                Try the editor and recover drafts in this browser. Cloud
                projects and MP4 export aren’t connected in this workspace.
              </p>
            </div>
            <Link href="/editor/new">
              Try the editor <ArrowUpRight size={15} />
            </Link>
          </div>
        )}
        <div className={styles.toolbar}>
          <div className={styles.tabs} role="group" aria-label="Project view">
            <button
              aria-pressed={!trash}
              onClick={() => {
                setTrash(false);
                setMessage("");
              }}
            >
              <Film size={15} /> Projects
            </button>
            <button
              aria-pressed={trash}
              onClick={() => {
                setTrash(true);
                setMessage("");
              }}
            >
              <Trash2 size={14} /> Trash
            </button>
          </div>
          <div className={styles.search}>
            <Search size={16} />
            <input
              type="search"
              aria-label="Search projects"
              placeholder="Search projects"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {!!folders.length && (
          <nav className={styles.folders} aria-label="Client folders">
            <button aria-pressed={!folder} onClick={() => setFolder("")}>
              All clients <small>{projects.length}</small>
            </button>
            {folders.map((client) => (
              <button
                key={client}
                aria-pressed={folder === client}
                onClick={() => setFolder(client)}
              >
                {client}
                <small>
                  {
                    projects.filter((project) => project.client === client)
                      .length
                  }
                </small>
              </button>
            ))}
            <button
              aria-pressed={folder === "__unfiled"}
              onClick={() => setFolder("__unfiled")}
            >
              Unfiled
              <small>
                {projects.filter((project) => !project.client).length}
              </small>
            </button>
          </nav>
        )}
        {trash && (
          <p className={styles.trashNotice}>
            Trashed projects can be restored until your workspace retention
            cleanup runs. Active exports must finish before a project can be
            trashed.
          </p>
        )}
        {message && (
          <p role="status" className={styles.success}>
            <CheckMark /> {message}
          </p>
        )}
        {error && (
          <div className={styles.error} role="alert">
            <AlertCircle size={18} />
            <div>
              <strong>
                {error.status === 401
                  ? "Sign in to continue."
                  : error.source === "load"
                    ? "Your workspace is taking a moment."
                    : "That change could not be completed."}
              </strong>
              <p>{error.message}</p>
            </div>
            {error.status === 401 ? (
              <Link href="/auth" className="text-link">
                Sign in <ArrowUpRight size={15} />
              </Link>
            ) : error.source === "load" ? (
              <button
                className="text-link"
                onClick={() => setRevision((value) => value + 1)}
              >
                Try again <RotateCcw size={14} />
              </button>
            ) : (
              <button aria-label="Dismiss error" onClick={() => setError(null)}>
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {loading ? (
          <div className={styles.loading} role="status">
            <span>
              <Loader2 size={17} className="spin" /> Loading your projects…
            </span>
            <div aria-hidden="true">
              {[0, 1, 2].map((item) => (
                <div key={item} className={styles.skeleton}>
                  <i />
                  <div>
                    <i />
                    <i />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : error?.source === "load" ? null : projects.length ? (
          <div className={styles.projectList}>
            <div className={styles.listHeading}>
              <span>{trash ? "IN THE TRASH" : "YOUR WORK"}</span>
              <span>
                {matchingProjects.length}{" "}
                {matchingProjects.length === 1 ? "project" : "projects"}
                {query.trim() ? " found" : ""}
              </span>
            </div>
            {matchingProjects.map((p) => {
              const motion = TEMPLATES.find(
                (template) => template.id === p.template,
              )?.name;
              return (
                <article
                  className={`${styles.projectRow} ${trash ? styles.trashed : ""}`}
                  key={p.id}
                  aria-busy={busy === p.id}
                >
                  <div
                    className={`${styles.projectIcon} ${p.format === "landscape" ? styles.landscapeIcon : styles.portraitIcon}`}
                    aria-hidden="true"
                  >
                    <span>
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                  <div className={styles.projectInfo}>
                    <h2>
                      {trash ? (
                        p.name
                      ) : (
                        <Link href={`/editor/${p.id}`}>{p.name}</Link>
                      )}
                    </h2>
                    <div className={styles.metadata}>
                      {p.format === "vertical" ? (
                        <span>
                          <Smartphone size={12} />
                          Vertical
                        </span>
                      ) : p.format === "landscape" ? (
                        <span>
                          <Monitor size={13} />
                          Landscape
                        </span>
                      ) : (
                        <span>
                          <Film size={12} />
                          {p.format === "square" ? "Square" : "Video"}
                        </span>
                      )}
                      {p.client && (
                        <>
                          <i />
                          <span>{p.client}</span>
                        </>
                      )}
                      <i />
                      <span>{p.duration ?? 15}s</span>
                      {motion && (
                        <>
                          <i />
                          <span>{motion}</span>
                        </>
                      )}
                      <i />
                      <span>Updated {updatedDate(p.updated_at)}</span>
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    {trash ? (
                      <button
                        className="button secondary small"
                        onClick={() => void manage(p.id, "restore")}
                        disabled={!!busy}
                      >
                        <RotateCcw size={15} /> Restore
                      </button>
                    ) : (
                      <>
                        <Link
                          className={styles.openLink}
                          href={`/editor/${p.id}`}
                        >
                          Open project <ArrowUpRight size={16} />
                        </Link>
                        <button
                          className={styles.iconAction}
                          aria-label={`Duplicate ${p.name}`}
                          title="Duplicate project"
                          disabled={!!busy}
                          onClick={() => void manage(p.id, "duplicate")}
                        >
                          {busy === p.id ? (
                            <Loader2 size={16} className="spin" />
                          ) : (
                            <Copy size={16} />
                          )}
                        </button>
                        <button
                          className={`${styles.iconAction} ${styles.trashAction}`}
                          aria-label={`Move ${p.name} to trash`}
                          title="Move to trash"
                          disabled={!!busy}
                          onClick={() => void manage(p.id, "trash")}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
            {!matchingProjects.length && (
              <div className={styles.noResults}>
                <Search size={24} />
                <h2>No projects match that search.</h2>
                <p>
                  Try another name, or clear the search to see your projects.
                </p>
                <button className="text-link" onClick={() => setQuery("")}>
                  Clear search <X size={13} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyArt} aria-hidden="true">
              {trash ? (
                <Trash2 size={35} strokeWidth={1.3} />
              ) : (
                <>
                  <div>
                    <span>BEFORE</span>
                    <i />
                    <i />
                  </div>
                  <ArrowRight size={22} />
                  <div>
                    <span>AFTER</span>
                    <i />
                    <i />
                  </div>
                </>
              )}
            </div>
            <h2>
              {trash ? "Your trash is empty." : "Your first reveal is waiting."}
            </h2>
            <p>
              {trash
                ? "Projects you move to trash will appear here."
                : "Start with our sample, or bring your own before and after."}
            </p>
            {trash ? (
              <button className="text-link" onClick={() => setTrash(false)}>
                Back to projects <ArrowRight size={17} />
              </button>
            ) : (
              <Link href="/editor/new" className="button primary">
                Create your first video <ArrowRight size={17} />
              </Link>
            )}
          </div>
        )}
      </main>
      <div className={styles.workspaceFooter}>
        <span>YOUR IDEAS. YOUR WORK. YOUR NEXT REVEAL.</span>
        <span>
          Launch films & product stories <i /> Made yours
        </span>
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
