#!/bin/bash
set -e

NAMESPACE="to-do"
DEPLOYMENT="to-do"
MIN_REPLICAS=2

echo "--- Deployment Validation ---"

READY=$(kubectl get deployment "$DEPLOYMENT" -n "$NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

if [ "${READY:-0}" -ge "$MIN_REPLICAS" ]; then
  echo "PASS: ${READY}/${MIN_REPLICAS} replicas ready"
else
  echo "FAIL: only ${READY:-0}/${MIN_REPLICAS} replicas ready"
  exit 1
fi

ALB=$(kubectl get ingress to-do-ingress -n "$NAMESPACE" \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")

if [ -n "$ALB" ]; then
  echo "Checking health at http://$ALB/health ..."
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "http://$ALB/health" --max-time 15 || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "PASS: health check returned HTTP $STATUS"
  else
    echo "FAIL: health check returned HTTP $STATUS"
    exit 1
  fi
else
  echo "WARN: no ALB hostname found, skipping health check"
fi

echo "--- Validation complete ---"
