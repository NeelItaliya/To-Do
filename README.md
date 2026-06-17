# Automated CI/CD Pipeline for a Web Application

A complete DevOps project that automatically builds, tests, containerizes, and deploys a sample **To-Do REST API** whenever code is pushed.

> **Phase 1 (complete):** Continuous Integration & Containerization
> **Phase 2 (in progress):** Continuous Deployment to AWS EKS, Terraform IaC, Prometheus/Grafana monitoring.

## Tech Stack

| Area | Tool |
|------|------|
| Application | Node.js + Express |
| Auth | JWT (JSON Web Tokens) + bcrypt |
| Database | AWS DynamoDB |
| Testing | Jest (unit) + supertest (API) |
| Code quality | ESLint |
| Containerization | Docker (multi-stage) + Docker Compose |
| CI | GitHub Actions |
| Registry | Docker Hub |
| Cloud | AWS EKS + Terraform |
| Monitoring (Phase 2) | Prometheus + Grafana |

## The Application

A To-Do REST API with JWT authentication, backed by **AWS DynamoDB** for persistent storage. A web UI is served at `/` in the same Express container.

Open <http://localhost:3000> after starting the app to use the UI.

### Auth API

| Method | Route | Description |
|--------|-------|-------------|
| POST   | `/api/auth/register` | Register `{ "username": "...", "password": "..." }` |
| POST   | `/api/auth/login`    | Login — returns `{ "token": "..." }` |

All todo routes require `Authorization: Bearer <token>` header.

### Todos API

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/health`        | Health/readiness probe |
| GET    | `/api/todos`     | List all todos for the authenticated user |
| GET    | `/api/todos/:id` | Get one todo |
| POST   | `/api/todos`     | Create a todo `{ "title": "...", "priority"?: "low\|medium\|high", "deadline": "ISO date" }` |
| PUT    | `/api/todos/:id` | Update `{ "title"?, "completed"?, "priority"? }` |
| DELETE | `/api/todos/:id` | Delete a todo |

## Run Locally

Requires AWS credentials with DynamoDB access (`~/.aws/credentials`).

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
docker build -t to-do:local .
docker run -p 3000:3000 \
  -e AWS_REGION=ap-south-1 \
  -e USERS_TABLE=to-do-users \
  -e TODOS_TABLE=to-do-todos \
  -e JWT_SECRET=your-secret \
  to-do:local

# Smoke test
curl localhost:3000/health
curl -X POST localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"pass123"}'
```

## CI Pipeline

On every push/PR to `main` or `develop`, GitHub Actions runs:

1. **Lint & Test** — `npm ci` → ESLint → Jest with coverage (artifact uploaded).
2. **Build & Push** — on push only: builds the multi-stage Docker image (`linux/amd64`) and pushes to Docker Hub with versioned tags (`latest`, branch name, short commit SHA).

See [`docs/ci-pipeline.md`](docs/ci-pipeline.md) for details and required secrets.

## Repository Layout

```
.
├── src/                  # Express app (app.js, server.js, todoStore.js, userStore.js)
├── public/               # Single-page web UI (served at /)
├── tests/                # Jest unit + supertest API tests
├── .github/workflows/    # GitHub Actions CI pipeline
├── docs/                 # Branching strategy + CI pipeline docs
├── terraform/            # AWS infrastructure (VPC, EKS, DynamoDB, IAM)
├── k8s/                  # Kubernetes manifests (Deployment, Service, Ingress)
├── Dockerfile            # Multi-stage build (deps → runtime, non-root user)
├── docker-compose.yml
└── package.json
```

## Documentation

- [Branching Strategy](docs/branching-strategy.md)
- [CI Pipeline Guide](docs/ci-pipeline.md)

## Project Status

- [x] **Phase 1:** Git workflow, app, JWT auth, DynamoDB, tests, ESLint, Docker, Docker Compose, GitHub Actions CI, Docker Hub push
- [x] **Phase 2 (Day 1):** Terraform EKS cluster, IRSA, Kubernetes manifests (Deployment, Service, Ingress via AWS LBC)
- [ ] **Phase 2 (remaining):** CD pipeline, multi-env, Prometheus/Grafana, alerting, secrets management, security scanning
