# novel-be

Backend server for a novel reading website. Built with Hono on Node.js, deployed as Firebase Cloud Functions.

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

## API Endpoints

All routes are prefixed with `/api/`. List endpoints support `page` and `limit` query params (max limit: 100).

### Auth (`/api/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | No | Register with email/password |
| POST | `/login` | No | Login with email/password |
| POST | `/google` | No | Login/register with Google OAuth |
| POST | `/refresh` | No | Refresh ID token |
| GET | `/me` | Yes | Get current user profile |

### Health (`/api/health`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Health check |

### Novels (`/api/novels`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | No | List novels (supports `genre`, `status` filters) |
| GET | `/:novelId` | No | Get novel detail |
| GET | `/:novelId/chapters` | Optional | List chapters (annotated with `is_subscribed` if authenticated) |
| GET | `/:novelId/chapters/:index` | Optional | Read chapter (access controlled by `access_type`) |

### Subscriptions (`/api/subscriptions`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/chapter` | Yes | Subscribe to a chapter (deducts credits) |
| POST | `/novel` | Yes | Subscribe to a whole novel (deducts credits) |
| GET | `/` | Yes | List user's subscriptions |
| GET | `/check/:novelId/:index` | Yes | Check access to a chapter |

### Credits (`/api/credits`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/balance` | Yes | Get credit balance |
| GET | `/history` | Yes | Get topup history |

### Admin — Novels (`/api/admin/novels`)

All admin routes require authentication + admin role.

| Method | Path | Description |
|---|---|---|
| POST | `/` | Create novel |
| GET | `/` | List novels |
| GET | `/:novelId` | Get novel detail |
| PATCH | `/:novelId` | Update novel |
| DELETE | `/:novelId` | Delete novel |
| POST | `/:novelId/chapters` | Create chapter |
| GET | `/:novelId/chapters` | List chapters (with content) |
| GET | `/:novelId/chapters/:index` | Get chapter |
| PATCH | `/:novelId/chapters/:index` | Update chapter |
| DELETE | `/:novelId/chapters/:index` | Delete chapter |

### Admin — Credits (`/api/admin/credits`)

All admin routes require authentication + admin role.

| Method | Path | Description |
|---|---|---|
| POST | `/topup` | Top up user credits |
| GET | `/history/:userId` | Get user's topup history |

## Deploy

```bash
npm run deploy
```

Deploys to Firebase Cloud Functions in `asia-southeast1`.

## License

Private
