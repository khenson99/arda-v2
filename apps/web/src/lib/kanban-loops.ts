import { fetchLoops } from "@/lib/api-client";
import { getPartLinkIds, partMatchesLinkId } from "@/lib/part-linking";
import type { KanbanLoop, PartRecord } from "@/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES_PER_QUERY = 25;

export async function fetchLoopsForPart(token: string, part: PartRecord): Promise<KanbanLoop[]> {
  const uuidPartIds = getPartLinkIds(part).filter((candidate) => UUID_RE.test(candidate));
  const uniquePartIds = [...new Set(uuidPartIds)];
  const byLoopId = new Map<string, KanbanLoop>();

  const fetchWithPartFilter = async (partId: string) => {
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages && page <= MAX_PAGES_PER_QUERY) {
      const pageResult = await fetchLoops(token, { partId, page, pageSize: DEFAULT_PAGE_SIZE });
      for (const loop of pageResult.data) {
        byLoopId.set(loop.id, loop);
      }
      totalPages = Math.max(1, pageResult.pagination.totalPages || 1);
      page += 1;
    }
  };

  if (uniquePartIds.length > 0) {
    await Promise.all(uniquePartIds.map((partId) => fetchWithPartFilter(partId)));
    return [...byLoopId.values()];
  }

  // Fallback for non-UUID part identifiers in legacy data.
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= MAX_PAGES_PER_QUERY) {
    const pageResult = await fetchLoops(token, { page, pageSize: DEFAULT_PAGE_SIZE });
    for (const loop of pageResult.data) {
      if (partMatchesLinkId(part, loop.partId)) {
        byLoopId.set(loop.id, loop);
      }
    }
    totalPages = Math.max(1, pageResult.pagination.totalPages || 1);
    page += 1;
  }

  return [...byLoopId.values()];
}
