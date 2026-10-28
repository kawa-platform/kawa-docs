import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import styles from './index.module.css';

interface Feature {
    icon: string;
    title: string;
    description: string;
    to: string;
}

const FEATURES: Feature[] = [
    {
        icon: 'ph-stack',
        title: 'Virtual topics',
        description: 'Give clients stable topic names while the cluster keeps its own; renamed in both directions.',
        to: '/docs/modules/virtual-topics',
    },
    {
        icon: 'ph-shield-check',
        title: 'Access control',
        description: 'Role-based ACLs on every Kafka request, enforced before anything reaches a broker.',
        to: '/docs/modules/rbac',
    },
    {
        icon: 'ph-scales',
        title: 'Governance',
        description: 'Rules for topic names, sizing and groups, judged on create, alter and delete.',
        to: '/docs/modules/governance',
    },
];

function Hero(): ReactNode {
    const {siteConfig} = useDocusaurusContext();
    return (
        <header className={styles.hero}>
            <div className={styles.brandRow}>
                <span className={styles.mark} aria-hidden="true">川</span>
                <span className={styles.wordmark}>{siteConfig.title}</span>
            </div>
            <p className={styles.kicker}>{siteConfig.tagline}</p>
            <h1 className={styles.tagline}>Kafka, amplified.</h1>
            <p className={styles.pitch}>
                kawa sits between your clients and your Kafka clusters. More than a proxy, it amplifies what your clusters can do, without changing a single client.
            </p>
            <div className={styles.actions}>
                <Link className="button button--primary" to="/docs/getting-started">
                    <i className="ph-duotone ph-rocket-launch" /> Get started
                </Link>
                <Link className="button button--secondary" to="/docs/configuration">
                    <i className="ph-duotone ph-sliders-horizontal" /> Configuration
                </Link>
            </div>
            <svg className={styles.river} viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 40 C 120 10, 220 70, 340 40 S 520 10, 600 34" />
                <path d="M0 82 C 140 52, 240 112, 360 82 S 520 52, 600 76" />
                <path d="M0 124 C 110 94, 230 154, 350 124 S 530 94, 600 118" />
            </svg>
        </header>
    );
}

function Features(): ReactNode {
    return (
        <section className={styles.features}>
            {FEATURES.map((feature) => (
                <Link key={feature.title} className={styles.card} to={feature.to}>
                    <span className={styles.cardIcon}>
                        <i className={`ph-duotone ${feature.icon}`} />
                    </span>
                    <span className={styles.cardTitle}>{feature.title}</span>
                    <span className={styles.cardText}>{feature.description}</span>
                </Link>
            ))}
        </section>
    );
}

export default function Home(): ReactNode {
    const {siteConfig} = useDocusaurusContext();
    return (
        <Layout title={siteConfig.tagline} description="kawa, a Kafka gateway: virtual topics, RBAC and governance in front of your cluster.">
            <main className={styles.page}>
                <Hero />
                <Features />
            </main>
        </Layout>
    );
}
