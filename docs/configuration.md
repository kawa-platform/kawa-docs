---
title: Configuration
sidebar_position: 3
---

# Configuration

kawa reads two kinds of configuration. The YAML file holds what must be known at startup: listeners and their TLS, the cluster connection, the advertised endpoint, the admin listener with its login settings, and the name of the config topic. Changing the file requires a restart.

Everything else is dynamic. Virtual topics, client credentials, RBAC, governance, admin users and modules are stored in the config topic and changed through the admin API, through Studio, or through the Kubernetes operator. Those changes apply live, without a restart.

| Setting                                                          | Where it lives      | Changed by                                    |
|------------------------------------------------------------------|---------------------|-----------------------------------------------|
| `listeners`, `clusters`, `advertised`, `admin`, `configTopic`    | YAML file           | Editing the file and restarting               |
| `auth.brokerAuth`                                                | YAML file           | Editing the file and restarting               |
| `virtualTopics`                                                  | Config topic        | `/topics` endpoints, Studio, the operator     |
| `auth.clients`, client mechanisms                                | Config topic        | `/auth/clients` endpoints, Studio             |
| `rbac`                                                           | Config topic        | `/rbac` endpoints, Studio                     |
| `governance`                                                     | Config topic        | `/governance` endpoints, Studio               |
| `adminUsers`                                                     | Config topic        | `/admin/users` endpoints, Studio              |
| `modules`                                                        | Config topic        | `/modules` endpoints, Studio                  |

Dynamic sections in the YAML file are not the source of truth. Manage them through the admin API. The one exception to note is `governance`, which the loader drops from the file. The [configuration snapshot](#the-config-topic) section explains exactly what is stored.

## Starting the gateway

```bash
java -jar kawa-server.jar --config /path/to/config.yaml
```

Without `--config`, kawa reads `config.yaml` from the working directory. Plugins are loaded from the directory named by `--plugins`, then the `KAWA_PLUGIN_DIR` variable, then `/opt/kawa/plugins`. See [Plugins](/docs/modules/plugins).

Unknown properties in the YAML file are ignored, and every field is optional unless it is marked as required below.

## Environment variables

Any string value in the file can reference environment variables with `${VAR}` or `${VAR:-default}`. Use this for passwords and key material, so that secrets stay out of the file.

| Variable            | Purpose                                                                                                                                                            |
|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `KAWA_LOG_LEVEL`    | Log level. `INFO` by default. Set `DEBUG` when troubleshooting.                                                                                                    |
| `KAWA_ADMIN_RESET`  | Set to `true` for one start to recover a gateway that nobody can sign in to. See [Recovering from a lockout](/docs/modules/authentication#recovering-from-a-lockout). |

## Full example

```yaml
listeners:
  - host: 0.0.0.0
    port: 9092
    securityProtocol: SASL_PLAINTEXT

clusters:
  default:
    bootstrapServers:
      - kafka:9092

auth:
  brokerAuth:
    mechanism: PLAIN
    username: kawa
    password: ${KAFKA_PASSWORD}

advertised:
  nodeId: 1
  host: gateway.example.com
  port: 9092

admin:
  enabled: true
  host: 0.0.0.0
  port: 8080
  cors:
    allowedOrigins:
      - https://studio.example.com
  auth:
    type: oauth
    bootstrapUser:
      username: admin@example.com
      password: ${KAWA_ADMIN_PASSWORD}
    settings:
      signingKey: ${KAWA_ADMIN_SIGNING_KEY}
      loginUrl: https://studio.example.com/admin/login
      redirectUris:
        - https://studio.example.com/admin/auth/callback

configTopic: __kawa
```

## Listeners

`listeners` is a list of client-facing listeners. Only the first entry is bound. Its port is also the default advertised port.

| Field              | Type   | Default          | Description                                                                             |
|--------------------|--------|------------------|-----------------------------------------------------------------------------------------|
| `host`             | string | `0.0.0.0`        | Bind address.                                                                           |
| `port`             | int    | `9092`           | Bind port. `0` binds an ephemeral port.                                                 |
| `securityProtocol` | enum   | `SASL_PLAINTEXT` | `PLAINTEXT`, `SSL`, `SASL_PLAINTEXT` or `SASL_SSL`. Clients set the same value as `security.protocol`. |
| `tls`              | object | none             | Required for `SSL` and `SASL_SSL`, and not allowed for the other two.                    |

The protocol decides how clients are identified. On `PLAINTEXT`, every client is anonymous. On `SSL`, the client certificate identifies the client, if the listener asks for one. On `SASL_PLAINTEXT` and `SASL_SSL`, the client must log in with SASL before anything else. Until it does, only `ApiVersions`, `SaslHandshake` and `SaslAuthenticate` are accepted, and any other request closes the connection, as on a broker. An anonymous client has no principal, so RBAC denies it everything. `PLAINTEXT` is useful only when RBAC is switched off.

### Listener TLS

| Field                   | Type   | Default            | Description                                                                                                      |
|-------------------------|--------|--------------------|------------------------------------------------------------------------------------------------------------------|
| `keystore`              | store  | required           | kawa's certificate and private key, presented to clients. Its certificate must name the advertised host.         |
| `truststore`            | store  | none               | CA certificates that client certificates are verified against. Required when `clientAuth` is not `NONE`.         |
| `clientAuth`            | enum   | `NONE`             | `NONE`, `REQUESTED` (a certificate is optional) or `REQUIRED`.                                                   |
| `principalMappingRules` | string | the certificate CN | How a client certificate's subject becomes the principal, in Kafka's `ssl.principal.mapping.rules` syntax.      |

A client certificate on an `SSL` listener needs no entry in the client list. The certificate, trusted through the truststore, is the credential. On `SASL_SSL`, the principal is always the SASL login, and the certificate only secures the connection.

```yaml
# SSL listener: clients are identified by their certificate
listeners:
  - port: 9093
    securityProtocol: SSL
    tls:
      keystore:
        location: /etc/kawa/kawa.p12
        password: ${KEYSTORE_PASSWORD}
      truststore:
        location: /etc/kawa/clients-ca.pem
        type: PEM
      clientAuth: REQUIRED
```

kawa refuses to start when a listener store cannot be read, and the error names the store.

### Stores

Every TLS store, on listeners and on clusters, has the same fields.

| Field         | Type   | Default      | Description                                                                                                    |
|---------------|--------|--------------|----------------------------------------------------------------------------------------------------------------|
| `location`    | string | required     | Path of the store file.                                                                                        |
| `type`        | enum   | `PKCS12`     | `PKCS12`, `JKS` or `PEM`.                                                                                       |
| `password`    | string | none         | Store password. Required for `PKCS12` and `JKS`, not allowed for `PEM`.                                        |
| `keyPassword` | string | none         | Keystore only. The private key's password, or the passphrase of an encrypted `PEM` key.                        |

A `PEM` truststore holds one or more CA certificates. A `PEM` keystore holds the private key in PKCS#8 form, followed by its certificate chain, in one file.

## Clusters

`clusters` maps a name to an upstream Kafka cluster. Only the first entry is used, and one cluster is supported.

| Field              | Type        | Default      | Description                                                                                  |
|--------------------|-------------|--------------|----------------------------------------------------------------------------------------------|
| `bootstrapServers` | string list | required     | `host:port` addresses for the initial connection to the cluster.                             |
| `tls`              | object      | none         | TLS to the brokers. Its fields are `truststore` (required), `keystore` and `verifyHostname`. |
| `schemaRegistry`   | object      | none         | Schema registry for virtual topics whose values are Avro. See below.                         |

The protocol kawa uses toward the brokers follows from what is configured. Without `tls` or `auth.brokerAuth`, the connection is plaintext. With only `auth.brokerAuth`, it is `SASL_PLAINTEXT`. With only `tls`, it is `SSL`. With both, it is `SASL_SSL`.

The `tls` block takes a `truststore` with the CA certificates that brokers' certificates must chain to. It can take a `keystore` for brokers that require mutual TLS. `verifyHostname` defaults to `true`, so that a broker's certificate must name the host kawa reached it on.

```yaml
clusters:
  default:
    bootstrapServers: [kafka-1.internal:9093]
    tls:
      truststore:
        location: /etc/kawa/ca.pem
        type: PEM
      keystore:
        location: /etc/kawa/kawa.p12
        password: ${KEYSTORE_PASSWORD}
```

### Schema registry

The `schemaRegistry` block is used by virtual topics whose `valueFormat` is `avro`. It needs a `url`, which is an `http://` or `https://` base URL. It can take `basicAuth` with `username` and `password`, and a `tls` block for an `https` registry, with the same fields as the cluster's TLS. Without a `tls` block, the JVM's default CA certificates are trusted. Virtual topics and value formats are described in [Virtual topics](/docs/modules/virtual-topics).

## Advertised endpoint

`advertised` is the endpoint kawa gives clients in every rewritten Metadata and FindCoordinator response. Every broker address a client sees is this endpoint, so all client traffic flows through kawa.

| Field    | Type   | Default                  | Description                                                                                |
|----------|--------|--------------------------|--------------------------------------------------------------------------------------------|
| `nodeId` | int    | `1`                      | Broker node id advertised to clients.                                                      |
| `host`   | string | `localhost`              | The host clients connect to. It must resolve from the client's network.                    |
| `port`   | int    | the first listener's port | The port clients connect to. `0` means use the bound listener port.                       |

Choose the host from the client's point of view. A value of `localhost` only works for clients on the same machine as the gateway, or with the port published on the host, as in the demo.

## Admin API

`admin` controls the admin HTTP server, which serves the admin API, Studio's backend and the `/docs` API reference.

| Field     | Type   | Default      | Description                                                                 |
|-----------|--------|--------------|-----------------------------------------------------------------------------|
| `enabled` | bool   | `false`      | Whether the admin server starts.                                            |
| `host`    | string | `0.0.0.0`    | Bind address.                                                               |
| `port`    | int    | `8080`       | Bind port. `0` binds an ephemeral port.                                     |
| `cors`    | object | none         | CORS settings for a browser UI served from another origin. Omit to disable. |
| `auth`    | object | `type: none` | Admin authentication. See below.                                            |

With no `auth` block, the admin API is open to anyone who can reach its port, and every request is treated as the principal `admin`. Do not expose the admin port without authentication. Use `oauth` for any deployment that is reachable by more than one person.

### CORS

| Field              | Type        | Default                                                 | Description                                                                                  |
|--------------------|-------------|---------------------------------------------------------|----------------------------------------------------------------------------------------------|
| `allowedOrigins`   | string list | `["*"]`                                                 | Origins that may call the admin API. `*` allows any origin.                                  |
| `allowedMethods`   | string list | `GET, POST, PUT, PATCH, DELETE, OPTIONS`                | Methods allowed in preflight responses.                                                      |
| `allowedHeaders`   | string list | `["*"]`                                                 | Headers allowed in preflight responses. An explicit list must include `Authorization`.      |
| `allowCredentials` | bool        | `false`                                                 | Whether credentialed requests are allowed. With a wildcard origin, kawa echoes the request origin instead. |
| `maxAge`           | int         | none                                                    | Seconds that preflight responses may be cached.                                              |

### admin.auth

`admin.auth` selects the admin authentication provider with `type`. Two providers ship with kawa: `none`, the default, and `oauth`. Plugins can add more. Exactly one is active.

| Field           | Type   | Default | Description                                                                                                                    |
|-----------------|--------|---------|--------------------------------------------------------------------------------------------------------------------------------|
| `type`          | string | `none`  | `none`, `oauth`, or a provider registered by a plugin.                                                                         |
| `bootstrapUser` | object | none    | `username` (an email address) and `password`. Creates the first admin user on a start that has no admin users. Required for `oauth` unless an admin user already exists. |
| `settings`      | object | `{}`    | Settings for the selected provider. `${VAR}` values are resolved.                                                              |

The `settings` for `type: oauth` are these.

| Setting          | Type     | Default       | Description                                                                                                        |
|------------------|----------|---------------|--------------------------------------------------------------------------------------------------------------------|
| `loginUrl`       | string   | required      | The login page of the UI, to which `/oauth/authorize` redirects. For Studio, `/admin/login` on Studio's origin.   |
| `redirectUris`   | list     | required      | Redirect URIs the UI may use after login, for example `https://studio.example.com/admin/auth/callback`.           |
| `issuer`         | string   | `kawa`        | The `iss` and `aud` claims of issued tokens.                                                                       |
| `tokenTtl`       | duration | `PT15M`       | Lifetime of access tokens, as an ISO-8601 duration.                                                                |
| `sessionTtl`     | duration | `PT8H`        | How long a login lasts. Refresh tokens stop working when the session ends, and refreshing does not extend it.     |
| `signingKey`     | string   | generated     | PEM EC P-256 private key that signs tokens. Set it in any deployment with more than one replica or with restarts.  |
| `operatorSecret` | string   | none          | Secret of the operator client `kawa-operator`, which authenticates with the client credentials grant. Without it the gateway issues no operator tokens. See [Authentication](/docs/modules/authentication#operator-client). |

The admin login flow, token format and admin user management are described in [Authentication](/docs/modules/authentication#admin-api-authentication). The `auth` block holds secrets, so it is read from the file only and is never written to the config topic.

## Client authentication

Client credentials are dynamic, so `auth.clients` does not appear in the file. Add clients through the admin API, as shown in [Authentication](/docs/modules/authentication#client-authentication). The file holds only the upstream identity.

### auth.brokerAuth

`auth.brokerAuth` is the identity kawa uses to log in to the cluster. Only `PLAIN` is supported.

| Field       | Type   | Required | Description                                                |
|-------------|--------|----------|------------------------------------------------------------|
| `mechanism` | string | yes      | The SASL mechanism. Only `PLAIN` is supported.             |
| `username`  | string | yes      | The broker SASL username.                                  |
| `password`  | string | yes      | The password. Supports `${VAR}` and `${VAR:-default}`.     |

```yaml
auth:
  brokerAuth:
    mechanism: PLAIN
    username: kawa
    password: ${KAFKA_PASSWORD}
```

kawa authenticates to the broker before it forwards any client request. The cluster's ACLs apply to this identity.

## The config topic

`configTopic` names the Kafka topic that holds the dynamic configuration. It defaults to `__kawa`. An empty config topic on first boot is valid: the gateway starts with no virtual topics, default-deny RBAC, no client credentials and no governance rules.

Each message in the topic is a complete JSON snapshot of the dynamic configuration. The snapshot contains `virtualTopics`, `auth` (the mechanisms and clients), `rbac`, `governance`, `adminUsers` and `modules`. It never contains the startup-only settings or any secret from the file, such as store passwords and the broker password. The last snapshot wins.

The topic should have a single partition and `cleanup.policy=compact`. Several gateway replicas can share one config topic. Each write is a Kafka transaction under a shared transactional id, and a write that loses a race is retried on the newer snapshot, so concurrent writes on different replicas do not overwrite each other. This needs brokers with transaction support. A single-broker development cluster needs `transaction.state.log.replication.factor=1` and `transaction.state.log.min.isr=1`.

## Modules

Modules are capabilities that you switch on and off at runtime through `PUT /modules/{id}`. The three modules are `virtual-topics`, `rbac` and `governance`. All three are enabled by default. A disabled module's behavior is not applied to requests. Switching off `rbac` makes kawa fail open, so read [Access control](/docs/modules/rbac#switching-rbac-off) before you do it.

## Where to next

Use [Virtual topics](/docs/modules/virtual-topics), [Authentication](/docs/modules/authentication), [Access control](/docs/modules/rbac) and [Governance](/docs/modules/governance) for the dynamic configuration of each feature. The [admin API reference](/docs/reference/admin-api) lists every endpoint that writes the config topic.
