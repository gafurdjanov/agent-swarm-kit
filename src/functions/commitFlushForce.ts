import { randomString } from "functools-kit";
import swarm from "../lib";

/**
 * Commits flush of agent history without active agent check
 * 
 * @param {string} clientId - The ID of the client.
 * @returns {Promise<void>} - A promise that resolves when the message is committed.
 */
export const commitFlushForce = async (clientId: string) => {
    const methodName = 'function commitFlushForce'
    swarm.loggerService.log('function commitFlushForce', {
        clientId,
        methodName,
    });
    swarm.sessionValidationService.validate(clientId, "commitFlushForce");
    const swarmName = swarm.sessionValidationService.getSwarm(clientId);
    swarm.swarmValidationService.validate(swarmName, "commitFlushForce");
    await swarm.sessionPublicService.commitFlush(methodName, clientId, swarmName);
}
