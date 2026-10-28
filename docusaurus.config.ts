import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import {kawaDark, kawaLight} from './src/prismTheme';

const config: Config = {
    title: 'kawa',
    tagline: 'Kafka Gateway',
    favicon: 'img/kawa.svg',

    url: 'https://kawa-platform.github.io',
    baseUrl: '/kawa-docs/',

    organizationName: 'kawa-platform',
    projectName: 'kawa-docs',

    onBrokenLinks: 'throw',

    // img/kawa.svg (logo and favicon) is served from the shared @kawa/design package.
    staticDirectories: ['node_modules/@kawa/design/assets'],

    i18n: {
        defaultLocale: 'en',
        locales: ['en'],
    },

    // The same fonts and icons as kawa-studio's index.html, so the docs and Studio look alike.
    headTags: [
        {tagName: 'link', attributes: {rel: 'preconnect', href: 'https://fonts.googleapis.com'}},
        {tagName: 'link', attributes: {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous'}},
        {
            tagName: 'link',
            attributes: {
                rel: 'stylesheet',
                href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap',
            },
        },
        {
            tagName: 'link',
            attributes: {
                rel: 'stylesheet',
                href: 'https://unpkg.com/@phosphor-icons/web@2.1.1/src/duotone/style.css',
            },
        },
    ],

    presets: [
        [
            'classic',
            {
                docs: {
                    sidebarPath: './sidebars.ts',
                    editUrl: 'https://github.com/kawa-platform/kawa-docs/edit/main/',
                },
                blog: false,
                theme: {
                    // the shared kawa tokens first; custom.css maps them onto Docusaurus
                    customCss: ['./node_modules/@kawa/design/tokens.css', './src/css/custom.css'],
                },
            } satisfies Preset.Options,
        ],
    ],

    themeConfig: {
        colorMode: {
            respectPrefersColorScheme: true,
        },
        navbar: {
            title: 'kawa',
            logo: {
                alt: 'kawa',
                src: 'img/kawa.svg',
            },
            items: [
                {
                    type: 'docSidebar',
                    sidebarId: 'docs',
                    position: 'left',
                    label: 'Docs',
                },
                {
                    href: 'https://github.com/kawa-platform',
                    label: 'GitHub',
                    position: 'right',
                },
            ],
        },
        footer: {
            style: 'light',
            links: [
                {
                    title: 'Source',
                    items: [
                        {label: 'kawa-gateway', href: 'https://github.com/kawa-platform/kawa-gateway'},
                        {label: 'kawa-studio', href: 'https://github.com/kawa-platform/kawa-studio'},
                        {label: 'kawa-operator', href: 'https://github.com/kawa-platform/kawa-operator'},
                        {label: 'kawa-charts', href: 'https://github.com/kawa-platform/kawa-charts'},
                    ],
                },
                {
                    title: 'More',
                    items: [
                        {label: 'GitHub organization', href: 'https://github.com/kawa-platform'},
                        {label: 'These docs', href: 'https://github.com/kawa-platform/kawa-docs'},
                    ],
                },
            ],
            copyright: `© ${new Date().getFullYear()} kawa · Kafka Gateway`,
        },
        prism: {
            theme: kawaLight,
            darkTheme: kawaDark,
            additionalLanguages: ['bash', 'java', 'json'],
        },
    } satisfies Preset.ThemeConfig,
};

export default config;
