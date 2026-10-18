---
title: Access control
sidebar_position: 4
---

# Access control

kawa enforces role-based access control (RBAC) on the client path. Once a client has authenticated, kawa checks each request it understands against the client's ACLs. A request that is not allowed is answered locally with the matching Kafka authorization error, and it never reaches the cluster.

The model is default-deny. A request is allowed only when at least one matching ACL grants it. A matching `DENY` always wins, even over an `ALLOW` that also matches. A gateway with no roles or groups denies every request from every client, so the first thing to do after installing kawa is to grant access on purpose.

## The model

An access control list is built from three kinds of object. An **ACL** grants or denies one operation on one resource. A **role** is a named list of ACLs. A **group** lists clients by their authenticated names and the roles those clients inherit. A client's effective permissions are the union of all the ACLs in all the roles of all the groups it belongs to.

An ACL has a `resource`, an `operation` and a `permission`. The resource has a `type`, which is `TOPIC`, `GROUP`, `TRANSACTIONAL_ID` or `CLUSTER`, a `pattern` and a `patternType`. A `LITERAL` pattern matches the name exactly, and a `PREFIXED` pattern matches any name that starts with it. `CLUSTER` matches the cluster regardless of name, so its pattern is ignored. The `permission` is `ALLOW` or `DENY`, and it defaults to `ALLOW`.

Operations are the Kafka ACL operations: `READ`, `WRITE`, `CREATE`, `DELETE`, `ALTER`, `DESCRIBE`, `ALTER_CONFIGS`, `DESCRIBE_CONFIGS` and `ALL`, which matches any operation. Which operation a request needs is listed in the table below.

Names are matched as the client sent them. Access control runs before virtual-topic mapping, so ACLs are written against virtual names such as `orders.eu`, not against the physical names on the cluster.

## Configuring RBAC through the API

Roles and groups are managed with `PUT` and `DELETE` on `/rbac/roles/{name}` and `/rbac/groups/{name}`, or in Studio's Roles and Groups pages. Studio's Clients page also shows the effective access of each client.

This role lets a producer write to the topic `orders`, and nothing else:

```bash
curl -sS -X PUT http://localhost:8080/rbac/roles/orders-producer \
  -H "Authorization: Bearer $KAWA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"acls": [
        {"resource": {"type": "TOPIC", "pattern": "orders", "patternType": "LITERAL"}, "operation": "WRITE"}]}'
```

This group gives the role to a client called `alice`:

```bash
curl -sS -X PUT http://localhost:8080/rbac/groups/producers \
  -H "Authorization: Bearer $KAWA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"clients": ["alice"], "roles": ["orders-producer"]}'
```

Deleting a group that still lists clients returns `409`, and the message names those clients. Clear the group's clients first, then delete it again. Deleting a role removes it from every group that references it. The groups and their clients stay, but the role's ACLs stop applying to them. Deleting a client removes it from every group. `PATCH /rbac/groups/{name}` renames a group, and its clients and roles move with it.

## What is enforced

kawa gates the APIs in the table below. The table is the reference for the access control behavior, and it lists every API that kawa gates. APIs that kawa does not decode are not gated, as described in [Kafka APIs](/docs/reference/kafka-apis).

| API                                                  | Resource checked                                                     | Operation                    | How a denial is answered                                                  |
|------------------------------------------------------|----------------------------------------------------------------------|------------------------------|---------------------------------------------------------------------------|
| Produce                                              | `TOPIC`, per topic                                                   | `WRITE`                      | Denied topics get `TOPIC_AUTHORIZATION_FAILED`. Their batches never reach the cluster. |
| Fetch                                                | `TOPIC`, per topic                                                   | `READ`                       | Denied topics get `TOPIC_AUTHORIZATION_FAILED`.                          |
| ListOffsets                                          | `TOPIC`, per topic                                                   | `DESCRIBE`                   | Denied topics get `TOPIC_AUTHORIZATION_FAILED`.                          |
| Metadata                                             | `TOPIC`, per topic                                                   | `DESCRIBE`                   | Denied topics look nonexistent, so a client cannot learn that they exist. |
| DescribeTopicPartitions                              | `TOPIC`, per topic                                                   | `DESCRIBE`                   | Denied topics are reported as unknown, as in Metadata.                    |
| OffsetForLeaderEpoch                                 | `TOPIC`, per topic                                                   | `DESCRIBE`                   | Denied topics get `TOPIC_AUTHORIZATION_FAILED`.                          |
| DeleteRecords                                        | `TOPIC`, per topic                                                   | `DELETE`                     | Denied topics get `TOPIC_AUTHORIZATION_FAILED`.                          |
| CreatePartitions                                     | `TOPIC`, per topic                                                   | `ALTER`                      | Denied topics get `TOPIC_AUTHORIZATION_FAILED`.                          |
| DescribeConfigs                                      | `TOPIC`, per topic, for topic resources only                         | `DESCRIBE_CONFIGS`           | Denied resources get `TOPIC_AUTHORIZATION_FAILED`. Broker resources pass. |
| AlterConfigs, IncrementalAlterConfigs                | `TOPIC`, per topic, for topic resources only                         | `ALTER_CONFIGS`              | Denied resources get `TOPIC_AUTHORIZATION_FAILED`. Broker resources pass. |
| CreateTopics                                         | `CLUSTER`                                                            | `CREATE`                     | Whole request refused with `CLUSTER_AUTHORIZATION_FAILED`.                |
| DeleteTopics                                         | `CLUSTER`                                                            | `DELETE`                     | Whole request refused with `CLUSTER_AUTHORIZATION_FAILED`.                |
| DescribeAcls                                         | `CLUSTER`                                                            | `DESCRIBE`                   | Whole request refused.                                                    |
| CreateAcls, DeleteAcls                               | `CLUSTER`                                                            | `ALTER`                      | Whole request refused.                                                    |
| DescribeLogDirs                                      | `CLUSTER`                                                            | `DESCRIBE`                   | Whole request refused.                                                    |
| DescribeCluster                                      | None. Any authenticated principal may call it, as in Kafka.          | none                         | Not applicable.                                                           |
| JoinGroup, SyncGroup, Heartbeat, LeaveGroup          | `GROUP`, the group id                                                | `READ`                       | Whole request refused with `GROUP_AUTHORIZATION_FAILED`.                  |
| ConsumerGroupHeartbeat                               | `GROUP`, the group id                                                | `READ`                       | Whole request refused.                                                    |
| OffsetCommit                                         | `GROUP` (group id) and `TOPIC`, per topic                            | `READ`                       | A denied group refuses the whole request. Denied topics are stripped.    |
| OffsetFetch                                          | `GROUP` (group id) and `TOPIC`, per topic                            | `DESCRIBE`                   | A denied group refuses the whole request. Denied topics are stripped.    |
| OffsetDelete                                         | `GROUP` (group id) with `DELETE`, and `TOPIC` with `READ`            | `DELETE` and `READ`          | A denied group refuses the whole request. Denied topics are stripped.    |
| DescribeGroups                                       | `GROUP`, per group                                                   | `DESCRIBE`                   | Denied groups get `GROUP_AUTHORIZATION_FAILED`.                           |
| ListGroups                                           | `GROUP`, as a response filter                                        | `DESCRIBE`                   | Groups the client cannot describe are left out of the response.           |
| FindCoordinator, group lookup                        | `GROUP`, the key                                                     | `DESCRIBE`                   | Refused.                                                                  |
| FindCoordinator, transaction lookup                  | `TRANSACTIONAL_ID`, the key                                          | `DESCRIBE`                   | Refused.                                                                  |
| DescribeTransactions                                 | `TRANSACTIONAL_ID`, per id                                           | `DESCRIBE`                   | Refused.                                                                  |
| InitProducerId, with a transactional id              | `TRANSACTIONAL_ID`                                                   | `WRITE`                      | `TRANSACTIONAL_ID_AUTHORIZATION_FAILED`.                                  |
| AddPartitionsToTxn                                   | `TRANSACTIONAL_ID` (id) with `WRITE`, and `TOPIC` per topic with `WRITE` | `WRITE`                  | Whole request refused, or denied topics stripped.                         |
| AddOffsetsToTxn                                      | `TRANSACTIONAL_ID` (id) with `WRITE`, and `GROUP` (group id) with `READ` | `WRITE` and `READ`       | Whole request refused.                                                    |
| EndTxn                                               | `TRANSACTIONAL_ID`                                                   | `WRITE`                      | Whole request refused.                                                    |
| TxnOffsetCommit                                      | `TRANSACTIONAL_ID` with `WRITE`, `GROUP` with `READ`, and `TOPIC` per topic with `READ` | `WRITE`, `READ`   | A denied id or group refuses the whole request. Denied topics are stripped. |

The refusal responses in the table are the ones the gateway returns. The governance rules in [Governance](/docs/modules/governance) are a separate system that can refuse some of the same requests for other reasons.

### Unauthenticated requests

A request that reaches a gated API without an authenticated principal is refused with `SASL_AUTHENTICATION_FAILED`. It is never passed through, so skipping SASL cannot bypass RBAC. On a SASL listener, such a request does not get that far: the connection is closed before RBAC sees it. On an `SSL` listener, a client that presents no certificate is anonymous and is refused the same way.

### Produce is checked per topic

A Produce batch can name several topics. Each is authorized on its own. Authorized topics are forwarded unchanged. Denied topics are removed from the request, so their records never reach the cluster, and the response reports `TOPIC_AUTHORIZATION_FAILED` for them alongside the broker's answers for the rest. If every topic in the batch is denied, the request is answered locally without being forwarded.

## Switching RBAC off

RBAC is a module that can be switched off at runtime with `PUT /modules/rbac` and the body `{"enabled": false}`. Switched off, kawa is fail-open: every Kafka request is admitted without access control, from any client, authenticated or not. kawa logs a warning while RBAC is off. Switch it off only when the network or the cluster's own ACLs control access.

## Broad access

RBAC is always enforced, so "everything is allowed" is something you configure. The usual way is a `PREFIXED` ACL with an empty pattern. Every resource name starts with the empty string, so the ACL matches all names of its type. Combined with `ALL` and a `CLUSTER` ACL, it grants everything:

```bash
curl -sS -X PUT http://localhost:8080/rbac/roles/allow-all \
  -H "Authorization: Bearer $KAWA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"acls": [
        {"resource": {"type": "TOPIC", "pattern": "", "patternType": "PREFIXED"}, "operation": "ALL"},
        {"resource": {"type": "GROUP", "pattern": "", "patternType": "PREFIXED"}, "operation": "ALL"},
        {"resource": {"type": "CLUSTER"}, "operation": "ALL"}]}'
```

This is convenient for demos and test fixtures. In production, prefer narrow, explicit ACLs per team and per topic, and use `DENY` ACLs where a broad grant needs an exception.

## Example: a producer and an admin

A producer may write to `orders` and nothing else. An admin may create and delete topics but may not produce. Any other client is denied by default.

```bash
curl -sS -X PUT http://localhost:8080/rbac/roles/admin \
  -H "Authorization: Bearer $KAWA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"acls": [
        {"resource": {"type": "CLUSTER"}, "operation": "CREATE"},
        {"resource": {"type": "CLUSTER"}, "operation": "DELETE"}]}'

curl -sS -X PUT http://localhost:8080/rbac/groups/admins \
  -H "Authorization: Bearer $KAWA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"clients": ["bob"], "roles": ["admin"]}'
```

Together with the `orders-producer` role and the `producers` group from above, that gives `alice` the producer rights and `bob` the admin rights. Note that `bob` can create topics but cannot produce to them, because his group does not grant `WRITE`.
