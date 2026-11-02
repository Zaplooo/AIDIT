import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	server: {watch: {ignored: ['**/projects/**', '**/worker/**']}},
	optimizeDeps: {include: ['@remotion/player', 'remotion']},
});
