"use client";

import { useState } from "react";
import { NewProjectDialog } from "./NewProjectDialog";
import { ProjectCard } from "./ProjectCard";
import type { ProjectMeta } from "@/lib/projects";

export function ProjectsGrid({ projects }: { projects: ProjectMeta[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3a2ff2] text-white shadow-md">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
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
              <h1 className="text-[18px] font-semibold text-gray-900">
                Redesign Studio
              </h1>
              <p className="text-[12px] text-gray-500">
                Capture & avant/après sur n&apos;importe quelle page catalogue
              </p>
            </div>
          </div>

          <button
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#3a2ff2] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#2a20d8]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nouveau projet
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-10">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold uppercase tracking-wide text-gray-500">
            Projets
          </h2>
          <span className="text-[12px] text-gray-400">
            {projects.length} projet{projects.length > 1 ? "s" : ""}
          </span>
        </div>

        {projects.length === 0 ? (
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
              Aucun projet pour le moment
            </h3>
            <p className="mt-1 text-[13px] text-gray-500">
              Lance ta première capture en cliquant sur « Nouveau projet ».
            </p>
            <button
              onClick={() => setDialogOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#3a2ff2] px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-[#2a20d8]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nouveau projet
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
        )}
      </main>

      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
