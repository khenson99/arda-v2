import type { PartRecord } from "@/types";

type PartLinkable = {
  id: PartRecord["id"];
  eId?: PartRecord["eId"] | null;
  externalGuid?: PartRecord["externalGuid"] | null;
};

export function normalizePartLinkId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

export function getPartLinkIds(part: PartLinkable): string[] {
  const keys = new Set<string>();

  for (const raw of [part.id, part.eId, part.externalGuid]) {
    const normalized = normalizePartLinkId(raw);
    if (normalized) {
      keys.add(normalized);
    }
  }

  return [...keys];
}

export function resolvePartLinkedValue<T>(
  part: PartLinkable,
  byPartId: Map<string, T>,
): T | undefined {
  for (const key of getPartLinkIds(part)) {
    const value = byPartId.get(key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

export function partMatchesLinkId(part: PartLinkable, candidatePartId: string): boolean {
  const normalized = normalizePartLinkId(candidatePartId);
  if (!normalized) return false;
  return getPartLinkIds(part).includes(normalized);
}
