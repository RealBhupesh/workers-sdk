import { describe, it } from "vitest";
import { getContainerMetadata } from "../src/deploy/helpers/container-metadata";
import type { Config } from "@cloudflare/workers-utils";

describe("getContainerMetadata", () => {
	it("includes the resolved name when no Durable Object-managed images are configured", ({
		expect,
	}) => {
		const metadata = getContainerMetadata({
			containers: [
				{
					class_name: "Sandbox",
					name: "sandbox-app",
					scheduling_policy: "durable_object",
				},
			],
		} as unknown as Config);

		expect(metadata).toEqual([{ name: "sandbox-app", class_name: "Sandbox" }]);
	});

	it("includes prepared named images for Durable Object-managed containers", ({
		expect,
	}) => {
		const metadata = getContainerMetadata(
			{
				containers: [
					{
						class_name: "Sandbox",
						name: "sandbox-app",
						scheduling_policy: "durable_object",
						images: {
							sandbox: { dockerfile: "./container/Dockerfile" },
						},
					},
				],
			} as unknown as Config,
			{
				Sandbox: {
					sandbox:
						"registry.cloudflare.com/account/sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
			}
		);

		expect(metadata).toEqual([
			{
				name: "sandbox-app",
				class_name: "Sandbox",
				images: {
					sandbox:
						"registry.cloudflare.com/account/sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
			},
		]);
	});
});
