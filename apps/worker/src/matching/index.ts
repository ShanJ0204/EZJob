export { MatchingService } from "./service.js";
export { scoreMatch } from "./scoring.js";
export { PostgresMatchResultRepository } from "./repository.js";
export { MatchingWorker } from "./worker.js";
export type {
  MatchComputation,
  MatchDecision,
  MatchReason,
  MatchResultRecord,
  MatchingCandidate,
  MatchingJob,
  ReasonCode
} from "./types.js";
export type { MatchingExecutionSummary, NotificationJobData } from "./worker.js";
