import { NotificationAction } from "./types.js";

export interface MatchAlertTemplateInput {
  jobTitle: string;
  companyName: string;
  locationText: string;
  score: string;
  reasonSummary: string;
  topReasons: string[];
  actions: readonly NotificationAction[];
}

export const buildMatchAlertMessage = (input: MatchAlertTemplateInput): string => {
  const reasons = input.topReasons.length > 0 ? input.topReasons : [input.reasonSummary];

  const reasonLines = reasons.slice(0, 3).map((reason, index) => `${index + 1}. ${reason}`).join("\n");
  const actionLine = input.actions.join(" | ");

  return [
    "🔔 New job match found",
    "",
    `**Job Summary**: ${input.jobTitle} at ${input.companyName} (${input.locationText})`,
    `**Score**: ${input.score}`,
    "**Top Match Reasons**:",
    reasonLines,
    "",
    `Actions: ${actionLine}`,
  ].join("\n");
};
