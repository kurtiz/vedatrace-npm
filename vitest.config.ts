import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		include: ["src/**.test.ts", "npx/**.test.ts"],
		coverage: {
			enabled: true,
			include: ["src/**", "npx/**"],
			exclude: [
				...(configDefaults.coverage.exclude || []),
				"**/index.ts",
				"**/integrations/**",
				"**/transports/**",
				"**/utils/**",
			],
		},
	},
});
