---
title: Kubernetes operator
sidebar_position: 4
---

# Kubernetes operator

The operator manages gateway configuration as Kubernetes resources: `VirtualTopic`, `Client`, `Role` and `Group`. It applies them through the gateway's admin API, keeps the gateway in sync and reverts changes made elsewhere.

## Install

The operator is the `kawa-operator` chart, installed next to the gateway. The examples assume the gateway from [Getting started](/docs/getting-started): release `kawa` in namespace `kawa`.

### 1. Share a client secret

The operator logs in as the fixed client `kawa-operator` with the OAuth 2.0 client credentials grant. Create its secret:

```bash
kubectl -n kawa create secret generic kawa-operator-client \
  --from-literal=client-secret="$(openssl rand -hex 32)"
```

Enable the client on the gateway (requires `admin.auth.type: oauth`) and `helm upgrade` it:

```yaml title="my-values.yaml"
gateway:
  extraEnv:
    - name: KAWA_OPERATOR_SECRET
      valueFrom:
        secretKeyRef: { name: kawa-operator-client, key: client-secret }
  config:
    admin:
      auth:
        settings:
          operatorSecret: ${KAWA_OPERATOR_SECRET}
```

### 2. Install the chart

```yaml title="operator-values.yaml"
gateway:
  adminUrl: http://kawa-gateway.kawa.svc:8080
  auth:
    existingSecret: kawa-operator-client
```

```bash
helm install kawa-operator oci://ghcr.io/kawa-platform/charts/kawa-operator --version 0.1.0-rc.3 \
  -n kawa -f operator-values.yaml --wait
```

The chart version pins the operator image. The Secrets must live in the operator's namespace.

| Value                         | Default        | Description                                                                              |
|-------------------------------|----------------|------------------------------------------------------------------------------------------|
| `gateway.adminUrl`            | required       | The gateway's admin API.                                                                 |
| `gateway.auth.existingSecret` | required       | Secret with key `client-secret`. Read on every use, so rotating it needs no restart.     |
| `gateway.tls.caSecret`        | system roots   | Secret with key `ca.crt`, for an https admin API with a private CA.                      |
| `namespaceSelector`           | all namespaces | Label selector of namespaces to serve, e.g. `kawa-platform.github.io/gateway=kawa`.      |
| `resyncInterval`              | `5m`           | How often synced resources are compared with the gateway again.                          |
| `metrics.enabled`             | `false`        | Metrics over HTTPS on `:8443`, Service `<release>-metrics`. Scrapers need the `<release>-metrics-reader` ClusterRole. |

The chart installs the CRDs and keeps them, and every resource, on uninstall. It aggregates into the built-in `view`, `edit` and `admin` roles, so namespace editors manage their own kawa resources. For several gateways, install one release per gateway, each with its own `namespaceSelector`.

### 3. Check it

```bash
kubectl create namespace team-a
kubectl apply -f - <<'EOF'
apiVersion: kawa-platform.github.io/v1alpha1
kind: VirtualTopic
metadata:
  name: orders-eu
  namespace: team-a
spec:
  physicalTopic: orders-v2
EOF
kubectl -n team-a get virtualtopic orders-eu \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].reason}'   # Synced
```

## Resources

All kinds are namespaced, in `kawa-platform.github.io/v1alpha1`. Each one is described on its module page:

| Kind           | Manages                         | Fields                                                        |
|----------------|---------------------------------|---------------------------------------------------------------|
| `VirtualTopic` | A virtual topic                 | [Virtual topics](/docs/modules/virtual-topics)                |
| `Client`       | A SASL client and its password  | [Authentication](/docs/modules/authentication)                |
| `Role`         | A set of ACLs                   | [Access control](/docs/modules/rbac)                          |
| `Group`        | Clients that share roles        | [Access control](/docs/modules/rbac)                          |

The gateway name is `metadata.name` (a `VirtualTopic` can override it). Every kind has `deletionPolicy`: `Delete` (default) removes the object from the gateway, `Retain` leaves it.

## Ownership

Gateway names are global per gateway. The operator records the name it manages in `status`, and only changes or deletes that name. If two resources claim one name, the older wins and the other reports `Conflict`. An object that already exists on the gateway (made in Studio or the API) reports `AlreadyExists` until you annotate the resource with `kawa-platform.github.io/adopt: "true"`.

Deletion goes through a finalizer and needs the gateway to be reachable.

## Status

Each resource has a `Ready` condition, `observedGeneration`, and the managed name in `status`.

| Reason                 | Meaning                                                                                      |
|------------------------|----------------------------------------------------------------------------------------------|
| `Synced`               | The gateway matches the spec. Checked again every resync interval.                           |
| `InvalidSpec`          | The admin API refused the spec (400), e.g. a CEL expression that does not compile.           |
| `GovernanceRejected`   | A [governance](/docs/modules/governance) rule refused the change (403). Retried each resync. |
| `AlreadyExists`        | Exists on the gateway but not managed by the operator. See [Ownership](#ownership).          |
| `Conflict`             | Another resource already manages this name.                                                  |
| `NamespaceNotAllowed`  | The namespace does not match `namespaceSelector`.                                            |
| `NamespaceUnreadable`  | The operator cannot read the namespace to check it.                                          |
| `SecretUnavailable`    | A `Client`'s password Secret or key is missing. Retried when the Secret changes.             |
| `AuthenticationFailed` | The gateway refused the operator's client secret.                                            |
| `GatewayConfigInvalid` | The operator's own gateway settings are unusable, e.g. an unreadable client secret or CA file. |
| `GatewayUnavailable`   | The admin API is unreachable or failing. Retried with backoff.                               |
| `APIUnavailable`       | The Kubernetes API failed. Retried with backoff.                                             |
| `DeletionRejected`     | The gateway refused the delete (403). Retried every minute; the finalizer holds the resource. |

## Operator flags

The chart sets these. They matter only when running the binary yourself.

| Flag                           | Default | Description                                                      |
|--------------------------------|---------|------------------------------------------------------------------|
| `--gateway-admin-url`          | required | Absolute `http://` or `https://` URL.                           |
| `--gateway-client-id`          | empty   | `kawa-operator`. Set together with `--gateway-client-secret-file`. |
| `--gateway-client-secret-file` | empty   | File with the client secret.                                     |
| `--gateway-ca-file`            | system roots | PEM CAs for an https admin API.                             |
| `--namespace-selector`         | all     | Label selector of namespaces to serve.                           |
| `--resync-interval`            | `5m`    |                                                                  |
| `--leader-elect`, `--leader-election-id` | `false`, `kawa-operator.kawa-platform.github.io` | The chart enables it, with the release name as id. |
| `--health-probe-bind-address`  | `:8081` | `/healthz` and `/readyz`.                                        |
| `--metrics-bind-address`, `--metrics-secure`, `--enable-http2` | `0`, `true`, `false` | Standard controller-runtime options. |
