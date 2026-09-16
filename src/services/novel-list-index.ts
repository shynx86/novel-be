export function normalizeNovelTitle(title: string): string {
  return title.trim().toLocaleLowerCase("vi");
}

/** Firestore can match one array value, so each value encodes one filter combination. */
export function publicFilterKey(filters: {
  status?: string;
  translatorId?: string;
  authorId?: string;
  genreId?: string;
}): string {
  return JSON.stringify([
    filters.status ?? null,
    filters.translatorId ?? null,
    filters.authorId ?? null,
    filters.genreId ?? null,
  ]);
}

export function publicFilterKeys(fields: Record<string, unknown>): string[] {
  if (fields.publication_status === "draft") return [];

  const statuses = [undefined, typeof fields.status === "string" ? fields.status : undefined];
  const translators = [
    undefined,
    typeof fields.translator_id === "string" ? fields.translator_id : undefined,
  ];
  const authors = [
    undefined,
    ...new Set(
      Array.isArray(fields.author_ids)
        ? fields.author_ids.filter((id) => typeof id === "string")
        : [],
    ),
  ];
  const genres = [
    undefined,
    ...new Set(
      Array.isArray(fields.genre_ids)
        ? fields.genre_ids.filter((id) => typeof id === "string")
        : [],
    ),
  ];
  const keys = new Set<string>();
  for (const status of statuses) {
    for (const translatorId of translators) {
      for (const authorId of authors) {
        for (const genreId of genres) {
          keys.add(publicFilterKey({ status, translatorId, authorId, genreId }));
        }
      }
    }
  }
  return [...keys];
}

/** A three-character gram narrows substring candidates; shorter searches use shorter grams. */
export function titleGrams(title: string, isPublic = true): string[] {
  if (!isPublic) return [];
  const normalized = normalizeNovelTitle(title);
  const grams = new Set<string>();
  for (const size of [1, 2, 3]) {
    for (let index = 0; index <= normalized.length - size; index += 1) {
      grams.add(normalized.slice(index, index + size));
    }
  }
  return [...grams];
}

export function searchGram(search: string): string {
  const normalized = normalizeNovelTitle(search);
  return normalized.slice(0, Math.min(3, normalized.length));
}
