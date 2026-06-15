# Branching Strategy

This project uses a **GitHub Flow / Git Flow hybrid** suited to continuous delivery.

## Branches

| Branch | Purpose | Protected |
|--------|---------|-----------|
| `main` | Production-ready. Every commit is deployable. Tagged releases cut from here. | Yes |
| `develop` | Integration branch for the next release. CI runs on every push. | Yes |
| `feature/<name>` | New work, branched off `develop`. | No |
| `bugfix/<name>` | Non-urgent fixes off `develop`. | No |
| `hotfix/<name>` | Urgent production fixes off `main`. | No |

## Workflow

```
feature/add-auth ──▶ PR ──▶ develop ──▶ PR ──▶ main ──▶ tag v1.x.x
```

1. Branch from `develop`:
   ```bash
   git checkout develop && git pull
   git checkout -b feature/add-pagination
   ```
2. Commit small, focused changes. Push and open a **Pull Request** into `develop`.
3. CI must pass (lint + tests). At least one **code review** approval required.
4. Squash-merge into `develop`. Periodically PR `develop` → `main` for release.
5. Tag releases on `main` (`v1.0.0`) — these can drive image tags / deploys.

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add DELETE /api/todos endpoint
fix: return 400 for empty title
chore: bump express to 4.21
docs: update CI guide
test: add update edge cases
ci: cache npm in actions
```

## Branch Protection Rules (configure on GitHub)

For `main` and `develop`:

- Require a pull request before merging
- Require status checks to pass (`Lint & Test`)
- Require at least 1 approving review
- Require branches to be up to date before merging
- Do not allow force pushes
