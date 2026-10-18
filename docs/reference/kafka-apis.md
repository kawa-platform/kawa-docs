---
title: Kafka APIs
sidebar_position: 1
---

# Kafka APIs

kawa reads, and where needed rewrites, requests for the APIs listed below. Every API in this table has a supported version range, which is the range of versions kawa can decode. Requests for any API that is not in the table pass through to the cluster unchanged. Those requests get no virtual-topic rewriting and no access control.

The table shows which of kawa's features apply to each API. The Virtual topics column says whether topic names are rewritten. The Access control column says which permission is checked. A value of "endpoint only" means that kawa rewrites broker addresses in the response and does no name mapping. A value of "authentication" means the API belongs to the login handshake itself.

| API                     | Key | Versions          | Virtual topics | Access control                                                  |
|-------------------------|----:|-------------------|----------------|-----------------------------------------------------------------|
| Produce                 |   0 | 0–8               | rewritten      | `TOPIC` `WRITE`, per topic                                      |
| Fetch                   |   1 | 0–11              | rewritten      | `TOPIC` `READ`, per topic                                       |
| ListOffsets             |   2 | 0–5               | rewritten      | `TOPIC` `DESCRIBE`, per topic                                   |
| Metadata                |   3 | 0–8               | rewritten      | `TOPIC` `DESCRIBE`, per topic                                   |
| OffsetCommit            |   8 | 0–7               | rewritten      | `GROUP` `READ`, and `TOPIC` `READ` per topic                    |
| OffsetFetch             |   9 | 0–5               | rewritten      | `GROUP` `DESCRIBE`, and `TOPIC` `DESCRIBE` per topic            |
| FindCoordinator         |  10 | 0–2               | endpoint only  | `GROUP` or `TRANSACTIONAL_ID` `DESCRIBE`                        |
| JoinGroup               |  11 | 0–9               | none           | `GROUP` `READ`                                                  |
| Heartbeat               |  12 | 0–4               | none           | `GROUP` `READ`                                                  |
| LeaveGroup              |  13 | 0–5               | none           | `GROUP` `READ`                                                  |
| SyncGroup               |  14 | 0–5               | none           | `GROUP` `READ`                                                  |
| DescribeGroups          |  15 | 0–6               | none           | `GROUP` `DESCRIBE`, per group                                   |
| ListGroups              |  16 | 0–5               | none           | `GROUP` `DESCRIBE`, as a response filter                        |
| SaslHandshake           |  17 | 0–1               | none           | authentication                                                  |
| ApiVersions             |  18 | 0–3               | none           | none                                                            |
| CreateTopics            |  19 | 0–7               | rewritten      | `CLUSTER` `CREATE`, and governance                              |
| DeleteTopics            |  20 | 0–6               | rewritten      | `CLUSTER` `DELETE`, and governance                              |
| DeleteRecords           |  21 | 0–2               | rewritten      | `TOPIC` `DELETE`, per topic                                     |
| InitProducerId          |  22 | bundled           | none           | `TRANSACTIONAL_ID` `WRITE`, when transactional                  |
| OffsetForLeaderEpoch    |  23 | 2–4               | rewritten      | `TOPIC` `DESCRIBE`, per topic                                   |
| AddPartitionsToTxn      |  24 | 0–3               | rewritten      | `TRANSACTIONAL_ID` `WRITE`, and `TOPIC` `WRITE` per topic       |
| AddOffsetsToTxn         |  25 | bundled           | none           | `TRANSACTIONAL_ID` `WRITE`, and `GROUP` `READ`                  |
| EndTxn                  |  26 | bundled           | none           | `TRANSACTIONAL_ID` `WRITE`                                      |
| TxnOffsetCommit         |  28 | 0–4               | rewritten      | `TRANSACTIONAL_ID` `WRITE`, `GROUP` `READ`, and `TOPIC` `READ`  |
| DescribeAcls            |  29 | 0–3               | rewritten      | `CLUSTER` `DESCRIBE`                                            |
| CreateAcls              |  30 | 0–3               | rewritten      | `CLUSTER` `ALTER`                                               |
| DeleteAcls              |  31 | 0–3               | rewritten      | `CLUSTER` `ALTER`                                               |
| DescribeConfigs         |  32 | 0–4               | rewritten      | `TOPIC` `DESCRIBE_CONFIGS`, per topic                           |
| AlterConfigs            |  33 | 0–2               | rewritten      | `TOPIC` `ALTER_CONFIGS`, per topic, and governance              |
| DescribeLogDirs         |  35 | 1–5               | rewritten      | `CLUSTER` `DESCRIBE`                                            |
| SaslAuthenticate        |  36 | 0–2               | none           | authentication                                                  |
| CreatePartitions        |  37 | 0–3               | rewritten      | `TOPIC` `ALTER`, per topic, and governance                      |
| IncrementalAlterConfigs |  44 | 0–1               | rewritten      | `TOPIC` `ALTER_CONFIGS`, per topic, and governance              |
| OffsetDelete            |  47 | 0–0               | rewritten      | `GROUP` `DELETE`, and `TOPIC` `READ` per topic                  |
| DescribeCluster         |  60 | bundled           | none           | any authenticated principal                                     |
| DescribeTransactions    |  65 | 0–0               | rewritten      | `TRANSACTIONAL_ID` `DESCRIBE`, per id                           |
| ConsumerGroupHeartbeat  |  68 | bundled           | none           | `GROUP` `READ`, and governance                                  |
| DescribeTopicPartitions |  75 | 0–0               | rewritten      | `TOPIC` `DESCRIBE`, per topic                                   |

Bundled means every stable version that the Kafka client library bundled with kawa supports.

Two APIs that are not in this table are worth naming, because they are often used for cluster administration. `ElectLeaders`, `AlterPartitionReassignments` and `DeleteGroups` are not decoded, so requests for them pass through without access control. If your clients should not have those powers, restrict them on the cluster or at the network level, and do not rely on kawa's ACLs for them.

The supported version range is what kawa can decode. It does not limit which versions a client may negotiate. Within the supported range, kawa rewrites the names it understands in both directions. The virtual-topic rewriting is described in [Virtual topics](/docs/modules/virtual-topics#what-is-rewritten), and the access control checks are described in [Access control](/docs/modules/rbac#what-is-enforced).
