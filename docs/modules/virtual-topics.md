---
title: Virtual topics
sidebar_position: 1
---

# Virtual topics

**A virtual topic is to a Kafka topic what a SQL view is to a table.** It is a topic name that exists only on the gateway, backed by a physical topic and optionally filtered. Clients produce, consume, commit offsets and join groups on it like on any topic. Nothing is copied: partitions, offsets, retention and storage are the physical topic's.

![Consumers use the virtual topics orders.eu, orders.us and orders, backed by the hidden physical topic orders-v2, next to the ordinary physical topic payments, which passes through unchanged](../img/virtual-topics.svg)

That makes the topic name an interface you control, independent of where the data lives:

- **Stable names**: clients bind to `orders`, not to `orders-v2`. Repointing a virtual topic switches producers at once, but committed offsets belong to the old physical topic: consumer groups restart on the new one from `auto.offset.reset`, so plan the cutover.
- **Filtered views without copies**: one physical topic, many consumer-specific views. No stream-processing job, no duplicate storage; filtered records never leave the gateway.
- **Per-view access**: ACLs apply to the virtual name, so a team can read `orders.eu` but not `orders-v2`.
- **Hidden physical layout**: a physical topic behind a virtual topic is left out of Metadata (unless `exposePhysicalTopic`), so clients do not depend on its name. Other physical topics stay visible and usable as before.

## Definition

| Field                 | Default  | Description                                                                         |
|-----------------------|----------|-------------------------------------------------------------------------------------|
| `name`                | required | Name clients use. Unique on the gateway.                                            |
| `topic`               | required | Physical topic. Need not exist yet.                                                 |
| `exposePhysicalTopic` | `false`  | Also list the physical topic in Metadata.                                           |
| `filter`              | none     | [Consume filter](#filters).                                                         |
| `valueFormat`         | none     | [Value format](#value-formats), so `cel` filters see decoded values.                |

A name that is both virtual and physical resolves to the virtual topic.

## Filters

Applied during Fetch. `type` selects the filter:

| Type               | Keeps a record when                                     | Fields            |
|--------------------|---------------------------------------------------------|-------------------|
| `headerEquals`     | header `header` equals `value`                          | `header`, `value` |
| `headerContains`   | header `header` contains `value`                        | `header`, `value` |
| `headerStartsWith` | header `header` starts with `value`                     | `header`, `value` |
| `headerMatches`    | header `header` fully matches regex `value` (anchored)  | `header`, `value` |
| `cel`              | the [CEL](https://cel.dev) `expression` is `true`       | `expression`      |

An invalid `headerMatches` regex is rejected when the topic is written.

CEL bindings:

| Binding     | Type                     | Notes                                                                 |
|-------------|--------------------------|-----------------------------------------------------------------------|
| `key`       | string                   | `""` without a key.                                                   |
| `value`     | string or decoded value  | Raw string, or with a `valueFormat` the decoded record (`value.region`). |
| `headers`   | map(string, string)      | Test presence with `has(headers.region)`.                             |
| `timestamp` | int                      | Epoch milliseconds.                                                   |

Examples as [`VirtualTopic` operator resources](#virtualtopic-operator-resource):

```yaml title="VirtualTopic orders.us: header filter"
apiVersion: kawa.kawa-platform.github.io/v1alpha1
kind: VirtualTopic
metadata:
  name: orders.us
spec:
  physicalTopic: orders-v2
  filter:
    type: headerEquals
    header: region
    value: us
```

```yaml title="VirtualTopic orders.eu: CEL filter"
apiVersion: kawa.kawa-platform.github.io/v1alpha1
kind: VirtualTopic
metadata:
  name: orders.eu
spec:
  physicalTopic: orders-v2
  filter:
    type: cel
    expression: headers.region == "eu" && value.severity != "nominal"
```

Filtering drops records from the fetched batches without renumbering: surviving records keep their physical offsets and dropped ones leave gaps, as on a compacted topic. Commits, seeks and rebalances work unchanged. CEL expressions are compiled once, when the filter is created.

## Value formats

| Type   | Value                                                                                                     |
|--------|-----------------------------------------------------------------------------------------------------------|
| `json` | A JSON document.                                                                                          |
| `avro` | Schema registry wire format. Needs the cluster's [`schemaRegistry`](/docs/configuration#schema-registry). |

`onDecodeError`: `skip` (default) drops the record, `include` delivers it, `fail` fails the fetch.

## Managing

Create virtual topics in Studio, or declare them as `VirtualTopic` resources with the operator. Changes are checked by [governance](/docs/modules/governance) and apply live. A virtual topic owned by the operator can only be changed through its resource.

### `VirtualTopic` operator resource

Requires the [Kubernetes operator](/docs/operator).

```yaml
apiVersion: kawa.kawa-platform.github.io/v1alpha1
kind: VirtualTopic
metadata:
  name: orders-eu
  namespace: team-a
spec:
  virtualTopic: orders.eu
  physicalTopic: orders-v2
  filter:
    type: headerEquals
    header: region
    value: eu
```

| Field                 | Description                                                                         |
|-----------------------|-------------------------------------------------------------------------------------|
| `physicalTopic`       | Required. `topic` above.                                                            |
| `virtualTopic`        | `name` above. Defaults to `metadata.name`; set it for names Kubernetes rejects. Immutable. |
| `exposePhysicalTopic`, `filter`, `valueFormat` | As above.                                                  |
| `deletionPolicy`      | `Delete` (default) removes the virtual topic on deletion, `Retain` keeps it.        |

Ownership, adoption and status are described in [Kubernetes operator](/docs/operator#ownership).
