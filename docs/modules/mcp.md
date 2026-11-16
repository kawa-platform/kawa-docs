---
title: MCP server
sidebar_position: 6
---

# MCP server

**kawa is an MCP server, so AI agents can look at your gateway.** Claude Code and other [MCP](https://modelcontextprotocol.io) clients connect to `<publicUrl>/mcp` on the admin port, where `<publicUrl>` is [`admin.publicUrl`](/docs/configuration#admin), and call kawa's tools as the admin user who logged in. Nothing to install next to the gateway: the server is part of it.

| Tool          | Answers with                                                                                                      |
|---------------|-------------------------------------------------------------------------------------------------------------------|
| `list_topics` | The virtual topics, each with its physical topic, partitions, replication factor, filter and value format (`json`, `avro`, `xml` or `raw`), and the physical topics on the cluster with partitions and replication factor. |

## Switching it on and off

The `mcp` module is off by default, so no agent reaches kawa until it is switched on. While it is off, `/mcp` answers `404`, as if it did not exist. Switch it on and off with the MCP card on Studio's Modules page; the change applies live, without a restart.

- **Requires `admin.publicUrl`**: MCP can only be switched on while [`admin.publicUrl`](/docs/configuration#admin) is set, since it is the URL agents connect to; the bind-address default does not count. Without it, Studio shows the gateway's refusal, `set admin.publicUrl, the URL agents connect to`, and MCP stays off.
- **Connect URL**: while MCP is on, the card shows the URL to configure in an agent's MCP client, `<admin.publicUrl>/mcp`.
- **Unavailable**: MCP that is on while `admin.publicUrl` is missing, for example after a restart without it, is reported as unavailable with that reason and without a connect URL. `/mcp` keeps serving in that state.
- **Switching off**: always allowed, also while MCP is unavailable.

## Authentication

`/mcp` is protected like the rest of the admin API, by [`admin.auth`](/docs/configuration#adminauth).

- **`type: none`**: connect directly. Every call runs as `admin`.

  ```bash
  claude mcp add --transport http kawa <publicUrl>/mcp
  ```

- **`type: oauth`**: the user logs in through Studio. The client finds out how on its own: kawa's `401` on `/mcp` points at metadata that names kawa's login server, so nobody copies tokens around. The client needs an [OAuth client](#oauth-clients) registered on kawa.

![1: the MCP client calls /mcp without a token; 2: kawa answers 401 with a pointer to its metadata; 3: the client opens the browser at kawa, which sends the user to Studio's login page; 4: after login the browser returns to the client's callback with a code; 5: the client exchanges the code for a token at kawa; 6: the client calls /mcp with the token](../img/mcp.svg)

### What an MCP login can do

- **Only MCP**: tokens issued to an OAuth client with audience `mcp` work on `/mcp` and nowhere else on the admin API. An agent cannot use them to change kawa through the API Studio uses.
- **As the user**: tool calls run as the admin user who logged in. Disabling or deleting that user ends the agent's access at once.
- **Traced**: every tool call leaves one log line at `INFO` with the tool, the user, the OAuth client and the outcome, `ok`, `error` or `failed`, e.g. `MCP tool list_topics called by alice@example.com via kawa-mcp-claude: ok`. Arguments and results are never logged.

## OAuth clients

With `type: oauth`, every kind of MCP client needs an OAuth client on kawa: one per client application, not per user, e.g. `kawa-mcp-claude` for Claude Code and `kawa-mcp-ide` for an IDE. Users pass its id when they add the server. OAuth clients have no secret; logins use PKCE.

`kawa-studio`, Studio's own client, is built in and configured with [`admin.auth`](/docs/configuration#adminauth); it needs no registration and its id cannot be used for another client.

| Field          | Description                                                                                         |
|----------------|-----------------------------------------------------------------------------------------------------|
| id             | Required. The `client_id`: lower-case letters, digits and `-`, starting with a letter or digit, at most 64 characters. |
| `name`         | A label, e.g. `Claude Code`.                                                                        |
| `redirectUris` | Required, at least one. The callbacks the client may return to after login. See [Callbacks](#callbacks). |
| `audience`     | Required. `mcp`: tokens work only on `/mcp`. `admin`: tokens work on the whole admin API, `/mcp` included. Use `mcp` for MCP clients. |
| `enabled`      | Default `true`. A disabled client cannot log in, and the users already logged in through it are cut off immediately. |

Changes apply to the next request. Deleting a client, disabling it or changing its audience revokes every token issued to it; users log in again once it is usable.

### Callbacks

A callback must be an absolute `https` URL, or an `http` URL on `localhost`, `127.0.0.1` or `[::1]`, without a fragment (`#...`). A client is only sent back to a callback that matches one of its `redirectUris` exactly: scheme, host, port, path and query.

The one exception is the port of an `http` loopback callback: `*` as the entire port allows any port, with the same host, path and query. Claude Code needs this, because it listens on a random local port: register `http://localhost:*/callback`. There are no other wildcards: `*` anywhere else, or a prefix such as `https://example.com/*`, is refused.

| Registered                       | Allows                                                         |
|----------------------------------|----------------------------------------------------------------|
| `http://localhost:*/callback`    | `http://localhost:54012/callback`, not `http://127.0.0.1:54012/callback` or `http://localhost:54012/other` |
| `http://127.0.0.1:8765/cb`       | Only `http://127.0.0.1:8765/cb`                                |
| `https://agent.example.com/cb`   | Only `https://agent.example.com/cb`                            |

### Managing

Create OAuth clients in Studio, or declare them as `OAuthClient` operator resources.

### `OAuthClient` operator resource

Requires the [Kubernetes operator](/docs/operator). The client's id is `metadata.name`.

```yaml title="OAuthClient kawa-mcp-claude"
apiVersion: kawa-platform.github.io/v1alpha1
kind: OAuthClient
metadata:
  name: kawa-mcp-claude
  namespace: kawa
spec:
  name: Claude Code
  redirectUris:
    - http://localhost:*/callback
  audience: mcp
  enabled: true
```

| Field            | Description                                                                 |
|------------------|-----------------------------------------------------------------------------|
| `name`           | A label.                                                                    |
| `redirectUris`   | Required, at least one. See [Callbacks](#callbacks).                        |
| `audience`       | Required. `mcp` or `admin`, as [above](#oauth-clients).                     |
| `enabled`        | Default `true`.                                                             |
| `deletionPolicy` | `Delete` (default) removes the client and revokes its tokens; `Retain` keeps it. |

Ownership and status are described in [Kubernetes operator](/docs/operator#ownership).

## Connecting Claude Code

With the `kawa-mcp-claude` client from above:

1. Add the server, with the OAuth client's id:

   ```bash
   claude mcp add --transport http --client-id kawa-mcp-claude kawa <publicUrl>/mcp
   ```

2. In Claude Code, run `/mcp`, pick `kawa` and choose **Authenticate**.
3. Log in on Studio's login page that opens in the browser. Claude Code receives its token and lists kawa's tools.

The login lasts as long as a Studio session ([`sessionTtl`](/docs/configuration#adminauth)); after that, authenticate again.

Clients in a browser send an `Origin` header; kawa accepts their calls to `/mcp` only from origins in [`admin.cors`](/docs/configuration#cors). Desktop and command-line clients are not affected.
