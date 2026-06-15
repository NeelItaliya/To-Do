# CI Pipeline Guide

The CI pipeline is defined in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
and runs on **GitHub Actions**.

## Triggers

| Event | Branches | What runs |
|-------|----------|-----------|
| `push` | `main`, `develop` | Lint & Test **+** Build & Push image |
| `pull_request` | `main`, `develop` | Lint & Test only |

## Pipeline Stages

```
 push / PR
    │
    ▼
┌─────────────────────┐
│  Job: Lint & Test   │  checkout → setup-node(cache) → npm ci
│                     │  → eslint → jest --coverage → upload coverage
└─────────┬───────────┘
          │ (needs: test, push only)
          ▼
┌─────────────────────┐
│ Job: Build & Push   │  buildx → docker login → metadata
│                     │  → build multi-stage image → push to Docker Hub
└─────────────────────┘
```

### Job 1 — Lint & Test
- `npm ci` for reproducible installs (uses the lockfile).
- `npm run lint` — ESLint code-quality gate.
- `npm run test:coverage` — Jest unit + supertest API tests with coverage.
- Coverage uploaded as a build artifact (7-day retention).

### Job 2 — Build & Push (push events only)
- Runs **only after** Job 1 passes (`needs: test`).
- Logs into Docker Hub using repository secrets.
- Builds the multi-stage `Dockerfile` with GitHub Actions layer caching.
- Tags and pushes the image (see tagging strategy below).

## Image Tagging Strategy

`docker/metadata-action` produces these tags automatically:

| Tag | When | Example |
|-----|------|---------|
| `latest` | push to `main` | `user/to-do:latest` |
| branch name | any push | `user/to-do:develop` |
| short commit SHA | every push | `user/to-do:a1b2c3d` |

The SHA tag gives an immutable, traceable reference for every build — important
for rollbacks and for pinning a specific image in Kubernetes (Phase 2).

## Required GitHub Secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | A Docker Hub **access token** (Account Settings → Security → New Access Token) — not your password |

## Running the Pipeline

```bash
# 1. Create the Docker Hub repo + access token, add the two secrets above.
# 2. Push to a tracked branch:
git push origin develop      # runs lint+test, builds & pushes :develop + :<sha>
git push origin main         # also pushes :latest
```

## Verifying Locally Before Pushing

```bash
npm ci
npm run lint
npm run test:coverage
docker build -t to-do .
```

If all four pass locally, the CI pipeline will pass too.
