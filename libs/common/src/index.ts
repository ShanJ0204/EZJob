import { z } from "zod";

export const JobSource = z.enum(["linkedin", "indeed", "company-site", "api", "rss"]);

export const JobIngestionPayload = z.object({
  source: JobSource,
  externalId: z.string().min(1),
  url: z.string().url()
});

export type JobIngestionPayload = z.infer<typeof JobIngestionPayload>;

export const EmploymentType = z.enum([
  "full-time",
  "part-time",
  "contract",
  "internship",
  "temporary",
  "other"
]);

export const JobPosting = z.object({
  sourceName: z.string().min(1),
  sourceJobId: z.string().min(1),
  sourceUrl: z.string().url(),
  title: z.string().min(1),
  companyName: z.string().min(1),
  locationText: z.string().default(""),
  locationCity: z.string().optional(),
  locationState: z.string().optional(),
  locationCountry: z.string().optional(),
  isRemote: z.boolean().default(false),
  employmentType: EmploymentType.optional(),
  seniorityLevel: z.string().optional(),
  salaryMin: z.number().int().optional(),
  salaryMax: z.number().int().optional(),
  salaryCurrency: z.string().length(3).optional(),
  postedAt: z.string().datetime().optional(),
  description: z.string().default(""),
  normalizedKey: z.string().min(1),
  dedupSignature: z.string().min(1)
});

export type JobPosting = z.infer<typeof JobPosting>;

export const RawJobPostingInput = z.object({
  sourceName: z.string().min(1),
  sourceJobId: z.string().min(1),
  sourceUrl: z.string().url(),
  title: z.string().min(1),
  companyName: z.string().min(1),
  locationText: z.string().optional(),
  locationCity: z.string().optional(),
  locationState: z.string().optional(),
  locationCountry: z.string().optional(),
  isRemote: z.boolean().optional(),
  employmentType: EmploymentType.optional(),
  seniorityLevel: z.string().optional(),
  salaryMin: z.number().int().optional(),
  salaryMax: z.number().int().optional(),
  salaryCurrency: z.string().optional(),
  postedAt: z.union([z.string().datetime(), z.date()]).optional(),
  description: z.string().optional()
});

export type RawJobPostingInput = z.infer<typeof RawJobPostingInput>;

const cleanToken = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const buildNormalizedKey = (sourceName: string, sourceJobId: string): string =>
  `${cleanToken(sourceName)}:${cleanToken(sourceJobId)}`;

export const buildDedupSignature = (
  title: string,
  companyName: string,
  locationText?: string
): string => `${cleanToken(title)}|${cleanToken(companyName)}|${cleanToken(locationText ?? "")}`;

export const normalizeJobPosting = (input: RawJobPostingInput): JobPosting => {
  const parsed = RawJobPostingInput.parse(input);
  const postedAt =
    parsed.postedAt instanceof Date ? parsed.postedAt.toISOString() : parsed.postedAt;

  return JobPosting.parse({
    ...parsed,
    locationText: parsed.locationText ?? "",
    isRemote: parsed.isRemote ?? false,
    description: parsed.description ?? "",
    postedAt,
    salaryCurrency: parsed.salaryCurrency?.toUpperCase(),
    normalizedKey: buildNormalizedKey(parsed.sourceName, parsed.sourceJobId),
    dedupSignature: buildDedupSignature(parsed.title, parsed.companyName, parsed.locationText)
  });
};

export const QUEUE_NAMES = {
  ingestion: "ingestion",
  matching: "matching",
  apply: "apply"
} as const;
