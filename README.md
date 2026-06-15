# Automated CI/CD Pipeline for a Web Application

A complete DevOps project that automatically builds, tests, containerizes, and (in Phase 2) deploys a sample **To-Do REST API** whenever code is pushed.

> **Phase 1 (this milestone):** Continuous Integration & Containerization
> **Phase 2 (next):** Continuous Deployment to AWS EKS, Terraform IaC, Prometheus/Grafana monitoring.

## Tech Stack

| Area | Tool |
|------|------|
| Application | Node.js + Express |
| Testing | Jest (unit) + supertest (API) |
| Code quality | ESLint |
| Containerization | Docker (multi-stage) + Docker Compose |
| CI | GitHub Actions |
| Registry | Docker Hub |
| Cloud (Phase 2) | AWS EKS + Terraform |
| Monitoring (Phase 2) | Prometheus + Grafana |

## The Application

A small To-Do app: a **web UI** (single-page, served at `/`) backed by a **REST API** with an in-memory store. The UI and API run in the same Express container.

Open <http://localhost:3000> after starting the app to use the UI (add, complete, and delete todos, with a live API health indicator).

### REST API

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/health`        | Health/readiness probe |
| GET    | `/api/todos`     | List all todos |
| GET    | `/api/todos/:id` | Get one todo |
| POST   | `/api/todos`     | Create a todo `{ "title": "...", "difficulty"?: "easy\|medium\|hard" }` |
| PUT    | `/api/todos/:id` | Update `{ "title"?, "completed"?, "difficulty"? }` |
| DELETE | `/api/todos/:id` | Delete a todo |

## Run Locally

```bash
npm install
npm start            # http://localhost:3000
npm test             # run unit + API tests
npm run test:coverage
npm run lint
```

## Run with Docker

```bash
# Build + run via compose
docker compose up --build

# Or build/run the image directly
docker build -t cicd-todo-pipeline:local .
docker run -p 3000:3000 cicd-todo-pipeline:local

# Smoke test
curl localhost:3000/health
curl -X POST localhost:3000/api/todos -H 'Content-Type: application/json' -d '{"title":"hello"}'
```

## CI Pipeline

On every push/PR to `main` or `develop`, GitHub Actions runs:

1. **Lint & Test** — `npm ci` → ESLint → Jest with coverage (artifact uploaded).
2. **Build & Push** — on push only: builds the multi-stage Docker image and pushes
   to Docker Hub with versioned tags (`latest`, branch name, short commit SHA).

See [`docs/ci-pipeline.md`](docs/ci-pipeline.md) for details and required secrets.

## Repository Layout

```
.
├── src/                  # Express app (app.js, server.js, todoStore.js)
├── public/               # Single-page web UI (served at /)
├── tests/                # Jest unit + supertest API tests
├── .github/workflows/    # GitHub Actions CI pipeline
├── docs/                 # Branching strategy + CI docs
├── Dockerfile            # Multi-stage build
├── docker-compose.yml
└── package.json
```

## Documentation

- [Branching Strategy](docs/branching-strategy.md)
- [CI Pipeline Guide](docs/ci-pipeline.md)

## Project Status

- [x] **Phase 1:** Git workflow, app, tests, ESLint, Docker, Docker Compose, GitHub Actions CI, Docker Hub push
- [ ] **Phase 2:** Terraform (VPC/EKS/ECR), Kubernetes manifests, CD pipeline, multi-env, Prometheus/Grafana, alerting
