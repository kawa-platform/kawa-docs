---
title: Kubernetes operator
sidebar_position: 4
---

# Kubernetes operator

The kawa operator lets you manage your gateway through Kubernetes custom resources. You declare the configuration you want as resources in your cluster, and the operator applies it to the gateway and keeps the two in sync, so your gateway setup lives in git and ships with the rest of your cluster configuration. It works through the gateway's [admin API](/docs/reference/admin-api).

## Install with the Helm chart

The operator is published as the `kawa-operator` chart at `oci://ghcr.io/kawa-platform/charts/kawa-operator`, and its
source is in the [kawa-charts](https://github.com/kawa-platform/kawa-charts) repository. You need a Kubernetes cluster
with a running kawa gateway, and Helm 3. You do not need to check anything out. The examples assume the gateway from
[Getting started](/docs/getting-started): release `kawa` in the namespace `kawa`.

### 1. Create the client secret

The operator authenticates with the OAuth 2.0 client credentials flow: it presents the client id `kawa-operator` and a
client secret and receives an access token for the admin API. That is why the gateway and the operator share a secret:

```bash
kubectl -n kawa create secret generic kawa-operator-client \
  --from-literal=client-secret="$(openssl rand -hex 32)"
```

Only if the operator runs in a different namespace, create the same Secret there too, because a Secret is only visible
to pods in its own namespace.

The gateway reads the same value through an environment variable. Add this to the gateway's values file and upgrade the
gateway. It sets the admin login to OAuth and enables the operator client, which has the fixed client id `kawa-operator`.
See [Authentication](/docs/modules/authentication#operator-client).

```yaml
gateway:
  config:
    admin:
      enabled: true
      auth:
        type: oauth   # required: the operator client is only available with oauth
        settings:
          operatorSecret: ${KAWA_OPERATOR_SECRET}
          # bootstrapUser, loginUrl and redirectUris as in Getting started
  extraEnv:
    - name: KAWA_OPERATOR_SECRET
      valueFrom:
        secretKeyRef:
          name: kawa-operator-client
          key: client-secret
```

### 2. Write the operator's values

```yaml title="operator-values.yaml"
gateway:
  adminUrl: http://kawa-gateway.kawa.svc:8080
  auth:
    existingSecret: kawa-operator-client
# namespaceSelector: kawa.io/gateway=kawa   # optional, default: all namespaces
# resyncInterval: 5m                        # optional
```

Use the admin Service's full DNS name, which also works if the operator runs in another namespace. For an https admin API with a
private CA, also set `gateway.tls.caSecret` to a Secret that holds the CA certificate.

| Value | Default | Meaning |
|-------|---------|---------|
| `gateway.adminUrl` | (required) | The gateway's admin API (`--gateway-admin-url`). |
| `gateway.auth.existingSecret` | (required) | Existing Secret, key `client-secret`, that holds the client secret. It is mounted as a file and passed as `--gateway-client-secret-file`. |
| `gateway.tls.caSecret` | none | Secret that holds the CA certificate for an https admin API with a private CA (`--gateway-ca-file`). |
| `namespaceSelector` | all namespaces | Label selector of the namespaces to serve (`--namespace-selector`). |
| `resyncInterval` | `5m` | How often synced topics are compared with the gateway again (`--resync-interval`). |

### 3. Install

The chart version pins the operator image: each release of the chart installs the matching kawa-operator image, so you do
not set an image tag yourself.

```bash
helm install kawa-operator oci://ghcr.io/kawa-platform/charts/kawa-operator --version 0.1.0-rc7 \
  -n kawa -f operator-values.yaml
```

The chart installs the `VirtualTopic` CRD, and it keeps the CRD and every `VirtualTopic` when the chart is uninstalled.
It grants the built-in `edit` and `admin` roles access to `VirtualTopic` resources, so whoever may edit a namespace can
manage its virtual topics. For several gateways, install one release per gateway, each with its own `namespaceSelector`.

### 4. Check that it works

```bash
kubectl -n kawa get pods
```

The operator pod should be `Running`. It logs at startup whether it reached the gateway, and keeps running if it did
not. Now apply a minimal `VirtualTopic`:

```bash
kubectl create namespace team-a
kubectl apply -f - <<'EOF'
apiVersion: kawa.io/v1alpha1
kind: VirtualTopic
metadata:
  name: orders-eu
  namespace: team-a
spec:
  topicName: orders.eu      # optional, defaults to metadata.name
  physicalTopic: orders-v2
  filter:
    type: headerEquals
    header: region
    value: eu
EOF

kubectl -n team-a get virtualtopic orders-eu \
  -o custom-columns=NAME:.metadata.name,READY:'.status.conditions[?(@.type=="Ready")].status',REASON:'.status.conditions[?(@.type=="Ready")].reason'
```

```text
NAME        READY   REASON
orders-eu   True    Synced
```

If `READY` is `False`, the reason says why. See [Status](#status).

## Authentication

The operator logs in to the admin API as the client `kawa-operator`, with the OAuth 2.0 client credentials grant. Every call is made as that client, and it is the identity that [governance](/docs/modules/governance) rules and the gateway's logs see.

## Configuration reference

### Operator flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--gateway-admin-url` | (required) | Base URL of the gateway admin API. An absolute `http://` or `https://` URL. |
| `--gateway-client-id` | empty | The operator's client id, `kawa-operator`; the chart sets it. Must be set together with `--gateway-client-secret-file`. |
| `--gateway-client-secret-file` | empty | File with the client secret. |
| `--gateway-ca-file` | system roots | PEM CA certificates to verify an https admin API. |
| `--namespace-selector` | empty (all) | Label selector of the namespaces to serve, e.g. `kawa.io/gateway=kawa`. `VirtualTopic`s elsewhere report `NamespaceNotAllowed`. |
| `--resync-interval` | `5m` | How often synced topics are compared with the gateway again, reverting changes made outside the operator. |
| `--leader-elect` | `false` | Leader election. |
| `--leader-election-id` | `kawa-operator.kawa.io` | Lease name. Unique per install. |
| `--health-probe-bind-address` | `:8081` | `/healthz` and `/readyz`. |
| `--metrics-bind-address`, `--metrics-secure` and the cert flags | `0` (off) | Standard kubebuilder metrics options. |

### Annotation

| Annotation | On | Effect |
|------------|----|--------|
| `kawa.io/adopt: "true"` | VirtualTopic | Take over a virtual topic that already exists on the gateway (made in Studio or the API). Without it the operator reports `AlreadyExists`. |

### VirtualTopic spec

A `VirtualTopic` declares a [virtual topic](/docs/modules/virtual-topics) on the gateway.

| Field | Notes |
|-------|-------|
| `physicalTopic` | Required. The Kafka topic behind the virtual one. |
| `topicName` | Virtual name. Defaults to `metadata.name`. Immutable. Allows `[a-zA-Z0-9._-]`. |
| `exposePhysicalTopic` | Keep the physical topic listed in Metadata responses. |
| `filter` | `type`: `headerEquals`, `headerContains`, `headerStartsWith`, `headerMatches` (need `header` and `value`) or `cel` (needs `expression` only). |
| `valueFormat` | `type`: `json` or `avro`. `onDecodeError`: `skip` (default), `include`, `fail`. |
| `deletionPolicy` | `Delete` (default) removes the virtual topic from the gateway on deletion, `Retain` leaves it. The physical topic is never deleted. |

Status fields: `conditions` (`Ready`), `observedGeneration`, and `topicName` (the name the operator manages).

Virtual topic names are global on a gateway. The operator only changes or deletes the topic recorded in `status.topicName`. If two `VirtualTopic`s claim one name, the older wins and the other reports `Conflict`.

## Status

`Ready` is `True` when the gateway serves the topic as specified. Otherwise `reason` says why:

| Reason | Meaning |
|--------|---------|
| `Synced` | The gateway serves the virtual topic as specified. Checked again every resync interval. |
| `InvalidSpec` | The admin API refused the spec (HTTP 400), e.g. a CEL expression that does not compile. |
| `GovernanceRejected` | A governance rule refused the change (HTTP 403). Retried every resync interval. |
| `AlreadyExists` | The gateway has a topic with this name the operator did not create. Use `kawa.io/adopt`. |
| `Conflict` | An older `VirtualTopic` already manages this name. |
| `NamespaceNotAllowed` | The namespace does not match `--namespace-selector`. |
| `AuthenticationFailed` | The gateway refused the operator's client id or secret. |
| `GatewayUnavailable` | The admin API is unreachable or failing, the client secret or CA file cannot be read, or the namespace cannot be read. Retried with backoff. |
| `DeletionRejected` | The gateway refused to delete the topic (HTTP 403). Retried every minute, the `VirtualTopic` waits on its finalizer. |

Deleting a `VirtualTopic` needs the gateway to be reachable. If the virtual topic is already gone, nothing is deleted, and the operator never deletes a physical topic.
