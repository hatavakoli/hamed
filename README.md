# YouTube Content Intelligence Monitor

Monitor a handful of YouTube channels. Whenever one publishes a new public video, this app
detects it, fetches a transcript when it can, sends everything to Claude for a deep content-strategy
analysis — **including whether the product idea in the video is worth building and which features
would make it better** — saves a detailed report, and emails you a summary.

Built to run on one small VPS with Docker, and designed so it can grow into a multi-user SaaS later.

**It runs with zero API keys.** Set `MOCK_MODE=true` and every external service (YouTube, transcripts,
Claude, email) is replaced with a realistic local mock, so you can click through the entire product
before spending a cent.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Architecture](#2-architecture)
3. [Project structure](#3-project-structure)
4. [Quick start (5 minutes, no API keys)](#4-quick-start-5-minutes-no-api-keys)
5. [Environment variables](#5-environment-variables)
6. [Getting the real API keys](#6-getting-the-real-api-keys)
7. [How the monitoring pipeline works](#7-how-the-monitoring-pipeline-works)
8. [API reference](#8-api-reference)
9. [Testing](#9-testing)
10. [Deploying to a VPS](#10-deploying-to-a-vps-contabo-hetzner-digitalocean)
11. [Reverse proxy and HTTPS](#11-reverse-proxy-and-https-optional)
12. [Common problems](#12-common-problems)
13. [MVP launch checklist](#13-mvp-launch-checklist)
14. [Where to take it next](#14-where-to-take-it-next)

---

## 1. What it does

- **Add 3–5 channels** by URL, `@handle`, channel ID, or even a video URL.
- **Checks for new videos** automatically (every 60 minutes by default) and on demand.
- **Never analyses the same video twice** — enforced by database constraints, not just code.
- **Fetches the transcript**, with automatic retries after 15 minutes, 1 hour and 6 hours.
- **Analyses each video with Claude** and validates the response against a strict schema.
- **Validates the product idea** in the video: is it buildable, what would an MVP contain, which
  features would make it better than what already exists, what are the risks.
- **Emails you** a short summary with the score and top three takeaways.
- **Dashboard** with search, filters, sorting, channel-level pattern insights and a weekly digest.
- **Backfill**: pull in and analyse videos published *before* you started monitoring.
- **Exports** every report as Markdown or print-ready HTML (use your browser's "Save as PDF").

### Guardrails built into the AI prompt

The model is explicitly instructed to:

- separate **verified facts** (things stated in the transcript/metadata) from **inference**, and hedge
  inferences with "likely" / "suggests" / "may";
- never claim retention or viewer psychology as fact — the app has no analytics access;
- never reproduce long transcript passages;
- never tell you to copy another creator's script, wording or thumbnail;
- generate **original** titles, hooks and video ideas that serve the same underlying viewer demand.

The app also does **not** scrape YouTube's private endpoints. Captions are retrieved either through a
transcript provider you configure or through YouTube's official captions API — and where YouTube only
permits caption downloads for channels you own, the app says so plainly instead of working around it.

---

## 2. Architecture

```
┌──────────────┐        ┌───────────────────────────┐        ┌──────────────┐
│   Browser    │ ─────► │  Next.js app (app + API)  │ ─────► │  PostgreSQL  │
└──────────────┘        └───────────────────────────┘        └──────────────┘
                                     ▲                              ▲
                                     │ same src/lib code            │
                        ┌────────────┴──────────────┐               │
                        │  Worker (node-cron)       │ ──────────────┘
                        │  every 1 min: drain queue │
                        │  every 5 min: due sweep?  │
                        │  Mon 08:00: weekly digest │
                        └───────────────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
      YouTube Data API      Transcript provider        Anthropic Claude
       (or mock)              (or mock)                  (or mock)
```

**Key decisions and why:**

| Decision | Reason |
|---|---|
| One Next.js app for UI + API | Fewer moving parts than a separate backend; one deploy, one image |
| Separate worker container | A 60-second AI call must never block a web request |
| Same image for both | One build, no drift between web and worker code |
| Database-backed job queue | A nullable-unique `dedupeKey` column means **Postgres itself** refuses to queue the same job twice. No Redis needed for an MVP |
| Cookie session, not NextAuth | ~60 lines of HMAC signing for a single admin; no library to learn |
| Provider interfaces everywhere | `AiProvider`, `TranscriptProvider`, `YouTubeClient`, `EmailProvider` — swapping Claude for OpenAI, or adding a transcript vendor, means writing one class |
| Zod on every boundary | Request bodies, query strings, env vars and **AI output** are all validated |
| `MOCK_MODE` | The whole product is explorable and testable with no keys and no cost |

**Why no Redis / BullMQ yet?** The MVP handles a handful of channels and a few dozen jobs a day.
A database-backed queue with a unique constraint is simpler, has fewer failure modes, and gives you a
readable audit log for free. `REDIS_URL` is reserved in `.env.example` for when you outgrow it — the
job functions in `src/lib/jobs/` are pure and would drop straight into a BullMQ worker.

---

## 3. Project structure

```
.
├── docker-compose.yml            # db + migrate + app + worker (production)
├── docker-compose.dev.yml        # just Postgres, for local `npm run dev`
├── Dockerfile                    # one multi-stage image for app and worker
├── .env.example                  # every variable, documented
│
├── prisma/
│   ├── schema.prisma             # all 8 models, enums, indexes, cascades
│   ├── migrations/               # checked in, applied with `prisma migrate deploy`
│   └── seed.ts                   # admin user + 3 demo channels
│
├── scripts/
│   ├── worker.ts                 # node-cron scheduler (the background process)
│   └── load-env.ts               # tiny .env reader (no dotenv dependency)
│
├── src/
│   ├── middleware.ts             # cookie presence check -> /login redirect
│   │
│   ├── app/
│   │   ├── layout.tsx  globals.css  error.tsx  not-found.tsx
│   │   ├── login/                # sign-in page
│   │   ├── setup/                # first-run wizard
│   │   ├── (app)/                # everything behind auth
│   │   │   ├── layout.tsx        # session check + sidebar shell
│   │   │   ├── page.tsx          # dashboard
│   │   │   ├── channels/         # list, add dialog, [id] detail, backfill
│   │   │   ├── videos/           # list + filters, [id] full report
│   │   │   ├── digests/          # weekly digests
│   │   │   ├── jobs/             # activity / error log
│   │   │   └── settings/         # preferences + connection tests
│   │   └── api/                  # every route handler (see §8)
│   │
│   ├── components/
│   │   ├── ui/                   # shadcn-style primitives (button, card, …)
│   │   ├── app-shell.tsx  toast.tsx  action-button.tsx
│   │   └── status-badge.tsx  score.tsx  empty-state.tsx
│   │
│   └── lib/
│       ├── env.ts                # every environment variable, validated once
│       ├── prisma.ts  logger.ts  crypto.ts  utils.ts  api.ts
│       ├── auth.ts               # HMAC cookie sessions
│       ├── settings.ts           # preferences + encrypted secrets
│       ├── youtube/              # parse.ts (pure) · api-client · mock-client
│       ├── transcript/           # retry.ts (pure) · providers · chain
│       ├── ai/                   # schema · prompt · chunk · anthropic · mock
│       ├── email/                # resend + console providers, templates
│       ├── jobs/                 # check-channels · process-video · digest · runner
│       ├── insights.ts           # channel pattern detection (pure)
│       └── export.ts             # Markdown + printable HTML
│
└── tests/                        # vitest: 5 unit files + 1 integration file
```

---

## 4. Quick start (5 minutes, no API keys)

You need **Node.js 20+** and **Docker** (for Postgres only).

```bash
# 1. Install dependencies
npm install

# 2. Create your .env from the template
cp .env.example .env
```

Open `.env` and change one line — everything else already works for local development:

```bash
NEXTAUTH_SECRET="paste-the-output-of-openssl-rand-base64-32"
```

Generate it with:

```bash
openssl rand -base64 32
```

Then:

```bash
# 3. Start PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# 4. Create the database tables
npm run prisma:deploy

# 5. Create the admin user and 3 demo channels
npm run db:seed

# 6. Start the app
npm run dev
```

Open **http://localhost:3000** and sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`
(defaults: `you@example.com` / `change-me-at-least-8-chars`).

Then, on the dashboard:

1. Press **Check all channels now** → it finds mock videos.
2. Press **Run queued jobs** a few times → each press analyses up to 3 videos.
3. Open **Videos & reports** → click any report.

The "email" for each report is printed in the terminal running `npm run dev`.

### macOS with OrbStack (or Docker Desktop)

Nothing to change — OrbStack provides drop-in `docker` and `docker compose` commands, so every
command in this README works unmodified. Three notes:

- **Apple Silicon is fine.** `node:22-alpine` and `postgres:16-alpine` both publish arm64 images and
  no `platform:` is pinned anywhere, so containers build and run natively. Prisma generates its
  engine *inside* the Alpine build stage, so it always gets the right binary for the image
  architecture — the usual "Prisma works on my Mac but not in Docker" problem cannot happen here.
- **Port 5432 may already be taken** if you run Postgres.app or `brew services start postgresql`.
  Either stop it (`brew services stop postgresql@16`) or change the mapping in
  `docker-compose.dev.yml` to `'5433:5432'` and update the port in your `DATABASE_URL` to match.
- **OrbStack gives every container a hostname.** Once `docker compose up -d` is running you can open
  <https://ycim-app.orb.local> instead of `http://localhost:3000`. If you do, set
  `APP_BASE_URL=https://ycim-app.orb.local` so the links inside emails point somewhere that works.

### Running the background worker locally

`npm run dev` alone does not run scheduled jobs — that is what the **Run queued jobs** button is for.
To get real automation locally, open a **second terminal**:

```bash
npm run worker
```

It drains the queue every minute, sweeps channels on your configured interval, and builds the weekly
digest on Mondays.

---

## 5. Environment variables

Full documentation lives in `.env.example`. Summary:

### Required

| Variable | What it is |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. The app will not start without it. |

### Important before going live

| Variable | What it is |
|---|---|
| `NEXTAUTH_SECRET` | Signs your login cookie **and** encrypts any API key saved through the UI. Generate with `openssl rand -base64 32`. Changing it logs everyone out and makes UI-saved secrets unreadable. |
| `ADMIN_EMAIL` | Your login and where reports are sent. |
| `ADMIN_PASSWORD` | Your login password. Alternatively create the account in the setup wizard, which stores a scrypt hash instead. |
| `APP_BASE_URL` | Public URL, used for links inside emails. |
| `NEXTAUTH_URL` | Same value as `APP_BASE_URL`. |
| `MOCK_MODE` | Set to `false` to use real services. |

### Optional (each has a working fallback)

| Variable | Fallback if missing |
|---|---|
| `YOUTUBE_API_KEY` | Mock YouTube client with fake channels and videos |
| `ANTHROPIC_API_KEY` | Mock AI analyst returning realistic, schema-valid reports |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` |
| `AI_PROVIDER` | Auto: `anthropic` when a key exists, otherwise `mock` |
| `TRANSCRIPT_PROVIDER` | Auto: `api` when a URL is set, otherwise `mock` |
| `TRANSCRIPT_API_URL` / `TRANSCRIPT_API_KEY` | Falls through to YouTube caption detection, then a metadata-only report |
| `RESEND_API_KEY` | Emails printed to the server terminal |
| `EMAIL_FROM` | `onboarding@resend.dev` |
| `CRON_SECRET` | `/api/cron/*` stays disabled (the worker container does not need it) |
| `MONITOR_INTERVAL_MINUTES` | `60` — also editable in Settings without a restart |
| `MAX_VIDEOS_PER_CHECK` | `5` — caps quota and AI spend per check |
| `REDIS_URL` | **Not used yet.** Reserved for a future BullMQ queue. |
| `LOG_LEVEL` | `info` |

> **Secrets never reach the browser.** The Settings page only ever reports whether a key is
> configured and shows a masked preview like `sk-a…cdef`. Keys entered in the UI are encrypted with
> AES-256-GCM before being stored; **environment variables always take precedence** over stored ones.

---

## 6. Getting the real API keys

### YouTube Data API v3 (free)

1. Go to <https://console.cloud.google.com/> and create a project.
2. **APIs & Services → Library** → search "YouTube Data API v3" → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Paste it into `YOUTUBE_API_KEY`.

The free quota is 10,000 units/day. One channel check costs about 3–5 units, so monitoring 5 channels
hourly uses well under 1% of it.

### Anthropic Claude (paid)

1. Go to <https://console.anthropic.com/> → **API keys** → create one.
2. Paste it into `ANTHROPIC_API_KEY`.

Roughly $0.01–$0.05 per video with `claude-sonnet-4-5`, depending on transcript length. The dashboard
shows a running estimate. Keep `MAX_VIDEOS_PER_CHECK` low while you are learning.

### Resend email (free tier available)

1. <https://resend.com> → **API keys** → create one → paste into `RESEND_API_KEY`.
2. Verify a sending domain, then set `EMAIL_FROM` to an address on it.
   For testing, `onboarding@resend.dev` works without a domain.

### Transcripts

YouTube only allows caption **downloads** for channels you own, so third-party channels need a
transcript provider. Point `TRANSCRIPT_API_URL` at any HTTP endpoint that accepts `?videoId=<id>` and
returns JSON in one of these shapes:

```json
{ "text": "the full transcript…" }
{ "transcript": "the full transcript…" }
{ "segments": [ { "start": 0, "duration": 3.2, "text": "…" } ] }
```

`TRANSCRIPT_API_KEY` is sent as both `Authorization: Bearer …` and `x-api-key`.

**Without a transcript provider the app still works.** It produces a metadata-only report that is
clearly labelled *"Transcript unavailable — lower-confidence analysis"* everywhere it appears.

---

## 7. How the monitoring pipeline works

```
   worker tick (every 1 min)
        │
        ├─ is a channel sweep due? ──► queue CHECK_ALL_CHANNELS
        ├─ any transcripts due for retry? ──► queue RETRY_TRANSCRIPT
        └─ drain up to 3 queued jobs
                 │
   CHECK_ALL_CHANNELS ──► for each active channel:
        1. read the uploads playlist
        2. drop video IDs already in the database
        3. drop anything older than lastProcessedVideoPublishedAt
        4. fetch full metadata; skip non-public / deleted videos
        5. insert with skipDuplicates, queue one PROCESS_VIDEO per new video
                 │
   PROCESS_VIDEO ──►
        1. transcript (only if PENDING or RETRYING)
             ├─ configured transcript API
             ├─ YouTube caption detection
             └─ give up gracefully -> metadata-only report
        2. gather prior channel context (recent titles, formats, average score)
        3. Claude analysis
             ├─ short transcript  -> one prompt
             ├─ long transcript   -> summarise chunks, then synthesise
             └─ invalid JSON      -> retry once with the exact error
        4. validate with Zod, save the report, update statuses
        5. email the summary (or log it)
```

**How duplicates are prevented (three independent layers):**

1. `videos.youtubeVideoId` is `UNIQUE`, and inserts use `skipDuplicates`.
2. `transcripts.videoId` and `analysis_reports.videoId` are `UNIQUE` — one report per video, ever.
3. `monitoring_jobs.dedupeKey` is nullable-`UNIQUE`. It is set while a job is queued or running and
   cleared when it finishes, so the database physically rejects a second copy of the same job.
   `processVideo` also short-circuits if a completed report already exists, unless you force it.

**Transcript retry schedule:** 15 minutes → 1 hour → 6 hours → stop and offer a manual retry button.
A definitive "this video has no captions" is *not* retried — that would just burn quota.

---

## 8. API reference

All routes return `{ ok: true, data }` or `{ ok: false, error, details? }`.
Every route except `/api/health`, `/api/auth/login`, `/api/setup` and `/api/cron/*` requires an admin
session cookie.

### Public

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness + database check. `200` healthy, `503` degraded. Used by Docker. |
| `POST` | `/api/auth/login` | `{ email, password }` → sets the session cookie |
| `POST` | `/api/auth/logout` | Clears the session cookie |
| `GET` | `/api/setup` | Whether first-run setup is still needed |
| `POST` | `/api/setup` | Save first-run configuration (requires a session once completed) |

### Channels

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/channels` | All channels with video and report counts |
| `POST` | `/api/channels` | `{ input, isActive?, checkNow? }` — resolves URL/@handle/ID/video URL |
| `GET` | `/api/channels/[id]` | Channel + its videos + computed insights |
| `PATCH` | `/api/channels/[id]` | `{ isActive?, title? }` — pause, resume or rename |
| `DELETE` | `/api/channels/[id]` | Deletes the channel and cascades to videos, transcripts, reports |
| `POST` | `/api/channels/[id]/check` | Check now (detection is synchronous, analysis is queued) |
| `POST` | `/api/channels/[id]/backfill` | `{ count }` — analyse videos published before monitoring started |

### Videos and reports

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/videos` | `?q&channelId&analysisStatus&transcriptStatus&from&to&minScore&maxScore&sort&page&pageSize` |
| `GET` | `/api/videos/[id]` | Full detail: metadata, transcript, report, recent jobs |
| `POST` | `/api/videos/[id]/retry-transcript` | Manual retry; queues a fresh analysis if it succeeds |
| `POST` | `/api/videos/[id]/regenerate-analysis` | Queues a forced re-analysis |
| `GET` | `/api/videos/[id]/export?format=md\|html` | Markdown download or print-ready HTML |
| `GET` | `/api/reports/[id]` | Accepts a report id **or** a video id |

### Dashboard, jobs and digests

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/dashboard/summary` | Counters, latest reports, recent job activity |
| `GET` | `/api/jobs` | `?status&limit` — the job/error log |
| `POST` | `/api/jobs/check-all-channels` | Sweep every active channel |
| `POST` | `/api/jobs/run` | `{ limit }` — drain the queue now |
| `POST` | `/api/jobs/weekly-digest` | Build and send this week's digest |
| `GET` | `/api/digests` · `/api/digests/[id]` | Saved weekly digests |

`/api/jobs/check-all-channels`, `/api/jobs/run` and `/api/jobs/weekly-digest` also accept
`Authorization: Bearer <CRON_SECRET>` instead of a session.

### Settings

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/settings` | Preferences + which secrets are configured (never their values) |
| `PATCH` | `/api/settings` | Update preferences and/or stored secrets |
| `POST` | `/api/settings/test-youtube` | Test the YouTube connection |
| `POST` | `/api/settings/test-ai` | Test the AI connection |
| `POST` | `/api/settings/test-email` | Send a test email |
| `POST` | `/api/settings/test-transcript` | Test the transcript provider |

### External cron

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/cron/check-channels` | Sweep all channels |
| `POST` | `/api/cron/run-jobs` | Drain the queue |
| `POST` | `/api/cron/weekly-digest` | Build the weekly digest |
| `POST` | `/api/cron/retention` | Apply the data-retention policy |

All require `Authorization: Bearer <CRON_SECRET>` and never accept a browser session, so they cannot
be triggered by CSRF. Use these only if you prefer a system crontab to the worker container:

```bash
*/10 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/run-jobs
0    * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/check-channels
0    8 * * 1 curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/weekly-digest
```

---

## 9. Testing

```bash
npm test              # run everything once
npm run test:watch    # re-run on change
npm run typecheck     # TypeScript, no emit
```

### What is covered

**Unit tests** (no database, no network):

| File | Covers |
|---|---|
| `tests/youtube-parse.test.ts` | Channel URL / `@handle` / ID / video-URL resolution, uploads playlist derivation |
| `tests/transcript-retry.test.ts` | The 15m → 1h → 6h retry schedule, when a retry is due, transcript payload normalisation |
| `tests/ai-schema.test.ts` | AI JSON extraction (fences, prose, nested braces), Zod validation, score resolution, prompt safety rules, chunking, cost estimation |
| `tests/insights.test.ts` | Title-pattern detection, channel insight aggregation, score trends, date/duration utilities |
| `tests/auth-crypto.test.ts` | Secret encryption round-trip and tamper rejection, password hashing, session signing and forgery rejection, API-key redaction in logs |

**Integration test** — `tests/pipeline.integration.test.ts` runs the real pipeline against a real
PostgreSQL database with every external service mocked. It asserts that the app:

1. detects new videos and queues exactly one job each,
2. creates no duplicate video or job on re-check,
3. saves the transcript, creates the report, and logs the notification (and that the full transcript
   is **not** in the email),
4. does not overwrite a completed report when re-processed,
5. marks a transcript-less report as low confidence,
6. builds a weekly digest,
7. cascades deletes from channel → videos → transcripts → reports.

To run it, point it at a database:

```bash
docker compose -f docker-compose.dev.yml up -d
DATABASE_URL="postgresql://ycim:ycim_password@localhost:5432/ycim" npm run prisma:deploy
TEST_DATABASE_URL="postgresql://ycim:ycim_password@localhost:5432/ycim" npm test
```

Without a reachable database the integration suite **skips itself** with a printed hint, so
`npm test` still passes on a machine with no Postgres.

> Use a throwaway database — the test creates and deletes its own channel, and clears `pref:` rows.

---

## 10. Deploying to a VPS (Contabo, Hetzner, DigitalOcean)

Assumes a fresh Ubuntu 22.04/24.04 server. Run these as a user with `sudo`.

### Step 1 — Install Docker

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker            # or log out and back in
docker --version && docker compose version
```

### Step 2 — Get the project onto the server

```bash
git clone <your-repo-url> ycim
cd ycim
```

(Or upload it with `scp -r ./project user@your-server:~/ycim`.)

### Step 3 — Configure

```bash
cp .env.example .env
openssl rand -base64 32     # copy this for NEXTAUTH_SECRET
openssl rand -hex 24        # copy this for CRON_SECRET
nano .env
```

Set at minimum:

```bash
DATABASE_URL="postgresql://ycim:CHANGE_THIS@db:5432/ycim?schema=public"   # host is `db`, not localhost
POSTGRES_PASSWORD="CHANGE_THIS"                                           # must match the line above
NEXTAUTH_SECRET="<the openssl rand -base64 32 output>"
CRON_SECRET="<the openssl rand -hex 24 output>"
ADMIN_EMAIL="you@yourdomain.com"
ADMIN_PASSWORD="<a long password>"
APP_BASE_URL="https://yourdomain.com"      # or http://YOUR_SERVER_IP:3000
NEXTAUTH_URL="https://yourdomain.com"
MOCK_MODE=false
YOUTUBE_API_KEY="..."
ANTHROPIC_API_KEY="..."
RESEND_API_KEY="..."
EMAIL_FROM="reports@yourdomain.com"
```

> Start with `MOCK_MODE=true` on the first deploy to confirm everything is wired up, then flip it to
> `false` and `docker compose restart app worker`.

### Step 4 — Start everything

```bash
docker compose up -d --build
```

This builds the image and starts four services: `db`, `migrate` (runs migrations then exits), `app`
and `worker`.

> **Build on the server, not on your Mac.** An image built on Apple Silicon is arm64 and will not
> start on a typical x86 VPS. The command above builds on the server, so this is handled — but if you
> ever build locally and push to a registry, cross-compile explicitly:
>
> ```bash
> docker buildx build --platform linux/amd64 -t yourname/ycim:latest --push .
> ```

### Step 5 — Confirm the migrations ran

```bash
docker compose logs migrate
# expect: "All migrations have been successfully applied."
```

To run them again later (after pulling new code):

```bash
docker compose run --rm migrate
```

### Step 6 — Verify health

```bash
curl http://localhost:3000/api/health
# {"status":"ok","database":"up",...}

docker compose ps       # app and db should show (healthy)
```

### Step 7 — Open the dashboard

Visit `http://YOUR_SERVER_IP:3000`. On first launch you get the **setup wizard**; after that, the
login page. Sign in with your `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Then add your channels and press **Check all channels now**.

### Day-to-day commands

```bash
docker compose logs -f app worker     # follow logs
docker compose restart app worker     # restart after an .env change
docker compose down                   # stop (data is preserved in the volume)
docker compose up -d --build          # update after `git pull`
docker compose run --rm migrate       # apply new migrations

# Back up the database
docker compose exec db pg_dump -U ycim ycim > backup-$(date +%F).sql

# Restore
cat backup-2025-01-01.sql | docker compose exec -T db psql -U ycim -d ycim
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

If you put a reverse proxy in front (next section), remove the `ports:` block from the `app` service
in `docker-compose.yml` so port 3000 is not reachable from the internet directly.

---

## 11. Reverse proxy and HTTPS (optional)

Skip this if you are happy on `http://IP:3000`. For a real domain, **Caddy** is the least work — it
gets and renews TLS certificates automatically.

Create `Caddyfile` next to `docker-compose.yml`:

```
yourdomain.com {
    reverse_proxy app:3000
}
```

Add to `docker-compose.yml`:

```yaml
  caddy:
    image: caddy:2-alpine
    container_name: ycim-caddy
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app

volumes:
  caddy_data:
  caddy_config:
```

Then remove the `ports:` block from the `app` service, point your domain's A record at the server, set
`APP_BASE_URL=https://yourdomain.com`, and run `docker compose up -d`.

---

## 12. Common problems

**"Invalid environment configuration: DATABASE_URL is required"**
The `.env` file is missing or `DATABASE_URL` is blank. In Docker, the host must be `db`, not
`localhost` — containers do not share a network namespace with the host.

**Login says "No admin account configured"**
Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` and restart, or complete the setup wizard at
`/setup`.

**Everything says "(mock)" and I set my real keys**
`MOCK_MODE` is still `true`. Set it to `false` and restart (`docker compose restart app worker`).
Mock mode overrides every provider regardless of the keys present.

**Videos are detected but never analysed**
Nothing is draining the queue. Either the worker is not running (`docker compose logs worker`), or in
local development you are running only `npm run dev` — press **Run queued jobs** on the dashboard, or
start `npm run worker` in a second terminal.

**Every transcript says "unavailable"**
Expected without `TRANSCRIPT_API_URL`. YouTube only permits caption downloads for channels you own.
Reports still generate; they are labelled lower-confidence. See §6.

**"YouTube API quota exceeded"**
The daily 10,000-unit quota is spent. It resets at midnight Pacific Time. Lower
`MAX_VIDEOS_PER_CHECK` or increase the monitoring interval in Settings.

**Analysis fails with "AI response could not be validated"**
The model returned malformed JSON twice. Usually a truncated response — try a different model in
Settings, then press **Regenerate analysis**. The error is recorded on the report and in the activity
log.

**Port 3000 already in use**
Change the mapping in `docker-compose.yml` to `'3001:3000'`, or stop whatever holds the port.

**I changed `NEXTAUTH_SECRET` and my saved API keys stopped working**
Expected — that secret is the encryption key. Re-enter the keys in Settings, or move them to `.env`.

---

## 13. MVP launch checklist

**Security**

- [ ] `NEXTAUTH_SECRET` is a fresh `openssl rand -base64 32` value, not the placeholder
- [ ] `ADMIN_PASSWORD` is long and unique
- [ ] `POSTGRES_PASSWORD` changed from `ycim_password`
- [ ] `CRON_SECRET` set if you use `/api/cron/*`
- [ ] `.env` is **not** committed (it is in `.gitignore` — verify with `git status`)
- [ ] Postgres is not exposed publicly (the compose file binds it to `127.0.0.1` only)
- [ ] `ufw` enabled; port 3000 closed if a reverse proxy is in front
- [ ] HTTPS in front of the app if it is on a public domain

**Configuration**

- [ ] `MOCK_MODE=false`
- [ ] `APP_BASE_URL` and `NEXTAUTH_URL` are the real public URL (report links in emails depend on it)
- [ ] `YOUTUBE_API_KEY` set and **Test YouTube connection** passes
- [ ] `ANTHROPIC_API_KEY` set and **Test AI connection** passes
- [ ] `RESEND_API_KEY` + verified `EMAIL_FROM`, and **Send a test email** arrives
- [ ] `MAX_VIDEOS_PER_CHECK` set to something your budget tolerates
- [ ] Monitoring interval chosen in Settings

**Function**

- [ ] `curl https://yourdomain.com/api/health` returns `"status":"ok"`
- [ ] 3–5 real channels added and resolving to the right YouTube channels
- [ ] **Check all channels now** finds videos
- [ ] `docker compose logs worker` shows ticks and completed analyses
- [ ] At least one report generated end to end and the email arrived
- [ ] Markdown and Print/PDF exports open correctly
- [ ] Weekly digest generated manually once to confirm it works

**Operations**

- [ ] `docker compose ps` shows `app` and `db` as `(healthy)`
- [ ] A database backup taken and a restore tested at least once
- [ ] Data-retention preference chosen in Settings
- [ ] Both containers set to `restart: unless-stopped` (they are by default)
- [ ] You know where the logs are: `docker compose logs -f app worker`

---

## 14. Where to take it next

The MVP is single-admin, but the seams for a multi-user SaaS are already cut:

- **Multi-tenancy** — the `User` model exists and `Channel.ownerId` already points at it. Add
  `ownerId` filters to the queries in `src/lib/` and the API routes, and swap the single-admin login
  for real registration.
- **A proper queue** — every job function in `src/lib/jobs/` is a plain async function with no HTTP
  dependency. Move them behind BullMQ by making `runJob` a BullMQ processor; `REDIS_URL` is already
  reserved.
- **More AI providers** — implement the `AiProvider` interface (`src/lib/ai/provider.ts`) for OpenAI
  or Gemini and add it to the switch in `getAiProvider()`. Nothing else changes.
- **Real-time updates** — the dashboard currently refreshes after each action; server-sent events on
  the job table would make it live.
- **Competitor comparison** — the per-channel insights in `src/lib/insights.ts` are pure functions
  over saved reports, so cross-channel comparison is mostly a new page.

---

## Licence

MIT. Use it however you like.
