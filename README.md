<p align="center">
  <img src="public/icon.svg" alt="Catetin logo" width="88" height="88">
</p>

<h1 align="center">Catetin</h1>

<p align="center">
  Keep track of what you owe, what you are owed, and what has been paid.
</p>

<p align="center">
  <a href="#-why-catetin">About</a> |
  <a href="#-features">Features</a> |
  <a href="#-getting-started">Getting started</a> |
  <a href="#-developer-guide">Developer guide</a>
</p>

<p align="center">
  <a href="https://catetin-utang.vercel.app/">
    <img src=".github/readme/try-catetin.svg" alt="Try Catetin" width="112" height="28">
  </a>
  <!-- Draft. Add the published blog URL before showing this link.
  <a href="#">
    <img src=".github/readme/read-the-story.svg" alt="Read the story" width="136" height="28">
  </a>
  -->
</p>

**Catetin tracks debts, receivables, and repayments.** Record personal loans, split bills, and installment payments with due dates and payment evidence.

Manage your own contacts or connect with other Catetin users to review and approve shared records.

<br>

## 💡 Why Catetin?

See the original amount, payments made, and remaining balance for each record. Attach receipts and check the activity history when you need to review a payment or a change.

<br>

## ✨ Features

- **Debts and receivables.** Track balances with due dates, attachments, and recurring records.
- **Shared records.** Connect with contacts, approve records, and follow activity history.
- **Split bills.** Divide group expenses and track each person's share.
- **Repayments.** Record payments, manage installments, and check remaining balances.
- **Reports.** Review statistics, export CSV files, and generate PDF statements.
- **AI assistant.** Capture records from text, receipt photos, or voice input.

Supports **Indonesian and English**, **PWA installation**, email notifications, and web push. AI and notifications require service configuration.

<br>

## ⚙️ Built with

<p align="left">
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&amp;logo=nextdotjs&amp;logoColor=white" alt="Next.js"></a>
  <a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&amp;logo=postgresql&amp;logoColor=white" alt="PostgreSQL"></a>
  <a href="https://orm.drizzle.team/"><img src="https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&amp;logo=drizzle&amp;logoColor=black" alt="Drizzle ORM"></a>
  <a href="https://www.better-auth.com/"><img src="https://img.shields.io/badge/Better_Auth-000000?style=for-the-badge&amp;logo=betterauth&amp;logoColor=white" alt="Better Auth"></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&amp;logo=tailwindcss&amp;logoColor=white" alt="Tailwind CSS"></a>
</p>

<br>

## 🚀 Getting started

Follow these steps to run Catetin locally.

### Requirements

<p align="left">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-26.x-5FA04E?style=for-the-badge&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 26.x"></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-1.4.4-000000?style=for-the-badge&amp;logo=bun&amp;logoColor=white" alt="Bun 1.4.4"></a>
  <a href="https://docs.docker.com/compose/"><img src="https://img.shields.io/badge/Docker_Compose-2496ED?style=for-the-badge&amp;logo=docker&amp;logoColor=white" alt="Docker Compose"></a>
  <a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?style=for-the-badge&amp;logo=postgresql&amp;logoColor=white" alt="PostgreSQL 18"></a>
</p>

> Docker Compose creates an empty database. Prepare the application schema before starting Catetin, as described in [Connect your database](#2-connect-your-database).

Existing Docker volumes keep their original database names. Changing `POSTGRES_DB` does not rename an existing database; keep `DATABASE_URL` aligned with that database or migrate it separately.

### 1. Prepare the environment

```bash
git clone https://github.com/nabielvna/catetin.git
cd catetin
bun install --frozen-lockfile
cp .env.example .env.local
bun run services:up
```

Docker Compose starts PostgreSQL and Mailpit, a local inbox for development email. If you are reusing an existing database, configure its connection in the next step.

### 2. Connect your database

Set `DATABASE_URL` in `.env.local` to an existing PostgreSQL database with the application schema. Catetin connects directly to that database and does not run migrations or seed data on startup.

Docker Compose creates an empty local database. To use it for development, restore a schema or data snapshot that matches `src/database/schema`. The test database setup below is separate from application database configuration.

### 3. Start Catetin

Run from the project directory:

```bash
bun run dev
```

| Service       | Local address         |
| ------------- | --------------------- |
| Application   | http://localhost:3000 |
| Mailpit inbox | http://localhost:8026 |
| PostgreSQL    | localhost:54330       |
| Mailpit SMTP  | localhost:1026        |

Open the application, sign in with an email address, and retrieve the verification code from Mailpit. Complete onboarding to start recording balances and payments.

<br>

## 🔧 Developer guide

See [`.env.example`](.env.example) for environment variables and defaults.

<details>
<summary><strong>Configuration and optional integrations</strong></summary>

### Local development

Copying `.env.example` to `.env.local` configures the application for the included Docker services:

| Service      | Local configuration                               |
| ------------ | ------------------------------------------------- |
| Database     | PostgreSQL on port `54330`                        |
| Email        | Mailpit SMTP on port `1026`, inbox on port `8026` |
| File storage | Local files in `.data/files`                      |
| Live updates | PostgreSQL through `REALTIME_DRIVER=pg`           |

Email sign-in and recordkeeping work with the local services. The integrations below require additional configuration.

### Optional integrations

| Enable                                          | Set                                                 | When omitted                    |
| ----------------------------------------------- | --------------------------------------------------- | ------------------------------- |
| Google sign-in                                  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`          | Email sign-in remains available |
| AI assistant, receipt scanning, and voice input | `GEMINI_API_KEY`                                    | AI features are disabled        |
| Web push                                        | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`             | Push delivery is unavailable    |
| Supabase file storage                           | `STORAGE_DRIVER=supabase` and Supabase credentials  | Files use local storage         |
| Supabase live updates                           | `REALTIME_DRIVER=supabase` and Supabase credentials | Live updates use PostgreSQL     |

Supabase storage requires a project URL and server key. Supabase realtime also requires a public key and JWT signing credentials. See the variables and supported key formats in [`.env.example`](.env.example). Set `REALTIME_DRIVER=none` to disable live updates.

### Production essentials

Configure these values in your hosting provider's environment settings before building:

| Setting              | What to provide                                                                   |
| -------------------- | --------------------------------------------------------------------------------- |
| `APP_URL`            | The public application URL                                                        |
| `DATABASE_URL`       | The production PostgreSQL connection string                                       |
| `BETTER_AUTH_SECRET` | A random authentication secret of at least 32 characters                          |
| `SIGNING_SECRET`     | A separate random secret for signed links and approvals                           |
| `CRON_SECRET`        | A separate random token for scheduled job requests                                |
| `SMTP_*`             | Your email provider's host, port, TLS mode, sender, and credentials when required |

For local storage, use a persistent directory and set `STORAGE_LOCAL_DIR` to its path. Use Supabase storage if your host has no persistent disk. Keep secrets in `.env.local` or hosting environment settings and out of Git.

</details>

<br>

<details>
<summary><strong>Development, testing, and architecture</strong></summary>

### Development commands

| Command                | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `bun run typecheck`    | Generate Next.js route types and check TypeScript |
| `bun run lint:fix`     | Sort imports and apply automatic lint fixes       |
| `bun run lint`         | Check code quality and dependency boundaries      |
| `bun run format:check` | Check formatting                                  |
| `bun run format`       | Apply formatting                                  |
| `bun run test`         | Run unit tests                                    |
| `bun run test:db`      | Initialize an empty, dedicated test database      |
| `bun run test:int`     | Run integration tests against PostgreSQL          |
| `bun run test:e2e`     | Run browser tests against a production build      |
| `bun run db:studio`    | Open Drizzle Studio                               |

### Database and browser tests

Integration and browser tests require separate databases named `catetin_test` and `catetin_e2e`. Additional suffixes are supported. Create these databases, then initialize each empty database using `bun run test:db`. This command uses only `TEST_DATABASE_URL`, validates the database name, refuses databases containing tables in the public schema, and prepares the schema from this repository.

Prepare each database once:

```bash
TEST_DATABASE_URL=postgres://catetin:catetin@localhost:54330/catetin_test bun run test:db
TEST_DATABASE_URL=postgres://catetin:catetin@localhost:54330/catetin_e2e bun run test:db
```

Run the tests:

```bash
TEST_DATABASE_URL=postgres://catetin:catetin@localhost:54330/catetin_test \
TEST_SMTP_HOST=localhost TEST_SMTP_PORT=1026 \
bun run test:int

TEST_DATABASE_URL=postgres://catetin:catetin@localhost:54330/catetin_e2e \
TEST_SMTP_HOST=localhost TEST_SMTP_PORT=1026 MAILPIT_URL=http://localhost:8026 \
bun run test:e2e
```

Browser tests require Google Chrome and use application port 3101 by default. Tests prepare their own fixtures but do not create databases or run migrations.

### Continuous integration

CI runs type checking, linting, formatting checks, unit tests, integration tests, and a production build. The [CI workflow](.github/workflows/ci.yml) starts an isolated PostgreSQL service and prepares its schema from this repository. Production database credentials are not needed.

### Architecture

The code separates request handling, business workflows, domain rules, and provider integrations. Services coordinate authorization and data access, while domain modules contain pure rules and calculations. ESLint checks dependency boundaries between layers.

| Directory          | Responsibility                                                  |
| ------------------ | --------------------------------------------------------------- |
| `src/app`          | Pages, layouts, and HTTP endpoints                              |
| `src/components`   | UI components and browser lifecycle behavior                    |
| `src/actions`      | Validation and entry points for browser mutations               |
| `src/services`     | Authorization, queries, and business workflows                  |
| `src/domain`       | Pure business rules and calculations                            |
| `src/database`     | Connections, schema, and transaction primitives                 |
| `src/integrations` | Authentication, email, AI, storage, realtime, and PDF providers |
| `src/jobs`         | Scheduled jobs                                                  |
| `src/i18n`         | Translations and locale-aware navigation                        |
| `src/lib`          | Technical utilities                                             |

### Lighthouse audits

Start the application and Mailpit, then use a local account that has completed onboarding:

```bash
bun run lighthouse --url http://localhost:3000 --email user@example.test --mode both --runs 3
```

Reports are saved to `.lighthouse/`. Add `--only /privacy,/home` to audit selected pages.

</details>

<br>

<details>
<summary><strong>Deployment and scheduled jobs</strong></summary>

### Build and storage

Set `DATABASE_URL` to your existing PostgreSQL database and configure the production environment. Deployment reuses the database without applying schema changes. Set the public `APP_URL`, production secrets, and SMTP delivery settings before building:

```bash
bun run build
bun run start
```

Local file storage requires a persistent directory at `STORAGE_LOCAL_DIR`. Use Supabase storage when deploying to a host without persistent local storage.

### Vercel runtime

Vercel runs Next.js server functions on Bun 1.x, selected by `bunVersion` in `vercel.json`. Dependencies and production builds also use Bun: `packageManager` declares the local Bun version, and `vercel.json` runs `bun --bun run build`.

### Scheduled jobs

Configure an external scheduler to call these endpoints with the header `Authorization: Bearer <CRON_SECRET>`:

| Endpoint                  | Responsibility                            |
| ------------------------- | ----------------------------------------- |
| `/api/cron/daily`         | Exchange rate updates and data cleanup    |
| `/api/cron/reminders`     | Reminders, recurring records, and digests |
| `/api/cron/notifications` | Notification delivery and retries         |

These jobs require an external scheduler. Starting the application does not schedule them automatically.

</details>
