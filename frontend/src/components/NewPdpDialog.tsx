"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ProjectMeta } from "@/lib/projects";

type Props = {
  open: boolean;
  onClose: () => void;
  resumeProject?: ProjectMeta | null;
};

type CaptureDone = {
  slug: string;
  csvUrl: string;
  projectUrl: string;
};

function toCaptureDoneFromDraft(project: ProjectMeta): CaptureDone {
  return {
    slug: project.slug,
    csvUrl: `/snapshots/${project.slug}/images.csv`,
    projectUrl: `/projects/${project.slug}`,
  };
}

function toInternalProjectUrl(rawUrl: string, fallbackSlug: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("/")) return trimmed;
  return `/projects/${fallbackSlug}`;
}

export function NewPdpDialog({ open, onClose, resumeProject = null }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [resultCsvFile, setResultCsvFile] = useState<File | null>(null);
  const [step, setStep] = useState<"capture" | "finalize">("capture");
  const [captureDone, setCaptureDone] = useState<CaptureDone | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isResumingDraftPdp =
    resumeProject?.kind === "pdp" && resumeProject?.status === "draft";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  useEffect(() => {
    if (!open) {
      setUrl("");
      setResultCsvFile(null);
      setStep("capture");
      setCaptureDone(null);
      setSubmitting(false);
      setLogs([]);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!isResumingDraftPdp || !resumeProject) return;

    setUrl(resumeProject.url || "");
    setResultCsvFile(null);
    setStep("finalize");
    setCaptureDone(toCaptureDoneFromDraft(resumeProject));
    setSubmitting(false);
    setError(null);
    setLogs([
      `▸ Reprise du brouillon PDP: ${resumeProject.slug}`,
      "✓ Étape 1 déjà terminée. Le CSV source est prêt au téléchargement.",
    ]);
  }, [open, isResumingDraftPdp, resumeProject]);

  async function runPipeline(formData: FormData): Promise<Record<string, unknown>> {
    const response = await fetch("/api/pdp", {
      method: "POST",
      body: formData,
    });
    if (!response.ok || !response.body) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let donePayload: Record<string, unknown> | null = null;
    let heartbeatCount = 0;

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
          heartbeatCount += 1;
          if (heartbeatCount % 3 === 0) {
            const keepAliveMessage =
              "… pipeline PDP toujours en cours (initialisation navigateur / scraping).";
            setLogs((prev) => {
              if (prev[prev.length - 1] === keepAliveMessage) return prev;
              return [...prev, keepAliveMessage];
            });
          }
          continue;
        } else if (line.startsWith("__ERROR__ ")) {
          throw new Error(line.slice(10));
        } else {
          setLogs((prev) => [...prev, line]);
        }
      }
    }

    if (!donePayload) {
      throw new Error("La pipeline PDP n'a pas renvoyé de résultat final.");
    }
    return donePayload;
  }

  async function submitCapture(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url) return;
    setSubmitting(true);
    setLogs(["▸ Étape 1/2 : scraping des images PDP (carrousel)…"]);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("phase", "scrape");
      formData.append("url", url);

      const payload = await runPipeline(formData);
      const done = {
        slug: String(payload.slug ?? ""),
        csvUrl: String(payload.csvUrl ?? ""),
        projectUrl: String(payload.projectUrl ?? ""),
      };
      if (!done.slug || !done.csvUrl) {
        throw new Error("Réponse incomplète après scraping PDP.");
      }

      setCaptureDone(done);
      setStep("finalize");
      setSubmitting(false);
      router.refresh();
      setLogs((prev) => [
        ...prev,
        "✓ Scraping PDP terminé.",
        "✓ CSV des images PDP prêt au téléchargement.",
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("signal: SIGKILL")) {
        setError(
          "Le process de scraping PDP a été interrompu (SIGKILL). Relance le serveur dev dans un terminal local et réessaie.",
        );
      } else {
        setError(message);
      }
      setSubmitting(false);
    }
  }

  async function submitFinalize(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captureDone || !resultCsvFile) return;
    setSubmitting(true);
    setError(null);
    setLogs((prev) => [...prev, "▸ Étape 2/2 : application du CSV redesign PDP…"]);

    try {
      const formData = new FormData();
      formData.append("phase", "finalize");
      formData.append("slug", captureDone.slug);
      formData.append("csv", resultCsvFile);
      const payload = await runPipeline(formData);
      const finalSlug = String(payload.slug ?? captureDone.slug);
      const finalUrl = toInternalProjectUrl(
        String(payload.projectUrl ?? `/projects/${finalSlug}`),
        finalSlug,
      );
      setLogs((prev) => [...prev, "✓ PDP finalisée."]);
      setSubmitting(false);
      onClose();
      router.refresh();
      router.push(finalUrl);
      setTimeout(() => {
        if (typeof window === "undefined") return;
        const targetPath = finalUrl.split("?")[0] || finalUrl;
        if (window.location.pathname !== targetPath) {
          window.location.assign(finalUrl);
        }
      }, 900);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("signal: SIGKILL")) {
        setError(
          "Le process de finalisation PDP a été interrompu (SIGKILL). Relance le serveur dev dans un terminal local et réessaie.",
        );
      } else {
        setError(message);
      }
      setSubmitting(false);
    }
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
        onClick={(event) => event.stopPropagation()}
      >
        <form
          onSubmit={step === "capture" ? submitCapture : submitFinalize}
          className="flex flex-col"
        >
          <div className="flex items-start justify-between px-6 pt-6 pb-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {isResumingDraftPdp ? "Reprendre PDP" : "Nouvelle PDP"}
              </h2>
              <p className="mt-1 text-[13px] text-gray-500">
                Étape 1 : scrape des images de la PDP. Étape 2 : upload du CSV
                redesign pour finaliser l&apos;avant/après.
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
            {step === "capture" ? (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-gray-600">
                    URL de la page produit (PDP)
                  </span>
                  <input
                    type="url"
                    required
                    autoFocus
                    placeholder="https://www.cdiscount.com/.../f-...html"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    disabled={submitting}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[14px] text-gray-900 placeholder-gray-400 outline-none focus:border-[#3a2ff2] focus:ring-2 focus:ring-[#3a2ff2]/20 disabled:bg-gray-50"
                  />
                </label>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                  <div className="text-[13px] font-medium text-indigo-900">
                    Étape 1 terminée : images PDP scrapées.
                  </div>
                  <div className="mt-1 text-[12px] text-indigo-800">
                    Télécharge le CSV généré, remplace les URLs côté image
                    processing, puis réimporte le CSV final.
                  </div>
                  {captureDone && (
                    <a
                      href={captureDone.csvUrl}
                      download
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[12px] font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 3v12m0 0l4-4m-4 4l-4-4M4 21h16" />
                      </svg>
                      Télécharger le CSV des images PDP
                    </a>
                  )}
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-gray-600">
                    CSV final avec nouvelles URLs
                  </span>
                  <div className="flex items-center gap-3">
                    <input
                      id="result-pdp-csv-input"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) =>
                        setResultCsvFile(event.target.files?.[0] ?? null)
                      }
                      disabled={submitting}
                      className="block w-full text-[13px] text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-gray-700 hover:file:bg-gray-200 disabled:opacity-50"
                    />
                    {resultCsvFile && (
                      <button
                        type="button"
                        onClick={() => {
                          setResultCsvFile(null);
                          const input = document.getElementById(
                            "result-pdp-csv-input",
                          ) as HTMLInputElement | null;
                          if (input) input.value = "";
                        }}
                        className="text-[12px] text-gray-500 hover:text-gray-700"
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400">
                    Colonnes acceptées (image/vidéo) : <code>order</code>,{" "}
                    <code>former_image_url</code>/<code>former_media_url</code>/
                    <code>former_video_url</code>, <code>new_image_url</code>/
                    <code>new_media_url</code>/<code>new_video_url</code>
                  </span>
                </label>
              </>
            )}
          </div>

          {(submitting || logs.length > 0 || error) && (
            <div className="mx-6 mb-4 max-h-40 overflow-y-auto rounded-lg bg-gray-900 px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-100">
              {logs.map((line, index) => (
                <div key={index} className="whitespace-pre-wrap">
                  {line}
                </div>
              ))}
              {error && <div className="text-red-300">✗ {error}</div>}
            </div>
          )}

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
              disabled={
                submitting ||
                (step === "capture" ? !url : !captureDone || !resultCsvFile)
              }
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
              {submitting
                ? step === "capture"
                  ? "Scraping PDP en cours…"
                  : "Finalisation PDP en cours…"
                : step === "capture"
                  ? "Étape 1 — Scraper les images PDP"
                  : "Étape 2 — Finaliser la PDP"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
