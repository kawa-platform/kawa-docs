---
title: Governance
sidebar_position: 5
---

# Governance

**Governance enforces your naming conventions and topic standards at the gateway.** Topic names, consumer group ids and transactional ids must follow your conventions, and topics must meet your sizing and config standards, or kawa refuses the request before it reaches a broker. Rules are [CEL](https://cel.dev) expressions, judged per principal and changed live: no broker plugins, no `CreateTopicPolicy` classes, no restarts.

Rules are enforced on the Kafka protocol itself, so they hold for every client that goes through the gateway: Terraform, AdminClient, applications, Kafka Streams. Nothing to install or configure in clients, and no way around it except bypassing the gateway.

![Any Kafka client sends requests through the kawa gateway; a topic that follows the rules is created, a topic that breaks topic-domains is refused with a policy error and never reaches the broker, and a group that follows group-prefix is allowed](../img/governance.svg)

Examples:

| Rule                                         | CEL                                                                         |
|----------------------------------------------|-----------------------------------------------------------------------------|
| Topic names are `<domain>.<name>`, domain `orders`, `payments` or `shipping` | `topic.name.matches('^(orders\|payments\|shipping)[.][a-z0-9-]+$')` |
| Each team creates topics in its own domain   | `topic.name.startsWith(principal.split('-')[0] + '.')`                      |
| Consumer groups start with the owning team   | `group.id.startsWith(principal + '-')`                                      |
| Transactional ids name the application       | `transaction.id.matches('^[a-z-]+-tx-[0-9]+$')`                             |
| Partition counts come from fixed tiers       | `topic.partitions in [1, 4, 6, 12]`                                         |
| Replication factor is at least 3             | `topic.replicationFactor >= 3`                                              |
| `*.state` topics are compacted               | `!topic.name.endsWith('.state') \|\| topic.configs['cleanup.policy'] == 'compact'` |
| Retention is set and at most 7 days          | `'retention.ms' in topic.configs && int(topic.configs['retention.ms']) <= 604800000` |
| Only the platform team deletes topics        | `principal.startsWith('platform-')`, on `DELETE`                            |

Rules are managed in Studio, which can also test a rule against a sample request before you save it.
