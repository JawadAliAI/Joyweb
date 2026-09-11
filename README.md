# cptcryptoiin

A production-quality cryptocurrency exchange platform.
Customers get a mobile-first exchange interface — live market data, a simulated
wallet, fixed-duration demo positions, demo deposits, withdrawals, transfers and
conversions. Administrators get a full back office — user management, simulated
balance adjustment, trading configuration, withdrawal review, credit-score
management, support and an append-only audit trail.

---

## ⚠️ This is a simulation. Read this first.

**Nothing in this platform touches real money or a real blockchain.**

| The platform does NOT | What it does instead |
| --- | --- |
| Accept real cryptocurrency deposits | Records a `Deposit` row against a clearly fake placeholder address |
| Broadcast blockchain withdrawals | Records a `Withdrawal` row and moves simulated balances |
| Generate blockchain transaction IDs | Issues references prefixed `DEMO-`, deliberately unlike a chain hash |
| Custody customer funds | Stores `NUMERIC` balances against assets named `DEMO_USDT` / `DEMO_BTC` / `DEMO_ETH` |
| Settle real financial obligations | Settles simulated positions against public market prices |

Guard rails that enforce this:

- `DEMO_MODE` must be `true`. The application **refuses to start** otherwise
  (`app/main.py` raises at startup) — there is no non-simulated code path to fall
  back to.
- Every asset is named `DEMO_*` and every transaction reference is `DEMO-*`.
- Every response carries an `X-Demo-Mode: true` header.
- The UI branding is configured via environment and platform settings.
- Market **prices** are real, read from a public provider. When that provider is
  unreachable the platform shows "Market data unavailable" — **it never invents a
  price**, and any position that would have to settle against an invented price is
  voided with the stake returned in full.

### On trade fairness

There is **no facility to force an individual customer's outcome**. A position is
decided solely by comparing its recorded entry price to the public market price at
expiry:

```
UP   wins when exitPrice > entryPrice
DOWN wins when exitPrice < entryPrice
equal prices                → DRAW, stake returned
market data unavailable     → VOIDED, stake returned in full
```

Every settled trade stores `settlement_source` and `settlement_note`, so any
outcome can be explained after the fact.

For QA there is a **Simulation Test Mode**: an administrator may script a
`WIN` / `LOSS` / `DRAW` on an account explicitly flagged `is_test_account`. It is
refused (`NOT_A_TEST_ACCOUNT`) against any ordinary account, it is labelled as a
test scenario in the API response, and every use is written to the audit log.

### On administrator power

Administrators can adjust simulated balances, freeze accounts and change the
internal demo score — every one of those actions **requires a written reason** and
writes an `AuditLog` row in the same database transaction as the change itself.

Administrators **cannot** see, retrieve or set a user's password or fund password.
Only Argon2id hashes are stored; password recovery issues a single-use, expiring
reset token (only its SHA-256 digest is persisted).

The "credit score" is an **internal demo account reputation score**, 1–100. It is
not a credit-bureau score, is not derived from any real financial data, and the UI
says so wherever it appears.

---

## Architecture

```
┌────────────────────┐        ┌─────────────────────┐       ┌──────────────┐
│  Next.js 14        │  HTTP  │  FastAPI            │  SQL  │ PostgreSQL   │
│  App Router        │───────▶│  (Python 3.12)      │──────▶│ 16           │
│  React Query       │ cookies│  SQLAlchemy 2.0     │       │ NUMERIC money│
│  Tailwind tokens   │◀───────│  Alembic            │◀──────│              │
└────────────────────┘        └──────────┬──────────┘       └──────────────┘
                                         │ HTTPS (read-only)
                                         ▼
                              ┌──────────────────────┐
                              │ Public market data   │
                              │ (Binance public REST)│
                              └──────────────────────┘
```

**Request path.** The browser talks to one origin. In development Next.js rewrites
`/api/*` to the backend, so the HTTP-only auth cookies are same-site and no
cross-site cookie configuration is needed.

**Layering.** Routes validate and orchestrate; services hold the business rules
(`wallet_service`, `trade_engine`, `admin_service`, `pricing_service`); models are
persistence only. The upstream price vendor sits behind a `MarketDataProvider`
interface — swapping vendors means adding one class and changing an env var.

### Repository layout

```
.
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py           # auth, RBAC, CSRF, rate limiting, feature flags
│   │   │   ├── router.py         # aggregate router
│   │   │   └── routes/           # auth, markets, wallet, transactions, trades,
│   │   │                         # notifications, support, admin, platform
│   │   ├── core/                 # config, errors, security, logging
│   │   ├── db/
│   │   │   ├── base.py           # declarative base + mixins
│   │   │   ├── session.py        # engine, session factory, unit_of_work
│   │   │   ├── models/           # 20 tables
│   │   │   └── seed.py           # idempotent seed
│   │   ├── schemas/              # Pydantic v2, camelCase on the wire
│   │   ├── services/             # business logic
│   │   └── main.py               # app factory, middleware, lifespan
│   ├── alembic/                  # migrations
│   ├── tests/                    # unit + integration
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/                  # App Router pages (customer + /admin)
│   │   ├── components/
│   │   │   ├── ui/               # primitives, form, overlay, toast, tabs
│   │   │   ├── layout/           # AppShell, AppHeader, navigation, DemoBadge
│   │   │   ├── market/ wallet/ trade/ admin/
│   │   │   └── providers.tsx     # React Query + branding + toasts
│   │   ├── hooks/                # useSession and friends
│   │   └── lib/                  # api client, types, formatting
│   ├── tailwind.config.ts        # every colour is a CSS variable
│   └── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── Makefile
└── .env.example
```

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind, Lucide, Lightweight Charts | Server components where useful, one styling system driven entirely by CSS variables |
| Data fetching | TanStack Query | Cache, retry policy, invalidation after every balance change |
| Backend | FastAPI, Pydantic v2 | Validation and OpenAPI docs from the same type definitions |
| ORM | SQLAlchemy 2.0 (typed `Mapped[]`) + Alembic | Row locking for wallet safety; migrations for every schema change |
| Database | PostgreSQL 16 | `NUMERIC(30,10)` money — never floating point |
| Auth | Argon2id, JWT in HTTP-only cookies, double-submit CSRF | Browser-safe sessions without token handling in JS |

---

## Getting started

### Option A — Docker (recommended)

```bash
cp .env.example .env
# Set at minimum: POSTGRES_PASSWORD, JWT_SECRET, SEED_ADMIN_PASSWORD, SEED_DEMO_PASSWORD
# Generate a secret:  openssl rand -hex 32

make up        # start db + backend + frontend
make migrate   # apply migrations
make seed      # markets, durations, demo users, sample history
```

`docker-compose.yml` deliberately has **no default** for `JWT_SECRET` or
`POSTGRES_PASSWORD` — compose aborts with a message rather than booting on a
guessable secret.

- Customer app → <http://localhost:3000>
- Admin dashboard → <http://localhost:3000/admin>
- API docs → <http://localhost:8000/docs>

`make fresh` tears down volumes and rebuilds from scratch.

### Option B — Local development

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # set DATABASE_URL and JWT_SECRET
alembic upgrade head
python -m app.db.seed
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

### Demo credentials

The seed creates `admin@example.com` (SUPER_ADMIN, forced to change password on
first login), `demo@example.com` (a funded demo customer) and `qa@example.com`
(flagged `is_test_account`, the only account eligible for scripted test outcomes).

Passwords come from `SEED_ADMIN_PASSWORD` / `SEED_DEMO_PASSWORD`. **If you leave
them empty the seed generates strong random passwords and prints them once** — no
credential is hard-coded anywhere in the source tree.

---

## Commands

| Command | Effect |
| --- | --- |
| `make up` / `make down` / `make logs` | Container lifecycle |
| `make migrate` | `alembic upgrade head` |
| `make seed` | Idempotent seed |
| `make test` | Backend test suite |
| `make fresh` | Reset volumes, migrate and seed |
| `alembic revision --autogenerate -m "..."` | New migration (never edit the schema by hand) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Frontend checks |

---

## Money handling

Financial correctness rules the codebase enforces:

1. **No floats.** Every monetary column is `NUMERIC(30,10)`; every calculation uses
   Python `Decimal`; money crosses JSON as a **string** so precision survives.
2. **Rounding down.** `wallet_service.quantize` rounds toward zero, so a rounding
   error can never create value out of nothing.
3. **Row locking.** Wallets are read with `SELECT … FOR UPDATE` before being
   modified, so two concurrent requests cannot spend the same balance.
4. **Stable lock ordering.** Transfers lock both wallets ordered by user id, which
   makes a mirrored-transfer deadlock impossible.
5. **No negative balances.** A debit that would overdraw raises
   `INSUFFICIENT_BALANCE` instead of writing.
6. **Every movement is a ledger entry.** No code path mutates a balance without a
   `Transaction` row, so the ledger always explains the balance.
7. **Atomic multi-step operations.** A transfer, a conversion and a trade
   settlement each commit as one unit — the audit entry lands with the change it
   describes or neither lands.

Funds reserved by an open position or a pending withdrawal live in `locked`, not
`available`, so they cannot be double-spent while in flight.

---

## API

Interactive docs: `/docs` (Swagger) and `/redoc`. Every response uses one envelope.

```jsonc
// success
{ "success": true, "data": { } }

// failure
{ "success": false, "error": { "code": "INSUFFICIENT_BALANCE",
                               "message": "Insufficient demo balance." } }
```

| Area | Endpoints |
| --- | --- |
| Platform | `GET /api/platform/config` |
| Auth | `POST /api/auth/{register,login,logout,refresh,forgot-password,reset-password,change-password,fund-password}`, `GET /api/auth/me` |
| Markets | `GET /api/markets`, `/ticker`, `/{symbol}`, `/{symbol}/candles`, `POST\|DELETE /{symbol}/favorite` |
| Wallet | `GET /api/assets`, `/api/wallet`, `/api/wallet/history` |
| Deposits | `POST /api/deposits/demo`, `GET /api/deposits` |
| Withdrawals | `GET /api/withdrawals/options`, `GET /api/withdrawals`, `POST /api/withdrawals/demo`, `POST /api/withdrawals/{id}/cancel` |
| Transfers | `POST\|GET /api/transfers` |
| Conversions | `POST /api/conversions/quote`, `POST /api/conversions` |
| Trading | `GET /api/trades/config`, `POST\|GET /api/trades`, `GET /api/trades/{id}`, `GET /api/trades/{id}/result` |
| Notifications | `GET /api/notifications`, `/unread-count`, `POST /{id}/read`, `/read-all` |
| Support | `GET\|POST /api/support`, `GET /api/support/{id}`, `POST /api/support/{id}/messages` |
| Admin | `/api/admin/{dashboard,users,withdrawals,deposits,transactions,transfers,trades,markets,trading,settings,support,credit-scores,audit-logs,test-scenarios,admins}` |

Common error codes: `UNAUTHENTICATED`, `FORBIDDEN`, `CSRF_FAILED`, `NOT_FOUND`,
`VALIDATION_ERROR`, `INSUFFICIENT_BALANCE`, `ACCOUNT_RESTRICTED`,
`FEATURE_DISABLED`, `MAINTENANCE_MODE`, `FUND_PASSWORD_NOT_SET`,
`INVALID_FUND_PASSWORD`, `MARKET_DATA_UNAVAILABLE`, `NOT_A_TEST_ACCOUNT`,
`RATE_LIMITED`.

---

## Security

| Control | Implementation |
| --- | --- |
| Password hashing | Argon2id, with automatic rehash when parameters change |
| Session transport | JWT in HTTP-only, `SameSite` cookies — never readable by JS |
| CSRF | Double-submit: a readable `cd_csrf` cookie echoed in `x-csrf-token`, verified on every cookie-authenticated mutation |
| Authorisation | `USER` / `ADMIN` / `SUPER_ADMIN`, enforced by dependency, not by UI |
| Fund password | Separate Argon2id hash, required for withdrawals and transfers |
| Rate limiting | Sliding window on login, registration, password reset, withdrawal and trade creation |
| Input validation | Pydantic v2 server-side; client validation is convenience only |
| SQL injection | Parameterised SQLAlchemy throughout — no string-built SQL |
| XSS | React escaping; no `dangerouslySetInnerHTML` anywhere |
| Headers | `nosniff`, `DENY` framing, referrer policy, permissions policy, HSTS when `COOKIE_SECURE` |
| Secret hygiene | Logs pass through a redacting formatter that masks password, token, secret, api_key, cookie and PIN values |
| Password reset | Single-use, expiring; only the SHA-256 digest is stored |
| Enumeration | Login and forgot-password return identical responses whether or not the account exists |
| Audit | Append-only `audit_logs`, written in the same transaction as the change |

### Before deploying anywhere public

- [ ] `JWT_SECRET` is 32+ random bytes and unique per environment
- [ ] `COOKIE_SECURE=true` and the app is served over HTTPS only
- [ ] `ENVIRONMENT=production` (this suppresses the development-only reset token in API responses)
- [ ] `CORS_ORIGINS` lists exact origins — no wildcard
- [ ] Seed passwords set explicitly; the admin's forced password change completed
- [ ] Database credentials rotated away from the compose defaults
- [ ] The rate limiter moved to Redis if you run more than one backend replica (it is in-process by design — see `SlidingWindowLimiter`)
- [ ] Backups configured; migrations applied via `alembic upgrade head`, never by hand

---

## Testing

```bash
cd backend && pytest -q            # or: make test
cd frontend && npm run typecheck && npm run lint && npm run build
```

Tests run against SQLite for speed; `db/session.py` detects the driver and skips
`FOR UPDATE` where it is unsupported. Coverage spans wallet arithmetic and
overdraw refusal, trade outcome and payout maths, withdrawal/transfer/conversion
validation, credit-score adjustment, freeze restrictions, authentication and
authorisation, and the register → deposit → trade → withdraw journey end to end.

---

## Configuration

Runtime behaviour is split in two:

**Environment** (`.env`) — infrastructure: database URL, JWT secret, cookie
policy, CORS, market-data provider, seed credentials.

**Platform settings** (the `platform_settings` table, edited at
`/admin/settings`) — everything an operator changes without a deploy: app name,
logo, favicon, primary and secondary colour, support email, display currency,
demo label, maintenance mode, per-feature switches for trading, withdrawals,
deposits, transfers and conversions, withdrawal minimum/maximum/fee, the
simulated network list, trade durations and payouts, and the stake limits.

`settings_service.DEFAULTS` is the single source of truth for the shape and
default of every key — declaring a new setting once makes it appear in the seed
and in the admin UI automatically.

Changing the primary colour in the admin UI rewrites the `--color-primary` CSS
variable at runtime, so the whole product re-themes with no rebuild. No component
hard-codes a hex value.

---

## Deployment

**Frontend → Vercel.** Set `BACKEND_INTERNAL_URL` to the public backend URL and
`NEXT_PUBLIC_API_URL=/api` so the rewrite keeps everything same-origin.

**Backend → Railway / Render / Fly / ECS.** Deploy `backend/Dockerfile`. Run
`alembic upgrade head` as a release command. Required: `DATABASE_URL`,
`JWT_SECRET`, `CORS_ORIGINS`, `COOKIE_SECURE=true`, `ENVIRONMENT=production`.
Health check: `GET /health`.

**Database → managed PostgreSQL 16.** Enforce TLS and enable automated backups.

If the frontend and backend end up on different registrable domains you must set
`COOKIE_DOMAIN` to the shared parent and `COOKIE_SAMESITE=none` (which requires
`COOKIE_SECURE=true`). Keeping them same-origin behind the rewrite is simpler and
is the supported path.

---

## Accessibility & performance

Semantic landmarks and a skip link; every icon-only control carries an
`aria-label`; the tab strips implement the ARIA tab pattern with arrow-key
navigation; dialogs trap focus, restore it on close and respond to Escape; the
trade countdown is an `aria-live` region; every interactive target clears 44px;
focus is always visible; `prefers-reduced-motion` is honoured.

Charts are lazily imported so `lightweight-charts` stays out of the initial
bundle; market data is cached server-side with a short TTL so a burst of page
loads makes one upstream call; search input is debounced; and transactions,
trades, users and audit logs are all paginated — no screen fetches an unbounded
history.

---

## Licence & intent

Built as a demonstration and educational project. The brand, logo and iconography
are original. Use it to learn, to prototype, or to teach — **not** to represent
custody of anyone's money.

# Joyweb
