# novel-be

Backend server for a novel reading website. Built with Hono on Node.js, deployed as Firebase Cloud Functions.

## Architecture Overview

```
Client (React/Vercel)
        │
        ▼
 Firebase Cloud Functions (asia-southeast1)
        │
        ▼
┌───────────────────────────────────────────┐
│              Hono Framework               │
│                                           │
│  Middleware: CORS → Request Logger → Auth │
│       │                                   │
│       ▼                                   │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  │
│  │  Public  │  │  Authed  │  │  Admin  │  │
│  │  Routes  │  │  Routes  │  │  Routes │  │
│  └────┬────┘  └────┬─────┘  └────┬────┘  │
│       │            │             │        │
│       ▼            ▼             ▼        │
│  ┌─────────────────────────────────────┐  │
│  │           Service Layer             │  │
│  │  auth · novel · chapter · credit    │  │
│  │  subscription · comment · favorite  │  │
│  │  history · search · genre · ad      │  │
│  │  author · translator                │  │
│  └─────────────────┬───────────────────┘  │
│                    │                      │
│                    ▼                      │
│         Firebase Admin SDK                │
│    (Firestore · Auth · Cloud Storage)     │
└───────────────────────────────────────────┘
        │
        ▼
   Firebase Firestore
```

### Adapter Pattern

The app supports two deployment modes:

- **Firebase**: `adapters/firebase/index.ts` — wraps Hono with `onRequest` for Cloud Functions v2
- **Standalone**: `adapters/standalone/index.ts` — runs as a plain Node.js HTTP server via `@hono/node-server`

Both import the same Hono app from `src/app.ts`.

### Middleware Chain

```
Request → CORS → Request Logger → Route Handler → Error Handler → Response
                                    │
                          ┌─────────┼─────────┐
                          │         │         │
                       public    auth     admin
                      (none)  (JWT verify) (role check)
```

## Database Model (Firestore)

### Collections

```
 Firestore
 │
 ├── users/{uid}
 │     ├── email, display_name, avatar_url
 │     ├── credits: number
 │     ├── role: "user" | "admin"
 │     ├── created_at, updated_at
 │     │
 │     ├── favorites/{novelId}           ← sub-collection
 │     │     └── created_at
 │     │
 │     └── reading_history/{novelId}     ← sub-collection
 │           ├── last_chapter_index
 │           ├── last_read_at
 │           └── read_chapters: number[]
 │
 ├── novels/{novelId}
 │     ├── slug, title, description
 │     ├── cover_url
 │     ├── status: "ongoing" | "completed" | "hiatus"
 │     ├── chapter_count, total_word_count
 │     ├── rating, views, followers, comment_count
 │     ├── price: number | null
 │     ├── created_at, updated_at
 │     │
 │     └── chapters/{chapterIndex}       ← sub-collection
 │           ├── title, content, word_count
 │           ├── access_type: "free" | "free_auth" | "paid"
 │           ├── price: number
 │           └── created_at, updated_at
 │
 ├── novel_authors/{novelId}:{authorId}  ← junction
 │     ├── novel_id, author_id
 │     └── created_at
 │
 ├── novel_translators/{novelId}:{translatorId}  ← junction
 │     ├── novel_id, translator_id
 │     └── created_at
 │
 ├── novel_genres/{novelId}:{genreId}    ← junction
 │     ├── novel_id, genre_id
 │     └── created_at
 │
 ├── subscriptions/{subId}
 │     ├── user_id, novel_id, chapter_index
 │     ├── type: "chapter" | "novel"
 │     ├── credits_paid
 │     └── subscribed_at
 │
 ├── credit_transactions/{txId}
 │     ├── user_id, type: "topup"
 │     ├── amount, balance_before, balance_after
 │     ├── performed_by
 │     └── created_at
 │
 ├── genres/{genreId}
 │     ├── name, slug
 │
 ├── authors/{authorId}
 │     ├── name, slug, bio, avatar_url
 │     └── created_at, updated_at
 │
 ├── translators/{translatorId}
 │     ├── name, slug, bio, avatar_url
 │     └── created_at, updated_at
 │
 └── ads/{adId}
       ├── title, image_url, link_url
       ├── position: "header" | "sidebar" | "footer" | "inline"
       ├── is_active, display_order
       ├── start_date, end_date
       ├── click_count, impression_count
       └── created_at, updated_at
```

### Access Control

| `access_type` | Behavior |
|---|---|
| `free` | Public — anyone can read |
| `free_auth` | Authenticated users only |
| `paid` | Requires active subscription (chapter or novel) |

## API Routes

All routes prefixed with `/api/`. List endpoints support `page` and `limit` query params (max 100).

### Public

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check (Firestore connectivity) |
| GET | `/api/genres` | List all genres |
| GET | `/api/search?q=&status=` | Search novels |
| GET | `/api/novels` | List novels (filters: `status`, `author_id`, `translator_id`, `genre_id`) |
| GET | `/api/novels/trending` | Trending novels |
| GET | `/api/novels/completed` | Completed novels |
| GET | `/api/novels/sitemap` | Sitemap data |
| GET | `/api/novels/by-slug/:slug` | Novel by slug |
| GET | `/api/novels/:novelId` | Novel detail |
| GET | `/api/novels/:novelId/related` | Related novels |
| GET | `/api/novels/:novelId/chapters` | List chapters (optional auth for `is_subscribed` annotation) |
| GET | `/api/novels/:novelId/chapters/:index` | Read chapter (access controlled) |
| POST | `/api/novels/:novelId/views` | Increment view count |
| GET | `/api/novels/:novelId/comments` | List comments (threaded) |
| POST | `/api/novels/:novelId/comments/:commentId/like` | Like a comment |

### Auth Required

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register (email + password) |
| POST | `/api/auth/login` | Login (email + password) |
| POST | `/api/auth/google` | Login/register via Google |
| POST | `/api/auth/refresh` | Refresh ID token |
| GET | `/api/auth/me` | Get current user profile |
| PATCH | `/api/auth/me` | Update profile (display_name, avatar_url) |
| GET | `/api/favorites` | List user's favorites |
| POST | `/api/favorites/:novelId` | Add to favorites |
| DELETE | `/api/favorites/:novelId` | Remove from favorites |
| GET | `/api/favorites/check/:novelId` | Check if favorited |
| GET | `/api/history` | Reading history |
| POST | `/api/history/:novelId` | Update reading progress |
| DELETE | `/api/history/:novelId` | Remove from history |
| POST | `/api/subscriptions/chapter` | Subscribe to chapter (deducts credits) |
| POST | `/api/subscriptions/novel` | Subscribe to novel (deducts credits) |
| GET | `/api/subscriptions` | List subscriptions |
| GET | `/api/subscriptions/check/:novelId/:index` | Check chapter access |
| GET | `/api/credits/balance` | Credit balance |
| GET | `/api/credits/history` | Credit transaction history |
| POST | `/api/novels/:novelId/comments` | Create comment |
| DELETE | `/api/novels/:novelId/comments/:commentId` | Delete comment |

### Admin Required (auth + admin role)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/auth/check` | Verify admin access |
| GET | `/api/admin/novels` | List novels (with content) |
| POST | `/api/admin/novels` | Create novel |
| GET | `/api/admin/novels/:novelId` | Get novel detail |
| PATCH | `/api/admin/novels/:novelId` | Update novel |
| DELETE | `/api/admin/novels/:novelId` | Delete novel |
| POST | `/api/admin/novels/:novelId/chapters` | Create chapter |
| GET | `/api/admin/novels/:novelId/chapters` | List chapters (with content) |
| GET | `/api/admin/novels/:novelId/chapters/:index` | Get chapter |
| PATCH | `/api/admin/novels/:novelId/chapters/:index` | Update chapter |
| DELETE | `/api/admin/novels/:novelId/chapters/:index` | Delete chapter |
| POST | `/api/admin/credits/topup` | Top up user credits |
| GET | `/api/admin/credits/history/:userId` | User's credit history |
| GET | `/api/admin/genres` | List genres |
| POST | `/api/admin/genres` | Create genre |
| PATCH | `/api/admin/genres/:genreId` | Update genre |
| DELETE | `/api/admin/genres/:genreId` | Delete genre |
| GET | `/api/admin/users` | List users |
| GET | `/api/admin/users/:userId` | Get user detail |
| PATCH | `/api/admin/users/:userId` | Update user |
| DELETE | `/api/admin/users/:userId` | Delete user |
| GET | `/api/admin/subscriptions` | List all subscriptions |
| GET | `/api/admin/subscriptions/:subId` | Get subscription |
| DELETE | `/api/admin/subscriptions/:subId` | Delete subscription |
| GET | `/api/admin/ads` | List ads |
| POST | `/api/admin/ads` | Create ad |
| GET | `/api/admin/ads/:adId` | Get ad |
| PATCH | `/api/admin/ads/:adId` | Update ad |
| DELETE | `/api/admin/ads/:adId` | Delete ad |
| GET | `/api/admin/authors` | List authors |
| POST | `/api/admin/authors` | Create author |
| GET | `/api/admin/authors/:authorId` | Get author |
| PATCH | `/api/admin/authors/:authorId` | Update author |
| DELETE | `/api/admin/authors/:authorId` | Delete author |
| GET | `/api/admin/translators` | List translators |
| POST | `/api/admin/translators` | Create translator |
| GET | `/api/admin/translators/:translatorId` | Get translator |
| PATCH | `/api/admin/translators/:translatorId` | Update translator |
| DELETE | `/api/admin/translators/:translatorId` | Delete translator |

## Prerequisites

- Node.js >= 20
- npm
- Firebase CLI (`npm install -g firebase-tools`)

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/shynx86/novel-be.git
   cd novel-be
   npm install
   ```

2. **Create environment file**

   ```bash
   cp .env.example .env
   ```

3. **Get the service account key**

   Ping @chunnc to get the `service-account.json` file, then place it in the project root.

   > **Never commit this file to git.** It is already listed in `.gitignore`.

4. **Get the Firebase Web API key**

   Ping @chunnc to get the `WEB_API_KEY` value, then update it in your `.env` file.

5. **Login to Firebase**

   ```bash
   firebase login
   ```

## Running locally

### Standalone mode (recommended for development)

```bash
npm run dev
```

Server starts at `http://localhost:3000`.

### Firebase Emulators

```bash
npm run serve
```

Emulator UI at `http://localhost:4000`.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Run standalone dev server with tsx |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled standalone server |
| `npm run serve` | Start Firebase emulators locally |
| `npm run deploy` | Deploy to Firebase Cloud Functions |
| `npm test` | Run tests |
| `npm run lint` | Biome check |
| `npm run format` | Biome format |
| `npm run typecheck` | TypeScript type check |

## Deploy

```bash
npm run deploy
```

Deploys to Firebase Cloud Functions in `asia-southeast1`.

## Migration

After deploying, run the migration script to move existing `author` and `genre` data from novels to junction collections:

```bash
npx tsx scripts/migrate-remove-author-genre.ts
```

This script:
1. Reads all novels with `author`/`genre` fields
2. Looks up corresponding author/genre documents by name
3. Creates junction documents in `novel_authors`/`novel_genres`
4. Removes `author` and `genre` fields from novel documents

**Prerequisites**: Authors and genres must already exist in their respective collections before running the migration.

## License

Private
