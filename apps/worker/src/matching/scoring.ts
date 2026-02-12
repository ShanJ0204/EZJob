import type { MatchComputation, MatchDecision, MatchReason, MatchingCandidate, MatchingJob } from "./types.js";

const WEIGHTS = {
  skillOverlap: 0.35,
  titleSimilarity: 0.25,
  compensationFit: 0.2,
  locationFit: 0.1,
  seniorityFit: 0.1
} as const;

const DECISION_THRESHOLDS = {
  highPriority: 85,
  notify: 60
} as const;

const normalize = (value: string): string => value.trim().toLowerCase();

const tokenize = (value: string): string[] =>
  normalize(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const overlapScore = (left: string[], right: string[]): number => {
  const l = new Set(left.map(normalize));
  const r = new Set(right.map(normalize));

  if (l.size === 0 || r.size === 0) {
    return 0;
  }

  const intersection = [...l].filter((token) => r.has(token)).length;
  const base = Math.max(l.size, r.size);
  return intersection / base;
};

const bestTitleSimilarity = (desiredTitles: string[], jobTitle: string): number => {
  const jobTokens = tokenize(jobTitle);
  const scores = desiredTitles.map((title) => overlapScore(tokenize(title), jobTokens));
  return scores.length > 0 ? Math.max(...scores) : 0;
};

const computeCompensationFit = (candidate: MatchingCandidate, job: MatchingJob): number => {
  if (!candidate.minSalary) {
    return 0.7;
  }

  const upperBand = job.salaryMax ?? job.salaryMin;
  if (!upperBand) {
    return 0.4;
  }

  if (upperBand < candidate.minSalary) {
    return 0;
  }

  if (job.salaryMin && job.salaryMin >= candidate.minSalary) {
    return 1;
  }

  const spread = upperBand - candidate.minSalary;
  return Math.max(0.6, Math.min(1, spread / candidate.minSalary + 0.6));
};

const computeLocationFit = (candidate: MatchingCandidate, job: MatchingJob): number => {
  if (candidate.remoteOnly) {
    return job.isRemote ? 1 : 0;
  }

  if (job.isRemote && candidate.preferredLocations.length === 0) {
    return 1;
  }

  if (candidate.preferredLocations.length === 0) {
    return 0.7;
  }

  const fields = [job.locationText, job.locationCity, job.locationState, job.locationCountry]
    .filter(Boolean)
    .map((item) => normalize(String(item)));

  const hasPreferred = candidate.preferredLocations
    .map(normalize)
    .some((preferred) => fields.some((field) => field.includes(preferred)));

  return hasPreferred ? 1 : 0;
};

const computeSeniorityFit = (candidate: MatchingCandidate, job: MatchingJob): number => {
  if (!job.seniorityLevel || !candidate.acceptedSeniority || candidate.acceptedSeniority.length === 0) {
    return 0.75;
  }

  const wanted = new Set(candidate.acceptedSeniority.map(normalize));
  return wanted.has(normalize(job.seniorityLevel)) ? 1 : 0;
};

const buildHardFilterFailures = (candidate: MatchingCandidate, job: MatchingJob): MatchReason[] => {
  const failures: MatchReason[] = [];

  if (candidate.remoteOnly && !job.isRemote) {
    failures.push({
      code: "remote_mismatch",
      label: "Remote requirement not satisfied",
      detail: "Candidate only accepts remote roles, but this job is not remote."
    });
  }

  if (!candidate.remoteOnly && candidate.preferredLocations.length > 0 && !job.isRemote) {
    const locationFit = computeLocationFit(candidate, job);
    if (locationFit === 0) {
      failures.push({
        code: "location_mismatch",
        label: "Location mismatch",
        detail: "Job location is outside candidate preferred locations."
      });
    }
  }

  if (candidate.workAuthorizationCountries && candidate.workAuthorizationCountries.length > 0) {
    const allowed = (job.eligibleCountries ?? []).map(normalize);
    const authorized = candidate.workAuthorizationCountries.map(normalize);
    const matchesCountry = allowed.length === 0 || allowed.some((country) => authorized.includes(country));
    const sponsorshipBlocked = candidate.requiresVisaSponsorship && !job.visaSponsorshipOffered;

    if (!matchesCountry || sponsorshipBlocked) {
      failures.push({
        code: "visa_not_supported",
        label: "Work authorization mismatch",
        detail: "Role does not satisfy candidate work authorization or visa sponsorship needs."
      });
    }
  }

  if (candidate.minSalary) {
    const upperBand = job.salaryMax ?? job.salaryMin;
    if (upperBand && upperBand < candidate.minSalary) {
      failures.push({
        code: "comp_below_floor",
        label: "Compensation below floor",
        detail: `Job maximum compensation (${upperBand}) is below candidate floor (${candidate.minSalary}).`
      });
    }
  }

  if (candidate.desiredTitles.length > 0 && bestTitleSimilarity(candidate.desiredTitles, job.title) < 0.2) {
    failures.push({
      code: "role_mismatch",
      label: "Role mismatch",
      detail: "Job title does not align to candidate desired role targets."
    });
  }

  if (candidate.acceptedSeniority && candidate.acceptedSeniority.length > 0 && job.seniorityLevel) {
    const seniorityFit = computeSeniorityFit(candidate, job);
    if (seniorityFit === 0) {
      failures.push({
        code: "seniority_mismatch",
        label: "Seniority mismatch",
        detail: "Job seniority level is outside candidate accepted seniority levels."
      });
    }
  }

  return failures;
};

const deriveDecision = (score: number, failedHardFilters: boolean): MatchDecision => {
  if (failedHardFilters) {
    return "drop";
  }

  if (score >= DECISION_THRESHOLDS.highPriority) {
    return "high_priority";
  }

  if (score >= DECISION_THRESHOLDS.notify) {
    return "notify";
  }

  return "drop";
};

export const scoreMatch = (candidate: MatchingCandidate, job: MatchingJob): MatchComputation => {
  const hardFilterFailures = buildHardFilterFailures(candidate, job);

  const skillOverlap = overlapScore(candidate.skills, job.requiredSkills ?? []);
  const titleSimilarity = bestTitleSimilarity(candidate.desiredTitles, job.title);
  const compensationFit = computeCompensationFit(candidate, job);
  const locationFit = computeLocationFit(candidate, job);
  const seniorityFit = computeSeniorityFit(candidate, job);

  const weightedRaw =
    skillOverlap * WEIGHTS.skillOverlap +
    titleSimilarity * WEIGHTS.titleSimilarity +
    compensationFit * WEIGHTS.compensationFit +
    locationFit * WEIGHTS.locationFit +
    seniorityFit * WEIGHTS.seniorityFit;

  const score = Math.round(Math.max(0, Math.min(100, weightedRaw * 100)));

  const reasons: MatchReason[] = [
    {
      code: "skill_overlap",
      label: "Skill overlap",
      detail: "Overlap between candidate skills and required skills.",
      value: Number(skillOverlap.toFixed(2))
    },
    {
      code: "title_similarity",
      label: "Title similarity",
      detail: "Similarity between desired titles and the job title.",
      value: Number(titleSimilarity.toFixed(2))
    },
    {
      code: "comp_fit",
      label: "Compensation fit",
      detail: "How well compensation aligns with candidate floor.",
      value: Number(compensationFit.toFixed(2))
    },
    {
      code: "location_fit",
      label: "Location fit",
      detail: "How well location/remote setup aligns with preferences.",
      value: Number(locationFit.toFixed(2))
    },
    {
      code: "seniority_fit",
      label: "Seniority fit",
      detail: "How well seniority levels align.",
      value: Number(seniorityFit.toFixed(2))
    }
  ];

  return {
    score,
    decision: deriveDecision(score, hardFilterFailures.length > 0),
    hardFilterFailures,
    reasons,
    weightedComponents: {
      skillOverlap: Number((skillOverlap * WEIGHTS.skillOverlap * 100).toFixed(2)),
      titleSimilarity: Number((titleSimilarity * WEIGHTS.titleSimilarity * 100).toFixed(2)),
      compensationFit: Number((compensationFit * WEIGHTS.compensationFit * 100).toFixed(2)),
      locationFit: Number((locationFit * WEIGHTS.locationFit * 100).toFixed(2)),
      seniorityFit: Number((seniorityFit * WEIGHTS.seniorityFit * 100).toFixed(2))
    }
  };
};
