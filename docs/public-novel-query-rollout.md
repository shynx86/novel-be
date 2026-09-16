# Public novel query rollout

The API now uses `public_filter_keys` for related novels and filtered public lists, and `title_grams` for substring search. These fields are maintained when novels or their author/genre relations change. Existing novels need a one-time backfill before the new queries can serve them.

1. Deploy `firebase/firestore.indexes.json` with `npm run deploy:indexes` and wait until all three new novel indexes are ready.
2. Run `DRY_RUN=true npm run migrate:novel-query-fields` and review the document count.
3. Pause novel metadata and author/genre writes, then run `npm run migrate:novel-query-fields` to backfill the fields on existing novels.
4. Deploy the backend and resume those writes. Keep the frontend API calls unchanged.
5. Check `/api/novels/:id/related`, `/api/novels?genre_id=...`, `/api/novels?author_id=...`, and `/api/search?title=...` against known novels. Check a title after the first 250 alphabetical novels.

The backfill is idempotent. It reads all novel and relation documents once, then writes only documents whose computed fields differ. `DRY_RUN=true` performs no writes. Run it again after a large import that used an older writer.
