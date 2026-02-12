import type { JobPosting } from "@ezjob/common";

export interface DedupResult {
  unique: JobPosting[];
  exactDuplicateCount: number;
  fuzzyDuplicateCount: number;
}

const tokenize = (value: string): Set<string> =>
  new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((segment) => segment.trim())
      .filter(Boolean)
  );

const jaccard = (left: string, right: string): number => {
  const l = tokenize(left);
  const r = tokenize(right);

  if (l.size === 0 || r.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of l) {
    if (r.has(token)) {
      intersection += 1;
    }
  }

  const union = l.size + r.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const isFuzzyMatch = (candidate: JobPosting, existing: JobPosting): boolean => {
  const titleScore = jaccard(candidate.title, existing.title);
  const companyScore = jaccard(candidate.companyName, existing.companyName);
  const locationScore = jaccard(candidate.locationText, existing.locationText);

  return titleScore >= 0.8 && companyScore >= 0.8 && locationScore >= 0.5;
};

export const deduplicatePostings = (
  incoming: JobPosting[],
  existing: JobPosting[]
): DedupResult => {
  const byNormalizedKey = new Set(existing.map((posting) => posting.normalizedKey));
  const uniques: JobPosting[] = [];

  let exactDuplicateCount = 0;
  let fuzzyDuplicateCount = 0;

  for (const posting of incoming) {
    if (byNormalizedKey.has(posting.normalizedKey)) {
      exactDuplicateCount += 1;
      continue;
    }

    const fuzzyExisting = existing.some((item) => isFuzzyMatch(posting, item));
    const fuzzyNew = uniques.some((item) => isFuzzyMatch(posting, item));

    if (fuzzyExisting || fuzzyNew) {
      fuzzyDuplicateCount += 1;
      continue;
    }

    byNormalizedKey.add(posting.normalizedKey);
    uniques.push(posting);
  }

  return {
    unique: uniques,
    exactDuplicateCount,
    fuzzyDuplicateCount
  };
};
