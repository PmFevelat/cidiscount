"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

type CaptureDone = {
  slug: string;
  csvUrl: string;
  projectUrl: string;
};

function slugifyForDefault(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").split(".")[0];
    const pathPart = u.pathname
      .split("/")
      .filter(Boolean)
      .slice(-2)
      .join("-");
    const raw = [host, pathPart].filter(Boolean).join("-");
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  } catch {
    return "";
  }
}

export function NewProjectDialog({ open, onClose }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [resultCsvFile, setResultCsvFile] = useState<File | null>(null);
  const [step, setStep] = useState<"capture" | "finalize">("capture");
  const [captureDone, setCaptureDone] = useState<CaptureDone | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
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
      // Reset when closing.
      setUrl("");
      setSlug("");
      setResultCsvFile(null);
      setStep("capture");
      setCaptureDone(null);
      setLogs([]);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const derivedSlug = slug || slugifyForDefault(url);

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
    setLogs(["▸ Étape 1/2 : scraping de la page…"]);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("phase", "scrape");
      fd.append("url", url);
      if (slug) fd.append("slug", slug);
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
      setStep("finalize");
      setSubmitting(false);
      setLogs((prev) => [
        ...prev,
        "✓ Scraping terminé.",
        "✓ CSV des images prêt au téléchargement.",
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  async function submitFinalize(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!captureDone || !resultCsvFile) return;
    setSubmitting(true);
    setError(null);
    setLogs((prev) => [...prev, "▸ Étape 2/2 : application du CSV redesign…"]);

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
      setError(err instanceof Error ? err.message : String(err));
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
        onClick={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={step === "capture" ? submitCapture : submitFinalize}
          className="flex flex-col"
        >
          <div className="flex items-start justify-between px-6 pt-6 pb-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Nouveau projet
              </h2>
              <p className="mt-1 text-[13px] text-gray-500">
                Étape 1 : scrape depuis l&apos;URL. Étape 2 : upload du CSV
                redesign pour finaliser et créer la card projet.
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

                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-gray-600">
                    Slug (optionnel)
                  </span>
                  <input
                    type="text"
                    placeholder={derivedSlug || "mon-projet"}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    disabled={submitting}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[14px] text-gray-900 placeholder-gray-400 outline-none focus:border-[#3a2ff2] focus:ring-2 focus:ring-[#3a2ff2]/20 disabled:bg-gray-50"
                  />
                </label>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                  <div className="text-[13px] font-medium text-indigo-900">
                    Étape 1 terminée : images scrapées.
                  </div>
                  <div className="mt-1 text-[12px] text-indigo-800">
                    Télécharge le CSV généré, remplace les URLs côté image
                    processing, puis réimporte le CSV final ci-dessous.
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
                      Télécharger le CSV des images scrapées
                    </a>
                  )}
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-gray-600">
                    CSV final avec nouvelles URLs
                  </span>
                  <div className="flex items-center gap-3">
                    <input
                      id="result-csv-input"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) =>
                        setResultCsvFile(e.target.files?.[0] ?? null)
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
                            "result-csv-input",
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
                    Colonnes attendues : <code>order</code>,{" "}
                    <code>former_image_url</code>, <code>new_image_url</code>
                  </span>
                </label>
              </>
            )}
          </div>

          {(submitting || logs.length > 0 || error) && (
            <div className="mx-6 mb-4 max-h-40 overflow-y-auto rounded-lg bg-gray-900 px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-100">
              {logs.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">
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
                  ? "Scraping en cours…"
                  : "Finalisation en cours…"
                : step === "capture"
                  ? "Étape 1 — Scraper les images"
                  : "Étape 2 — Finaliser le projet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
