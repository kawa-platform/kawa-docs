---
title: How it works
sidebar_position: 2
---

# How it works

This page describes what kawa does with a request, so that you can predict what a client sees and where each control applies. It does not require knowledge of kawa's source code.

## The path of a request

A client connects to a listener and logs in. On a SASL listener the login is the first exchange, and any other request before it closes the connection. On an `SSL` listener the client certificate identifies the client. Once the connection is authenticated, the client sends `ApiVersions`. kawa answers with the versions of the APIs it understands, so the client settles on versions that kawa can read.

The client then sends its requests. For each request kawa understands, the enabled modules run in a fixed order. Access control runs first, and it judges the request against the client's ACLs, using the topic and group names the client sent. Governance runs next, and it judges administrative requests and the use of consumer groups against the rules. Virtual topics run last, and they rewrite virtual names to physical names. A separate step always runs, whether or not any module is enabled: it rewrites the broker addresses in responses so that the client keeps talking to kawa.

The request then goes to the cluster over a connection that kawa manages, and kawa logs in to the cluster with its own identity. The response comes back through the same steps in reverse. Physical names become virtual names again, and the broker addresses point at kawa.

```text
 client                        kawa                              cluster
   |-- Produce orders.eu ------->| login checked, RBAC on orders.eu   |
   |                             | governance (admin requests only)   |
   |                             | rewrite orders.eu -> orders-v2     |
   |                             |-- Produce orders-v2 -------------->| leader broker
   |                             |<------------- response ------------|
   |<-- Produce response --------| restore orders.eu, endpoints       |
```

Requests kawa does not understand pass through unchanged. They get no virtual-topic rewriting and no access control. The [Kafka APIs reference](/docs/reference/kafka-apis) lists which APIs are covered, and this has a security consequence. The cluster's own ACLs still apply to the requests that pass through, but they apply to kawa's upstream identity, which means that kawa's own permissions decide what those requests can do. Restrict the uncovered APIs on the cluster, or keep them off the network path clients can reach.

## Connections and routing

kawa keeps a session for each client connection. It maintains a pool of connections to the cluster's brokers and keeps its view of the cluster's metadata up to date in the background. Each request is sent to the broker that leads the partition, so kawa does not forward requests between brokers. When leadership moves, the broker answers `NOT_LEADER`. The client's normal retry logic then asks kawa for fresh metadata, and it reaches the new leader through kawa.

## Modules

The three modules are virtual topics, access control and governance. Each can be switched on or off at runtime through `PUT /modules/{id}`, and all three are on by default. Switching a module off removes its behavior from the request path. Switching off access control makes kawa fail open, as described in [Access control](/docs/modules/rbac#switching-rbac-off). Endpoint rewriting is not a module, and it cannot be switched off, because without it clients would connect to the cluster directly.

## Observability

kawa counts requests, responses, bytes, connections and virtual-topic hits, and it records request latency. These figures are collected in memory. They are not exposed on any endpoint in the current release, so you cannot scrape them yet.

## Current limits

kawa serves one upstream cluster. It binds only the first listener, and it uses the first cluster entry. Upstream authentication supports `PLAIN` only. Because every broker address a client receives is rewritten to the advertised endpoint, `advertised.host` must resolve from the client's network. Configuration changes take effect live, but changes to the YAML file need a restart.
