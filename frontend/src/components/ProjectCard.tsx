"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectMeta } from "@/lib/projects";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type Props = {
  project: ProjectMeta;
  onResumeDraftPdp?: (project: ProjectMeta) => void;
};

export function ProjectCard({ project, onResumeDraftPdp }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const label = project.title || project.slug;
  const host = hostname(project.url);
  const created = formatDate(project.createdAt);
  const isResumableDraftPdp =
    project.kind === "pdp" &&
    project.status === "draft" &&
    typeof onResumeDraftPdp === "function";

  const cardClassName =
    "group relative flex h-full w-full max-w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm transition hover:shadow-md hover:-translate-y-0.5 hover:border-gray-300";

  const deleteButton = (
    <button
      type="button"
      title="Supprimer le projet"
      aria-label="Supprimer le projet"
      disabled={deleting}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (
          !window.confirm(
            "Supprimer ce projet ? Les fichiers associés (snapshots) seront définitivement effacés.",
          )
        ) {
          return;
        }
        setDeleting(true);
        try {
          const res = await fetch(`/api/projects/${encodeURIComponent(project.slug)}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error || res.statusText);
          }
          router.refresh();
        } catch (err) {
          console.error(err);
          window.alert("La suppression a échoué. Réessaie plus tard.");
        } finally {
          setDeleting(false);
        }
      }}
      className="absolute top-2 left-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-500 shadow-sm backdrop-blur transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3a2ff2] disabled:opacity-50"
    >
      {deleting ? (
        <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-gray-300" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6" />
        </svg>
      )}
    </button>
  );

  const cardContent = (
    <>
      <div className="relative h-32 w-full shrink-0 overflow-hidden bg-gray-50 sm:h-36">
        {project.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.thumbnailUrl}
            alt={label}
            className="h-full w-full object-contain p-2 transition-transform duration-500 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="2" />
              <path d="M21 16l-5-5-8 8" />
            </svg>
          </div>
        )}
        {project.status === "draft" ? (
          <span className="absolute top-2 right-2 z-10 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow">
            {project.kind === "pdp" ? "PDP à finaliser" : "Brouillon"}
          </span>
        ) : project.hasRedesign ? (
          <span className="absolute top-2 right-2 z-10 rounded-full bg-[#3a2ff2] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow">
            Redesign
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-[12px] font-semibold leading-snug text-gray-900 sm:text-[13px]">
          {label}
        </h3>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 sm:text-[11px]">
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" />
          </svg>
          <span className="truncate">{host}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500 sm:text-[11px]">
          <span>{project.imageCount} images</span>
          {project.status === "draft" ? (
            <span>· en attente CSV final</span>
          ) : project.csvPairs > 0 ? (
            <span>· {project.csvPairs} paires</span>
          ) : null}
          {created && <span className="ml-auto shrink-0">{created}</span>}
        </div>
      </div>
    </>
  );

  if (isResumableDraftPdp) {
    return (
      <div className={cardClassName}>
        {deleteButton}
        <button
          type="button"
          onClick={() => onResumeDraftPdp(project)}
          className="flex w-full min-w-0 flex-1 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3a2ff2]"
        >
          {cardContent}
        </button>
      </div>
    );
  }

  return (
    <div className={cardClassName}>
      {deleteButton}
      <Link
        href={`/projects/${project.slug}`}
        className="flex min-w-0 flex-1 flex-col no-underline text-inherit outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3a2ff2] rounded-xl"
      >
        {cardContent}
      </Link>
    </div>
  );
}
