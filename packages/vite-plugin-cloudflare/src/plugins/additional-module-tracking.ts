import * as path from "node:path";

/**
 * Vite reloads the client HTML entry itself. Tracking that file as a Worker
 * Text module would restart the dev server and race the page reload.
 * A Worker that actually imports the same path still needs tracking.
 */
export function shouldTrackAdditionalModule(
	filePath: string,
	root: string,
	importer: string | undefined
): boolean {
	const isClientHtmlEntry =
		path.resolve(filePath) === path.resolve(root, "index.html");
	if (!isClientHtmlEntry) {
		return true;
	}

	return importer != null && !importer.endsWith(".html");
}
