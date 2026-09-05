# Security Policy

CryptoDemo Exchange is a **paper-trading simulator**. It holds no customer funds
and touches no blockchain. It does, however, hold real credentials and real
personal data, and that is what this document is about.

For the control-by-control table and the minimum deploy checklist, see the
**Security** section of [`README.md`](README.md). This file covers what that
section does not: the threat model, the explicit non-goals, how to report a
problem, and the hardening steps that matter before the simulator is exposed to
the public internet.

---

## Threat model

**What an attacker cannot get.** There are no funds to steal. Balances are
`NUMERIC` columns against assets literally named `DEMO_USDT` / `DEMO_BTC` /
`DEMO_ETH`; there is no wallet, no private key, no exchange API key with
withdrawal rights, and no settlement rail. Compromising this platform completely
still moves no money. `DEMO_MODE` is a startup assertion (`app/main.py` refuses
to boot when it is false), not a feature flag, so there is no non-simulated code
path to unlock.

**What an attacker can get, and what we defend.**

| Asset at risk | Why it matters | Realistic attack |
| --- | --- | --- |
| Password hashes | Users reuse passwords on real exchanges. This is the highest-value thing in the database. | Database exfiltration, a readable backup, offline cracking |
| Live sessions | Full account takeover inside the simulator, including the admin back office | Stolen cookie, CSRF, XSS |
| Personal data | Names, emails, support-ticket contents, profile fields | Broken access control — reading another user's records via a guessable id |
| Administrator capability | Adjusting simulated balances, credit scores and account status; reading every user | Privilege escalation, or an admin account left on a seeded password |
| The audit trail | An attacker who can rewrite history cannot be investigated | Tampering with or truncating `audit_logs` |
| Reputational integrity | A simulator that looks like a real exchange is attractive to reuse as a scam front | Cloning the UI, or an operator quietly removing the demo badges |

**Trust boundaries.** The browser is untrusted; every rule is enforced
server-side and client-side validation is convenience only. Market prices come
from a public third-party provider and are treated as untrusted input — when the
provider is unreachable no price is invented, and any position that would settle
against a missing price is voided with the stake returned. Administrators are
partially trusted: they are powerful, but every action they take is written to
the append-only audit log in the same transaction as the change, and outcome
scripting is refused against any account not flagged `is_test_account`.

**Out of scope.** Physical access to the host, a malicious operator with
database shell access, and denial-of-service beyond the in-process rate limiter.

---

## Controls in place

Summarised here; the README table says exactly where each one lives.

- **Credentials** — Argon2id password hashing with automatic rehash on parameter
  change, plus a separate Argon2id fund password required for withdrawals and
  transfers. Password reset tokens are single-use and expiring, and only their
  SHA-256 digest is stored. Login and forgot-password return identical responses
  whether or not the account exists.
- **Sessions** — JWTs carried in HTTP-only, `SameSite` cookies that JavaScript
  cannot read, plus double-submit CSRF: a readable `cd_csrf` cookie must be
  echoed in `x-csrf-token` on every cookie-authenticated mutation.
- **Authorisation** — `USER` / `ADMIN` / `SUPER_ADMIN` enforced by a request
  dependency rather than by what the UI chooses to render.
- **Abuse limits** — sliding-window rate limiting on login, registration,
  password reset, withdrawal and trade creation.
- **Input and storage** — Pydantic v2 validation on every request body, and
  parameterised SQLAlchemy throughout with no string-built SQL anywhere.
- **Transport and browser** — `nosniff`, `DENY` framing, referrer and permissions
  policy, and HSTS when `COOKIE_SECURE` is on. React escaping, with no
  `dangerouslySetInnerHTML` in the codebase.
- **Operational hygiene** — a redacting log formatter masks password, token,
  secret, api_key, cookie and PIN values before anything is written, and the
  `audit_logs` table is append-only.
- **Secrets** — `JWT_SECRET` and `POSTGRES_PASSWORD` have **no fallback default**
  in `docker-compose.yml`. They use `${VAR:?...}`, so compose aborts with a
  readable error rather than starting with a guessable value. `.env` is
  git-ignored; `.env.example` is tracked and ships every secret blank.

---

## Non-goals

These are deliberate absences, not gaps waiting to be filled.

- **No custody.** The platform never holds, receives or controls
  cryptocurrency. Deposit addresses shown in the UI are obvious placeholders.
- **No blockchain.** Nothing is signed or broadcast. References are prefixed
  `DEMO-` precisely so they cannot be mistaken for a chain hash.
- **No real settlement.** Positions settle against public prices into simulated
  balances. No real financial obligation is ever created or discharged.
- **No payment processing.** There is no card, bank or PSP integration, and so
  no cardholder data and no PCI scope.
- **Not a regulated venue.** There is no order book, no counterparty, no
  liquidity and no market making. It is not an exchange and must never be
  presented as one.

Because of all this, the project is not a suitable base for anything that does
handle real value. Please do not use it as one.

---

## Reporting a vulnerability

Email the address configured as `SUPPORT_EMAIL` (see `.env.example`) with
`SECURITY` in the subject line. Include what you found, the steps to reproduce
it, and the impact you believe it has. Please do not open a public issue for an
unfixed vulnerability, and please do not test against anyone else's deployment.

We aim to acknowledge a report within a few working days. Since the platform
holds no funds, severity is judged by exposure of credentials, personal data or
administrator capability — not by the size of any simulated balance an issue can
move.

**Please do report:** authentication or authorisation bypass, access to another
user's data, CSRF or XSS, SQL injection, secret leakage in logs or responses,
audit-log tampering, and any way to make the platform behave as though it were
handling real funds.

**Please don't report:** that an administrator can adjust simulated balances
(that is the product), that `DEMO_` assets have no real value (also the
product), missing rate limits on read-only endpoints, or scanner output with no
demonstrated impact.

---

## Hardening checklist for a public deployment

The README checklist covers the minimum. Complete these as well before exposing
the simulator to the internet.

**Secrets and configuration**

- [ ] `JWT_SECRET` generated with `openssl rand -hex 32`, unique per
      environment, and never committed or shared between staging and production
- [ ] `POSTGRES_PASSWORD` set to a generated value; confirm neither it nor
      `JWT_SECRET` has a fallback default in compose (both use `${VAR:?...}`)
- [ ] `ENVIRONMENT=production`, which suppresses the development-only reset
      token in API responses
- [ ] `COOKIE_SECURE=true`, `COOKIE_SAMESITE` no looser than `lax`, and
      `COOKIE_DOMAIN` set only if the API and UI genuinely share a parent domain
- [ ] `CORS_ORIGINS` lists exact origins — never a wildcard
- [ ] `NEXT_PUBLIC_API_URL` left relative (`/api`) so the browser sees a single
      origin and the auth cookies need no cross-site configuration, with
      `BACKEND_INTERNAL_URL` pointing at the backend over the private network
- [ ] `.env` confirmed absent from the built images (`.dockerignore`) and from
      version control

**Accounts**

- [ ] The seeded admin's forced password change completed and its printed
      password rotated
- [ ] `SEED_DEMO_PASSWORD` set explicitly, or the demo account disabled entirely
- [ ] No account a real person uses carries `is_test_account` — outcome
      scripting is refused only on accounts without that flag
- [ ] `ADMIN` and `SUPER_ADMIN` membership reviewed and kept as small as the
      operation allows

**Infrastructure**

- [ ] TLS terminated in front of the stack, with HTTP redirected to HTTPS
- [ ] The Postgres port not published to the host or the internet — the compose
      `db` service is reachable only over the internal network by design
- [ ] Containers still running as their non-root users (`appuser`, `nextjs`)
      after any Dockerfile change
- [ ] Backups encrypted, access-controlled and restore-tested; remember that a
      backup is a full copy of every password hash
- [ ] Migrations applied only via `alembic upgrade head`, never by hand
- [ ] The rate limiter moved behind a shared store if you run more than one
      backend replica — it is in-process by design (`SlidingWindowLimiter`), and
      per-replica limits are weaker than they look
- [ ] Logs shipped somewhere durable and reviewed, with the redacting formatter
      confirmed active in the deployed configuration
- [ ] Base images and dependencies rebuilt on a schedule, not pinned and
      forgotten

**Presentation**

- [ ] The `DEMO / PAPER TRADING` badge, the `X-Demo-Mode: true` header and the
      per-flow simulation notices all still present in the deployed build
- [ ] The deployment does not use branding, a domain or copy that could lead a
      visitor to believe real funds are involved
