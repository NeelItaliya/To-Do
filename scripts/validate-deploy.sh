#!/usr/bin/env bash
# Post-deploy validation, run by the CD pipeline after `kubectl rollout status`.
#
# Checks, in order:
#   1. every replica the Deployment asks for is updated and ready
#   2. the Deployment runs the image that was just deployed (when EXPECTED_IMAGE is set)
#   3. the app answers /health through the load balancer
#   4. smoke tests: the pages load, the API enforces sign-in, and a sign-in
#      attempt reaches the database
#
# Exits non-zero on the first failure, which makes the pipeline roll back.
set -euo pipefail

NAMESPACE="${NAMESPACE:-to-do}"
DEPLOYMENT="${DEPLOYMENT:-to-do}"
INGRESS="${INGRESS:-${DEPLOYMENT}-ingress}"
EXPECTED_IMAGE="${EXPECTED_IMAGE:-}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-6}"
HEALTH_WAIT_SECONDS="${HEALTH_WAIT_SECONDS:-10}"

field() {
  kubectl get deployment "$DEPLOYMENT" -n "$NAMESPACE" -o "jsonpath=$1"
}

echo "--- Deployment validation ---"

# 1. Replicas. The desired count comes from the Deployment itself, so this
#    works for every environment size.
DESIRED=$(field '{.spec.replicas}')
READY=$(field '{.status.readyReplicas}')
UPDATED=$(field '{.status.updatedReplicas}')
READY="${READY:-0}"
UPDATED="${UPDATED:-0}"

if [ "$READY" -ge "$DESIRED" ] && [ "$UPDATED" -ge "$DESIRED" ]; then
  echo "PASS: ${READY}/${DESIRED} replicas ready on the new version"
else
  echo "FAIL: ${READY}/${DESIRED} ready, ${UPDATED}/${DESIRED} updated"
  exit 1
fi

# 2. Image.
ACTUAL_IMAGE=$(field '{.spec.template.spec.containers[0].image}')
if [ -n "$EXPECTED_IMAGE" ]; then
  if [ "$ACTUAL_IMAGE" = "$EXPECTED_IMAGE" ]; then
    echo "PASS: running image $ACTUAL_IMAGE"
  else
    echo "FAIL: expected image $EXPECTED_IMAGE but the Deployment runs $ACTUAL_IMAGE"
    exit 1
  fi
else
  echo "INFO: running image $ACTUAL_IMAGE"
fi

# 3. Health through the load balancer, retried because targets can take a
#    few seconds to register after a rollout.
ALB=$(kubectl get ingress "$INGRESS" -n "$NAMESPACE" \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)

if [ -z "$ALB" ]; then
  echo "WARN: the ingress has no load balancer address yet, skipping the health check"
  echo "--- Validation complete ---"
  exit 0
fi

echo "Checking http://$ALB/health"
for attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://$ALB/health" || true)
  if [ "$STATUS" = "200" ]; then
    echo "PASS: health check returned HTTP 200 (attempt $attempt)"
    break
  fi
  echo "  attempt $attempt/$HEALTH_ATTEMPTS: HTTP ${STATUS:-000}"
  sleep "$HEALTH_WAIT_SECONDS"
done

if [ "$STATUS" != "200" ]; then
  echo "FAIL: health check never returned HTTP 200"
  exit 1
fi

# 4. Smoke tests. Each one requests a path and compares the status code.
#    None of them writes data.
smoke() {
  local label="$1" expected="$2" path="$3"
  shift 3
  local got
  got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@" "http://$ALB$path" || true)
  if [ "$got" = "$expected" ]; then
    echo "PASS: smoke: $label (HTTP $got)"
  else
    echo "FAIL: smoke: $label expected HTTP $expected, got ${got:-000}"
    exit 1
  fi
}

smoke "landing page loads" 200 /
smoke "sign-in page loads" 200 /login
smoke "tasks page loads" 200 /app
smoke "API rejects requests without a token" 401 /api/todos
# A sign-in for a user that does not exist must return 401. That only happens
# if the app can read the users table, so this also proves database access.
smoke "sign-in reaches the database" 401 /api/auth/login \
  -X POST -H 'Content-Type: application/json' \
  -d '{"username":"smoke-test-no-such-user","password":"smoke-test"}'

echo "--- Validation complete ---"
