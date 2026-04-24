"use client";

import { useEffect, useRef, useState } from "react";
import { NewProjectDialog } from "./NewProjectDialog";
import { NewPdpDialog } from "./NewPdpDialog";
import { ProjectCard } from "./ProjectCard";
import type { ProjectMeta } from "@/lib/projects";

type Props = {
  catalogProjects: ProjectMeta[];
  pdpProjects: ProjectMeta[];
  initialResumeCatalogSlug?: string | null;
  initialResumePdpSlug?: string | null;
};

export function ProjectsGrid({
  catalogProjects,
  pdpProjects,
  initialResumeCatalogSlug = null,
  initialResumePdpSlug = null,
}: Props) {
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [pdpDialogOpen, setPdpDialogOpen] = useState(false);
  const [resumePdpProject, setResumePdpProject] = useState<ProjectMeta | null>(
    null,
  );
  const [resumeCatalogProject, setResumeCatalogProject] =
    useState<ProjectMeta | null>(null);
  const urlOpenOnce = useRef(false);

  useEffect(() => {
    if (urlOpenOnce.current) return;
    if (initialResumeCatalogSlug) {
      const p = catalogProjects.find(
        (x) => x.slug === initialResumeCatalogSlug,
      );
      if (p?.status === "draft") {
        setResumeCatalogProject(p);
        setCatalogDialogOpen(true);
        urlOpenOnce.current = true;
        if (typeof window !== "undefined") {
          window.history.replaceState({}, "", "/");
        }
      }
    } else if (initialResumePdpSlug) {
      const p = pdpProjects.find((x) => x.slug === initialResumePdpSlug);
      if (p?.status === "draft") {
        setResumePdpProject(p);
        setPdpDialogOpen(true);
        urlOpenOnce.current = true;
        if (typeof window !== "undefined") {
          window.history.replaceState({}, "", "/");
        }
      }
    }
  }, [
    initialResumeCatalogSlug,
    initialResumePdpSlug,
    catalogProjects,
    pdpProjects,
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3a2ff2] text-white shadow-sm">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12l4-4 4 4 4-4 4 4" />
                <path d="M3 18h18" />
              </svg>
            </div>
            <div>
              <h1 className="text-[15px] font-semibold leading-tight text-gray-900">
                Redesign Studio
              </h1>
              <p className="text-[11px] leading-snug text-gray-500">
                Capture & redesign sur catalogue et page produit
              </p>
            </div>
          </div>

        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold uppercase tracking-wide text-gray-500">
            Catalogue
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-gray-400">
              {catalogProjects.length} projet
              {catalogProjects.length > 1 ? "s" : ""}
            </span>
            <button
              onClick={() => {
                setResumeCatalogProject(null);
                setCatalogDialogOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#3a2ff2] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#2a20d8]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nouveau Catalogue
            </button>
          </div>
        </div>

        {catalogProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white py-16 px-6 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="9" cy="10" r="2" />
                <path d="M21 16l-5-5-8 8" />
              </svg>
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900">
              Aucun catalogue pour le moment
            </h3>
            <p className="mt-1 text-[13px] text-gray-500">
              Lance ton premier catalogue en cliquant sur « Nouveau Catalogue ».
            </p>
            <button
              onClick={() => {
                setResumeCatalogProject(null);
                setCatalogDialogOpen(true);
              }}
              className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[#3a2ff2] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:bg-[#2a20d8]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nouveau Catalogue
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {catalogProjects.map((project) => (
              <ProjectCard
                key={project.slug}
                project={project}
                onResumeDraft={(draft) => {
                  setResumeCatalogProject(draft);
                  setCatalogDialogOpen(true);
                }}
              />
            ))}
          </div>
        )}

        <section className="mt-12">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold uppercase tracking-wide text-gray-500">
              PDP
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-gray-400">
                {pdpProjects.length} projet{pdpProjects.length > 1 ? "s" : ""}
              </span>
            <button
              onClick={() => {
                  setResumePdpProject(null);
                  setPdpDialogOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#3a2ff2] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#2a20d8]"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nouvelle PDP
              </button>
            </div>
          </div>

          {pdpProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white py-16 px-6 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="9" cy="10" r="2" />
                  <path d="M21 16l-5-5-8 8" />
                </svg>
              </div>
              <h3 className="text-[15px] font-semibold text-gray-900">
                Aucune PDP pour le moment
              </h3>
              <p className="mt-1 text-[13px] text-gray-500">
                Crée ta première PDP en cliquant sur « Nouvelle PDP ».
              </p>
              <button
                onClick={() => {
                  setResumePdpProject(null);
                  setPdpDialogOpen(true);
                }}
                className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[#3a2ff2] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:bg-[#2a20d8]"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nouvelle PDP
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {pdpProjects.map((project) => (
                <ProjectCard
                  key={project.slug}
                  project={project}
                  onResumeDraft={(draftProject) => {
                    setResumePdpProject(draftProject);
                    setPdpDialogOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <NewProjectDialog
        key={
          resumeCatalogProject
            ? `resume-cat-${resumeCatalogProject.slug}`
            : "catalog-new"
        }
        open={catalogDialogOpen}
        onClose={() => {
          setCatalogDialogOpen(false);
          setResumeCatalogProject(null);
        }}
        resumeProject={resumeCatalogProject}
      />
      <NewPdpDialog
        key={
          resumePdpProject ? `resume-pdp-${resumePdpProject.slug}` : "pdp-new"
        }
        open={pdpDialogOpen}
        resumeProject={resumePdpProject}
        onClose={() => {
          setPdpDialogOpen(false);
          setResumePdpProject(null);
        }}
      />
    </div>
  );
}
