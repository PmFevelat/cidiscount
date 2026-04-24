import { ProjectsGrid } from "@/components/ProjectsGrid";
import { listProjectsByKind } from "@/lib/projects";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [catalogProjects, pdpProjects, sp] = await Promise.all([
    listProjectsByKind("catalog"),
    listProjectsByKind("pdp"),
    searchParams,
  ]);
  const resumeCat = sp?.resumeCatalog;
  const resumePdp = sp?.resumePdp;
  const initialResumeCatalogSlug =
    typeof resumeCat === "string" && resumeCat ? resumeCat : null;
  const initialResumePdpSlug =
    typeof resumePdp === "string" && resumePdp ? resumePdp : null;

  return (
    <ProjectsGrid
      catalogProjects={catalogProjects}
      pdpProjects={pdpProjects}
      initialResumeCatalogSlug={initialResumeCatalogSlug}
      initialResumePdpSlug={initialResumePdpSlug}
    />
  );
}
