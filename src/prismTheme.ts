import type {PrismTheme} from 'prism-react-renderer';

/// Code colours from kawa-studio (`src/pages/governance/components/CelCode.vue` on the tokens of
/// `src/assets/theme.css`): strings and variables in the brand gold, keywords and numbers in the
/// accent, functions in pink, punctuation and operators muted.
interface Palette {
    text: string;
    background: string;
    muted: string;
    faint: string;
    brand: string;
    accent: string;
    pink: string;
    error: string;
}

function theme(colors: Palette): PrismTheme {
    return {
        plain: {color: colors.text, backgroundColor: colors.background},
        styles: [
            {types: ['comment', 'prolog', 'doctype', 'cdata'], style: {color: colors.faint, fontStyle: 'italic'}},
            {types: ['punctuation', 'operator'], style: {color: colors.muted}},
            {types: ['string', 'char', 'attr-value', 'inserted', 'variable', 'url'], style: {color: colors.brand}},
            {types: ['number', 'boolean', 'constant', 'symbol'], style: {color: colors.accent}},
            {types: ['keyword', 'atrule', 'selector', 'important'], style: {color: colors.accent, fontWeight: '600'}},
            {types: ['function', 'class-name', 'builtin'], style: {color: colors.pink}},
            {types: ['property', 'attr-name', 'tag', 'key'], style: {color: colors.text}},
            {types: ['deleted'], style: {color: colors.error}},
        ],
    };
}

export const kawaDark = theme({
    text: '#dfebf5',
    background: '#07182b',
    muted: '#adc0d2',
    faint: '#7f93a6',
    brand: '#c2a54e',
    accent: '#22d3ee',
    pink: '#e18bb7',
    error: '#f87171',
});

export const kawaLight = theme({
    text: '#020617',
    background: '#ffffff',
    muted: '#475569',
    faint: '#64748b',
    brand: '#a06e00',
    accent: '#0f6b99',
    pink: '#b0457c',
    error: '#dc2626',
});
