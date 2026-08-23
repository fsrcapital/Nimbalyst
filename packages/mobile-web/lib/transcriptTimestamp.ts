export function formatTranscriptTimestamp(createdAt: number): string {
  if (!createdAt) return "";

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
