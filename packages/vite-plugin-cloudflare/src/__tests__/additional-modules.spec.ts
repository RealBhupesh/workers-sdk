import * as path from "node:path";
import { describe, test } from "vitest";
import { shouldTrackAdditionalModule } from "../plugins/additional-module-tracking";

const root = path.resolve("/app");
const clientHtml = path.join(root, "index.html");

describe("shouldTrackAdditionalModule", () => {
	test("tracks Worker-imported wasm, data, and text files", ({ expect }) => {
		expect(
			shouldTrackAdditionalModule(
				path.join(root, "add.wasm"),
				root,
				path.join(root, "src/index.ts")
			)
		).toBe(true);
		expect(
			shouldTrackAdditionalModule(
				path.join(root, "template.html"),
				root,
				path.join(root, "src/index.ts")
			)
		).toBe(true);
	});

	test("does not track the client HTML entry unless a Worker imported it", ({
		expect,
	}) => {
		expect(shouldTrackAdditionalModule(clientHtml, root, undefined)).toBe(
			false
		);
		expect(
			shouldTrackAdditionalModule(clientHtml, root, path.join(root, "index.html"))
		).toBe(false);
	});

	test("tracks the client HTML entry when a Worker source imported it", ({
		expect,
	}) => {
		expect(
			shouldTrackAdditionalModule(
				clientHtml,
				root,
				path.join(root, "src/index.ts")
			)
		).toBe(true);
	});
});
