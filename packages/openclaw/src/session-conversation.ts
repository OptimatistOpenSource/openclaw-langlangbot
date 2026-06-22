export const CONVERSATION_UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const CONVERSATION_UUID = CONVERSATION_UUID_PATTERN;

export const CONVERSATION_UUID_RE = new RegExp(
  `^${CONVERSATION_UUID_PATTERN}$`,
  "i",
);

export function isConversationUuid(raw: string): boolean {
  return CONVERSATION_UUID_RE.test(raw.trim());
}

const DIRECT_SESSION_CONVERSATION_RE = new RegExp(
  `:direct:conversation:(${CONVERSATION_UUID})\\b`,
  "i",
);
const EMBEDDED_SESSION_CONVERSATION_RE = new RegExp(
  `conversation:(${CONVERSATION_UUID})\\b`,
  "i",
);

export function resolveLanglangbotSessionConversationId(
  sessionKey?: string | null,
): string | null {
  if (!sessionKey) {
    return null;
  }
  const direct = sessionKey.match(DIRECT_SESSION_CONVERSATION_RE);
  if (direct?.[1]) {
    return direct[1].toLowerCase();
  }
  const embedded = sessionKey.match(EMBEDDED_SESSION_CONVERSATION_RE);
  if (embedded?.[1]) {
    return embedded[1].toLowerCase();
  }
  return null;
}
