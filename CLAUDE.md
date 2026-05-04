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
  app.ts              # Hono app setup, middleware registration
  config/env.ts       # Environment variables and configuration
  middleware/
    auth.ts           # Firebase Auth middleware (JWT verification)
    error-handler.ts  # Global error handling
    request-logger.ts # Request logging with unique request IDs
  routes/
    index.ts          # Route registration (all under /api/)
    health.ts         # Health check endpoint
  services/
    health.ts         # Health check service (Firestore connectivity test)
  utils/
    errors.ts         # Custom error classes (AppError, NotFoundError, etc.)
    logger.ts         # Structured JSON logger
adapters/
  firebase/index.ts   # Firebase Cloud Functions adapter (wraps Hono with onRequest)
  standalone/index.ts # Standalone Node.js adapter (@hono/node-server)
tests/
  setup.ts            # Test setup and utilities
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
- Each request gets a unique `X-Request-Id` header
- Middleware chain: request logger → routes → error handler

## Testing conventions

- Jest with ts-jest, ESM support enabled
- Tests import the Hono app directly from `src/app.ts`
- Run: `npm test`

## Code style

- Biome with double quotes, semicolons, trailing commas, 2-space indentation
- Path alias: `@/*` maps to `src/*`
