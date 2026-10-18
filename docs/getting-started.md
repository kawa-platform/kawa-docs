---
title: Getting started
sidebar_position: 2
---

# Getting started

There are two ways to use kawa today. You can **install it with the Helm chart** into a Kubernetes cluster you run,
which is how you run it for real. Or you can try it on your own machine with **kawa-demo**, which runs kawa with Studio,
Kafka, a schema registry and a seeded sample workload, on Docker Compose or on minikube, and shows what kawa can do.

## Install with the Helm chart

The chart installs kawa-gateway and kawa-studio together. It is published as the `kawa-gateway` chart at
`oci://ghcr.io/kawa-platform/charts/kawa-gateway`, and its source is in
the [kawa-charts](https://github.com/kawa-platform/kawa-charts) repository. You need a Kubernetes cluster and Helm 3.
You do not need to check anything out.

The gateway's configuration is the value `gateway.config`. It is the same `config.yaml` that the gateway documents, and
the chart mounts it unchanged. 

When you do not set an admin password or a token signing key (`gateway.secrets.adminPassword` and
`gateway.secrets.signingKey`), the chart generates them on first install and stores them in a Secret. The command to
read the generated password is printed in the install notes. Your configuration refers to them as
`${KAWA_ADMIN_PASSWORD}` and `${KAWA_SIGNING_KEY}`. Here is a minimal values file. It serves Studio at
`studio.example.com` and sets the admin login to OAuth:

```yaml
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
          loginUrl: https://studio.example.com/admin/login
          redirectUris:
            - https://studio.example.com/admin/auth/callback
```

Install the published chart. The chart version pins the images: each release of the chart installs the matching
kawa-gateway and kawa-studio images, so you do not set image tags yourself.

```bash
helm install kawa oci://ghcr.io/kawa-platform/charts/kawa-gateway --version 0.1.0-rc7 \
  -n kawa --create-namespace -f my-values.yaml
```

To read the generated admin password, read it from the Secret. With the release name `kawa` from the command above, the
Secret is called `kawa-gateway`:

```bash
kubectl -n kawa get secret kawa-gateway -o jsonpath='{.data.admin-password}' | base64 -d
```

The generated values stay the same across upgrades.

Once Studio is reachable, sign in as the bootstrap user. Everything else, including virtual topics, clients, roles and
governance rules, is configured from Studio or through the admin API. The [configuration reference](/docs/configuration)
lists every setting, and the [admin API reference](/docs/reference/admin-api) lists every endpoint.

If you run Kubernetes workloads that create topics, the [Kubernetes operator](/docs/operator) can manage virtual topics
for each team as `VirtualTopic` resources. You install it separately, after the gateway.

## Try it locally with kawa-demo

[kawa-demo](https://github.com/kawa-platform/kawa-demo) allows you to play around with kawa either through docker-compose or kubernetes. 

The demo starts a gateway with virtual topics, SASL clients, RBAC and governance already
configured, so you can see each feature working before you configure your own. Its README walks through what each part
shows.

You need the kawa-demo repository and `make`, `curl` and `jq`. Everything else depends on the target you choose.

### Docker Compose

Docker with Compose v2 is the quickest path. From the kawa-demo checkout, run:

```bash
make compose-up
```

When it finishes, Studio is at `http://localhost:5173/admin/`. Sign in with `admin@kawa` and the password `admin`. The
gateway listens for Kafka clients on `localhost:9092`, and its admin API is on `localhost:8080`. Clients log in with
SASL PLAIN as `spacecraft`, `director`, `systems` or `navigator`, and the password is `<name>-secret`. To change the
admin password, set `KAWA_ADMIN_PASSWORD` before the first start. It is read only when the admin user is created.

Try the alerts console as the `systems` client, which may read only the alert topic:

```bash
make consume CLIENT=systems TOPIC=telemetry.alerts
```

Stop the stack with `make compose-down`.

### kubernetes through minikube

The minikube path runs the same demo inside a Kubernetes cluster, using the kawa chart. You need `minikube`, `kubectl`,
`helm`, `envsubst` and `docker`. The kawa images are private, so you also need to be logged in to `ghcr.io` with Docker.
From the kawa-demo checkout, run:

```bash
make k8s-up
make k8s-forward
```

`make k8s-up` starts a minikube profile called `kawa-demo`, so other clusters are left alone. `make k8s-forward`
forwards Studio to `http://localhost:5173/admin/` and the admin API to `localhost:8080`. Keep it running while you use
Studio. Sign in as `admin@kawa` with the password `admin`. Read the alerts console with `make k8s-consume`, and stop
everything with `make k8s-down`.

Image versions are pinned in the demo's `versions.env`. Change a version there, or override it on the command line, for
example `GATEWAY_VERSION=0.1.0-rc.3 make compose-up`.

## Where to go next

The [Virtual topics](/docs/modules/virtual-topics) page explains the feature the demo shows
first. [Authentication](/docs/modules/authentication) covers client credentials, TLS and admin login,
and [Access control](/docs/modules/rbac) explains how permissions are evaluated.
