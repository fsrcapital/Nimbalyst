const knownPhaseLabels: Record<string, string> = {
  backlog: "Backlog",
  planning: "Planning",
  implementing: "Implementing",
  validating: "Validating",
  complete: "Complete",
};

export function formatSessionPhase(phase: string | null | undefined): string {
  const normalized = phase?.trim().toLowerCase() ?? "";
  if (!normalized) return "";
  if (knownPhaseLabels[normalized]) return knownPhaseLabels[normalized];
  const words = normalized.replace(/[-_]+/g, " ");
  return words.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function sessionPhaseTone(phase: string | null | undefined): string {
  const normalized = phase?.trim().toLowerCase() ?? "";
  return normalized in knownPhaseLabels ? normalized : "other";
}
