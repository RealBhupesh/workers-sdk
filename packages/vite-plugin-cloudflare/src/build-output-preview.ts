import {
	DEFAULT_WORKER_DIRECTORY_NAME,
	readBuildOutput,
} from "@cloudflare/build-output-utils";
import type { BuildOutputWorker } from "@cloudflare/build-output-utils";
import type {
	ModuleType,
	ParsedOutputSettingsConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";

export interface Bundle {
	rootPath: string;
	mainModule: string;
	modules: Record<string, { type: ModuleType }>;
}

export interface BuildOutputPreviewWorker {
	source: "build-output";
	config: ParsedOutputWorkerConfig;
	settings: ParsedOutputSettingsConfig | undefined;
	assetsDir: string | undefined;
	bundle: Bundle | undefined;
}

/**
 * Read the Workers from the Build Output Specification for preview. The
 * `default` entry Worker is returned first, followed by auxiliary Workers.
 */
export async function readBuildOutputWorkers(
	root: string
): Promise<BuildOutputPreviewWorker[]> {
	// `settings` comes from the top-level `config.json` holding project-level
	// settings (`account_id`, `compliance_region`) shared by every Worker. It
	// also carries the `mode` the build ran in.
	const { workers, settings } = await readBuildOutput(root);
	const defaultWorker = workers[DEFAULT_WORKER_DIRECTORY_NAME];
	const auxiliaryWorkers = Object.entries(workers)
		.filter(([directoryName]) => {
			return (
				directoryName !== DEFAULT_WORKER_DIRECTORY_NAME &&
				directoryName !== "prerender"
			);
		})
		.map(([_, worker]) => worker);

	return [defaultWorker, ...auxiliaryWorkers].map((worker) =>
		toPreviewWorker(worker, settings)
	);
}

function toPreviewWorker(
	worker: BuildOutputWorker,
	settings: ParsedOutputSettingsConfig | undefined
): BuildOutputPreviewWorker {
	const { manifest } = worker.config;
	let bundle: Bundle | undefined;
	if (manifest && worker.bundleDir) {
		bundle = {
			rootPath: worker.bundleDir,
			mainModule: manifest.mainModule,
			modules: manifest.modules,
		};
	}

	return {
		source: "build-output",
		config: worker.config,
		settings,
		assetsDir: worker.assetsDir,
		bundle,
	};
}
