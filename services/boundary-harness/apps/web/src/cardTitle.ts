const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIRTY_RE = /e2e|\bg-[a-z0-9-]+/i;

export function isHumanTitle(name: unknown): boolean {
  const raw = String(name ?? "").trim();
  if (!raw || UUID_RE.test(raw) || DIRTY_RE.test(raw)) return false;
  return true;
}

/** Face title: human Goal title/summary, else 未命名目标. Never seed ids. */
export function sanitizeCardTitle(goal?: { title?: string; summary?: string } | null): string {
  for (const cand of [goal?.title, goal?.summary]) {
    if (isHumanTitle(cand)) return String(cand).trim();
  }
  return "未命名目标";
}
