import { Pool } from "pg";
import type { Queue } from "bullmq";
import { MatchingService } from "./service.js";
import { PostgresMatchResultRepository } from "./repository.js";
import type { MatchDecision, MatchingCandidate, MatchingJob } from "./types.js";

type MatchingExecutionSummary = {
  processedCandidates: number;
  processedJobs: number;
  evaluatedPairs: number;
  persistedMatches: number;
  queuedNotifications: number;
};

type NotificationJobData = {
  userId: string;
  matchResultId: string;
  decision: Extract<MatchDecision, "notify" | "high_priority">;
};

type UserContextRow = {
  user_id: string;
  desired_titles: string[];
  preferred_locations: string[];
  remote_only: boolean;
  min_salary: number | null;
  notifications_enabled: boolean;
  summary: string | null;
  years_experience: string | null;
  latest_resume_variant_id: string | null;
  latest_resume_target_role: string | null;
  latest_resume_text: string | null;
};

type JobPostingRow = {
  id: string;
  source_name: string;
  source_job_id: string;
  source_url: string | null;
  title: string;
  company_name: string;
  location_text: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  is_remote: boolean;
  employment_type: string | null;
  seniority_level: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  posted_at: Date | null;
  description: string | null;
};

const DEFAULT_RECENT_JOBS_LIMIT = Number(process.env.MATCHING_RECENT_JOBS_LIMIT ?? 50);
const DEFAULT_ACTIVE_USERS_LIMIT = Number(process.env.MATCHING_ACTIVE_USERS_LIMIT ?? 300);
const SKIP_NOTIFICATIONS_DISABLED = (process.env.MATCHING_SKIP_NOTIFICATIONS_DISABLED ?? "true") === "true";
const EMPLOYMENT_TYPES = new Set(["full-time", "part-time", "contract", "internship", "temporary", "other"] as const);

const mapEmploymentType = (value: string | null): MatchingJob["employmentType"] =>
  value && EMPLOYMENT_TYPES.has(value as never) ? (value as MatchingJob["employmentType"]) : undefined;

const SKILL_TOKENS_TO_IGNORE = new Set([
  "and",
  "with",
  "from",
  "that",
  "this",
  "have",
  "your",
  "will",
  "role",
  "team",
  "years",
  "experience",
  "developer",
  "engineer"
]);

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !SKILL_TOKENS_TO_IGNORE.has(token));

const inferSkillsFromContext = (contextFields: (string | null | undefined)[]): string[] => {
  const tokens = contextFields.flatMap((field) => (field ? tokenize(field) : []));
  const frequency = new Map<string, number>();

  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }

  return [...frequency.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 30)
    .map(([token]) => token);
};

const inferAcceptedSeniority = (yearsExperienceRaw: string | null): string[] => {
  const years = Number(yearsExperienceRaw ?? "0");

  if (!Number.isFinite(years) || years <= 0) {
    return [];
  }

  if (years < 2) {
    return ["junior", "entry", "associate"];
  }

  if (years < 6) {
    return ["mid", "intermediate", "senior"];
  }

  return ["senior", "staff", "lead", "principal"];
};

const toMatchingCandidate = (row: UserContextRow): MatchingCandidate => {
  const derivedSkills = inferSkillsFromContext([
    row.summary,
    row.latest_resume_target_role,
    row.latest_resume_text
  ]);

  return {
    userId: row.user_id,
    resumeVariantId: row.latest_resume_variant_id ?? undefined,
    desiredTitles: row.desired_titles,
    preferredLocations: row.preferred_locations,
    remoteOnly: row.remote_only,
    minSalary: row.min_salary ?? undefined,
    acceptedSeniority: inferAcceptedSeniority(row.years_experience),
    skills: derivedSkills
  };
};

const toMatchingJob = (row: JobPostingRow): MatchingJob => ({
  sourceName: row.source_name,
  sourceJobId: row.source_job_id,
  sourceUrl: row.source_url ?? `https://example.invalid/jobs/${row.id}`,
  title: row.title,
  companyName: row.company_name,
  locationText: row.location_text ?? "",
  locationCity: row.location_city ?? undefined,
  locationState: row.location_state ?? undefined,
  locationCountry: row.location_country ?? undefined,
  isRemote: row.is_remote,
  employmentType: mapEmploymentType(row.employment_type),
  seniorityLevel: row.seniority_level ?? undefined,
  salaryMin: row.salary_min ?? undefined,
  salaryMax: row.salary_max ?? undefined,
  salaryCurrency: row.salary_currency ?? undefined,
  postedAt: row.posted_at?.toISOString(),
  description: row.description ?? "",
  normalizedKey: `${row.source_name}:${row.source_job_id}`,
  dedupSignature: `${row.title}:${row.company_name}:${row.location_text ?? ""}`,
  requiredSkills: inferSkillsFromContext([row.description, row.title])
});

export class MatchingWorker {
  private readonly pool: Pool;
  private readonly service: MatchingService;
  private readonly resultRepository: PostgresMatchResultRepository;

  constructor(
    private readonly notificationQueue: Queue<NotificationJobData>,
    databaseUrl = process.env.DATABASE_URL
  ) {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for matching worker");
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      allowExitOnIdle: true
    });
    this.resultRepository = new PostgresMatchResultRepository(databaseUrl);
    this.service = new MatchingService(this.resultRepository);
  }

  async runCycle(): Promise<MatchingExecutionSummary> {
    const [users, jobs] = await Promise.all([this.fetchActiveCandidates(), this.fetchRecentJobs()]);

    let evaluatedPairs = 0;
    let persistedMatches = 0;
    let queuedNotifications = 0;

    for (const user of users) {
      const candidate = toMatchingCandidate(user);

      for (const job of jobs) {
        evaluatedPairs += 1;
        const result = await this.service.evaluateAndPersist(candidate, toMatchingJob(job), job.id);
        persistedMatches += 1;

        if (
          result.id &&
          (result.decision === "notify" || result.decision === "high_priority") &&
          user.notifications_enabled
        ) {
          await this.notificationQueue.add(
            "dispatch-match-alert",
            {
              userId: result.userId,
              matchResultId: result.id,
              decision: result.decision
            },
            {
              jobId: `notify:${result.id}`,
              removeOnComplete: 100,
              removeOnFail: 200
            }
          );
          queuedNotifications += 1;
        }
      }
    }

    return {
      processedCandidates: users.length,
      processedJobs: jobs.length,
      evaluatedPairs,
      persistedMatches,
      queuedNotifications
    };
  }

  async close(): Promise<void> {
    await Promise.all([this.pool.end(), this.resultRepository.close()]);
  }

  private async fetchRecentJobs(): Promise<JobPostingRow[]> {
    const queryResult = await this.pool.query<JobPostingRow>(
      `
      SELECT
        id,
        source_name,
        source_job_id,
        source_url,
        title,
        company_name,
        location_text,
        location_city,
        location_state,
        location_country,
        is_remote,
        employment_type,
        seniority_level,
        salary_min,
        salary_max,
        salary_currency,
        posted_at,
        description
      FROM job_postings
      ORDER BY COALESCE(posted_at, indexed_at, created_at) DESC
      LIMIT $1
      `,
      [DEFAULT_RECENT_JOBS_LIMIT]
    );

    return queryResult.rows;
  }

  private async fetchActiveCandidates(): Promise<UserContextRow[]> {
    const queryResult = await this.pool.query<UserContextRow>(
      `
      SELECT
        u.id AS user_id,
        COALESCE(up.desired_titles, ARRAY[]::text[]) AS desired_titles,
        COALESCE(up.preferred_locations, ARRAY[]::text[]) AS preferred_locations,
        COALESCE(up.remote_only, false) AS remote_only,
        up.min_salary,
        COALESCE(up.notifications_enabled, true) AS notifications_enabled,
        cp.summary,
        cp.years_experience::text AS years_experience,
        rv.id AS latest_resume_variant_id,
        rv.target_role AS latest_resume_target_role,
        rm.parsed_text AS latest_resume_text
      FROM users u
      LEFT JOIN user_preferences up ON up.user_id = u.id
      LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT rv_inner.id, rv_inner.target_role, rv_inner.resume_master_id
        FROM resume_variants rv_inner
        WHERE rv_inner.user_id = u.id
        ORDER BY rv_inner.created_at DESC
        LIMIT 1
      ) rv ON true
      LEFT JOIN resume_masters rm ON rm.id = rv.resume_master_id
      WHERE u.is_active = true
        AND ($2::boolean = false OR COALESCE(up.notifications_enabled, true) = true)
      ORDER BY u.created_at DESC
      LIMIT $1
      `,
      [DEFAULT_ACTIVE_USERS_LIMIT, SKIP_NOTIFICATIONS_DISABLED]
    );

    return queryResult.rows;
  }
}

export type { MatchingExecutionSummary, NotificationJobData };
