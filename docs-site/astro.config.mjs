// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const DEFAULT_BASE = '/bpmn-extension-synthea-module';
const SITE_BASE = (process.env.DOCS_BASE_PATH || DEFAULT_BASE).replace(/\/$/, '');
const REPO = 'https://github.com/forschungsgruppe-digital-health/bpmn-extension-synthea-module';

/**
 * Prefix root-relative links written in Markdown with the site base.
 *
 * Astro rewrites links it generates, but not the ones you write yourself, so a link such as
 * `[guide](/modeling/modeling-guide/)` would resolve to the domain root and 404 with no build
 * error. Rewriting them here keeps the content base-agnostic: the guides are written as if the
 * site were at the root.
 */
function rehypeBaseLinks() {
  return (tree) => {
    const visit = (node) => {
      if (node.type === 'element' && node.properties) {
        for (const attribute of ['href', 'src']) {
          const value = node.properties[attribute];
          if (
            typeof value === 'string' &&
            value.startsWith('/') &&
            !value.startsWith('//') &&
            value !== SITE_BASE &&
            !value.startsWith(`${SITE_BASE}/`)
          ) {
            node.properties[attribute] = SITE_BASE + value;
          }
        }
      }
      for (const child of node.children || []) visit(child);
    };
    visit(tree);
  };
}

export default defineConfig({
  // Published under the repository path on GitHub Pages. The modeler (/modeler/) and the
  // converter result (/modules/) are built separately and copied next to this site by
  // tools/build-site.mjs.
  site: 'https://forschungsgruppe-digital-health.github.io',
  base: SITE_BASE,
  trailingSlash: 'always',
  markdown: { rehypePlugins: [rehypeBaseLinks] },

  integrations: [
    starlight({
      title: 'BPMN Extension for Synthea',
      favicon: '/favicon.svg',
      description: 'Model patient pathways in BPMN and convert them into Synthea modules.',
      lastUpdated: false,
      social: [{ icon: 'github', label: 'GitHub', href: REPO }],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        { label: 'Overview', items: [{ label: 'What it is and who it is for', link: '/' }] },
        {
          label: 'Start here',
          items: [
            { label: 'Concepts', link: '/start/concepts/' },
            { label: 'Synthea and the lung cancer pathway', link: '/start/synthea/' }
          ]
        },
        {
          label: 'Modeling',
          items: [
            { label: 'Modeling guide', link: '/modeling/modeling-guide/' },
            { label: 'Which type on which element', link: '/modeling/extension-matrix/' },
            { label: 'Lint rules', link: '/modeling/lint-rules/' }
          ]
        },
        {
          label: 'Reference',
          items: [
            { label: 'Conversion rules', link: '/reference/implicit-rules/' },
            { label: 'Converter overview', link: '/reference/converter-overview/' },
            { label: 'Validator overview', link: '/reference/validator-overview/' },
            { label: 'Converter concept', link: '/reference/bpmn2gmf-concept/' }
          ]
        },
        {
          label: 'Decisions',
          collapsed: true,
          items: [
            { label: 'ADR-0001 Versioning', link: '/decisions/0001-versioning-and-release-please/' },
            { label: 'ADR-0002 Encounter as flow node', link: '/decisions/0002-encounter-as-flow-node/' },
            { label: 'ADR-0003 Encounter scope', link: '/decisions/0003-encounter-context-implicit-scoping/' }
          ]
        }
      ]
    })
  ]
});
