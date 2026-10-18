---
title: Authentication
sidebar_position: 3
---

# Authentication

kawa has three identities to think about, and they are independent of one another. Clients authenticate to the gateway to use Kafka. Admins authenticate to the gateway's admin API to change its configuration. kawa itself authenticates to the cluster as one service identity. Adding a client never requires creating a principal on the cluster, and an admin login has nothing to do with Kafka credentials.

## Client authentication

Clients authenticate with the standard Kafka SASL handshake, so any Kafka client works without modification. The listener must use `SASL_PLAINTEXT` or `SASL_SSL`, which are the defaults. On such a listener, a client must log in before anything else. Credentials are managed through the admin API or Studio, and they apply live.

Add a client with `PUT /auth/clients/{name}`. The body carries the mechanism and the password, and optionally the groups the client belongs to:

```bash
curl -sS -X PUT http://localhost:8080/auth/clients/alice \
  -H "Authorization: Bearer $KAWA_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mechanism": "SCRAM-SHA-256", "password": "a-long-passphrase", "groups": ["producers"]}'
```

The mechanisms are `PLAIN`, `SCRAM-SHA-256` and `SCRAM-SHA-512`. Each client has one mechanism. The gateway advertises every mechanism that any client uses, so adding a client with a new mechanism makes that mechanism available automatically. Passwords are stored hashed, with PBKDF2-HMAC-SHA256 for `PLAIN` and the SCRAM verifier for the SCRAM mechanisms. Responses never include a password or its hash.

`PATCH /auth/clients/{name}` changes only the fields it carries. Its `groups` field, when present, replaces the client's group memberships. `DELETE /auth/clients/{name}` removes the client and removes it from every group that lists it.

A `PLAIN` client sets `sasl.mechanism=PLAIN` and uses the `PlainLoginModule`:

```properties
security.protocol=SASL_PLAINTEXT
sasl.mechanism=PLAIN
sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="alice" password="secret";
```

A SCRAM client uses the SCRAM login module:

```properties
security.protocol=SASL_PLAINTEXT
sasl.mechanism=SCRAM-SHA-256
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username="alice" password="a-long-passphrase";
```

### Client certificates

On an `SSL` listener, a client that presents a certificate is identified by it. Its subject is mapped to a principal by `principalMappingRules`, which defaults to the certificate's CN. A certificate for `CN=alice,OU=payments` gives the principal `alice`. That name is used in RBAC groups like any SASL username, and it needs no entry in the client list, because the certificate, trusted through the listener's truststore, is the credential. The listener configuration is in [Configuration](/docs/configuration#listeners).

## Upstream authentication

kawa logs in to the cluster with `auth.brokerAuth`, which is set in the YAML file and supports `PLAIN` only. This identity is the one the cluster's own ACLs see. The gateway performs this login before it forwards any client request, so clients never see it. See [Configuration](/docs/configuration#authbrokerauth).

## Admin API authentication

The admin API is protected by the provider named in `admin.auth.type`. With `none`, the default, nobody is authenticated and every request is treated as the principal `admin`. Use `oauth` anywhere the admin port is reachable by more than one person.

With `oauth`, kawa acts as its own OAuth 2.0 authorization server. The login page belongs to Studio, not to the gateway. Studio, scripts and automation use the same authorization code flow with PKCE, and the flow has three steps and then bearer tokens.

In the first step, the client sends the user's browser to `GET /oauth/authorize` with its `client_id`, a registered `redirect_uri`, a PKCE `code_challenge` using `S256`, and a `state`. kawa validates the request and redirects to the UI's `loginUrl` with a signed login challenge that lasts five minutes.

In the second step, the login page posts the challenge with the user's email and password to `POST /oauth/login`. On success, kawa answers with a `redirect_to` value: the client's redirect URI with a single-use authorization code that is valid for 60 seconds. Failed logins return `invalid_credentials`, whether the email or the password is wrong, and take the same time either way.

In the third step, the client redeems the code with its PKCE `code_verifier` at `POST /oauth/token`. The response carries an access token, which is an ES256-signed JWT that lasts 15 minutes by default, and a refresh token. The session behind them lasts 8 hours by default. The client sends the access token as `Authorization: Bearer <token>`. Before it expires, the client exchanges the refresh token with `grant_type=refresh_token`. The refresh token rotates on each exchange, and the end of the session does not move.

The password grant is not supported. Passwords go only to the login endpoint. The client speaks the standard authorization code flow, so an external OpenID Connect provider can replace kawa's login later without changes to the UI. The `scripts/token.sh` script in the kawa-demo repository implements steps one to three in a short shell script, and it is a useful reference for automation.

These endpoints need no token: `/oauth/authorize`, `/oauth/login`, `/oauth/token`, `/.well-known/jwks.json`, `/.well-known/oauth-authorization-server` and `/docs`. Every other admin endpoint requires a valid token. A missing or invalid token gets `401` with a `WWW-Authenticate: Bearer` challenge.

### Signing key

Tokens are signed with the EC P-256 key in `admin.auth.settings.signingKey`. Generate one with:

```bash
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out kawa-admin-signing-key.pem
```

Pass it through the environment, as `signingKey: ${KAWA_ADMIN_SIGNING_KEY}`. Every replica must use the same key. Without a configured key, kawa generates one at startup and logs a warning. Tokens then stop working after a restart, and only the replica that issued them accepts them.

### Admin users

People who sign in to the admin API are admin users. They are managed through `GET` and `POST /admin/users` and `GET`, `PATCH` and `DELETE /admin/users/{id}`, or in Studio under Studio users. The email address is the username. It is stored in lower case and must be unique regardless of case. Each user has an optional display name and an `enabled` flag, and the gateway assigns the `createdAt` time. `PATCH` changes only the fields it carries, so a user can be renamed or disabled without a new password. Responses never include a password or its hash.

Deleting or disabling an admin user revokes their tokens immediately, because every request checks that the token's subject still exists and is enabled. The gateway refuses changes that would lock everyone out, with `409` and a message that gives the reason: deleting or disabling your own user, and deleting or disabling the last enabled user.

The first admin user comes from `admin.auth.bootstrapUser`. On a start where no admin user exists, the gateway creates the bootstrap user as an ordinary stored user. From then on the bootstrap user is a normal account: it can be renamed, disabled or deleted, and the password in the file is ignored. Changing the password in the file later has no effect. Change it through the API instead. A deleted bootstrap user stays deleted.

### Recovering from a lockout

If nobody can sign in, for example after a forgotten password, start the gateway once with `KAWA_ADMIN_RESET=true`. That start enables the bootstrap user, resets its password to the one in `bootstrapUser`, or creates the user if it was deleted, and logs a warning. Other admin users are left alone. Unset the variable before the next start. Without it, a start never changes existing admin users.

### Sessions

kawa keeps no session store. Refresh tokens are stateless, so signing out only discards the tokens in the client. A leaked refresh token keeps working until its session ends, unless its user is deleted or disabled, which revokes it at once. Keep `sessionTtl` as short as your users can tolerate.

## Operator client

The [Kubernetes operator](/docs/operator) authenticates to the admin API with the OAuth 2.0 client credentials grant. It uses the fixed client id `kawa-operator`, and its secret is the `operatorSecret` setting. Without `operatorSecret` the gateway issues no operator tokens:

```yaml
admin:
  auth:
    type: oauth
    settings:
      operatorSecret: ${KAWA_OPERATOR_SECRET}
```

The operator requests a token at `/oauth/token` with its id and secret, using `client_secret_basic` or `client_secret_post`:

```bash
curl -sS -u kawa-operator:$KAWA_OPERATOR_SECRET \
  -d grant_type=client_credentials \
  http://localhost:8080/oauth/token
```

The token lasts `tokenTtl`, and there is no refresh token: the operator requests a new one when the old one expires. The operator is not an admin user, so it does not appear under `/admin/users`. Everything it does is made as the principal `kawa-operator`, which is the name [governance](/docs/modules/governance) rules and the gateway's logs see. A wrong client id or secret returns `401` with `invalid_client`.
