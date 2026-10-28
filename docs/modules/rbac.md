---
title: Access control
sidebar_position: 4
---

# Access control

**Access control is Kafka ACLs per client, enforced at the gateway.** Every client authenticates to kawa with its own identity; kawa checks each request against that client's ACLs and refuses it with the standard Kafka authorization error before it reaches a broker. The cluster only sees kawa's single service identity, so there are no per-client principals, ACLs or SASL users to manage on the brokers.

ACLs are grouped into roles, and roles are given to groups of clients:

![The client alice is in the group producers, which has the role orders-producer granting WRITE on topic orders; the client bob is in the group admins, which has the role admin granting CREATE and DELETE on the cluster; everything else is denied](../img/access-control.svg)

- **Default deny**: a request is allowed only when an ACL grants it. A gateway without roles denies everything.
- **DENY wins** over any matching ALLOW.
- **Names as the client uses them**: ACLs apply to virtual topic names, so a team can read `orders.eu` without access to the topic behind it. See [Virtual topics](/docs/modules/virtual-topics).
- **Invisible when denied**: topics a client may not describe do not appear in its metadata.
- **Per topic**: a produce or fetch that spans topics keeps the allowed ones; only the denied topics fail.

## ACLs

| Field                  | Values                                                                                              |
|------------------------|-----------------------------------------------------------------------------------------------------|
| `resource.type`        | `TOPIC`, `GROUP`, `TRANSACTIONAL_ID` or `CLUSTER`.                                                 |
| `resource.pattern`     | The name. Not used for `CLUSTER`.                                                                   |
| `resource.patternType` | `LITERAL` (default) or `PREFIXED`. `PREFIXED` with an empty pattern matches every name of the type. |
| `operation`            | `READ`, `WRITE`, `CREATE`, `DELETE`, `ALTER`, `DESCRIBE`, `ALTER_CONFIGS`, `DESCRIBE_CONFIGS` or `ALL`. |
| `permission`           | `ALLOW` or `DENY`.                                                                                  |

Operations mean what they mean in Kafka: producing needs `WRITE` on the topic, consuming needs `READ` on the topic and the group, creating topics needs `CREATE` on the cluster.

## Managing

Create roles and groups in Studio, which also shows each client's effective access, or declare them as operator resources. Changes apply live. Roles and groups owned by the operator can only be changed through their resources. Clients themselves are described in [Authentication](/docs/modules/authentication).

### `Role` operator resource

Requires the [Kubernetes operator](/docs/operator). The gateway role is named after `metadata.name`.

```yaml title="Role orders-producer"
apiVersion: kawa.kawa-platform.github.io/v1alpha1
kind: Role
metadata:
  name: orders-producer
  namespace: team-orders
spec:
  acls:
    - resource: { type: TOPIC, pattern: orders, patternType: PREFIXED }
      operation: WRITE
      permission: ALLOW
    - resource: { type: TOPIC, pattern: orders.internal, patternType: PREFIXED }
      operation: ALL
      permission: DENY
```

| Field            | Description                                                                 |
|------------------|-----------------------------------------------------------------------------|
| `acls`           | Required, at least one. As [above](#acls); `permission` is required.        |
| `deletionPolicy` | `Delete` (default) removes the role, and it from every group; `Retain` keeps it. |

### `Group` operator resource

Requires the [Kubernetes operator](/docs/operator). The gateway group is named after `metadata.name`.

```yaml title="Group producers"
apiVersion: kawa.kawa-platform.github.io/v1alpha1
kind: Group
metadata:
  name: producers
  namespace: team-orders
spec:
  clients: [alice]
  roles: [orders-producer]
```

| Field            | Description                                                                  |
|------------------|------------------------------------------------------------------------------|
| `clients`        | Client names.                                                                |
| `roles`          | Role names; the clients get their ACLs.                                      |
| `deletionPolicy` | `Delete` (default) empties and removes the group; `Retain` keeps it.         |

Ownership, adoption and status are described in [Kubernetes operator](/docs/operator#ownership).

## Switching access control off

The `rbac` module can be switched off in Studio. kawa then fails open: every request from every client is allowed, authenticated or not, and kawa logs a warning. Only do this when the network or the cluster's own ACLs control access.
