---
title: Getting started
sidebar_position: 2
---

# Getting started

Kawa is made of these components:

| Component   | What it is                                                            |
|-------------|-----------------------------------------------------------------------|
| Gateway     | The main component that amplifies and protects your Kafka clusters.   |
| Studio      | Web admin UI for the Gateway.                                         |
| Operator    | Kubernetes operator that manages Kawa's resources                     |
| Helm charts | `kawa` installs the gateway and Studio, `kawa-operator` the operator. |

![Kafka clients connect to the kawa gateway on 9092; the platform team uses Studio, which calls the gateway's admin API, or declares resources that the operator applies; the kawa chart installs gateway and Studio, the kawa-operator chart the operator; the gateway talks to the Kafka cluster and keeps its configuration in the __kawa topic](./img/components.svg)

As kawa has been built with a cloud native mindset, the easiest way to get started is to use the Helm chart.

## Install with the Helm chart

The `kawa` chart installs the gateway and Studio. You need a Kubernetes cluster, Helm 3 and a Kafka cluster the
gateway can reach.

### 1. Install

Write a values file. Set `bootstrapServers` to your Kafka cluster; everything else can stay as it is:

```yaml title="my-values.yaml"
gateway:
  config:
    clusters:
      default:
        bootstrapServers: [ kafka.kafka.svc:9092 ]
    admin:
      enabled: true
      auth:
        type: oauth
        bootstrapUser:
          username: admin@example.com
          password: ${KAWA_ADMIN_PASSWORD}
        settings:
          signingKey: ${KAWA_SIGNING_KEY}
          loginUrl: http://localhost:5173/admin/login
          redirectUris:
            - http://localhost:5173/admin/auth/callback
      cors:
        allowedOrigins: [ http://localhost:5173 ]
```

Install the chart:

```bash
helm install kawa oci://ghcr.io/kawa-platform/charts/kawa --version 0.1.0-rc.4 \
  -n kawa --create-namespace -f my-values.yaml --wait
```

The chart version pins the gateway and Studio images, so you do not set image tags yourself.

### 2. Open Studio

Forward Studio and the admin API to your machine, and keep the command running:

```bash
kubectl -n kawa port-forward svc/kawa-studio 5173:80 &
kubectl -n kawa port-forward svc/kawa-gateway 8080:8080
```

Open `http://localhost:5173/admin/` and sign in as `admin@example.com`. The chart generated the password on install:

```bash
kubectl -n kawa get secret kawa-gateway -o jsonpath='{.data.admin-password}' | base64 -d
```

The generated password and signing key stay the same across upgrades. To choose your own, set
`gateway.secrets.adminPassword` and `gateway.secrets.signingKey`.

### 3. Connect a client

Kafka clients inside the cluster connect to `kawa-gateway.kawa.svc:9092` instead of your brokers. Before a client can
log in, create it in Studio, give it a role, and add any virtual topics it should use.

Clients outside the cluster need an address the gateway advertises: set `advertised.host` in the gateway config and
`gateway.service.type` to `LoadBalancer` or `NodePort`.

### Next steps

- To serve Studio on a real host, set `ingress.enabled`, `ingress.host` and its `tls`, and
  change `loginUrl`, `redirectUris` and `allowedOrigins` to that host.
- The [configuration reference](/docs/configuration) lists every gateway setting, and the
  admin API reference is served at `/docs` on the admin port.
- To manage virtual topics as `VirtualTopic` resources, install the [Kubernetes operator](/docs/operator) next to the gateway.

## Where to go next

The [Virtual topics](/docs/modules/virtual-topics) page explains kawa's core feature. [Authentication](/docs/modules/authentication) covers client credentials, TLS and admin login,
and [Access control](/docs/modules/rbac) explains how permissions are evaluated.
