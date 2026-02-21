import type { JobPosting } from "@ezjob/common";

export type MatchDecision = "notify" | "high_priority" | "drop";

export type ReasonCode =
  | "remote_mismatch"
  | "location_mismatch"
  | "visa_not_supported"
  | "comp_below_floor"
  | "role_mismatch"
  | "seniority_mismatch"
  | "skill_overlap"
  | "title_similarity"
  | "comp_fit"
  | "location_fit"
  | "seniority_fit";

export type MatchReason = {
  code: ReasonCode;
  label: string;
  detail: string;
  value?: number;
};

export type MatchingCandidate = {
  userId: string;
  resumeVariantId?: string;
  desiredTitles: string[];
  preferredLocations: string[];
  remoteOnly: boolean;
  minSalary?: number;
  acceptedSeniority?: string[];
  skills: string[];
  workAuthorizationCountries?: string[];
  requiresVisaSponsorship?: boolean;
};

export type MatchingJob = JobPosting & {
  eligibleCountries?: string[];
  visaSponsorshipOffered?: boolean;
  requiredSkills?: string[];
};

export type MatchResultRecord = {
  id?: string;
  userId: string;
  jobPostingId: string;
  resumeVariantId?: string;
  score: number;
  decision: MatchDecision;
  reasonSummary: string;
  reasonDetails: {
    reasons: MatchReason[];
    hardFilterFailures: MatchReason[];
    weightedComponents: Record<string, number>;
  };
};

export type MatchComputation = {
  score: number;
  decision: MatchDecision;
  hardFilterFailures: MatchReason[];
  reasons: MatchReason[];
  weightedComponents: Record<string, number>;
};
