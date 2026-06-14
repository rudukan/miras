import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
			},
			colors: {
				term: {
					bg: '#070a13',
					panel: '#0e1322',
					panelLight: '#141c30',
					border: '#1f2d4d',
					borderGlow: '#00ff66',
					green: '#00ff66',
					red: '#ff3366',
					amber: '#f59e0b',
					blue: '#00e1ff',
					violet: '#a855f7',
					text: '#a3b8cc'
				}
			},
			animation: {
				'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
				flicker: 'flicker 0.15s infinite'
			},
			keyframes: {
				flicker: {
					'0%': { opacity: '0.98' },
					'50%': { opacity: '1' },
					'100%': { opacity: '0.99' }
				}
			}
		}
	},
	plugins: []
} satisfies Config;
