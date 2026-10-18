---
title: Governance
sidebar_position: 5
---

# Governance

Governance states rules about what may be created, changed or deleted on the cluster, and it makes kawa refuse requests that break them. A rule might require topic names to follow a convention, limit partition counts to a set of sizes, or require consumer groups to be named after their owner. kawa checks each request before it reaches the cluster and judges it as the principal that sent it.

Governance covers topic administration through the Kafka protocol and through the admin API, and it covers the use of consumer groups and transactional ids. Rules are dynamic configuration. Manage them with the admin API or in Studio's Governance page. A `governance` section in the YAML file is dropped when the file is loaded.

## What is enforced

Governance judges these requests. A refusal is returned in the way the table shows.

| Request                                                                                  | Rules that apply                                              | Refused with                                |
|------------------------------------------------------------------------------------------|---------------------------------------------------------------|---------------------------------------------|
| `CreateTopics`, and `POST /topics` with `type: physical`                                 | `TOPIC` rules on `CREATE`, for physical topics                | `POLICY_VIOLATION` per topic                |
| `AlterConfigs`, `IncrementalAlterConfigs` on topics                                      | `TOPIC` rules on `ALTER`, for physical topics                 | `POLICY_VIOLATION` per resource             |
| `CreatePartitions`                                                                       | `TOPIC` rules on `ALTER`, for physical topics                 | `POLICY_VIOLATION` per topic                |
| `POST /topics` with `type: virtual`, `PUT /topics/{name}`                                | `TOPIC` rules for virtual topics, on `CREATE` or `ALTER`      | `403` with the violations                   |
| `PATCH /topics/{name}` on a virtual topic                                                | `TOPIC` rules for virtual topics on `ALTER`, under the new name | `403` with the violations                  |
| `DeleteTopics`                                                                           | `TOPIC` rules on `DELETE`, for physical topics                | `POLICY_VIOLATION` per topic                |
| `DELETE /topics/{name}`                                                                  | `TOPIC` rules on `DELETE`, for the topic's kind               | `403` with the violations                   |
| `JoinGroup`, `ConsumerGroupHeartbeat`                                                    | `GROUP` rules                                                 | `INVALID_GROUP_ID`                          |
| `OffsetCommit`, `TxnOffsetCommit`                                                        | `GROUP` rules                                                 | `INVALID_GROUP_ID` per partition            |
| `InitProducerId` with a transactional id                                                 | `TRANSACTIONAL_ID` rules                                      | `TRANSACTIONAL_ID_AUTHORIZATION_FAILED`     |

The governance message, for example `[model > compaction > compact] model topics must be compacted`, is sent in the response's error message wherever the API has one. Group and transactional id refusals carry only the error code, so the gateway logs the full message for each refusal. For requests with per-entry results, the rest of the request goes through.

A consumer that is not allowed to use its group fails on `poll()` with `InvalidGroupIdException`. A transactional producer fails on `initTransactions()` with `TransactionalIdAuthorizationException`. A `ConsumerGroupHeartbeat` that leaves the group is never refused. Group and transactional id verdicts are cached until the governance configuration changes.

When an `ALTER` is judged, the rule sees the topic as it will be after the change. The gateway reads the topic's current partitions, replication factor and configs from the broker and applies the change on top. `AlterConfigs` replaces every config set on the topic. `IncrementalAlterConfigs` sets, deletes or appends to them. `CreatePartitions` sets the partition count. So a change to a topic that already breaks a rule is refused unless the change fixes it. A change to a topic the broker does not know is left for the broker to answer. A change is refused when the topic's current state cannot be read. The broker is only asked while some rule runs on `ALTER`.

When a `DELETE` is judged, the rule sees the topic as it is now. A `DeleteTopics` entry that names a topic only by id cannot be judged, so it is refused while a rule runs on `DELETE`. Delete by name instead.

A virtual topic is judged with `topic.name`, `topic.virtual` set to `true`, and `topic.physicalTopic`. A change through a virtual topic's name on the Kafka protocol, such as an alter or `CreatePartitions`, changes its physical topic, so it is judged as a change to that physical topic.

## Rules

A rule has a name, an error message, a selector and one or more sub-rules. The selector says which requests the rule applies to. Its `resourceType` is `TOPIC`, `GROUP` or `TRANSACTIONAL_ID`, its `scope` is `PHYSICAL`, `VIRTUAL` or `BOTH` for topics, and its `operations` list is `CREATE`, `ALTER` and `DELETE` for topics. The default operations are `[CREATE]`.

A sub-rule is either a check, which is one CEL expression that returns a boolean, or a group of checks combined with `ALL` or `ANY`. The rule's `match` field decides how its sub-rules combine. Sub-rules are evaluated left to right and stop early, as `&&` and `||` do. When a rule fails, the message reported is the most specific one on the failing path.

The example below requires topic names to have the form `domain.name`, and it requires partition counts to be one of a set of tiers. It is written as the body of `PUT /governance/rules/topic-names` and the variable it uses is written with `PUT /governance/variables/partitionTiers`.

```json
{
  "errorMessage": "Topic names must look like domain.name.",
  "selector": {"resourceType": "TOPIC", "expression": null, "scope": "PHYSICAL", "operations": ["CREATE"]},
  "match": "ALL",
  "subRules": [
    {"kind": "check", "name": "shape",
     "expression": {"type": "CEL", "value": "topic.name.matches('^[a-z]+[.][a-z0-9-]+$')"}},
    {"kind": "check", "name": "tier",
     "expression": {"type": "CEL", "value": "topic.partitions in partitionTiers"}}
  ]
}
```

```json
{"name": "partitionTiers", "type": "list<int>", "value": "[1, 4, 6, 12]", "note": "single, low, medium, high"}
```

Variables are typed constants that expressions can read. Their `type` is `string`, `int`, `double`, `bool`, `list<string>` or `list<int>`, and their `value` is a literal in JSON syntax. The names `principal`, `service`, `topic`, `group` and `transaction` are reserved. Removing or retyping a variable that a rule still reads is refused.

CEL expressions, in rules, selectors and exemptions alike, are compiled when the configuration is applied. An expression that does not compile rejects the change, so it never fails the first request.

### Exemptions

An exemption is a named case that a rule does not apply to. A rule can have its own exemptions, and they switch off that rule only. A global exemption, stored under `governance.exemptions`, switches off every rule when its expression is `true`. An exemption that fails to evaluate, or that does not return `true`, does not apply. A common use is to let a platform team's principals size topics by hand:

```json
{"name": "platform", "description": "Sized by hand.",
 "expression": {"type": "CEL", "value": "principal.startsWith('platform-')"}}
```

### Expression bindings

Expressions read these bindings. Every governance variable is also available under its own name, with its declared type.

| Binding                   | Type                    | Notes                                                                             |
|---------------------------|-------------------------|-----------------------------------------------------------------------------------|
| `principal`               | string                  | The principal making the request.                                                  |
| `service`                 | string                  | `kafka` for requests on the Kafka listener, and `kawa` for the admin API.          |
| `topic.name`              | string                  | Topic rules: the topic name.                                                       |
| `topic.virtual`           | bool                    | Topic rules: whether the topic is virtual.                                         |
| `topic.partitions`        | int                     | Physical topics: partition count. On `CREATE`, `-1` means the broker default.      |
| `topic.replicationFactor` | int                     | Physical topics: replication factor. On `CREATE`, `-1` means the broker default.  |
| `topic.configs`           | map of string to string | Physical topics: configs set on the topic, not broker defaults. Test a key with `'key' in topic.configs`. |
| `topic.physicalTopic`     | string                  | Virtual topics: the physical topic they map to.                                    |
| `group.id`                | string                  | Group rules: the consumer group id.                                                |
| `transaction.id`          | string                  | Transactional id rules: the transactional id.                                      |

Reading a key that a topic does not set fails the check, so test for presence first.

## Testing a rule before it applies

`POST /governance/dry-run` evaluates a request without creating anything, and it returns the full trace of every rule and exemption. The body names the resource type, the operation, the principal and the resource fields. It can also carry one unsaved rule, which is evaluated in place of the stored rules.

```bash
curl -sS -X POST http://localhost:8080/governance/dry-run \
  -H "Authorization: Bearer $KAWA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"resourceType": "TOPIC", "operation": "CREATE", "principal": "alice", "service": "kafka",
       "resource": {"name": "Houston", "partitions": 3, "replicationFactor": 1, "configs": {}}}'
```

Dry runs do not consult global exemptions when they are given an unsaved rule.

## Managing rules

Rules, global exemptions and variables are managed one entry at a time. `PUT /governance/rules/{name}` adds or replaces a rule, `DELETE` removes it, and `GET` reads it. The same pattern applies to `/governance/exemptions/{name}` and `/governance/variables/{name}`. The full list of endpoints is in the [admin API reference](/docs/reference/admin-api). The body's `name` is optional, but when it is present it must match the path, or the request is refused with `400`. Writes take effect live.
