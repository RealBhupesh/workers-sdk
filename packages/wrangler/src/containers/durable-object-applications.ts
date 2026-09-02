import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { updateStatus } from "@cloudflare/cli-shared-helpers";
import {
	ApplicationsService,
	ContainerImagePreparationsService,
	ContainerImagePreparationStatus,
	resolveImageName,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import {
	getDurableObjectContainerApps,
	getDockerPath,
	isNonInteractiveOrCI,
	UserError,
} from "@cloudflare/workers-utils";
import { buildAndMaybePush } from "../cloudchamber/build";
import {
	fillOpenAPIConfiguration,
	promiseSpinner,
} from "../cloudchamber/common";
import { logger } from "../logger";
import { getOrSelectAccountId } from "../user";
import { validateDurableObjectContainerApplications } from "./config";
import { createDurableObjectNamespaceResolver } from "./deploy";
import { containersScope } from ".";
import type { CreateDurableObjectApplicationRequest } from "@cloudflare/containers-shared";
import type {
	Config,
	DurableObjectContainerApp,
	DurableObjectContainerImage,
} from "@cloudflare/workers-utils";

const IMAGE_PREPARATION_POLL_INTERVAL_MS = 2_000;
const IMAGE_PREPARATION_TIMEOUT_MS = 15 * 60_000;

type DeployDurableObjectContainerApplicationsArgs = {
	versionId: string;
	accountId: string;
	scriptName: string;
};

type PrepareDurableObjectContainerApplicationsArgs = {
	dryRun: boolean;
	scriptName: string;
};

export type PreparedContainerImages = Record<string, Record<string, string>>;

function isRegistryImage(
	image: DurableObjectContainerImage
): image is Extract<DurableObjectContainerImage, { image: string }> {
	return typeof image.image === "string";
}

function toCreateApplicationRequest(
	{ name }: DurableObjectContainerApp,
	namespaceId: string
): CreateDurableObjectApplicationRequest {
	return {
		name,
		scheduling_policy: SchedulingPolicy.DURABLE_OBJECT,
		durable_objects: { namespace_id: namespaceId },
	};
}

function buildTag(
	scriptName: string,
	className: string,
	imageName: string
): string {
	const repository = `${scriptName}-${className}-${imageName}`
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return `${repository}:wrangler-${Date.now().toString(36)}`;
}

async function buildOrResolveImage(
	config: Config,
	container: DurableObjectContainerApp,
	imageName: string,
	imageConfig: DurableObjectContainerImage,
	scriptName: string,
	dryRun: boolean
): Promise<string> {
	if (isRegistryImage(imageConfig)) {
		if (dryRun) {
			return imageConfig.image;
		}
		return resolveImageName(
			await getOrSelectAccountId(config),
			imageConfig.image,
			config
		);
	}

	const baseDir = config.configPath
		? path.dirname(config.configPath)
		: process.cwd();
	const dockerfile = path.resolve(baseDir, imageConfig.dockerfile);
	const tag = buildTag(scriptName, container.class_name, imageName);
	logger.log("Building image", tag);
	const imageRef = await buildAndMaybePush(
		{
			tag,
			pathToDockerfile: dockerfile,
			buildContext: path.dirname(dockerfile),
			platform: "linux/amd64",
		},
		getDockerPath(),
		!dryRun,
		undefined,
		true,
		config
	);

	return "remoteDigest" in imageRef ? imageRef.remoteDigest : imageRef.newTag;
}

async function waitForImagePreparation(image: string): Promise<void> {
	const deadline = Date.now() + IMAGE_PREPARATION_TIMEOUT_MS;

	while (Date.now() < deadline) {
		const preparation =
			await ContainerImagePreparationsService.prepareContainerImage({ image });
		switch (preparation.status) {
			case ContainerImagePreparationStatus.READY:
				return;
			case ContainerImagePreparationStatus.ERROR:
				throw new UserError(
					preparation.reason ?? "Container image preparation failed",
					{
						telemetryMessage:
							"durable object container image preparation failed",
					}
				);
			case ContainerImagePreparationStatus.PENDING:
				await setTimeout(IMAGE_PREPARATION_POLL_INTERVAL_MS);
				break;
			default:
				throw new UserError(
					`Container image preparation returned an unsupported status: ${String(preparation.status)}`,
					{
						telemetryMessage:
							"durable object container image preparation unsupported status",
					}
				);
		}
	}

	throw new UserError(
		"Timed out while preparing the container image on Cloudflare's network.",
		{
			telemetryMessage: "durable object container image preparation timed out",
		}
	);
}

export async function prepareDurableObjectContainerApplications(
	config: Config,
	{ dryRun, scriptName }: PrepareDurableObjectContainerApplicationsArgs
): Promise<PreparedContainerImages> {
	validateDurableObjectContainerApplications(config);

	const containers = getDurableObjectContainerApps(config.containers).filter(
		(container) => Object.keys(container.images ?? {}).length > 0
	);
	if (containers.length === 0) {
		return {};
	}

	if (!dryRun) {
		await fillOpenAPIConfiguration(config, containersScope);
	}

	const imagesByClass: [string, Record<string, string>][] = [];
	const preparedImages = new Map<string, string>();
	for (const container of containers) {
		const classImages: [string, string][] = [];
		for (const [imageName, imageConfig] of Object.entries(
			container.images ?? {}
		)) {
			const source = isRegistryImage(imageConfig)
				? `image:${imageConfig.image}`
				: `dockerfile:${path.resolve(
						config.configPath ? path.dirname(config.configPath) : process.cwd(),
						imageConfig.dockerfile
					)}`;
			let image = preparedImages.get(source);
			if (image === undefined) {
				image = await buildOrResolveImage(
					config,
					container,
					imageName,
					imageConfig,
					scriptName,
					dryRun
				);

				if (!dryRun) {
					const imageLine = `  ${image}`;
					const message = `Preparing ${imageName} for Cloudflare Containers\n${imageLine}`;
					if (isNonInteractiveOrCI()) {
						updateStatus(message);
						await waitForImagePreparation(image);
					} else {
						await promiseSpinner(waitForImagePreparation(image), {
							message,
						});
					}
					updateStatus(`${imageName} is ready to run\n${imageLine}`);
				}
				preparedImages.set(source, image);
			}

			classImages.push([imageName, image]);
		}
		imagesByClass.push([container.class_name, Object.fromEntries(classImages)]);
	}

	return Object.fromEntries(imagesByClass);
}

export async function deployDurableObjectContainerApplications(
	config: Config,
	{
		versionId,
		accountId,
		scriptName,
	}: DeployDurableObjectContainerApplicationsArgs
): Promise<void> {
	const containers = getDurableObjectContainerApps(config.containers);
	if (containers.length === 0) {
		return;
	}

	await fillOpenAPIConfiguration(config, containersScope);
	const resolveNamespaceId = createDurableObjectNamespaceResolver(config, {
		versionId,
		accountId,
		scriptName,
	});

	for (const container of containers) {
		const namespaceId = await resolveNamespaceId(container.class_name);
		await ApplicationsService.createApplication(
			toCreateApplicationRequest(container, namespaceId)
		);
	}
}
