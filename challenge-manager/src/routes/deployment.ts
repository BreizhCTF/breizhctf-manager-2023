import { KubernetesObject, V1Deployment } from "@kubernetes/client-node";
import { FastifyInstance } from "fastify";
import * as jwt from "jsonwebtoken";
import {
	AUTH_SECRET,
	API_DOMAIN,
	BASE_DOMAIN,
	MAX_OWNER_DEPLOYMENTS,
} from "../config";
import * as strings from "../strings";

export default async function register(fastify: FastifyInstance) {
	const { kubeClient, challengeConfigStore } = fastify.container.cradle;

	const mapDeploymentToResponse = async ({ metadata }: V1Deployment) => {
		
		return {
			name: metadata?.labels?.challenge,
			// host: `${
			// 	metadata?.labels?.[
			// 		`${strings.ISOLATED_CHALLENGE_QUALIFIER}/deployment`
			// 	]
			// }.${BASE_DOMAIN}`,
			host: await kubeClient.getAccessEndpoint(
				metadata?.labels?.[`${strings.ISOLATED_CHALLENGE_QUALIFIER}/deployment`] ?? '',
				metadata?.labels?.[`${strings.ISOLATED_CHALLENGE_QUALIFIER}/owner`] ?? ''
			),
			expires: metadata?.annotations?.["janitor/expires"],
			// owner: metadata?.labels?.[
			// 	`${strings.ISOLATED_CHALLENGE_QUALIFIER}/owner`
			// ],
		};
	};

	fastify.addSchema({
		$id: "challenge-manager.kube-ctf.downunderctf.com/schema/deployments.json",
		type: "object",
		properties: {
			options: {
				type: "object",
				properties: {
					reset: { type: "boolean" },
					extend: { type: "boolean" },
				},
			},
			name: {
				type: "string",
				pattern: "^[0-9a-z_-]+$",
			},
		},
	});

	fastify.addHook("preHandler", async (request, reply) => {
		if (!request.headers.authorization)
			return reply.code(401).send({
				error: strings.ERROR_UNAUTHORIZED,
			});

		// extract and verify token
		const token = request.headers.authorization.match(/^Bearer (.*)$/);
		if (!token)
			return reply.code(401).send({
				error: strings.ERROR_INVALID_CREDENTIALS,
			});

		try {
			const payload = jwt.verify(token[1], AUTH_SECRET, {
				// audience: API_DOMAIN,
				algorithms: ["HS256"],
			}) as { owner_id: string; admin: boolean };

			request.requestContext.set("owner", payload.owner_id || "-1");
			request.requestContext.set("admin", !!payload.admin);

			request.log.info(
				`auth_info: owner_id=${payload.owner_id}${
					payload.admin ? ", admin" : ""
				}`
			);
		} catch (e) {
			request.log.warn("auth error", e);
			reply.code(401).send({
				error: strings.ERROR_INVALID_CREDENTIALS,
			});
		}
	});

	// List all deployments made by an owner
	fastify.route({
		method: "GET",
		url: "/",
		handler: async (request, reply) => {
			const owner = request.requestContext.get("owner") as string;

			const deployments = await kubeClient.getDeploymentsByOwner(owner);
			console.log(deployments);
			const response = await Promise.all(deployments.map(async d => mapDeploymentToResponse(d)))

			reply.send({
				deployments: response
			});
		},
	});

	fastify.route<{ Params: { name: string } }>({
		method: "GET",
		url: "/:name",
		schema: {
			params: {
				name: {
					$ref: "challenge-manager.kube-ctf.downunderctf.com/schema/deployments.json#/properties/name",
				},
			},
		},
		handler: async (request, reply) => {
			const owner = request.requestContext.get("owner") as string;
			const name = request.params?.name as string;

			// Get the deployment
			const deployment = await kubeClient.getDeploymentByNameAndOwner(
				name,
				owner
			);

			if (!deployment) {
				return reply.code(404).send({
					error: strings.ERROR_DEPLOYMENT_NOT_FOUND,
				});
			}

			return reply.send({
				deployment: await mapDeploymentToResponse(deployment),
			});
		},
	});

	fastify.route<{
		Params: { name: string };
		Body: { reset: boolean; extend: boolean };
	}>({
		method: "POST",
		url: "/:name",
		schema: {
			body: {
				$ref: "challenge-manager.kube-ctf.downunderctf.com/schema/deployments.json#/properties/options",
			},
			params: {
				name: {
					$ref: "challenge-manager.kube-ctf.downunderctf.com/schema/deployments.json#/properties/name",
				},
			},
		},
		handler: async (request, reply) => {
			const owner = request.requestContext.get("owner") as string;
			const admin = request.requestContext.get("admin") as boolean;

			// Get all deployments (for rate limiting purposes)
			const deployment = await kubeClient.getDeploymentByNameAndOwner(request.params.name, owner);


			// Check if challenge name exists in current deployments
			// const deployment = deployments.find(
			// 	({ metadata }) =>
			// 		metadata?.labels?.[`${strings.API_GROUP}/challenge`] ===
			// 		request.params.name
			// );
			if (deployment && !(request.body.reset || request.body.extend)) {
				return reply.code(400).send({
					error: strings.ERROR_DEPLOYMENT_EXISTS,
				});
			}

			// Find spec and launch
			const spec = await challengeConfigStore.getChallenge(
				request.params.name
			);

			if (!spec)
				return reply.code(400).send({
					error: strings.ERROR_CHALLENGE_NOT_FOUND,
				});

			let res: KubernetesObject[];

			if (deployment && request.body.reset) {
				// reset
				request.log.info("deploy: type=reset");
				res = await kubeClient.reset(spec, owner);
			} else if (deployment && request.body.extend) {
				// extend
				request.log.info("deploy: type=extend");
				res = await kubeClient.extend(spec, owner);
			} else {
				// check container limit
				const deployments = await kubeClient.getDeploymentsByOwner(owner);
				if (
					MAX_OWNER_DEPLOYMENTS !== 0 &&
					deployments.length >= MAX_OWNER_DEPLOYMENTS
				) {
					request.log.info("deploy: error=deployment_limit");
					return reply.code(403).send({
						error: strings.ERROR_DEPLOYMENT_LIMIT,
						runningChallenges: deployments.map(d => d.metadata?.labels?.challenge)
					});
				}

				request.log.info("deploy: type=new");
				res = await kubeClient.deploy(spec, owner);
			}

			// find the deployment object
			const newDeployment = res.find(({ kind }) => kind === "Deployment");
			// const access = kubeClient.getAccessEndpoint(request.params.name, owner);
			// let host: string[] = [];
			// for (const manifest of res) {
			// 	if (manifest.kind === "Ingress") {
			// 		host = (manifest as any).spec.rules.map(
			// 			(rule: any) => `https://${rule.host}`
			// 		);
			// 	} else if (host.length == 0 && manifest.kind === "Service") {
			// 		host = (manifest as any).spec.ports.map(
			// 			(port: any) => `ctf.bzh:${port.nodePort}`
			// 		);
			// 	}
			// }

			if (!newDeployment)
				return reply.code(500).send({
					error: "Deployment failed.",
				});

			reply.send({
				deployment: await mapDeploymentToResponse(newDeployment),
			});
		},
	});

	fastify.route<{ Params: { name: string } }>({
		method: "DELETE",
		url: "/:name",
		schema: {
			params: {
				name: {
					$ref: "challenge-manager.kube-ctf.downunderctf.com/schema/deployments.json#/properties/name",
				},
			},
		},
		handler: async (request, reply) => {
			const owner = request.requestContext.get("owner") as string;

			// Get all deployments (for rate limiting purposes)
			const deployment = await kubeClient.getDeploymentByNameAndOwner(
				request.params.name,
				owner
			);

			if (!deployment)
				return reply.code(404).send({
					error: strings.ERROR_DEPLOYMENT_NOT_FOUND,
				});

			// Find spec and delete
			const spec = await challengeConfigStore.getChallenge(
				request.params.name,
				true
			);
			if (!spec)
				return reply.code(404).send({
					error: strings.ERROR_CHALLENGE_NOT_FOUND,
				});

			await kubeClient.destroy(spec, owner);
			return reply.send({});
		},
	});
}
