---
title: MCP server
sidebar_position: 6
---

# MCP server

**kawa can also act as an [MCP](https://modelcontextprotocol.io) server, so AI agents can inspect the gateway and its cluster with live data.**

```text title="Prompt"
Why is the billing consumer group lagging, and which topics is it reading?
```

The agent calls `describe_consumer_group` for `billing`. It sees that the group reads `orders-v2`, behind the virtual topics `orders.eu` and `orders.us`, and that partition 3 lags by 48,000 records while the others are within a few hundred. It answers with the lagging partition, the member that holds it and the topics involved, from live gateway data instead of pasted config.

Agents only read. No tool or resource creates, changes or deletes anything, so an agent steered by what it reads cannot change kawa or the cluster.

## Switching it on

MCP is off by default; until it is on, `/mcp` answers `404`. Set [`admin.publicUrl`](/docs/configuration#admin), the URL agents connect to, then switch MCP on with the MCP card on Studio's Modules page. The change applies live, and the card shows the URL to connect to, `<admin.publicUrl>/mcp`.

## Connecting an agent

Agents connect to `<publicUrl>/mcp`, the URL the MCP card in Studio shows. With `admin.auth.type: none` they connect without signing in; with `oauth` the user signs in through Studio, see [Authentication](#authentication).

### Claude Code

With `type: none`, add the server and you are done:

```bash title="type: none"
claude mcp add --transport http kawa <publicUrl>/mcp
```

With `type: oauth`, register an [OAuth client](#registered-clients) for Claude Code first, e.g. `kawa-mcp-claude` with callback `http://localhost:*/callback` and audience `mcp`. Then:

1. Add the server with the OAuth client's id:

   ```bash title="type: oauth"
   claude mcp add --transport http --client-id kawa-mcp-claude kawa <publicUrl>/mcp
   ```

2. In Claude Code, run `/mcp`, pick `kawa` and choose **Authenticate**.
3. Log in on Studio's login page that opens in the browser. Claude Code receives its token and lists kawa's tools.

The login lasts as long as a Studio session ([`sessionTtl`](/docs/configuration#adminauth)); after that, authenticate again.

### GitHub Copilot in VS Code

Add the server to `.vscode/mcp.json` in the workspace, or to the user configuration with **MCP: Open User Configuration**:

```json title=".vscode/mcp.json"
{
  "servers": {
    "kawa": {
      "type": "http",
      "url": "<publicUrl>/mcp"
    }
  }
}
```

Start the server from the file or with **MCP: List Servers**. With `type: oauth`, VS Code opens Studio's login page in the browser.

Clients in a browser send an `Origin` header; kawa accepts their calls to `/mcp` only from origins in [`admin.cors`](/docs/configuration#cors). Desktop and command-line clients are not affected.

## Tools

| Tool                      | Answers with                                                                 |
|---------------------------|------------------------------------------------------------------------------|
| `list_topics`             | The virtual and physical topics with their properties. Filter by `type` (`virtual` or `physical`) and by `name` (a regular expression). |
| `describe_topic`          | One virtual or physical topic in detail, including the physical topic's configs. |
| `list_consumer_groups`    | Every group on the cluster with its state and [lag](#consumer-group-lag).   |
| `describe_consumer_group` | One group: its members and their partitions, and the lag per partition.     |
| `peek_records`            | Records of a physical topic: offsets, timestamps, keys and, on request, decoded values. See [Peeking records](#peeking-records). |

An unknown topic or group is a tool error that names it; an invalid argument is a tool error that says why.

### Consumer group lag

- **Which groups**: lag applies to `CONSUMER` groups ([KIP-848](https://cwiki.apache.org/confluence/display/KAFKA/KIP-848%3A+The+Next+Generation+of+the+Consumer+Rebalance+Protocol)) and `CLASSIC` groups of protocol type `consumer`, or of none for a group that only commits offsets. Share, streams, Connect and other groups are listed with `lagApplicable: false` and no lag fields.
- **Lag**: end offset (read committed) minus committed offset, on the physical topic. A partition without a commit is counted in `uncommittedPartitions`, not as zero lag.
- **Upper bound**: when a virtual topic on the physical topic filters, records the filter drops still count as lag, and `lagIsUpperBound` is `true`.
- **Physical, not virtual**: the tools do not say which virtual topic a group read. See [Shared physical topics](/docs/modules/virtual-topics#shared-physical-topics).

### Peeking records

```text title="Prompt"
Did shipment-events get a message mentioning John in the last hour?
```

The agent calls `peek_records` with `start_time` an hour ago and `value_contains: "John"`. kawa reads up to 50 records from that time on, decodes their values and answers with the matches and how much of the hour it covered.

`peek_records` reads with its own consumer outside any consumer group: it commits no offsets and does not affect the topic's consumers. It reads physical topics only; a virtual topic is refused with the name of its physical topic, as its filter and transformations would not apply.

| Argument         | Default | Description                                                                 |
|------------------|---------|-----------------------------------------------------------------------------|
| `topic`          |         | Required. Physical topic.                                                   |
| `partitions`     | All     | Partitions to read.                                                         |
| `limit`          | `50`    | Most records to read, 1 to 500, over all selected partitions together.      |
| `start_offset`   |         | Inclusive start offset. Only with one selected partition.                   |
| `start_offsets`  |         | Inclusive start offset per partition, e.g. `{"0": 1200, "1": 850}`. Selects those partitions when `partitions` is omitted. |
| `start_time`     |         | Start at the first record whose timestamp is at or after this ISO-8601 time. |
| `end_offset`     |         | Exclusive end offset. Only with one selected partition.                     |
| `end_offsets`    |         | Exclusive end offset per partition.                                         |
| `until`          |         | Exclusive upper bound on the record timestamp, ISO-8601.                    |
| `key_contains`   |         | Keep records whose UTF-8 key contains this text, ignoring case. Values are not decoded. |
| `value_contains` |         | Keep records whose decoded value contains this text in any field value at any depth, ignoring case. Field names are not searched. |
| `include_values` | `false` | Decode and return values.                                                   |
| `format`         | `auto`  | `auto`, `json`, `xml`, `avro`, `string` or `raw` (Base64, not decoded).     |
| `include_raw`    | `false` | Also return each value's bytes as Base64.                                   |

A start offset and `start_time` exclude each other, as do an end offset and `until`, and the single and per-partition forms of an offset.

- **Position**: without a start, the latest records, read back from the end. With a start, forward from there to the end offset, `until`, or the end of the log. Records written after the call started are not read.
- **Shared limit**: each partition gets an equal share of `limit`; a partition with fewer records hands the rest to the others, so a busy partition does not crowd out quiet ones.
- **Clamped offsets**: an offset outside the partition's log, such as one removed by retention, is moved to the nearest one that exists and reported in the partition's `notes`. The result keeps both the requested and the inspected offsets.
- **Timestamps**: time arguments use Kafka record timestamps (`CreateTime` or `LogAppendTime`), not when an application received a record. With `CreateTime` they can be out of order; records outside the time range are counted in `outsideTimeRange` and not returned.
- **Counting**: each partition's `offsetsInRange` counts the offsets in the range without reading records. Compaction, transaction markers and retention leave gaps, so it is an upper bound on the records.
- **Formats**: `auto` decides per record: Avro in the Schema Registry wire format with a schema id the cluster's [`schemaRegistry`](/docs/configuration#clusters) knows, then JSON objects and arrays, XML, UTF-8 text. A value that matches none is `unidentified`. XML with a `DOCTYPE` is refused. A value that does not decode fails on its own; the other records still decode.
- **Asking for the format**: when values must be decoded and `auto` cannot identify some, the result's `formatUndetermined` tells the agent to ask the user for the format and call again with `format`. kawa does not ask the user itself: its MCP server is stateless and has no elicitation.
- **Size**: values longer than 4,000 characters and keys longer than 512 are shortened, and values stop after 200,000 characters per result. Shortened fields are flagged; records are never left out.

Results are bounded. `exhaustive` is `true` only when every offset of the requested range was read in every selected partition; `limitReached`, `timedOut` and each partition's `error` say why not. A search reports `matches` and `unsearchable`: records whose key is binary or whose value does not decode count as unsearchable, not as non-matches. A search that is not exhaustive found no match only among the records read, not in the whole range.

## Resources

The broker's topics and groups are also MCP resources, for clients that let users attach data by URI:

| URI                                 | Holds                                                                      |
|-------------------------------------|----------------------------------------------------------------------------|
| `kafka://topics`                    | The physical topics, with partitions and replication factor.               |
| `kafka://topics/{topicName}`        | One physical topic, with partitions, replication factor and settings. Topic names complete. |
| `kafka://consumer-groups`           | As `list_consumer_groups`.                                                 |
| `kafka://consumer-groups/{groupId}` | As `describe_consumer_group`.                                              |

Resources show the broker as it is: virtual topics are not listed, and a virtual topic's name does not resolve. Use the tools for virtual topics.

## Authentication

`/mcp` is protected like the rest of the admin API, by [`admin.auth`](/docs/configuration#adminauth).

- **`type: none`**: agents connect without signing in. Every call runs as `admin`.

- **`type: oauth`**: the user logs in through Studio. The client finds out how on its own: kawa's `401` on `/mcp` points at metadata that names kawa's login server, so nobody copies tokens around. The client signs in as a [registered client](#registered-clients) or with a [client ID metadata document](#client-id-metadata-documents).

![1: the MCP client calls /mcp without a token; 2: kawa answers 401 with a pointer to its metadata; 3: the client opens the browser at kawa, which sends the user to Studio's login page; 4: after login the browser returns to the client's callback with a code; 5: the client exchanges the code for a token at kawa; 6: the client calls /mcp with the token](../img/mcp.svg)

## OAuth clients

With `type: oauth`, an MCP client signs in under a `client_id` that kawa must accept. There are two ways, usable side by side:

- **[Registered clients](#registered-clients)**, for controlled environments: an admin decides which client applications may sign in.
- **[Client ID metadata documents](#client-id-metadata-documents)**, for open setups: any agent that supports them signs in without admin work, and the user decides on the login page, which shows the client's name and whether it is registered.

|                  | Registered clients                                              | Client ID metadata documents                                         |
|------------------|-----------------------------------------------------------------|----------------------------------------------------------------------|
| Set up           | An admin registers each client application in Studio; users pass its id when adding the server. | Nothing to register: the client names itself with the URL of a document it publishes. |
| Which clients    | Only the registered ones.                                       | Any client that publishes a document, unless limited to a list of URLs. |
| Control          | Per client: disable, delete or change the audience, which revokes its tokens at once. | All or nothing: switching the `mcp-cimd` module off revokes every such token. |
| Audience         | `mcp` or `admin`.                                               | `mcp` only.                                                          |
| Needs            | Nothing beyond kawa.                                            | A client that supports it, and outbound `https` from kawa to the document's host. |

### Registered clients

Register one client per client application, not per user, e.g. `kawa-mcp-claude` for Claude Code, in Studio. Users pass its id when they add the server, as in [Claude Code](#claude-code). Clients have no secret; logins use PKCE. Changes apply to the next request.

| Field          | Description                                                                                         |
|----------------|-----------------------------------------------------------------------------------------------------|
| id             | Required. The `client_id`: lower-case letters, digits and `-`, starting with a letter or digit, at most 64 characters. |
| `name`         | A label, e.g. `Claude Code`.                                                                        |
| `redirectUris` | Required, at least one. The callbacks the client may return to after login. See [Callbacks](#callbacks). |
| `audience`     | Required. `mcp`: tokens work only on `/mcp`. `admin`: tokens work on the whole admin API, `/mcp` included. Use `mcp` for MCP clients. |
| `enabled`      | Default `true`. A disabled client cannot log in, and the users already logged in through it are cut off immediately. |

Changes apply to the next request. Deleting a client, disabling it or changing its audience revokes every token issued to it; users log in again once it is usable.

`kawa-studio`, Studio's own client, is built in and configured with [`admin.auth`](/docs/configuration#adminauth); its id cannot be used for another client.

#### Callbacks

A callback must be an absolute `https` URL, or an `http` URL on `localhost`, `127.0.0.1` or `[::1]`, without a fragment (`#...`). A client is only sent back to a callback that matches one of its `redirectUris` exactly: scheme, host, port, path and query.

The one exception is the port of an `http` loopback callback: `*` as the entire port allows any port, with the same host, path and query. Claude Code needs this, because it listens on a random local port: register `http://localhost:*/callback`. There are no other wildcards: `*` anywhere else, or a prefix such as `https://example.com/*`, is refused.

| Registered                       | Allows                                                         |
|----------------------------------|----------------------------------------------------------------|
| `http://localhost:*/callback`    | `http://localhost:54012/callback`, not `http://127.0.0.1:54012/callback` or `http://localhost:54012/other` |
| `http://127.0.0.1:8765/cb`       | Only `http://127.0.0.1:8765/cb`                                |
| `https://agent.example.com/cb`   | Only `https://agent.example.com/cb`                            |

### Client ID metadata documents

The client's `client_id` is an `https` URL serving its OAuth metadata ([client ID metadata document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/)). kawa fetches the document and uses its name and callbacks. Users add the server without a client id.

- **Switching**: the `mcp-cimd` [module](/docs/configuration#modules), on by default, only counts while `mcp` is on. Switched off, new sign-ins stop and issued tokens are revoked from the next request.
- **Restricting**: the `oauth` setting [`clientIdMetadataDocuments`](/docs/configuration#adminauth) limits sign-in to the listed URLs. Empty, any URL is accepted.
- **Fetching**: only public `https` hosts (no loopback, private or cloud metadata addresses), no redirects, at most 5 seconds and 64 KB, cached for 5 minutes and failures for 30 seconds.
- **Valid document**: its `client_id` equals its URL, its `redirect_uris` are valid [callbacks](#callbacks) and it declares no client authentication.
