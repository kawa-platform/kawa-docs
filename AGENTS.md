# kawa-docs

## Diagrams

- Every diagram is an SVG file in `docs/img/`, embedded with a Markdown image. No ASCII or text diagrams.
- Use the style of `docs/img/gateway.svg`: copy its `<style>` block (kawa-design tokens as CSS variables, dark by default, light under `prefers-color-scheme: light`), background with the two glows, `card`/`row`/`tile`/`pill` shapes, the `川` brand tile for the gateway, Geist for text and JetBrains Mono for topic names and code, `flow-v` arrows in the accent color.
- Give each SVG a `<title>` and `<desc>`, and the Markdown image alt text that says what the diagram shows.

## Content

- The admin API exists for Studio. Do not document its endpoints, requests or `curl` examples in the docs; describe what users do in Studio or with the operator instead.
- Every Kubernetes resource (`VirtualTopic`, `Client`, `Role`, `Group`) is presented as an operator resource: a heading such as "`VirtualTopic` operator resource" and a line that it requires the [Kubernetes operator](/docs/operator). YAML examples of a resource show the full resource (`apiVersion`, `kind`, `metadata`, `spec`) and a code block title naming the kind, so they are never mistaken for gateway config.
- Do not list which Kafka APIs kawa rewrites, decodes or passes through (no "What is rewritten" sections or API tables). Describe behavior as clients see it.
