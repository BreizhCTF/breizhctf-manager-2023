import {
	AppsV1Api,
	NetworkingV1Api,
	KubeConfig,
	KubernetesObjectApi,
	CoreV1Api,
} from "@kubernetes/client-node";
import { Challenge } from "../../types/Challenge";
import handlebars from "handlebars";
import { apply, destroy, generateIdentifier } from "./actions";
import { API_GROUP, ISOLATED_CHALLENGE_QUALIFIER } from "../../strings";

export class DeploymentsStore {
	private core: CoreV1Api;
	private apps: AppsV1Api;
	private networking: NetworkingV1Api;
	private objectApi: KubernetesObjectApi;

	constructor(
		cfg: KubeConfig,
		private apiDomain: string,
		private domain: string,
		private namespace: string,
		private secret: string
	) {
		this.apps = cfg.makeApiClient(AppsV1Api);
		this.core = cfg.makeApiClient(CoreV1Api);
		this.networking = cfg.makeApiClient(NetworkingV1Api);
		this.objectApi = KubernetesObjectApi.makeApiClient(cfg);
	}

	/**
	 * Get all challenges associated with a particular owner
	 *
	 * @param ownerId Owner ID
	 * @returns A list of deployments
	 */
	async getDeploymentsByOwner(ownerId: string) {
		return (
			await this.apps.listNamespacedDeployment(
				this.namespace,
				undefined,
				undefined,
				undefined,
				undefined,
				`${ISOLATED_CHALLENGE_QUALIFIER}/owner=${ownerId}`
			)
		).body.items;
	}

	async getDeploymentByNameAndOwner(name: string, ownerId: string) {
		const identifier = generateIdentifier(name, ownerId, this.secret);
		
		const items = (
			await this.apps.listNamespacedDeployment(
				this.namespace,
				undefined,
				undefined,
				undefined,
				undefined,
				`${ISOLATED_CHALLENGE_QUALIFIER}/owner=${ownerId},${ISOLATED_CHALLENGE_QUALIFIER}/deployment=${identifier}`,
				1
			)
		).body.items;
		
		if (items.length === 0) return null;
		return items[0];
	}

	async getDeploymentsByName(name: string) {
		return this.apps
			.listNamespacedDeployment(
				this.namespace,
				undefined,
				undefined,
				undefined,
				undefined,
				`${API_GROUP}/name=${name}`
			)
			.then((response) => response.body.items);
	}

	async getAccessEndpoint(challengeName: string, ownerId: string) {
		const ingress = await this.networking.listNamespacedIngress(
			this.namespace,
			undefined,
			undefined,
			undefined,
			undefined,
			`${ISOLATED_CHALLENGE_QUALIFIER}/deployment=${challengeName},${ISOLATED_CHALLENGE_QUALIFIER}/owner=${ownerId}`,
		).then(response => response.body.items);

		if (ingress.length > 0) {
			return `https://${ingress[0].spec!.rules![0].host}`;
		}

		const service = await this.core.listNamespacedService(
			this.namespace,
			undefined,
			undefined,
			undefined,
			undefined,
			`${ISOLATED_CHALLENGE_QUALIFIER}/deployment=${challengeName},${ISOLATED_CHALLENGE_QUALIFIER}/owner=${ownerId}`
		).then(response => response.body.items);

		if (service.length > 0) {
			return `challenge.ctf.bzh:${service[0].spec!.ports![0].nodePort}`;
		}

		return 'Not found';
	}

	/**
	 * Deploys the challenge.
	 * @param challenge Challenge spec
	 * @param ownerId Owner ID
	 * @returns A list of kubernetes objects
	 */
	async deploy(challenge: Challenge, ownerId: string) {
		// Generate the template
		const spec = this.renderTemplate(challenge, ownerId);
		return await apply(spec, this.objectApi, {
			fieldManager: this.apiDomain,
		});
	}

	/**
	 * Resets the state of the challenge by performing a rollout restart on the deployment
	 * and updating the expiry on all the objects.
	 *
	 * @param challenge Challenge spec
	 * @param ownerId Owner ID
	 * @returns A list of kubernetes objects
	 */
	async reset(challenge: Challenge, ownerId: string) {
		const spec = this.renderTemplate(challenge, ownerId);
		return await apply(spec, this.objectApi, {
			fieldManager: this.apiDomain,
			reset: true,
		});
	}

	/**
	 * Extends the expiry of the challenge.
	 *
	 * @param challenge Challenge spec
	 * @param ownerId Owner ID
	 * @returns A list of kubernetes objects
	 */
	async extend(challenge: Challenge, ownerId: string) {
		const spec = this.renderTemplate(challenge, ownerId);
		return await apply(spec, this.objectApi, {
			fieldManager: this.apiDomain,
			extend: true,
		});
	}

	/**
	 * Destroys the challenge instance
	 *
	 * @param challenge Challenge spec
	 * @param ownerId Owner ID
	 * @returns A list of kubernetes objects
	 */
	async destroy(challenge: Challenge, ownerId: string) {
		const spec = this.renderTemplate(challenge, ownerId);
		return await destroy(spec, this.objectApi);
	}

	private renderTemplate(challenge: Challenge, ownerId: string) {
		const tpl = handlebars.compile(challenge.template);
		const spec = tpl({
			deployment_id: generateIdentifier(
				challenge.name,
				ownerId,
				this.secret
			),
			challenge_name: challenge.name,
			owner_id: ownerId,
			domain: this.domain,
			expires:
				new Date(Date.now() + challenge.expires * 1000)
					.toISOString()
					.slice(0, -5) + "Z",
		});
		return spec;
	}
}
