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

Studio and the operator use the gateway's admin API, protected by [`admin.auth`](/docs/configuration#adminauth). The default is `type: oauth`. With `type: none`, anyone who reaches the admin port is admin.

With `oauth`, kawa is its own OAuth 2.0 server:

- **Admin users** sign in to Studio with email and password. Manage them in Studio. Disabling or deleting a user revokes their tokens at once; kawa refuses to disable or delete yourself or the last enabled user.
- **The first admin user** is created in Studio with a setup token, or from `bootstrapUser`. See [First admin user](#first-admin-user).
- **Sessions** last `sessionTtl` (8 hours) with access tokens of `tokenTtl` (15 minutes). There is no server-side session store.
- **Signing key**: set `signingKey` to an EC P-256 key shared by all replicas (`openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256`). Without it, tokens die on restart and only work on the replica that issued them. The Helm chart generates one.
- **Issuer**: tokens name [`admin.publicUrl`](/docs/configuration#admin) as their issuer, and kawa's OAuth discovery metadata names it as the authorization server. Set `publicUrl` to the URL clients reach the admin API at; with a wildcard bind address such as `0.0.0.0`, startup fails without it. Changing `publicUrl` signs everyone out.
- **Discovery**: a request without a valid token gets a `401` that points at metadata naming kawa's login server, so OAuth clients such as MCP clients find out how to log in on their own.
- **Other OAuth clients**: besides Studio, users can log in through OAuth clients registered on kawa, such as MCP clients. See [MCP server](/docs/modules/mcp#oauth-clients).

### First admin user

A gateway with `oauth` and no admin users needs a first one. Two ways:

| Way                | When                       | How                                                                                               |
|--------------------|----------------------------|---------------------------------------------------------------------------------------------------|
| Setup token        | `bootstrapUser` unset      | Open Studio, which shows **Create the first admin** instead of the sign-in, and enter the setup token, an email and a password. |
| `bootstrapUser`    | Automated installs         | Created on the first start without admin users. Afterwards an ordinary user; the configured password is ignored. |

Where the setup token comes from depends on the number of replicas:

| Replicas | Setup token                                              | In the log |
|----------|----------------------------------------------------------|------------|
| 1        | Generated at startup. New on every start.                | Yes.       |
| More     | Required: set `KAWA_SETUP_TOKEN` yourself.               | No.        |

**One replica**: read the token from the log, framed under `kawa setup: create the first admin user`:

```bash
kubectl -n kawa logs deploy/kawa-gateway | grep -A12 'kawa setup'
```

**More replicas**: each replica would otherwise generate a different token and reject the others', so set one token for all of them from a Secret. kawa never prints a token from `KAWA_SETUP_TOKEN`. Use a long random value, such as `openssl rand -base64 32`; kawa does not check its strength.

```yaml title="my-values.yaml"
gateway:
  replicaCount: 3
  extraEnv:
    - name: KAWA_SETUP_TOKEN
      valueFrom:
        secretKeyRef: { name: kawa-setup, key: token }
```

The token works until the first admin user exists. Replicas starting together accept exactly one setup; every later attempt sees the sign-in.

### Operator client

The operator authenticates as the fixed client `kawa-operator` with the client credentials grant, enabled by setting `operatorSecret`. It is not an admin user; its changes are made, logged and judged by [governance](/docs/modules/governance) as `kawa-operator`. Setup is described in [Kubernetes operator](/docs/operator#install).

### Recovering from a lockout

If nobody can sign in, set `bootstrapUser` to the email of the admin user to recover and a new password, then run `helm upgrade` once with `gateway.adminReset=true`. That start enables the user, or recreates it, with the password from `bootstrapUser`; other admin users are untouched. Unset `adminReset` on the next upgrade. This also works when the first admin user was created in Studio.
