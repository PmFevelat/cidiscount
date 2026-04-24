"use client";

import { useEffect, useRef, useState } from "react";
import { NewProjectDialog } from "./NewProjectDialog";
import { NewPdpDialog } from "./NewPdpDialog";
import { ProjectCard } from "./ProjectCard";
import type { ProjectMeta } from "@/lib/projects";

type Tab = "catalog" | "pdp";

const STEPS = [
  {
    n: 1,
    title: "Entrer l'URL",
    body: "Colle l'URL de la page catalogue ou PDP à scraper et lance le projet.",
  },
  {
    n: 2,
    title: "Le scraper ouvre une fenêtre web",
    body: "Chrome s'ouvre automatiquement. Si des modales ou captchas apparaissent, ferme-les manuellement.",
  },
  {
    n: 3,
    title: "Scraping en direct — sois patient",
    body: "Le scraper parcourt la page et charge toutes les images. Des timers sont volontairement mis en place pour garantir un chargement complet.",
  },
  {
    n: 4,
    title: "Récupère le CSV des images",
    body: "Une fois terminé, reviens sur la card du projet. Télécharge le CSV structuré en 3 colonnes : order · former_image_url · new_image_url.",
  },
  {
    n: 5,
    title: "Génère les images redesign avec l'agent Presti",
    body: "Donne le CSV à l'agent Presti avec le skill Shadow + fond gris et le prompt :\n« Voici un CSV. Génère pour chaque image une version sur fond gris avec ombres et place les URLs dans la colonne new_image_url. »",
  },
  {
    n: 6,
    title: "Drop le CSV enrichi & génère la simulation",
    body: "Dépose le nouveau CSV (avec les new_image_url renseignées) dans la modale de finalisation. La simulation avant / après est générée automatiquement.",
  },
];

function ProcessModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-[16px] font-semibold text-gray-900">Comment ça marche ?</h2>
            <p className="text-[12px] text-gray-500 mt-0.5">Le process de A à Z</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Steps */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {STEPS.map((step, i) => (
            <div key={step.n} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#3a2ff2] text-white text-[12px] font-bold">
                  {step.n}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="mt-1.5 w-px flex-1 bg-gray-200" style={{ minHeight: 20 }} />
                )}
              </div>
              <div className="pb-4">
                <p className="text-[13px] font-semibold text-gray-900">{step.title}</p>
                <p className="mt-0.5 text-[12px] text-gray-500 whitespace-pre-line">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-[#3a2ff2] py-2 text-[13px] font-semibold text-white hover:bg-[#2a20d8] transition"
          >
            C'est compris, on y va !
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [tab, setTab] = useState<Tab>("catalog");
  const [processOpen, setProcessOpen] = useState(false);
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [pdpDialogOpen, setPdpDialogOpen] = useState(false);
  const [resumePdpProject, setResumePdpProject] = useState<ProjectMeta | null>(null);
  const [resumeCatalogProject, setResumeCatalogProject] = useState<ProjectMeta | null>(null);
  const urlOpenOnce = useRef(false);

  useEffect(() => {
    if (urlOpenOnce.current) return;
    if (initialResumeCatalogSlug) {
      const p = catalogProjects.find((x) => x.slug === initialResumeCatalogSlug);
      if (p?.status === "draft") {
        setResumeCatalogProject(p);
        setCatalogDialogOpen(true);
        setTab("catalog");
        urlOpenOnce.current = true;
        if (typeof window !== "undefined") window.history.replaceState({}, "", "/");
      }
    } else if (initialResumePdpSlug) {
      const p = pdpProjects.find((x) => x.slug === initialResumePdpSlug);
      if (p?.status === "draft") {
        setResumePdpProject(p);
        setPdpDialogOpen(true);
        setTab("pdp");
        urlOpenOnce.current = true;
        if (typeof window !== "undefined") window.history.replaceState({}, "", "/");
      }
    }
  }, [initialResumeCatalogSlug, initialResumePdpSlug, catalogProjects, pdpProjects]);

  const projects = tab === "catalog" ? catalogProjects : pdpProjects;
  const emptyLabel = tab === "catalog" ? "Aucun catalogue pour le moment" : "Aucune PDP pour le moment";
  const emptyHint = tab === "catalog"
    ? "Lance ton premier catalogue en cliquant sur « Nouveau Catalogue »."
    : "Crée ta première PDP en cliquant sur « Nouvelle PDP ».";

  const openNew = () => {
    if (tab === "catalog") {
      setResumeCatalogProject(null);
      setCatalogDialogOpen(true);
    } else {
      setResumePdpProject(null);
      setPdpDialogOpen(true);
    }
  };

  const newLabel = tab === "catalog" ? "Nouveau Catalogue" : "Nouvelle PDP";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3a2ff2] text-white shadow-sm">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12l4-4 4 4 4-4 4 4" />
                <path d="M3 18h18" />
              </svg>
            </div>
            <h1 className="text-[15px] font-semibold text-gray-900">Redesign Studio</h1>
          </div>
        </div>
      </header>

      {/* How it works CTA */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-2 sm:px-6">
          <p className="text-[12px] text-gray-500">
            Nouveau par ici ? Découvre comment générer une simulation en quelques étapes.
          </p>
          <button
            onClick={() => setProcessOpen(true)}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#3a2ff2] hover:underline transition shrink-0"
          >
            Comment ça marche
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-[1200px] px-6 py-8">
        {/* Tabs + New button */}
        <div className="mb-8 flex items-center justify-between">
          <nav className="flex items-center gap-1 rounded-lg bg-gray-200/70 p-1">
            {(["catalog", "pdp"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-5 py-1.5 text-[13px] font-medium transition ${
                  tab === t
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "catalog" ? "Catalogue" : "PDP"}
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  tab === t ? "bg-[#3a2ff2]/10 text-[#3a2ff2]" : "bg-gray-300/80 text-gray-500"
                }`}>
                  {t === "catalog" ? catalogProjects.length : pdpProjects.length}
                </span>
              </button>
            ))}
          </nav>

          <button
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#3a2ff2] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#2a20d8]"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {newLabel}
          </button>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-400">
            {projects.length} projet{projects.length > 1 ? "s" : ""}
          </h2>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white py-16 px-6 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="9" cy="10" r="2" />
                <path d="M21 16l-5-5-8 8" />
              </svg>
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900">{emptyLabel}</h3>
            <p className="mt-1 text-[13px] text-gray-500">{emptyHint}</p>
            <button
              onClick={openNew}
              className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[#3a2ff2] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:bg-[#2a20d8]"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {newLabel}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.slug}
                project={project}
                onResumeDraft={(draft) => {
                  if (tab === "catalog") {
                    setResumeCatalogProject(draft);
                    setCatalogDialogOpen(true);
                  } else {
                    setResumePdpProject(draft);
                    setPdpDialogOpen(true);
                  }
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      {processOpen && <ProcessModal onClose={() => setProcessOpen(false)} />}

      <NewProjectDialog
        key={resumeCatalogProject ? `resume-cat-${resumeCatalogProject.slug}` : "catalog-new"}
        open={catalogDialogOpen}
        onClose={() => { setCatalogDialogOpen(false); setResumeCatalogProject(null); }}
        resumeProject={resumeCatalogProject}
      />
      <NewPdpDialog
        key={resumePdpProject ? `resume-pdp-${resumePdpProject.slug}` : "pdp-new"}
        open={pdpDialogOpen}
        resumeProject={resumePdpProject}
        onClose={() => { setPdpDialogOpen(false); setResumePdpProject(null); }}
      />
    </div>
  );
}
