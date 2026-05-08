export function parsePagination(
  pageParam: string | null | undefined,
  limitParam: string | null | undefined,
  defaultLimit = 20,
): { page: number; limit: number } {
  const page = Math.max(1, Number(pageParam) || 1);
  const limit = Math.min(100, Math.max(1, Number(limitParam) || defaultLimit));
  return { page, limit };
}
