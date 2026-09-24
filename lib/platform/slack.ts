import "server-only";
import { getEnv } from "./env";
import { scoped } from "./logger";

const log = scoped("platform.slack");

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
}

export interface SlackMessagePayload {
  text?: string;
  blocks?: SlackBlock[];
}

/**
 * Checks if the Slack incoming webhook URL is configured.
 */
export function isSlackConfigured(): boolean {
  try {
    const env = getEnv();
    return Boolean(env.SLACK_WEBHOOK_URL && env.SLACK_WEBHOOK_URL.trim().length > 0);
  } catch {
    return Boolean(process.env.SLACK_WEBHOOK_URL && process.env.SLACK_WEBHOOK_URL.trim().length > 0);
  }
}

/**
 * Low-level dispatch to Slack webhook. Never throws, fails open.
 */
export async function sendSlackWebhook(payload: SlackMessagePayload): Promise<boolean> {
  let webhookUrl: string | undefined;
  try {
    const env = getEnv();
    webhookUrl = env.SLACK_WEBHOOK_URL;
  } catch {
    webhookUrl = process.env.SLACK_WEBHOOK_URL;
  }

  if (!webhookUrl || webhookUrl.trim() === "") {
    log.debug("Slack webhook not configured, skipping notification");
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(webhookUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      log.error("Slack webhook returned non-OK status", {
        status: response.status,
        statusText: response.statusText,
        body: errText,
      });
      return false;
    }

    return true;
  } catch (error) {
    clearTimeout(timeoutId);
    log.error("Failed to send Slack webhook notification", { error });
    return false;
  }
}

function getAppEnvName(): string {
  if (process.env.NODE_ENV === "production") return "PROD";
  if (process.env.VERCEL_ENV === "preview" || process.env.RAILWAY_ENVIRONMENT_NAME === "staging") return "STAGING";
  return "DEV";
}

/**
 * Notifies Slack when an email dispatch fails via the Nodemailer gateway.
 */
export async function notifyEmailFailure(details: {
  to: string;
  subject?: string;
  from?: string;
  error: string;
  retryable?: boolean;
}): Promise<void> {
  const envTag = getAppEnvName();
  const text = `🚨 [${envTag}] Email Delivery Failed: ${details.to}`;

  await sendSlackWebhook({
    text,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🚨 [${envTag}] Email Delivery Failed`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Recipient:*\n\`${details.to}\`` },
          { type: "mrkdwn", text: `*Subject:*\n${details.subject || "_None_"}` },
          { type: "mrkdwn", text: `*From / Sender:*\n${details.from || "Basilissa"}` },
          { type: "mrkdwn", text: `*Retryable:*\n${details.retryable ? "Yes (will retry)" : "No (permanent)"}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Error Detail:*\n\`\`\`${details.error}\`\`\``,
        },
      },
    ],
  });
}

/**
 * Notifies Slack when a background worker job exhausts max attempts and transitions to DEAD.
 */
export async function notifyJobDead(details: {
  id: string;
  type: string;
  attempts: number;
  maxAttempts: number;
  error: unknown;
  payload?: unknown;
}): Promise<void> {
  const envTag = getAppEnvName();
  const errorMessage =
    details.error instanceof Error
      ? `${details.error.name}: ${details.error.message}\n${details.error.stack || ""}`
      : String(details.error);

  const truncatedError = errorMessage.slice(0, 1000);
  const text = `💀 [${envTag}] Worker Job Dead-Lettered: ${details.type} (${details.id})`;

  let payloadSnippet = "";
  if (details.payload) {
    try {
      payloadSnippet = JSON.stringify(details.payload, null, 2).slice(0, 500);
    } catch {
      // ignore serialization errors
    }
  }

  const fields = [
    { type: "mrkdwn", text: `*Job Type:*\n\`${details.type}\`` },
    { type: "mrkdwn", text: `*Job ID:*\n\`${details.id}\`` },
    { type: "mrkdwn", text: `*Attempts:*\n${details.attempts}/${details.maxAttempts} (Exhausted)` },
    { type: "mrkdwn", text: `*Timestamp:*\n${new Date().toISOString()}` },
  ];

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `💀 [${envTag}] Worker Job Dead-Lettered`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields,
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Error:*\n\`\`\`${truncatedError}\`\`\``,
      },
    },
  ];

  if (payloadSnippet) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Payload Snippet:*\n\`\`\`json\n${payloadSnippet}\n\`\`\``,
      },
    });
  }

  await sendSlackWebhook({ text, blocks });
}

/**
 * Notifies Slack when a biometric terminal punch is quarantined (e.g. unknown serial number or unmapped PIN).
 */
export async function notifyTerminalQuarantine(details: {
  serialNumber: string;
  reason: string;
  pin?: string;
  rawPayload?: unknown;
}): Promise<void> {
  const envTag = getAppEnvName();
  const text = `⚠️ [${envTag}] Terminal Punch Quarantined: ${details.serialNumber} (PIN: ${details.pin || "unknown"})`;

  await sendSlackWebhook({
    text,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `⚠️ [${envTag}] Terminal Punch Quarantined`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Terminal SN:*\n\`${details.serialNumber}\`` },
          { type: "mrkdwn", text: `*Device User PIN:*\n\`${details.pin || "N/A"}\`` },
          { type: "mrkdwn", text: `*Reason:*\n${details.reason}` },
          { type: "mrkdwn", text: `*Time:*\n${new Date().toISOString()}` },
        ],
      },
      {
        type: "context",
        text: {
          type: "mrkdwn",
          text: "Action required: Map the employee PIN in Admin or verify physical device registration.",
        },
      },
    ],
  });
}

/**
 * Notifies Slack when SMS OTP delivery fails for mobile staff authentication.
 */
export async function notifyOtpFailure(details: {
  tel: string;
  name?: string;
  error: string;
}): Promise<void> {
  const envTag = getAppEnvName();
  const text = `📱 [${envTag}] SMS OTP Gateway Failure: ${details.tel}`;

  await sendSlackWebhook({
    text,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `📱 [${envTag}] SMS OTP Gateway Failure`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Recipient Tel:*\n\`${details.tel}\`` },
          { type: "mrkdwn", text: `*Staff Name:*\n${details.name || "N/A"}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Error:*\n\`\`\`${details.error}\`\`\``,
        },
      },
    ],
  });
}

/**
 * Notifies Slack when worker process encounters a fatal error or periodic sweep failure.
 */
export async function notifyWorkerError(details: {
  processName: string;
  action: string;
  error: unknown;
}): Promise<void> {
  const envTag = getAppEnvName();
  const errorMessage =
    details.error instanceof Error
      ? `${details.error.name}: ${details.error.message}\n${details.error.stack || ""}`
      : String(details.error);

  const text = `💥 [${envTag}] Worker Exception: ${details.action}`;

  await sendSlackWebhook({
    text,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `💥 [${envTag}] Worker Exception in ${details.processName}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Action:*\n${details.action}` },
          { type: "mrkdwn", text: `*Time:*\n${new Date().toISOString()}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Error Stack:*\n\`\`\`${errorMessage.slice(0, 1000)}\`\`\``,
        },
      },
    ],
  });
}
