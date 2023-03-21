import { KubernetesRepository } from "./stores/ChallengeConfigStore/KubernetesRepository";
import { DeploymentsStore } from "./stores/DeploymentsStore";
import { ISOLATED_CHALLENGE_QUALIFIER } from "./strings";
import { Challenge } from "./types/Challenge";

export class Watcher {
    constructor(
        private configStore: KubernetesRepository,
        private deploymentStore: DeploymentsStore
    ) {}

    public init() {
        this.configStore.watch((e, challenge) => {
            if (e === "MODIFIED") {
                this.update(challenge);
            }
        });
    }

    private update(challenge: Challenge) {
        this.deploymentStore.getDeploymentsByName(challenge.name)
            .then(deployments => {
                for (const deployment of deployments) {
                    if (!deployment.metadata || !deployment.metadata.labels) { continue; }

                    const ownerId = deployment.metadata.labels[`${ISOLATED_CHALLENGE_QUALIFIER}/owner`];

                    this.deploymentStore.deploy(challenge, ownerId);
                }
            });
    }
};
