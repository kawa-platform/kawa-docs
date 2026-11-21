---
title: Transformations
sidebar_position: 1
---

# Transformations

**A transformation is to a virtual topic what a `SELECT` list is to a SQL view.** It reshapes each record value a consumer fetches from a [virtual topic](/docs/modules/virtual-topics): it drops, renames and defaults fields, computes a new value with CEL, and can deliver the result in another format than the one stored. Nothing is copied or written back. The physical topic keeps the original records, and each virtual topic on it can show them differently.

Transformations apply on fetch only, and only to the record value. Keys and headers are never changed, tombstones pass through, and produced records reach the broker as sent.

![A consumer fetches orders.virtual. kawa runs the consume filter on the stored Avro records of orders.raw, applies the transformation steps in order, and encodes the result as JSON before the records reach the consumer](../../img/transformations.svg)

For each fetched record, kawa:

1. **Filters**: the [consume filter](/docs/modules/virtual-topics#filters) runs on the stored value. Dropped records are not transformed.
2. **Decodes** the value with the topic's `valueFormat`.
3. **Maps**: the steps run in order, each on the previous step's result.
4. **Encodes** the result in the output format: the format of a trailing `convert` step, else the `valueFormat`.

## Example

`orders.raw` holds Avro orders. `orders.virtual` exposes them as JSON, without `internal_risk_score` and with `order_id` renamed to `id`, as a [`VirtualTopic` operator resource](#virtualtopic-operator-resource):

```yaml title="VirtualTopic orders.virtual"
apiVersion: kawa-platform.github.io/v1alpha1
kind: VirtualTopic
metadata:
  name: orders.virtual
spec:
  physicalTopic: orders.raw
  valueFormat:
    type: avro
  transformations:
    - type: dropFields
      fields: [internal_risk_score]
    - type: renameField
      from: order_id
      to: id
    - type: convert
      format:
        type: json
```

A stored record and what the consumer of `orders.virtual` receives:

```json title="Stored in orders.raw (decoded)"
{"order_id": "o-7", "status": "PAID", "total": 12.5, "internal_risk_score": 0.82}
```

```json title="Fetched from orders.virtual"
{"id": "o-7", "status": "PAID", "total": 12.5}
```

The cluster needs a [`schemaRegistry`](/docs/configuration#schema-registry) to decode the Avro values.

## Steps

`type` selects the step. Fields are addressed by dotted paths (`customer.name`); a field whose name contains a dot cannot be addressed. A list on a path applies the step to every element: `lines.sku` means the `sku` of every line.

| Type           | Fields                | Effect                                                                 |
|----------------|-----------------------|------------------------------------------------------------------------|
| `dropFields`   | `fields`              | Removes the fields. A path the value does not have is ignored.         |
| `renameField`  | `from`, `to`          | Moves a field, keeping its value. An absent `from` is ignored.         |
| `defaultField` | `field`, `value`      | Sets the field when it is absent or `null`.                            |
| `cel`          | `expression`          | Replaces the value with the expression's result.                       |
| `convert`      | `format`              | Encodes the result in `format`. Only allowed as the last step.         |

### dropFields

| Field    | Default  | Description                               |
|----------|----------|-------------------------------------------|
| `fields` | required | Dotted paths to remove. At least one.     |

### renameField

| Field  | Default  | Description                                   |
|--------|----------|-----------------------------------------------|
| `from` | required | Dotted path of the field.                     |
| `to`   | required | Dotted path the field is exposed under.       |

- **Levels**: moving a field to another level flattens it (`customer.name` to `customerName`) or nests it (`city` to `address.city`). Missing parent objects are created.
- **Position**: within one object the field keeps its position; moved to another object it is appended.
- **Collisions**: an existing field at `to` is replaced.
- **Lists**: a list is mapped over only on the part both paths share (`lines.sku` to `lines.code` renames in every line). Below that part, a list on either path fails the record.
- **Refused**: `from` and `to` that are equal or contain each other (`a` to `a.b`).

### defaultField

| Field   | Default  | Description                                                              |
|---------|----------|--------------------------------------------------------------------------|
| `field` | required | Dotted path of the field. Missing parent objects are created.            |
| `value` | `null`   | Any JSON value: string, number, boolean, `null`, object or list.         |

A scalar where the path needs an object fails the record.

### cel

| Field        | Default  | Description                                       |
|--------------|----------|---------------------------------------------------|
| `expression` | required | [CEL](https://cel.dev) expression. Its result replaces the value. |

For mappings the other steps cannot express, such as picking fields or building lists:

```text title="cel expression"
{"id": value.order_id, "total": value.total, "skus": value.lines.map(l, l.sku)}
```

The bindings are those of [CEL filters](/docs/modules/virtual-topics#filters): `key`, `value` (the result of the previous step), `headers` and `timestamp`. In JSON and XML values, a missing field reads as `null`. Maps in the result need string keys. Convert `uint`, `timestamp` and `duration` values in the expression, for example with `string()`. The expression is compiled when the topic is written; an expression that does not compile is refused.

### convert

| Field    | Default  | Description                                     |
|----------|----------|-------------------------------------------------|
| `format` | required | Output [format](#formats).                      |

Without `convert`, values are encoded back in the `valueFormat`.

## Formats

`valueFormat` decodes the stored value; the output format encodes the result. Both take a `type` and these options:

| Field           | Formats | Default  | Description                                                                                  |
|-----------------|---------|----------|----------------------------------------------------------------------------------------------|
| `onDecodeError` | all     | `skip`   | On the `valueFormat`: what happens to a record that cannot be transformed. See [Errors](#errors). Ignored on a `convert` format. |
| `subject`       | `avro`  | none     | Schema registry subject to encode with. Required when Avro is the output format.             |
| `version`       | `avro`  | latest   | Subject version to encode with. Requires `subject`. 1 or higher.                             |
| `root`          | `xml`   | none     | Root element name. Required when XML is the output format. When set, decoding refuses another root. |

- **`json`**: integers that fit a 64-bit long stay integers; other numbers become doubles, so an integer beyond the long range comes back as `1.2345678901234567E19`. Whitespace and number spelling are normalized (`1e2` becomes `100.0`). An explicit `null` stays present, an absent field stays absent.
- **`avro`**: decoded with the writer schema named in each record, encoded with the schema registered under `subject`. The value is resolved against that schema the way an Avro reader resolves a writer's record: fields the schema lacks are ignored, fields the value lacks take the schema default, and a missing field without a default or a value of the wrong type fails the record. Decimals pass through doubles, so digits beyond double precision are lost. Any Avro, decoding or encoding, needs the cluster's [`schemaRegistry`](/docs/configuration#schema-registry).
- **`xml`**: the root element's content becomes the value. Child elements become fields, attributes become `@name` fields, the text of an element with attributes becomes `#text`, and repeated elements become lists. Every scalar is a string (`<zip>007</zip>` stays `"007"`; cast in CEL with `int(value.qty)`). Namespace prefixes are kept as written. Output is UTF-8 without an XML declaration.

XML fails a record when the value tree cannot represent it:

- **On decode**: mixed content (text next to child elements), a repeated element interleaved with others (`<a/><b/><a/>`), any DOCTYPE, or another root than `root`.
- **On encode**: a key that is not a valid XML name, a non-scalar attribute or `#text`, a list inside a list, a list as the whole value, or characters XML 1.0 cannot carry.
- **Lost**: comments, processing instructions, the XML declaration and whitespace between elements. A single element reads as a value, not a one-element list, and a one-element list is written as a single element.

## Errors

A record whose value does not decode, fails a step, or cannot be encoded follows the `onDecodeError` of the `valueFormat`:

| Policy             | The consumer gets                                                              |
|--------------------|--------------------------------------------------------------------------------|
| `skip` (default)   | Nothing. The record is dropped, leaving an offset gap.                         |
| `include`          | The value as stored, untransformed, so not in the format the consumer expects. |
| `fail`             | The records before it, then `CORRUPT_MESSAGE` on its partition. See [below](#what-the-application-sees-with-fail). |

Every record is handled on its own, so one response can mix transformed and skipped records, and a topic holding values in several formats only loses the ones that do not decode. Use `fail` when such a record must stop consumption instead of being lost silently.

Every failure stalls only its own partition at the gateway. Other partitions and topics keep being delivered on every fetch, and only the stalled partition's lag grows. The partition stays assigned to the same consumer: no rebalance moves it, since the consumer keeps polling.

| Case                        | The partition answers              | A Java consumer                                                                  |
|-----------------------------|------------------------------------|----------------------------------------------------------------------------------|
| Bad record with `fail`      | `CORRUPT_MESSAGE`, no records      | Throws a `KafkaException` from `poll()` until the application seeks past the record. |
| Schema registry unreachable | `UNKNOWN_SERVER_ERROR`, no records | Logs a warning and fetches the same offset again; resumes once the registry is back. |
| Unexpected gateway error    | `UNKNOWN_SERVER_ERROR`, no records | Logs a warning and fetches the same offset again.                                |

- **Schema registry unreachable**: a connection error, timeout or `5xx`. A schema the registry does not have (`404`) or an invalid schema is a bad record. Schemas by id and by explicit subject version are cached until restart, a subject's `latest` for 5 minutes; when refreshing `latest` fails, the last cached schema is used.
- **Unexpected gateway error**: a failure while filtering or transforming that is not caused by the record.

`onDecodeError` applies to bad records only, never to the other two cases.

### What the application sees with `fail`

When it reaches the record, the consuming application gets an exception: `Encountered corrupt message when fetching offset <n> for topic-partition <tp>`. What happens next depends on whether its consuming code handles that exception:

- **Not handled** (the common case): the application stops consuming all of its partitions, not only the stalled one.
- **Handled, consuming on**: the other partitions keep flowing, and the error comes back for the stalled partition on every poll, until the application skips the record by seeking to offset `n + 1` on that partition.
- **Kafka Streams**: treats it as fatal and stops the stream thread, so all of its partitions stop.

## Offsets and delivery

Records keep their offsets, timestamps, keys and headers. Batches keep their producer and transaction metadata, compression and last offset, so consumers move past a batch whose records were all skipped. `read_committed` consumers still drop aborted records, and transaction markers pass unchanged. Commits, seeks and rebalances work as on any virtual topic.

A change to the transformations applies from the next fetch response, also within a running consumer's fetch session.

With [`exposePhysicalTopic`](/docs/modules/virtual-topics#definition), the physical topic fetched by its own name is served as stored, never transformed.

## Performance

Every record of a transformed topic is decoded, mapped and encoded on every fetch, and every consumer pays again. Measured on one core, with batches of 500 JSON records of about 180 bytes:

| Virtual topic                                  | Per record  |
|------------------------------------------------|-------------|
| No filter, no transformations                  | Records pass untouched. |
| Filter only                                    | 0.86 µs     |
| JSON to JSON: `dropFields`, `renameField`      | 1.23 µs     |
| JSON to JSON: `cel`                            | 1.45 µs     |
| JSON to XML: `dropFields`, `renameField`, `convert` | 1.87 µs |

lz4 compression adds less than 5%. A `cel` filter together with transformations decodes each value twice.

## Managing

Transformations are part of the virtual topic: set them in Studio or in the [`VirtualTopic` operator resource](#virtualtopic-operator-resource). kawa refuses a virtual topic before anything is written when:

- it has steps but no `valueFormat`;
- `convert` is not the last step;
- the output format is Avro without `subject`, or XML without `root`;
- Avro, as the `valueFormat` or a `convert` format, is used on a cluster without a `schemaRegistry`;
- a path is blank or has an empty segment (`a..b`, `.a`, `a.`);
- a `cel` expression does not compile.

An error about one step starts with `transformations[N] (type)`, N being the step's 0-based index: `transformations[2] (cel): Invalid CEL expression ...`.

### `VirtualTopic` operator resource

Requires the [Kubernetes operator](/docs/operator). `spec.transformations` takes the [steps](#steps) and `spec.valueFormat` and `convert.format` take the [formats](#formats), with the fields above:

```yaml title="VirtualTopic orders.xml"
apiVersion: kawa-platform.github.io/v1alpha1
kind: VirtualTopic
metadata:
  name: orders.xml
  namespace: team-a
spec:
  physicalTopic: orders.raw
  valueFormat:
    type: json
    onDecodeError: include
  transformations:
    - type: defaultField
      field: customer.tier
      value: standard
    - type: cel
      expression: '{"id": value.order_id, "tier": value.customer.tier, "skus": value.lines.map(l, l.sku)}'
    - type: convert
      format:
        type: xml
        root: order
```

The API server rejects a resource on admission when:

- **Step fields**: a step sets a field of another step type, or misses its own: `fields` (at least one) for `dropFields`, `from` and `to` for `renameField`, `field` for `defaultField`, `expression` for `cel`, `format` for `convert`. `value` is optional and means `null`.
- **Format fields**: `subject` or `version` on a format other than `avro`, `version` without `subject` or below 1, or `root` on a format other than `xml`.

The rules that span steps or need the cluster come back from the gateway: steps without a `valueFormat`, `convert` not last, Avro output without `subject`, XML output without `root`, and Avro on a cluster without a `schemaRegistry`. The resource then reports `Ready=False` with reason `InvalidSpec` and the gateway's message, `transformations[N] (type)` included for a step.

The operator keeps the steps in sync like the rest of the spec:

- **Drift**: steps changed elsewhere, for example in Studio, are restored at the next [resync](/docs/operator#status). An unset `onDecodeError` counts as `skip`, and `defaultField` values compare as JSON values, so formatting differences are not drift.
- **Removal**: removing `spec.transformations` clears the steps on the gateway.

## Limitations

- **Fetch only**: there is no produce direction. Mappings are one-way: a dropped or overwritten field cannot be restored.
- **Values only**: keys are never transformed.
- **Headers unchanged**: content-type and schema-id headers still describe the stored value, also after a `convert`.
