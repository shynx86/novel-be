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
    error-handler.ts  # Global error handling
    request-logger.ts # Request logging with unique request IDs
  routes/
    index.ts          # Route registration (all under /api/)
    auth.ts           # Auth routes: register, login, google, refresh, me
    health.ts         # Health check endpoint
  services/
    auth.ts           # Auth business logic (token exchange, user management)
    firebase.ts       # Shared Firebase Admin singleton (getAdminApp, getAuth, getFirestore)
    health.ts         # Health check service (Firestore connectivity test)
  utils/
    errors.ts         # Custom error classes (AppError, NotFoundError, UnauthorizedError, etc.)
    logger.ts         # Structured JSON logger
adapters/
  firebase/index.ts   # Firebase Cloud Functions adapter (wraps Hono with onRequest)
  standalone/index.ts # Standalone Node.js adapter (@hono/node-server)
tests/
  setup.ts            # Test setup and utilities
  __mocks__/          # Module mocks (firebase-admin, config/env)
  routes/             # Route tests
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

## Auth architecture

- **Auth endpoints**: `POST /register`, `POST /login`, `POST /google`, `POST /refresh`, `GET /me` (all under `/api/auth/`)
- **Token flow**: Backend returns `idToken` + `refreshToken` directly — no Firebase Client SDK needed on frontend
- **Login**: Uses Identity Toolkit REST API (`signInWithPassword`) — tokens come directly from the response (no custom token round-trip)
- **Register/Google**: Generate custom token via Firebase Admin, exchange for ID token via Identity Toolkit (`signInWithCustomToken`)
- **Refresh**: Uses `securetoken.googleapis.com/v1/token` with grant_type=refresh_token
- **Firestore user docs**: Stored in `users` collection, keyed by Firebase Auth UID. `getOrCreateUserDocument` uses `set({ merge: true })` to handle concurrent requests safely
- **Google OAuth**: Client-side flow — frontend sends Google ID token to backend, backend verifies via Firebase Admin
- **Protected routes**: `authMiddleware` verifies ID token via `getAuth().verifyIdToken()`

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
