import { scoreMatch } from "./scoring.js";
import type { MatchResultRepository } from "./repository.js";
import type { MatchResultRecord, MatchingCandidate, MatchingJob } from "./types.js";

export class MatchingService {
  constructor(private readonly repository: MatchResultRepository) {}

  async evaluateAndPersist(
    candidate: MatchingCandidate,
    job: MatchingJob,
    jobPostingId: string
  ): Promise<MatchResultRecord> {
    const computation = scoreMatch(candidate, job);

    const reasonSummary =
      computation.hardFilterFailures.length > 0
        ? `Dropped by hard filters: ${computation.hardFilterFailures.map((reason) => reason.code).join(", ")}`
        : `Decision=${computation.decision}; score=${computation.score}`;

    const result: MatchResultRecord = {
      userId: candidate.userId,
      jobPostingId,
      resumeVariantId: candidate.resumeVariantId,
      score: computation.score,
      decision: computation.decision,
      reasonSummary,
      reasonDetails: {
        reasons: computation.reasons,
        hardFilterFailures: computation.hardFilterFailures,
        weightedComponents: computation.weightedComponents
      }
    };

    await this.repository.save(result);
    return result;
  }
}
