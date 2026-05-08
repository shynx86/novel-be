# novel-be

Backend server for a novel reading website. Built with Hono on Node.js, deployed as Firebase Cloud Functions (asia-southeast1).

## Stack

- **Runtime**: Node.js (≥20)
- **Framework**: Hono
- **Language**: TypeScript (strict mode, ES2022, NodeNext modules)
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication (JWT verification via Firebase Admin SDK)
- **Deployment**: Firebase Cloud Functions v2 (Cloud Run-based), also supports standalone Node.js
- **Formatting/Linting**: Biome (`biome check src/ adapters/ tests/`)
- **Testing**: Jest + ts-jest

## Project layout

```
src/
  app.ts              # Hono app setup, middleware registration, global error handler
  config/env.ts       # Environment variables and configuration
  middleware/
    auth.ts           # Firebase Auth middleware (JWT verification via shared firebase.ts)
    optional-auth.ts  # Optional auth — silently ignores invalid tokens (for public content)
    admin.ts          # Admin role verification (checks user.role === "admin" in Firestore)
    error-handler.ts  # Global error handling
    request-logger.ts # Request logging with unique request IDs
  routes/
    index.ts          # Route registration (all under /api/)
    auth.ts           # Auth routes: register, login, google, refresh, me
    health.ts         # Health check endpoint
    novels.ts         # Public novel/chapter browsing (list, detail, chapters, read)
    subscriptions.ts  # User subscriptions (subscribe chapter/novel, list, check access)
    credits.ts        # User credits (balance, topup history)
    admin-novels.ts   # Admin novel/chapter CRUD
    admin-credits.ts  # Admin credit management (topup, history)
  services/
    auth.ts           # Auth business logic (token exchange, user management)
    firebase.ts       # Shared Firebase Admin singleton (getAdminApp, getAuth, getFirestore)
    health.ts         # Health check service (Firestore connectivity test)
    novel.ts          # Novel CRUD operations
    chapter.ts        # Chapter CRUD operations with auto-indexing
    subscription.ts   # Subscription management with credit deduction (atomic Firestore transactions)
    credit.ts         # Credit balance and transaction management
  types/
    novel.ts          # TypeScript interfaces (NovelDocument, ChapterDocument, SubscriptionDocument, etc.)
  utils/
    errors.ts         # Custom error classes (AppError, NotFoundError, UnauthorizedError, ForbiddenError, ValidationError, etc.)
    logger.ts         # Structured JSON logger
adapters/
  firebase/index.ts   # Firebase Cloud Functions adapter (wraps Hono with onRequest)
  standalone/index.ts # Standalone Node.js adapter (@hono/node-server)
tests/
  setup.ts            # Test setup and utilities
  __mocks__/          # Module mocks (firebase-admin, config/env)
  routes/             # Route tests (health, auth, novels, subscriptions, credits, admin-novels)
firebase/             # Firebase config (firestore rules, storage rules, indexes)
docs/                 # Documentation
```

## Adapter pattern

The app supports two deployment modes via adapters:
- **Firebase**: `adapters/firebase/index.ts` — wraps the Hono app with Firebase Functions `onRequest`
- **Standalone**: `adapters/standalone/index.ts` — runs as a plain Node.js HTTP server via `@hono/node-server`

Both import the same Hono app from `src/app.ts`.

## Commands

- `npm run dev` — Run standalone server with tsx (reads .env)
- `npm run build` — Compile TypeScript to dist/
- `npm start` — Run compiled standalone server
- `npm run serve` — Start Firebase emulators locally
- `npm run deploy` — Deploy to Firebase Cloud Functions
- `npm test` — Run tests
- `npm run lint` — Biome check
- `npm run format` — Biome format
- `npm run typecheck` — TypeScript type check

## API conventions

- All routes prefixed with `/api/`
- Error response format: `{ error: { code, message, details? } }`
- Success response format: `{ data: ... }`
- Each request gets a unique `X-Request-Id` header
- Middleware chain: request logger → routes → error handler
- All list endpoints support pagination with `page` and `limit` query params (max limit: 100)
- Paginated responses: `{ data: { items: [], page, limit, total } }`

## Auth architecture

- **Auth endpoints**: `POST /register`, `POST /login`, `POST /google`, `POST /refresh`, `GET /me` (all under `/api/auth/`)
- **Token flow**: Backend returns `idToken` + `refreshToken` directly — no Firebase Client SDK needed on frontend
- **Login**: Uses Identity Toolkit REST API (`signInWithPassword`) — tokens come directly from the response (no custom token round-trip)
- **Register/Google**: Generate custom token via Firebase Admin, exchange for ID token via Identity Toolkit (`signInWithCustomToken`)
- **Refresh**: Uses `securetoken.googleapis.com/v1/token` with grant_type=refresh_token
- **Firestore user docs**: Stored in `users` collection, keyed by Firebase Auth UID. `getOrCreateUserDocument` uses `set({ merge: true })` to handle concurrent requests safely
- **Google OAuth**: Client-side flow — frontend sends Google ID token to backend, backend verifies via Firebase Admin
- **Protected routes**: `authMiddleware` verifies ID token via `getAuth().verifyIdToken()`
- **Optional auth**: `optionalAuthMiddleware` sets user context if token is valid, silently proceeds otherwise
- **Admin routes**: `adminMiddleware` checks `user.role === "admin"` in Firestore, returns 403 if not admin

## Novel & chapter system

- **Firestore collections**: `novels` (top-level), `novels/{novelId}/chapters` (sub-collection)
- **Chapters**: Auto-indexed (server assigns next index on create), tracked by `chapter_count` and `total_word_count` on novel doc
- **Access types**: `free` (public), `free_auth` (authenticated users), `paid` (subscription required)
- **Chapter listing**: Content excluded by default for performance (`includeContent: false` for public, `true` for admin)
- **Subscription annotation**: Chapter lists for authenticated users include `is_subscribed` field based on user's subscriptions

## Subscription & credit system

- **Subscription types**: Per-chapter (`chapter`) or whole-novel (`novel`)
- **Firestore collection**: `subscriptions` with composite fields (`user_id`, `novel_id`, `chapter_index`, `type`)
- **Credit deduction**: Atomic Firestore transactions — deduct credits + create subscription in one transaction
- **Insufficient credits**: Returns 402 with `INSUFFICIENT_CREDITS` error code
- **Credit transactions**: Logged in `credit_transactions` collection with `balance_before`/`balance_after` snapshots
- **Admin topup**: Admins can top up user credits via `/api/admin/credits/topup`

## Testing conventions

- Jest with ts-jest, ESM support enabled
- Tests import the Hono app directly from `src/app.ts`
- `firebase-admin` and `config/env` are mocked via `moduleNameMapper` in jest.config.js (not `jest.mock`)
- Module mapper order matters: env mock must come before the generic `.js` stripping rule
- Mocks defined in `tests/__mocks__/firebase-admin.ts` and `tests/__mocks__/config-env.ts`
- Run: `npm test`

## Code style

- Biome with double quotes, semicolons, trailing commas, 2-space indentation
- Path alias: `@/*` maps to `src/*`
