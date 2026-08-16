import js from "@eslint/js";

export default [
	js.configs.recommended,
	{
		files: ["**/*.js"],
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: "commonjs",
			globals: {
				// Node
				require: "readonly",
				module: "writable",
				__dirname: "readonly",
				process: "readonly",
				console: "readonly",
				setTimeout: "readonly",
				clearTimeout: "readonly",
				setInterval: "readonly",
				clearInterval: "readonly",
				fetch: "readonly",
				AbortController: "readonly",
				// MagicMirror frontend
				Module: "readonly",
				Log: "readonly",
				document: "readonly"
			}
		},
		rules: {
			indent: ["error", "tab", { SwitchCase: 1 }],
			quotes: ["error", "double"],
			semi: ["error", "always"],
			"no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
		}
	}
];
