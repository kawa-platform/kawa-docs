import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/__docusaurus/debug',
    component: ComponentCreator('/__docusaurus/debug', '5ff'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/config',
    component: ComponentCreator('/__docusaurus/debug/config', '5ba'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/content',
    component: ComponentCreator('/__docusaurus/debug/content', 'a2b'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/globalData',
    component: ComponentCreator('/__docusaurus/debug/globalData', 'c3c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/metadata',
    component: ComponentCreator('/__docusaurus/debug/metadata', '156'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/registry',
    component: ComponentCreator('/__docusaurus/debug/registry', '88c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/routes',
    component: ComponentCreator('/__docusaurus/debug/routes', '000'),
    exact: true
  },
  {
    path: '/docs',
    component: ComponentCreator('/docs', '64b'),
    routes: [
      {
        path: '/docs',
        component: ComponentCreator('/docs', 'c84'),
        routes: [
          {
            path: '/docs',
            component: ComponentCreator('/docs', '3bf'),
            routes: [
              {
                path: '/docs/category/concepts',
                component: ComponentCreator('/docs/category/concepts', 'cd6'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/category/reference',
                component: ComponentCreator('/docs/category/reference', 'a72'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/concepts/architecture',
                component: ComponentCreator('/docs/concepts/architecture', '533'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/concepts/authentication',
                component: ComponentCreator('/docs/concepts/authentication', '462'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/concepts/plugins',
                component: ComponentCreator('/docs/concepts/plugins', '842'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/concepts/rbac',
                component: ComponentCreator('/docs/concepts/rbac', '050'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/concepts/virtual-topics',
                component: ComponentCreator('/docs/concepts/virtual-topics', '25f'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/configuration',
                component: ComponentCreator('/docs/configuration', '4e9'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/getting-started',
                component: ComponentCreator('/docs/getting-started', '565'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/intro',
                component: ComponentCreator('/docs/intro', '536'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/reference/kafka-apis',
                component: ComponentCreator('/docs/reference/kafka-apis', 'c66'),
                exact: true,
                sidebar: "docs"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '/',
    component: ComponentCreator('/', 'e5f'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
