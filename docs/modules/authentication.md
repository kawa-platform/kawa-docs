---
title: Authentication
sidebar_position: 3
---

# Authentication

**Every client gets its own Kafka identity on the gateway, while the cluster sees only one.** Clients log in to kawa with standard Kafka SASL or a client certificate; kawa applies [access control](/docs/modules/rbac) per client and talks to the brokers as a single service identity. Onboarding a client never touches the cluster: no SASL users, no principals, no broker ACLs.

![Kafka clients authenticate to the gateway's Kafka listener with SASL or a client certificate, admin users and the operator authenticate to its admin API with OAuth 2.0, and the gateway talks to the cluster as one service identity](../img/authentication.svg)

## Kafka clients

| Method                  | Listener                          | Identity                                                                 |
|-------------------------|-----------------------------------|--------------------------------------------------------------------------|
| SASL `PLAIN`            | `SASL_PLAINTEXT` (default) or `SASL_SSL` | The client's username.                                             |
| SASL `SCRAM-SHA-256` / `SCRAM-SHA-512` | as above            | The client's username.                                                   |
| Client certificate      | `SSL` with `clientAuth`           | The certificate subject's CN, or [`principalMappingRules`](/docs/configuration#listener-tls). No client entry needed: the trusted certificate is the credential. |

Clients use their usual Kafka settings, nothing kawa-specific:

```properties title="client.properties"
security.protocol=SASL_SSL
sasl.mechanism=SCRAM-SHA-512
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username="alice" password="...";
```

SASL clients are created in Studio or as `Client` operator resources and apply live. Each has one mechanism; passwords are stored hashed (PBKDF2 for `PLAIN`, SCRAM verifiers for SCRAM) and never returned. On a `SASL_*` listener nothing but the handshake is accepted before login; anonymous clients are denied by [access control](/docs/modules/rbac).

### `Client` operator resource

Requires the [Kubernetes operator](/docs/operator). The client's username is `metadata.name`; the password comes from a Secret and is written to the gateway again whenever the Secret changes.

```yaml title="Client alice"
apiVersion: kawa-platform.github.io/v1alpha1
kind: Client
metadata:
  name: alice
  namespace: team-orders
spec:
  mechanism: SCRAM-SHA-512
  passwordSecretRef:
    name: alice-kafka
    key: password
```

| Field               | Description                                                                         |
|---------------------|-------------------------------------------------------------------------------------|
| `mechanism`         | Required. `PLAIN`, `SCRAM-SHA-256` or `SCRAM-SHA-512`.                              |
| `passwordSecretRef` | Required. `name` and `key` of a Secret in the same namespace.                       |
| `deletionPolicy`    | `Delete` (default) removes the client, and it from every group; `Retain` keeps it.  |

Give the client access with a [`Group`](/docs/modules/rbac#group-operator-resource). Ownership and status are described in [Kubernetes operator](/docs/operator#ownership).

## Cluster identity

kawa logs in to the brokers with [`auth.brokerAuth`](/docs/configuration#authbrokerauth) (SASL `PLAIN`), over TLS when the cluster's `tls` is set. The cluster's own ACLs apply to this one identity, so grant it what kawa's clients need in total.

## Studio and the admin API

Studio and the operator use the gateway's admin API, protected by [`admin.auth`](/docs/configuration#adminauth). Use `type: oauth` anywhere the admin port is reachable by more than one person; with `none`, anyone who reaches the port is admin.

With `oauth`, kawa is its own OAuth 2.0 server:

- **Admin users** sign in to Studio with email and password. Manage them in Studio. Disabling or deleting a user revokes their tokens at once; kawa refuses to disable or delete yourself or the last enabled user.
- **The first admin user** is `bootstrapUser`, created on the first start without admin users. After that it is an ordinary user, and the password in the values file is ignored.
- **Sessions** last `sessionTtl` (8 hours) with access tokens of `tokenTtl` (15 minutes). There is no server-side session store.
- **Signing key**: set `signingKey` to an EC P-256 key shared by all replicas (`openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256`). Without it, tokens die on restart and only work on the replica that issued them. The Helm chart generates one.

### Operator client

The operator authenticates as the fixed client `kawa-operator` with the client credentials grant, enabled by setting `operatorSecret`. It is not an admin user; its changes are made, logged and judged by [governance](/docs/modules/governance) as `kawa-operator`. Setup is described in [Kubernetes operator](/docs/operator#install).

### Recovering from a lockout

If nobody can sign in, run `helm upgrade` once with `--reuse-values --set gateway.adminReset=true`. That start enables the bootstrap user, or recreates it, with the password from `bootstrapUser`; other admin users are untouched. Unset it on the next upgrade.
