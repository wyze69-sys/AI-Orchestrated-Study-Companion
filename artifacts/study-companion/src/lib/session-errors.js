export function getSessionMutationError(error, fallback = "Unable to create the study session. Please try again.") {
  const data = error?.data;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (data && typeof data === "object") {
    const message = data.error ?? data.message ?? data.detail;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();
  return fallback;
}
