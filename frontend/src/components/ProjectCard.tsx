import Link from "next/link";
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

export function ProjectCard({ project }: { project: ProjectMeta }) {
  const label = project.title || project.slug;
  const host = hostname(project.url);
  const created = formatDate(project.createdAt);

  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-lg hover:-translate-y-0.5 hover:border-gray-300"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-50">
        {project.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.thumbnailUrl}
            alt={label}
            className="h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <svg
              viewBox="0 0 24 24"
              className="h-10 w-10"
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
          <span className="absolute top-3 right-3 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
            Brouillon
          </span>
        ) : project.hasRedesign ? (
          <span className="absolute top-3 right-3 rounded-full bg-[#3a2ff2] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
            Redesign
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 p-5">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-gray-900">
          {label}
        </h3>
        <div className="flex items-center gap-2 text-[12px] text-gray-500">
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" />
          </svg>
          <span className="truncate">{host}</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-500">
          <span>{project.imageCount} images</span>
          {project.status === "draft" ? (
            <span>· en attente CSV final</span>
          ) : project.csvPairs > 0 ? (
            <span>· {project.csvPairs} paires</span>
          ) : null}
          {created && <span className="ml-auto">{created}</span>}
        </div>
      </div>
    </Link>
  );
}
