---
title: Virtual topics
sidebar_position: 1
---

# Virtual topics

A virtual topic is a name that clients use for a topic on the cluster. Clients produce to it and consume from it under that name, while the records are stored in a real topic on the cluster, called the physical topic. A virtual topic has three parts: the name clients use, the physical topic it maps to, and an optional filter that decides which records a consumer receives.

A virtual topic is a mapping, not a copy. Nothing is stored under the virtual name, and no data is duplicated. Writes through the virtual name land in the physical topic, so partitions, retention and storage all belong to the physical topic. Reads through the virtual name come from the physical topic too, after the filter has been applied.

## What it is for

The first use is changing the name without changing the clients. A team's applications produce to `orders.eu`. Later the data moves to `orders-v2`, perhaps after a migration or a change of partition count. You change where `orders.eu` points, and the applications keep their configuration. Because the mapping is in the gateway, the change is made in one place rather than in every client.

The second use is several views of one topic. Any number of virtual topics can map to the same physical topic, and each can have its own filter. The kawa-demo shows this with a spacecraft's telemetry. Every reading goes to the physical topic `telemetry.raw`, and the virtual topic `telemetry.alerts` shows only the readings whose severity is warning or critical. The systems engineer reads `telemetry.alerts` and never sees the nominal readings. Nothing is copied to make that view, and the filter runs on the gateway, so the records a consumer should not see never leave the gateway.

The third use is access per view. Access control checks the name a client uses, so a team can be granted a virtual topic and denied the physical topic underneath it. In the demo, the navigator may read `navigation.artemis` and nothing else, so it sees the state vectors it needs and none of the others. Views and access rules are configured together, and neither needs a separate topic.

The fourth use is hiding the physical layout. Metadata lists virtual topics and leaves the physical topics out, so clients see the names you chose and not the names the platform uses. Set `exposePhysicalTopic` if you want the physical topic listed alongside its virtual name.

The fifth use is filtering by content. With a value format set, a `cel` filter can read fields inside JSON or Avro records. In the demo, `navigation.artemis` keeps only the Avro state vectors for one spacecraft, which requires the gateway to decode each value with the schema registry before it applies the filter.

## How names are rewritten

kawa rewrites the topic name in both directions, in every request and response that carries one. A producer that sends to `orders.eu` is forwarded to `orders-v2`. A consumer that fetches from `orders.eu` receives records as if they came from that topic. Requests and responses that name a topic, such as offset commits, ACL operations, configs and transactions, are rewritten the same way.

## Creating and changing a virtual topic

`POST /topics` with `"type": "virtual"` creates one. The body names the virtual topic and the physical topic behind it. The call returns `201` with the stored definition. Governance applies to the change, as described in [Governance](/docs/modules/governance), and a refusal returns `403` with the violations.

```bash
curl -sS -X POST http://localhost:8080/topics \
  -H "Authorization: Bearer $KAWA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"type": "virtual", "name": "orders.eu", "topic": "orders-v2",
       "filter": {"type": "headerEquals", "header": "region", "value": "eu"},
       "valueFormat": {"type": "json", "onDecodeError": "skip"}}'
```

`PUT /topics/{name}` adds or replaces the virtual topic's configuration and returns `200`. `PATCH /topics/{name}` changes only the fields it carries, and a `name` in the body renames the topic. `DELETE /topics/{name}` removes a virtual topic's configuration. It does not touch the physical topic, and it returns `204`. A name that is both a virtual and a physical topic resolves to the virtual one, so deleting it never deletes the data on the cluster.

## Fields

| Field                 | Type   | Default      | Description                                                                                                    |
|-----------------------|--------|--------------|----------------------------------------------------------------------------------------------------------------|
| `name`                | string | required     | The name clients use. Virtual topic names are unique on the gateway.                                           |
| `topic`               | string | required     | The physical topic on the cluster. It may not exist yet. Virtual topics are listed even when it does not.      |
| `exposePhysicalTopic` | bool   | `false`      | When `true`, the physical topic stays visible in Metadata responses next to the virtual name.                 |
| `filter`              | object | none         | An optional consume filter. See below.                                                                         |
| `valueFormat`         | object | none         | How record values are encoded, so that a `cel` filter can read fields of the decoded value. See below.         |

By default, the physical topic is hidden from Metadata, so a client that lists topics sees only `orders.eu`.

## Consume filters

A filter decides which records a consumer receives. The gateway applies it during Fetch, so records that do not match never leave the gateway. The `type` field selects the kind of filter.

| Type               | Keeps a record when                                                                  | Fields                |
|--------------------|--------------------------------------------------------------------------------------|-----------------------|
| `headerEquals`     | the record header `header` equals `value`                                             | `header`, `value`     |
| `headerContains`   | the record header `header` contains `value` as a substring                            | `header`, `value`     |
| `headerStartsWith` | the record header `header` starts with `value`                                        | `header`, `value`     |
| `headerMatches`    | the record header `header` fully matches the regular expression `value`               | `header`, `value`     |
| `cel`              | a CEL expression evaluates to `true` for the record                                   | `expression`          |

```yaml
filter:
  type: headerEquals
  header: region
  value: eu
```

The `headerMatches` regular expression is anchored, the way Java's `String.matches` anchors it, and an invalid pattern is rejected when the configuration is applied, not at the first Fetch.

The `cel` filter evaluates a [CEL](https://cel.dev) expression against each record. The expression can read these bindings.

| Binding     | Type                    | Notes                                                                   |
|-------------|-------------------------|-------------------------------------------------------------------------|
| `key`       | string                  | `""` when the record has no key.                                        |
| `value`     | string, or the decoded document | `""` when the record has no value. With a `valueFormat`, the decoded document, so `value.region` works. |
| `headers`   | map of string to string | A missing header resolves to `""`. Use `has(headers.region)` to test presence. |
| `timestamp` | int                     | The record timestamp in milliseconds.                                   |

```yaml
filter:
  type: cel
  expression: headers.region == "eu" && value.contains("error")
```

CEL is not Turing-complete and evaluates in linear time, so it is safe on a busy topic. Expressions are compiled once and cached, and only the evaluation runs per record.

Filtering uses Kafka's own batch filtering, so it is cheap and keeps record framing intact. Offsets are not renumbered. The offsets of the records that survive are the ones they had on the physical topic, and the dropped records leave gaps in the sequence. Consumers therefore see the same offsets they would see on a compacted stream, and offset commits and rebalances work normally. Each virtual topic filters independently. Producers can write everything to `orders-v2`, and each view sees only what its filter keeps.

## Value formats

A `valueFormat` tells the gateway how record values are encoded. It is needed only when a `cel` filter should read fields of the value. Without a format, `value` is the raw string.

| Type   | Meaning                                                                                                                         |
|--------|---------------------------------------------------------------------------------------------------------------------------------|
| `json` | The value is a JSON document. Its fields are reachable as `value.field`.                                                        |
| `avro` | The value uses the schema registry wire format. The schema is looked up in the cluster's `schemaRegistry`, which must be configured. |

`onDecodeError` decides what happens to a record that cannot be decoded. `skip` drops it, which is the default. `include` delivers it as though it matched. `fail` fails the fetch.

```yaml
valueFormat:
  type: avro
  onDecodeError: skip
```

Avro values are decoded for filtering. Registry settings are described in [Configuration](/docs/configuration#schema-registry).

## What is rewritten

The gateway rewrites topic names in these APIs: Produce, Fetch, ListOffsets, Metadata, OffsetCommit, OffsetFetch, OffsetDelete, DeleteRecords, OffsetForLeaderEpoch, AddPartitionsToTxn, TxnOffsetCommit, DescribeTransactions, CreateTopics, DeleteTopics, CreatePartitions, DescribeTopicPartitions, DescribeConfigs, AlterConfigs, IncrementalAlterConfigs, CreateAcls, DescribeAcls, DeleteAcls and DescribeLogDirs. Fetch sessions are tracked so that incremental fetches stay consistent after a rewrite. Requests for other APIs pass through untouched. The [Kafka APIs reference](/docs/reference/kafka-apis) lists every API with its coverage.

Access control sees the names clients use, so ACLs are written against virtual names. See [Access control](/docs/modules/rbac).

## Operating virtual topics

A physical topic does not have to exist before the virtual topic that refers to it, and the gateway lists a virtual topic even while its physical topic is missing. A virtual topic name cannot be reused for a second virtual topic. Renaming a virtual topic is a change of the name that clients use, so clients see a different topic afterwards, as with any rename.

Studio's Topics page shows both kinds of topic, with their filters and value formats. The admin API's `GET /topics` returns the same information as JSON, including each topic's filter in a readable form.
