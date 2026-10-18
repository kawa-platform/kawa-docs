---
title: Plugins
sidebar_position: 6
---

# Plugins

Plugins extend the gateway with JAR files that are loaded at startup. A plugin can add an admin authentication provider, for example one that signs admins in through an external OpenID Connect provider. kawa's own `none` and `oauth` admin authentication providers are built in the same way.

## Installing a plugin

Plugins live in a plugin directory. kawa looks for it in this order: the path given with `--plugins <dir>`, then the `KAWA_PLUGIN_DIR` environment variable, then `/opt/kawa/plugins`, which is the directory in the Docker image. The gateway loads plugins once, at startup, so a change needs a restart.

Each subdirectory of the plugin directory is one plugin, made of all the JAR files in it. A single JAR that is self-contained can also sit directly in the directory.

```text
/opt/kawa/plugins/
├── kawa-pro/              one directory = one plugin, made of all its JARs
│   ├── kawa-pro.jar
│   └── some-library.jar   the plugin's own dependencies
└── small-plugin.jar       a self-contained plugin can be a single JAR
```

In the Helm chart, mount the directory into the gateway with `gateway.extraVolumes` and `gateway.extraVolumeMounts`, targeting `/opt/kawa/plugins`.

A plugin that cannot be loaded stops the gateway at startup, and the error names the plugin.

## Isolation

Each plugin has its own classloader, so its libraries cannot clash with kawa's or with another plugin's. A plugin can use a different version of a library than kawa does, and a kawa upgrade does not break it through its dependencies. The plugin brings its own dependencies as JAR files in its directory. kawa supplies the plugin API and the logging facade, and it does not expose its own internal libraries to plugins.

Plugin logs go through kawa's logging, so they appear with the rest of the gateway's output and follow `KAWA_LOG_LEVEL`.

## Choosing a provider

Only one admin authentication provider is active at a time. `admin.auth.type` names it, and the name must match a provider that is installed. An unknown `type` stops the gateway at startup and lists the providers it found. The provider's own settings go under `admin.auth.settings` in the configuration file. See [Configuration](/docs/configuration#adminauth).
