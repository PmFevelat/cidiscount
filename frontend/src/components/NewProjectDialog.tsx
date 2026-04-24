"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CsvEnrichedDropZone } from "@/components/CsvEnrichedDropZone";
import { ScraperLogBlock } from "@/components/ScraperLogBlock";
import type { ProjectMeta } from "@/lib/projects";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Brouillon catalogue : ouvre l’étape 2 (téléchargement CSV). */
  resumeProject?: ProjectMeta | null;
};

type CaptureDone = {
  slug: string;
  csvUrl: string;
  projectUrl: string;
};

type Step = "capture" | "downloadCsv" | "uploadCsv";

export function NewProjectDialog({
  open,
  onClose,
  resumeProject = null,
}: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [resultCsvFile, setResultCsvFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("capture");
  const [captureDone, setCaptureDone] = useState<CaptureDone | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  useEffect(() => {
    if (!open) {
      setUrl("");
      setResultCsvFile(null);
      setStep("capture");
      setCaptureDone(null);
      setLogs([]);
      setError(null);
      setSubmitting(false);
      setShowBrowser(false);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !resumeProject) return;
    if (resumeProject.kind !== "catalog" || resumeProject.status !== "draft") {
      return;
    }
    setUrl(resumeProject.url || "");
    setResultCsvFile(null);
    setStep("downloadCsv");
    setCaptureDone({
      slug: resumeProject.slug,
      csvUrl: `/snapshots/${resumeProject.slug}/images.csv`,
      projectUrl: `/projects/${resumeProject.slug}`,
    });
    setSubmitting(false);
    setError(null);
    setLogs([
      `▸ Reprise du brouillon catalogue : ${resumeProject.slug}`,
      "✓ Étape 1 déjà terminée. Télécharge le CSV puis poursuis vers l’import.",
    ]);
  }, [open, resumeProject]);

  async function runPipeline(formData: FormData): Promise<Record<string, unknown>> {
    const res = await fetch("/api/projects", {
      method: "POST",
      body: formData,
    });
    if (!res.ok || !res.body) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let donePayload: Record<string, unknown> | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        if (!line.trim()) continue;
        if (line.startsWith("__DONE__ ")) {
          try {
            donePayload = JSON.parse(line.slice(9));
          } catch {
            throw new Error("Réponse finale invalide.");
          }
        } else if (line.startsWith("__HEARTBEAT__ ")) {
          continue;
        } else if (line.startsWith("__ERROR__ ")) {
          throw new Error(line.slice(10));
        } else {
          setLogs((prev) => [...prev, line]);
        }
      }
    }
    if (!donePayload) {
      throw new Error("La pipeline n'a pas renvoyé de résultat final.");
    }
    return donePayload;
  }

  async function submitCapture(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!url) return;
    setSubmitting(true);
    setLogs(["▸ Étape 1/3 : scraping de la page…"]);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("phase", "scrape");
      fd.append("url", url);
      if (showBrowser) {
        fd.append("headed", "1");
      }
      const payload = await runPipeline(fd);
      const done = {
        slug: String(payload.slug ?? ""),
        csvUrl: String(payload.csvUrl ?? ""),
        projectUrl: String(payload.projectUrl ?? ""),
      };
      if (!done.slug || !done.csvUrl) {
        throw new Error("Réponse incomplète après scraping.");
      }
      setCaptureDone(done);
      setStep("downloadCsv");
      setSubmitting(false);
      setLogs((prev) => [
        ...prev,
        "✓ Scraping terminé.",
        "➡ Étape 2/3 : télécharge le CSV des images à enrichir.",
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("signal: SIGKILL")) {
        setError(
          "Le process de scraping catalogue a été interrompu (SIGKILL). Relance le serveur dev dans un terminal local et réessaie.",
        );
      } else {
        setError(message);
      }
      setSubmitting(false);
    }
  }

  async function submitFinalize(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!captureDone || !resultCsvFile) return;
    setSubmitting(true);
    setError(null);
    setLogs((prev) => [...prev, "▸ Étape 3/3 : application du CSV enrichi…"]);

    try {
      const fd = new FormData();
      fd.append("phase", "finalize");
      fd.append("slug", captureDone.slug);
      fd.append("csv", resultCsvFile);
      const payload = await runPipeline(fd);
      const finalSlug = String(payload.slug ?? captureDone.slug);
      const finalUrl = String(payload.projectUrl ?? `/projects/${finalSlug}`);
      setLogs((prev) => [...prev, "✓ Projet finalisé."]);
      setTimeout(() => {
        router.refresh();
        router.push(finalUrl);
      }, 350);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("signal: SIGKILL")) {
        setError(
          "Le process de finalisation catalogue a été interrompu (SIGKILL). Relance le serveur dev dans un terminal local et réessaie.",
        );
      } else {
        setError(message);
      }
      setSubmitting(false);
    }
  }

  function goToUploadStep() {
    setStep("uploadCsv");
  }

  function goBackToDownload() {
    setResultCsvFile(null);
    setStep("downloadCsv");
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "capture" && (
          <form onSubmit={submitCapture} className="flex flex-col">
            <div className="flex items-start justify-between px-6 pt-6 pb-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3a2ff2]">
                  Étape 1 sur 3
                </p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">
                  Nouveau projet
                </h2>
                <p className="mt-1 text-[13px] text-gray-500">
                  Indique l&apos;URL de la page catalogue à scraper.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                aria-label="Fermer"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-4 px-6 py-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-gray-600">
                  URL de la page catalogue
                </span>
                <input
                  type="url"
                  required
                  autoFocus
                  placeholder="https://example.com/catalogue/…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[14px] text-gray-900 placeholder-gray-400 outline-none focus:border-[#3a2ff2] focus:ring-2 focus:ring-[#3a2ff2]/20 disabled:bg-gray-50"
                />
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug text-gray-700">
                <input
                  type="checkbox"
                  checked={showBrowser}
                  onChange={(e) => setShowBrowser(e.target.checked)}
                  disabled={submitting}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[#3a2ff2] focus:ring-[#3a2ff2]"
                />
                <span>
                  Afficher le navigateur (Chrome visible) — utile si le site
                  bloque le mode headless ou affiche des modales.
                </span>
              </label>
            </div>

            <ScraperLogBlock
              lines={logs}
              error={error}
              className="mx-6 mb-4"
            />

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4 rounded-b-2xl">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting || !url}
                className="inline-flex items-center gap-2 rounded-lg bg-[#3a2ff2] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#2a20d8] disabled:opacity-50"
              >
                {submitting && (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 animate-spin"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeOpacity="0.25"
                      strokeWidth="4"
                    />
                    <path
                      d="M12 2a10 10 0 0110 10"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {submitting ? "Scraping en cours…" : "Lancer le scraping"}
              </button>
            </div>
          </form>
        )}

        {step === "downloadCsv" && (
          <div className="flex flex-col">
            <div className="flex items-start justify-between px-6 pt-6 pb-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3a2ff2]">
                  Étape 2 sur 3
                </p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">
                  CSV des images scrapées
                </h2>
                <p className="mt-1 text-[13px] text-gray-500">
                  Télécharge le fichier, enrichis les colonnes
                  <code className="mx-0.5 text-[12px]">new_image_url</code>
                  côté traitement d&apos;images, puis passe à l&apos;étape
                  suivante.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Fermer"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4">
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-5 shadow-sm">
                <div className="text-[13px] font-medium text-indigo-900">
                  Images extraites — export prêt
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-indigo-800/95">
                  Le CSV liste les <code>former_image_url</code> actuelles.
                  Remplis <code>new_image_url</code> avec tes visuels
                  redesignés avant l&apos;import.
                </p>
                {captureDone && (
                  <a
                    href={captureDone.csvUrl}
                    download
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[14px] font-semibold text-indigo-700 shadow-md transition hover:bg-indigo-100"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 3v12m0 0l4-4m-4 4l-4-4M4 21h16" />
                    </svg>
                    Télécharger le CSV des images scrapées
                  </a>
                )}
              </div>
            </div>

            <ScraperLogBlock
              lines={logs}
              error={null}
              className="mx-6 mb-4"
              maxHeightClass="max-h-32"
            />

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4 rounded-b-2xl">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={goToUploadStep}
                disabled={!captureDone}
                className="inline-flex items-center gap-2 rounded-lg bg-[#3a2ff2] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#2a20d8] disabled:opacity-50"
              >
                Continuer — importer le CSV enrichi
              </button>
            </div>
          </div>
        )}

        {step === "uploadCsv" && (
          <form onSubmit={submitFinalize} className="flex flex-col">
            <div className="flex items-start justify-between px-6 pt-6 pb-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3a2ff2]">
                  Étape 3 sur 3
                </p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">
                  Import du CSV final
                </h2>
                <p className="mt-1 text-[13px] text-gray-500">
                  Uploade le CSV avec les
                  <code className="mx-0.5 text-[12px]">new_image_url</code>
                  renseignées pour générer la fiche avant / après.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                aria-label="Fermer"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-2 px-6 py-4">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-gray-600">
                CSV final avec nouvelles URLs
              </span>
              <CsvEnrichedDropZone
                key={resultCsvFile ? resultCsvFile.name : "empty"}
                inputId="result-csv-input"
                file={resultCsvFile}
                onFileChange={setResultCsvFile}
                disabled={submitting}
                helpText={
                  <>
                    Colonnes attendues : <code>order</code>,{" "}
                    <code>former_image_url</code>, <code>new_image_url</code>
                  </>
                }
              />
              {resultCsvFile && (
                <button
                  type="button"
                  onClick={() => setResultCsvFile(null)}
                  className="self-start text-[12px] text-gray-500 hover:text-gray-800"
                >
                  Effacer la sélection
                </button>
              )}
            </div>

            <ScraperLogBlock
              lines={logs}
              error={error}
              className="mx-6 mb-4"
              maxHeightClass="max-h-32"
            />

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4 rounded-b-2xl">
              <button
                type="button"
                onClick={goBackToDownload}
                disabled={submitting}
                className="mr-auto rounded-lg px-3 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                ← Retour
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting || !captureDone || !resultCsvFile}
                className="inline-flex items-center gap-2 rounded-lg bg-[#3a2ff2] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#2a20d8] disabled:opacity-50"
              >
                {submitting && (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 animate-spin"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeOpacity="0.25"
                      strokeWidth="4"
                    />
                    <path
                      d="M12 2a10 10 0 0110 10"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {submitting ? "Finalisation en cours…" : "Finaliser le projet"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
