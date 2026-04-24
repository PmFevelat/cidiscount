import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { PdpSplitScaledIframe } from "@/components/PdpSplitScaledIframe";
import { PdpSplitScreen } from "@/components/PdpSplitScreen";
import { SnapshotFrame } from "@/components/SnapshotFrame";
import { getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ share?: string }>;
}) {
  const { slug } = await params;
  const { share } = await searchParams;
  const isShare = share === "1";

  const project = await getProject(slug);
  if (!project) notFound();

  if (project.status === "draft") {
    const q = project.kind === "pdp" ? "resumePdp" : "resumeCatalog";
    redirect(`/?${q}=${encodeURIComponent(slug)}`);
  }

  const originalSrc = `/snapshots/${slug}/original.html`;
  const redesignSrc = `/snapshots/${slug}/redesign.html`;
  const fallbackHeight = project.documentHeight || 2400;

  const backButton = !isShare && (
    <div className="fixed top-4 left-4 z-[80]" style={{ pointerEvents: "auto" }}>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full bg-white/95 backdrop-blur px-3 py-2 text-[13px] font-medium text-gray-800 shadow-md transition hover:bg-white"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Retour aux projets
      </Link>
    </div>
  );

  if (project.kind === "pdp") {
    const sandbox = "allow-scripts allow-same-origin";
    return (
      <div className="relative h-[100dvh] w-full overflow-hidden">
        {backButton}
        <PdpSplitScreen
          left={
            <PdpSplitScaledIframe
              src={originalSrc}
              title={`${project.title} — original`}
              fallbackHeight={fallbackHeight}
              sandbox={sandbox}
            />
          }
          right={
            <PdpSplitScaledIframe
              src={redesignSrc}
              title={`${project.title} — redesign`}
              fallbackHeight={fallbackHeight}
              sandbox={sandbox}
            />
          }
        />
      </div>
    );
  }

  return (
    <div className="relative">
      {backButton}
      <BeforeAfterSlider
        before={
          <SnapshotFrame
            src={originalSrc}
            title={`${project.title} — original`}
            fallbackHeight={fallbackHeight}
          />
        }
        after={
          <SnapshotFrame
            src={redesignSrc}
            title={`${project.title} — redesign`}
            fallbackHeight={fallbackHeight}
          />
        }
      />
    </div>
  );
}
