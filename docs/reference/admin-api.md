---
title: Admin API
sidebar_position: 2
---

# Admin API

The admin API is the HTTP interface that Studio uses, and that scripts and the Kubernetes operator can use too. It is served on the admin port, which is `8080` by default, and it returns and accepts JSON. The interactive reference generated from the same definitions is served at `/docs` on the admin port.

Every endpoint except the OAuth endpoints and `/docs` requires a bearer token when `admin.auth.type` is `oauth`. Send the token as `Authorization: Bearer <token>`. How to obtain a token is described in [Authentication](/docs/modules/authentication#admin-api-authentication).

## Conventions

Write endpoints accept a `consistency` query parameter. The default, `persisted`, answers once the change is committed to the config topic. `applied` also waits until the replica that answered has applied the change, which is useful when the next request must see it at once. Any other value is refused with `400`.

Responses use these status codes. `200` is returned for a successful read or update, `201` for a creation and `204` for a deletion with no body. `400` means the body or a parameter is invalid. `401` means the token is missing or invalid, and carries a `WWW-Authenticate: Bearer` challenge. `403` means a governance rule refused the change, and the body lists the violations. `404` means the named entry does not exist. `409` means the change conflicts with the current state, for example a name that already exists or a lockout that would result.

## Topics

| Method   | Path                | Purpose                                                                                                                                  |
|----------|---------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| `GET`    | `/topics`           | Lists virtual topics and physical topics, with their partitions, replication factor, filter and value format.                            |
| `POST`   | `/topics`           | Creates a topic. The body's `type` is `physical` (creates it on the cluster) or `virtual` (adds a virtual topic configuration).          |
| `PUT`    | `/topics/{name}`    | Adds or replaces a virtual topic's configuration. Only `type: virtual` is accepted.                                                       |
| `PATCH`  | `/topics/{name}`    | Changes the fields a virtual topic's body carries. A `name` in the body renames the topic.                                                |
| `DELETE` | `/topics/{name}`    | Removes a virtual topic's configuration, or deletes a physical topic on the cluster if the name is not virtual.                           |

A virtual topic body has these fields: `type`, `name`, `topic`, and optionally `filter`, `exposePhysicalTopic` and `valueFormat`. A physical topic body has `type`, `name`, `partitions`, `replicationFactor` and `configs`.

## Access control

| Method   | Path                        | Purpose                                                                                |
|----------|-----------------------------|----------------------------------------------------------------------------------------|
| `GET`    | `/rbac/roles`               | Lists roles.                                                                           |
| `PUT`    | `/rbac/roles/{name}`        | Adds or replaces a role. The body is `{"acls": [...]}`.                                |
| `DELETE` | `/rbac/roles/{name}`        | Removes a role and detaches it from every group.                                       |
| `GET`    | `/rbac/groups`              | Lists groups.                                                                          |
| `PUT`    | `/rbac/groups/{name}`       | Adds or replaces a group. The body is `{"clients": [...], "roles": [...]}`.            |
| `PATCH`  | `/rbac/groups/{name}`       | Renames a group. Its clients and roles move with it.                                   |
| `DELETE` | `/rbac/groups/{name}`       | Removes a group. Returns `409` while the group still lists clients.                    |

## Clients

| Method   | Path                    | Purpose                                                                                                         |
|----------|-------------------------|-----------------------------------------------------------------------------------------------------------------|
| `GET`    | `/auth/clients`         | Lists clients, with their mechanisms and groups. Passwords are never returned.                                  |
| `PUT`    | `/auth/clients/{name}`  | Adds or replaces a client. The body has `mechanism`, `password` and optionally `groups`.                        |
| `PATCH`  | `/auth/clients/{name}`  | Changes only the fields the body carries. `groups`, when present, replaces the memberships.                     |
| `DELETE` | `/auth/clients/{name}`  | Removes a client and its memberships.                                                                           |

## Governance

| Method   | Path                              | Purpose                                                                                |
|----------|-----------------------------------|----------------------------------------------------------------------------------------|
| `GET`    | `/governance/rules`               | Returns the governance section: rules, global exemptions and variables.                 |
| `GET`    | `/governance/rules/{name}`        | Reads one rule.                                                                        |
| `PUT`    | `/governance/rules/{name}`        | Adds or replaces a rule. Its CEL expressions are compiled before anything is stored.   |
| `DELETE` | `/governance/rules/{name}`        | Removes a rule.                                                                        |
| `GET`    | `/governance/exemptions`          | Lists the global exemptions.                                                           |
| `GET`    | `/governance/exemptions/{name}`   | Reads one global exemption.                                                            |
| `PUT`    | `/governance/exemptions/{name}`   | Adds or replaces a global exemption.                                                   |
| `DELETE` | `/governance/exemptions/{name}`   | Removes a global exemption.                                                            |
| `GET`    | `/governance/variables`           | Lists the variables.                                                                   |
| `PUT`    | `/governance/variables/{name}`    | Adds or replaces a variable.                                                           |
| `DELETE` | `/governance/variables/{name}`    | Removes a variable. Refused while a rule reads it.                                     |
| `POST`   | `/governance/dry-run`             | Evaluates a request, or one unsaved rule, and returns the full trace.                  |

Governance details, including the bindings that expressions can read, are in [Governance](/docs/modules/governance).

## Modules

| Method | Path             | Purpose                                                                              |
|--------|------------------|--------------------------------------------------------------------------------------|
| `GET`  | `/modules`       | Lists the modules and whether each is enabled.                                       |
| `GET`  | `/modules/{id}`  | Reads one module. The ids are `virtual-topics`, `rbac` and `governance`.              |
| `PUT`  | `/modules/{id}`  | Switches a module on or off with the body `{"enabled": true}` or `{"enabled": false}`. |

Switching off `rbac` makes kawa fail open. Read [Access control](/docs/modules/rbac#switching-rbac-off) first.

## Admin users

| Method   | Path                     | Purpose                                                                                              |
|----------|--------------------------|------------------------------------------------------------------------------------------------------|
| `GET`    | `/admin/users`           | Lists admin users.                                                                                   |
| `POST`   | `/admin/users`           | Creates an admin user. Responds `201` with a `Location` header.                                       |
| `GET`    | `/admin/users/{id}`      | Reads one admin user.                                                                                |
| `PATCH`  | `/admin/users/{id}`      | Changes the email, password, display name or `enabled` flag. Omitted fields are kept.                |
| `DELETE` | `/admin/users/{id}`      | Removes an admin user and revokes its tokens at once. Returns `409` for a lockout.                   |

## OAuth and discovery

| Method | Path                                    | Purpose                                                                 | Token needed |
|--------|-----------------------------------------|-------------------------------------------------------------------------|--------------|
| `GET`  | `/oauth/authorize`                      | Starts the authorization code flow and redirects to the login page.     | no           |
| `POST` | `/oauth/login`                          | Checks a user's credentials and returns the redirect with the code.     | no           |
| `POST` | `/oauth/token`                          | Exchanges a code, a refresh token or client credentials for tokens.     | no           |
| `GET`  | `/.well-known/jwks.json`                | The public key that verifies tokens.                                    | no           |
| `GET`  | `/.well-known/oauth-authorization-server` | The OAuth server metadata, as RFC 8414 describes it.                  | no           |
| `GET`  | `/docs`                                 | The interactive API reference.                                          | no           |
