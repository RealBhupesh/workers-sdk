import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/worker-a/index.ts" with { type: "cf-worker" };
import * as auxiliaryEntrypoint from "./src/worker-b/index.ts" with { type: "cf-worker" };

export const auxiliaryWorker = defineWorker({
	name: "worker-b",
	entrypoint: auxiliaryEntrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		NAMED_ENTRYPOINT: {
			type: "worker",
			worker: "worker-b",
			exportName: "NamedEntrypoint",
		},
	},
});

export default defineWorker({
	name: "worker-a",
	entrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		NAMED_ENTRYPOINT: {
			type: "worker",
			worker: "worker-a",
			exportName: "NamedEntrypoint",
		},
		AUXILIARY_WORKER: { type: "worker", worker: "worker-b" },
	},
});
