import type { Config } from 'tailwindcss';

/**
 * Chart and delta colors are defined here so the report table and the chart
 * speak one color system.
 *
 * The palette is validated, not eyeballed: `viz.plan` / `viz.actual` are
 * categorical slots 1 and 2, and `viz.over` / `viz.under` are the diverging
 * poles. Both pairs clear the lightness band, chroma floor, CVD separation
 * (worst adjacent deltaE 24.7 and 23.8, target >= 8), normal-vision floor and
 * 3:1 contrast against a white card surface.
 */
const config: Config = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        viz: {
          plan: '#2a78d6', // categorical slot 1 (blue)
          actual: '#eb6834', // categorical slot 2 (orange)
          over: '#d03b3b', // diverging warm pole - spent more than planned
          under: '#2a78d6', // diverging cool pole - spent less than planned
          grid: '#e1e0d9',
          axis: '#c3c2b7',
          muted: '#898781',
        },
        ink: {
          good: '#006300', // under plan
          bad: '#d03b3b', // over plan
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
