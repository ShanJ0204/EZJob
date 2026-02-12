export const NOTIFICATION_ACTIONS = ["Review", "Generate Docs", "Approve", "Reject"] as const;

export type NotificationAction = (typeof NOTIFICATION_ACTIONS)[number];

export interface MatchAlertPayload {
  userId: string;
  matchResultId: string;
}

export interface SendMessageInput {
  userId: string;
  matchResultId: string;
  text: string;
  actions: readonly NotificationAction[];
}

export interface SendMessageResult {
  messageId: string;
  channel: string;
  rawResponse?: Record<string, unknown>;
}

export interface CallbackPayload {
  userId: string;
  matchResultId: string;
  messageId: string;
  action: NotificationAction;
  metadata?: Record<string, unknown>;
}
