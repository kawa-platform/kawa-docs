---
title: Configuration
sidebar_position: 3
---

# Configuration

kawa is configured through the values of the `kawa` Helm chart. The operator has its own chart, `kawa-operator` (see [Kubernetes operator](/docs/operator)).

There are two kinds of gateway configuration:

- **Static**: `gateway.config`, read at startup. Holds listeners, the upstream cluster, the advertised endpoint, the admin server and the config topic name. A change rolls the gateway pods.
- **Dynamic**: stored in the [config topic](#config-topic) and changed through the admin API, Studio or the operator. Applies live.

| Section                                                       | Kind    | Changed through                           |
|---------------------------------------------------------------|---------|-------------------------------------------|
| `listeners`, `clusters`, `advertised`, `admin`, `configTopic` | Static  | Chart values                              |
| `auth.brokerAuth`                                             | Static  | Chart values                              |
| `virtualTopics`                                               | Dynamic | `/topics`, Studio, the operator           |
| `auth.clients`, client mechanisms                             | Dynamic | `/auth/clients`, Studio                   |
| `rbac`                                                        | Dynamic | `/rbac`, Studio                           |
| `governance`                                                  | Dynamic | `/governance`, Studio                     |
| `adminUsers`                                                  | Dynamic | `/admin/users`, Studio                    |
| `modules`                                                     | Dynamic | `/modules`, Studio                        |
| `virtualClusters`                                             | Dynamic | `/virtual-clusters`                       |

## Chart values

| Value                                                 | Default     | Description                                                                                                    |
|-------------------------------------------------------|-------------|----------------------------------------------------------------------------------------------------------------|
| `gateway.config`                                      | `{}`        | The gateway config, described in the sections below. Mounted as `/etc/kawa/config.yaml`.                        |
| `gateway.existingConfigMap`                           | none        | A ConfigMap with a `config.yaml` key, used instead of `gateway.config`. Set `gateway.service.kafkaPort` and `adminPort` to match. |
| `gateway.secrets.adminPassword`, `.signingKey`        | generated   | Exposed as `KAWA_ADMIN_PASSWORD` and `KAWA_SIGNING_KEY`. Generated on first install and kept across upgrades.   |
| `gateway.secrets.existingSecret`                      | none        | A Secret with keys `admin-password` and `signing-key`, used instead.                                           |
| `gateway.logLevel`                                    | `INFO`      | Gateway log level.                                                                                             |
| `gateway.adminReset`                                  | `false`     | Resets the bootstrap admin's password on start. Set for one upgrade, then unset. See [Recovering from a lockout](/docs/modules/authentication#recovering-from-a-lockout). |
| `gateway.extraEnv`                                    | `[]`        | More environment variables, e.g. from a Secret, for `${VAR}` references.                                       |
| `gateway.extraVolumes`, `gateway.extraVolumeMounts`   | `[]`        | Mount TLS stores; point store `location` at the mount path.                                                    |
| `gateway.service.type`                                | `ClusterIP` | Use `LoadBalancer` or `NodePort` for clients outside the cluster, with `advertised.host` set to match.         |
| `gateway.replicaCount`, `gateway.resources`           | `1`, 512Mi–1Gi | The JVM heap is sized from the memory limit.                                                                |
| `ingress.enabled`, `.host`, `.className`, `.tls`      | off         | Serves Studio and `/api`. The host must match `loginUrl`, `redirectUris` and `cors.allowedOrigins`.             |
| `gateway.adminIngress.*`                              | off         | Exposes the admin API on its own host.                                                                         |

The Service exposes the first listener's port and `admin.port`. When `advertised.host` is unset, the chart sets it to the Service's cluster DNS name.

### Secrets

`${VAR}` and `${VAR:-default}` are resolved in secret fields only: store `password` and `keyPassword`, `auth.brokerAuth.password`, `schemaRegistry.basicAuth.password`, `admin.auth.bootstrapUser.password`, and every string in `admin.auth.settings`. Provide variables other than `KAWA_ADMIN_PASSWORD` and `KAWA_SIGNING_KEY` with `gateway.extraEnv`.

## Example

```yaml
gateway:
  extraEnv:
    - name: KAFKA_PASSWORD
      valueFrom:
        secretKeyRef: { name: kafka-credentials, key: password }
  config:
    clusters:
      default:
        bootstrapServers: [kafka.kafka.svc:9092]
    auth:
      brokerAuth:
        mechanism: PLAIN
        username: kawa
        password: ${KAFKA_PASSWORD}
    admin:
      enabled: true
      cors:
        allowedOrigins: [https://studio.example.com]
      auth:
        type: oauth
        bootstrapUser:
          username: admin@example.com
          password: ${KAWA_ADMIN_PASSWORD}
        settings:
          signingKey: ${KAWA_SIGNING_KEY}
          loginUrl: https://studio.example.com/admin/login
          redirectUris: [https://studio.example.com/admin/auth/callback]
ingress:
  enabled: true
  host: studio.example.com
```

## Gateway config

The sections below are keys of `gateway.config`. It is strict: unknown keys and dynamic sections fail startup. Fields are optional unless marked required.

### listeners

Client-facing listeners. Every entry is bound. Default: one `SASL_PLAINTEXT` listener on `0.0.0.0:9092`.

| Field              | Type   | Default          | Description                                                                                       |
|--------------------|--------|------------------|---------------------------------------------------------------------------------------------------|
| `host`             | string | `0.0.0.0`        | Bind address.                                                                                     |
| `port`             | int    | `9092`           | Bind port. `0` is ephemeral.                                                                      |
| `securityProtocol` | enum   | `SASL_PLAINTEXT` | `PLAINTEXT`, `SSL`, `SASL_PLAINTEXT` or `SASL_SSL`, as on a broker.                               |
| `tls`              | object | none             | Required for `SSL` and `SASL_SSL`, rejected otherwise.                                            |
| `advertised`       | object | see below        | This listener's [advertised endpoint](#advertised).                                               |
| `virtualCluster`   | string | none             | Pins every connection on this listener to a virtual cluster. Unset: chosen by SNI hostname or login. |

Identity follows the protocol. `PLAINTEXT` clients are anonymous, and RBAC denies anonymous clients everything. `SSL` identifies clients by certificate when `clientAuth` asks for one. On `SASL_*`, only `ApiVersions`, `SaslHandshake` and `SaslAuthenticate` are accepted before login; anything else closes the connection.

#### Listener tls

| Field                   | Type   | Default  | Description                                                                         |
|-------------------------|--------|----------|-------------------------------------------------------------------------------------|
| `keystore`              | store  | required | Certificate presented to clients. Must name the advertised host.                    |
| `truststore`            | store  | none     | CAs for client certificates. Required unless `clientAuth` is `NONE`.               |
| `clientAuth`            | enum   | `NONE`   | `NONE`, `REQUESTED` or `REQUIRED`.                                                  |
| `principalMappingRules` | string | CN       | Kafka `ssl.principal.mapping.rules` syntax. Default takes the subject's CN.         |

On `SSL`, a trusted certificate is the credential and needs no client entry. On `SASL_SSL`, the principal is the SASL login.

#### Stores

Used by listener, cluster and schema registry TLS. A store file that does not exist fails startup.

| Field         | Type   | Default  | Description                                                              |
|---------------|--------|----------|--------------------------------------------------------------------------|
| `location`    | string | required | Path to the file.                                                        |
| `type`        | enum   | `PKCS12` | `PKCS12`, `JKS` or `PEM`.                                                |
| `password`    | string | none     | Required for `PKCS12` and `JKS`, rejected for `PEM`.                     |
| `keyPassword` | string | none     | Keystore only: the key's password, or an encrypted `PEM` key's passphrase. |

A `PEM` keystore holds a PKCS#8 key followed by its certificate chain.

### clusters

The upstream Kafka cluster, keyed by name. Only the first entry is used. Required.

| Field              | Type        | Default  | Description                                                     |
|--------------------|-------------|----------|-----------------------------------------------------------------|
| `bootstrapServers` | string list | required | `host:port`. Only the first address is used.                    |
| `tls`              | object      | none     | `truststore` (required), `keystore` for mTLS, `verifyHostname` (default `true`). |
| `schemaRegistry`   | object      | none     | For virtual topics with `valueFormat: avro`.                    |

The broker protocol follows from what is set: neither `tls` nor `auth.brokerAuth` is `PLAINTEXT`, `brokerAuth` only is `SASL_PLAINTEXT`, `tls` only is `SSL`, both is `SASL_SSL`.

#### Schema registry

| Field       | Type   | Default  | Description                                                    |
|-------------|--------|----------|----------------------------------------------------------------|
| `url`       | string | required | Absolute `http://` or `https://` URL.                          |
| `basicAuth` | object | none     | `username` and `password`.                                     |
| `tls`       | object | JVM CAs  | As cluster `tls`. Only for `https`.                            |

### auth.brokerAuth

The SASL identity kawa uses toward the brokers; broker ACLs apply to it. All fields required. `mechanism` must be `PLAIN`.

### advertised

The endpoint kawa returns in Metadata and FindCoordinator responses, so all traffic flows through the gateway.

| Field    | Type   | Default     | Description                                          |
|----------|--------|-------------|------------------------------------------------------|
| `nodeId` | int    | `1`         | Advertised broker id.                                |
| `host`   | string | `localhost` | Must resolve from the clients' network.              |
| `port`   | int    | bound port  | `0` means the listener's bound port.                 |

The top-level `advertised` applies to the first listener; further listeners use its host with their own bound port unless they set `advertised` themselves.

### admin

The admin HTTP server: admin API, Studio backend and `/docs`.

| Field     | Type   | Default      | Description                                      |
|-----------|--------|--------------|--------------------------------------------------|
| `enabled` | bool   | `false`      | Start the admin server.                          |
| `host`    | string | `0.0.0.0`    | Bind address.                                    |
| `port`    | int    | `8080`       | Bind port. `0` is ephemeral.                     |
| `cors`    | object | none         | Omit to disable CORS.                            |
| `auth`    | object | `type: none` | See below.                                       |

With `type: none`, the API is open and every request runs as principal `admin`. Use `oauth` anywhere it is reachable by others.

#### cors

| Field              | Type        | Default                                  | Description                                                     |
|--------------------|-------------|------------------------------------------|-----------------------------------------------------------------|
| `allowedOrigins`   | string list | `["*"]`                                  |                                                                 |
| `allowedMethods`   | string list | `GET, POST, PUT, PATCH, DELETE, OPTIONS` |                                                                 |
| `allowedHeaders`   | string list | `["*"]`                                  | `*` also allows `Authorization`; an explicit list must name it. |
| `allowCredentials` | bool        | `false`                                  |                                                                 |
| `maxAge`           | int         | none                                     | Preflight cache, in seconds.                                    |

#### admin.auth

Read from the file only, never written to the config topic.

| Field           | Type   | Default | Description                                                                                         |
|-----------------|--------|---------|-----------------------------------------------------------------------------------------------------|
| `type`          | string | `none`  | `none` or `oauth`.                                                                                  |
| `bootstrapUser` | object | none    | `username` (an email) and `password`. Seeds the first admin user when none exist; ignored afterwards. |
| `settings`      | object | `{}`    | Settings for the selected `type`.                                                                   |

`oauth` settings:

| Setting          | Type     | Default   | Description                                                                                   |
|------------------|----------|-----------|-----------------------------------------------------------------------------------------------|
| `loginUrl`       | string   | required  | UI login page `/oauth/authorize` redirects to. For Studio: `<origin>/admin/login`.            |
| `redirectUris`   | list     | required  | Allowed post-login redirects. For Studio: `<origin>/admin/auth/callback`.                     |
| `issuer`         | string   | `kawa`    | `iss` and `aud` of issued tokens.                                                             |
| `tokenTtl`       | duration | `PT15M`   | Access token lifetime.                                                                        |
| `sessionTtl`     | duration | `PT8H`    | Login lifetime. Refreshing does not extend it.                                                |
| `signingKey`     | string   | generated | PEM EC P-256 key. Unset, a temporary key is generated and tokens die on restart; set it for anything beyond one replica. |
| `operatorSecret` | string   | none      | Enables the `kawa-operator` client (client credentials). See [Authentication](/docs/modules/authentication#operator-client). |

See [Authentication](/docs/modules/authentication#studio-and-the-admin-api) for admin users and sign-in.

## Config topic

`configTopic` names the topic holding dynamic config, default `__kawa`. Create it with one partition and `cleanup.policy=compact`. An empty topic is a valid first boot: no virtual topics, no clients, default-deny RBAC.

Each record is a full JSON snapshot of the dynamic sections; the latest wins. It never contains static settings or file secrets. Replicas can share the topic: writes are transactional under a shared transactional id and retried on conflict, so brokers need transaction support. Single-broker dev clusters need `transaction.state.log.replication.factor=1` and `transaction.state.log.min.isr=1`.

## Modules

`virtual-topics`, `rbac` and `governance`, all on by default, toggled in Studio. Disabling `rbac` fails open; see [Access control](/docs/modules/rbac#switching-access-control-off).
