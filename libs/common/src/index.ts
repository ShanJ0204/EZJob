import { z } from "zod";

export const JobSource = z.enum(["linkedin", "indeed", "company-site"]);

export const JobIngestionPayload = z.object({
  source: JobSource,
  externalId: z.string().min(1),
  url: z.string().url()
});

export type JobIngestionPayload = z.infer<typeof JobIngestionPayload>;

export const QUEUE_NAMES = {
  ingestion: "ingestion",
  matching: "matching",
  apply: "apply"
} as const;
