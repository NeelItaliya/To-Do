# Monitoring Guide

## Overview

The To-Do app uses **kube-prometheus-stack** (Prometheus + Grafana + AlertManager) deployed via Helm into the `monitoring` namespace, with **Fluent Bit** shipping container logs to AWS CloudWatch.

---

## Accessing Monitoring Tools

### Grafana

```bash
kubectl port-forward svc/prometheus-grafana 3001:80 -n monitoring
```

Open: http://localhost:3001  
Login: `admin` / `admin`

Navigate to **Dashboards → To-Do App** to see the custom dashboard.

### Prometheus

```bash
kubectl port-forward svc/prometheus-kube-prometheus-prometheus 9090:9090 -n monitoring
```

Open: http://localhost:9090

- **Alerts tab** — view all active/pending/inactive alerts
- **Graph tab** — run PromQL queries
- **Status → Targets** — check scrape health

### AlertManager

```bash
kubectl port-forward svc/prometheus-kube-prometheus-alertmanager 9093:9093 -n monitoring
```

Open: http://localhost:9093

Shows currently firing alerts and their routing to Slack.

### CloudWatch Logs

AWS Console → CloudWatch → Log Groups → `/aws/eks/to-do/containers`

Or via CLI:
```bash
aws logs describe-log-groups --log-group-name-prefix /aws/eks/to-do --region ap-south-1
aws logs tail /aws/eks/to-do/containers --follow --region ap-south-1
```

---

## Grafana Dashboard: To-Do App

The **To-Do App** dashboard (`k8s/grafana-dashboard.yaml`) shows 5 panels:

| Panel | Query | Purpose |
|-------|-------|---------|
| Total HTTP Requests | `sum(http_requests_total)` | Cumulative request count |
| Request Rate (req/sec) | `sum(rate(http_requests_total[5m]))` | Live throughput |
| P95 Latency | `histogram_quantile(0.95, ...)` | 95th percentile response time |
| Error Rate (%) | `sum(rate(5xx)) / sum(rate(all)) * 100` | % of 5xx responses |
| Pod Ready Count | `kube_pod_status_ready{namespace="to-do"}` | Running replica count |

**Applying the dashboard after a fresh cluster:**
```bash
kubectl apply -f k8s/grafana-dashboard.yaml
```

The dashboard is auto-discovered by Grafana via the `grafana_dashboard: "1"` ConfigMap label.

---

## Prometheus Alert Rules

Custom rules are defined in `k8s/alerting-rules.yaml` under the `to-do.rules` group.

**Applying after a fresh cluster:**
```bash
kubectl apply -f k8s/alerting-rules.yaml
```

### Alert Definitions

#### TodoAppHighErrorRate
- **Severity:** critical
- **Condition:** HTTP 5xx error rate > 5% over 5 minutes
- **Expression:** `sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05`
- **For:** 5m
- **Meaning:** Fires when more than 5% of all requests are returning server errors

#### TodoAppHighLatency
- **Severity:** warning
- **Condition:** P95 response time > 1 second over 5 minutes
- **Expression:** `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m]))) > 1`
- **For:** 5m
- **Meaning:** Fires when 95% of requests take longer than 1 second to complete

#### TodoAppPodNotReady
- **Severity:** critical
- **Condition:** Zero ready pods in `to-do` namespace for 2 minutes
- **Expression:** `kube_pod_status_ready{condition="true",namespace="to-do"} == 0`
- **For:** 2m
- **Meaning:** Fires when all app pods are down or not passing readiness checks

#### TodoAppDown
- **Severity:** critical
- **Condition:** Prometheus cannot scrape any To-Do app targets
- **Expression:** `absent(up{job="to-do-monitor"}) or sum(up{job="to-do-monitor"}) == 0`
- **For:** 1m
- **Meaning:** Fires when Prometheus has no scrape targets for the app (ServiceMonitor not applied, or all pods unreachable)

---

## ServiceMonitor

The `ServiceMonitor` (`k8s/service-monitor.yaml`) tells Prometheus how to scrape the app's `/metrics` endpoint.

**Must be applied manually after every fresh cluster:**
```bash
kubectl apply -f k8s/service-monitor.yaml
```

This creates a scrape job named `to-do-monitor` targeting port 3000 on pods labeled `app: to-do` in the `to-do` namespace.

**Verify scraping is working:**
```bash
# In Prometheus UI → Status → Targets
# Look for: to-do/to-do-monitor (should show UP)
```

---

## Useful PromQL Queries

```promql
# Request rate over last 5 minutes
sum(rate(http_requests_total[5m]))

# Error rate (5xx only)
sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

# P95 latency
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))

# Pod readiness
kube_pod_status_ready{condition="true", namespace="to-do"}

# App target scrape health
up{job="to-do-monitor"}

# Total requests by status code
sum by (status_code) (rate(http_requests_total[5m]))
```

---

## AlertManager Configuration

AlertManager is configured in `terraform/helm.tf` via the `kube-prometheus-stack` Helm values.

Alerts route to **Slack** via a webhook URL:
- All `to-do` namespace alerts route to the `to-do-alerts` receiver
- Alerts repeat every 4 hours if still firing
- Group wait: 30 seconds, group interval: 5 minutes

**Configuration location:**
```hcl
# terraform/helm.tf — alertmanager.config section
alertmanager:
  config:
    route:
      receiver: 'to-do-alerts'
      routes:
        - match:
            namespace: to-do
          receiver: to-do-alerts
    receivers:
      - name: to-do-alerts
        slack_configs:
          - api_url: <slack_webhook_url>
```

---

## Fluent Bit (Log Shipping)

Fluent Bit runs as a DaemonSet (one pod per node) and ships all container logs from `/var/log/containers/` to AWS CloudWatch.

**Log group:** `/aws/eks/to-do/containers`  
**Log stream format:** `{pod-name}_{namespace}_{container-name}`

Fluent Bit uses **IRSA** via the node role (`CloudWatchAgentServerPolicy`) — no credentials needed in pod specs.

**Check Fluent Bit status:**
```bash
kubectl get pods -n monitoring -l app.kubernetes.io/name=fluent-bit
kubectl logs -n monitoring -l app.kubernetes.io/name=fluent-bit --tail=20
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Grafana dashboard not found | `kubectl apply -f k8s/grafana-dashboard.yaml` |
| AlertManager alerts not routing | Check Slack webhook URL in `terraform/helm.tf` and re-apply |
| `TodoAppDown` firing | `kubectl apply -f k8s/service-monitor.yaml` to create the scrape job |
| Prometheus shows no targets | Verify ServiceMonitor is applied and pods are running |
| CloudWatch logs not appearing | Check Fluent Bit pods: `kubectl logs -n monitoring -l app.kubernetes.io/name=fluent-bit` |
| Grafana login fails | Default creds: `admin` / `admin` (change on first login) |
