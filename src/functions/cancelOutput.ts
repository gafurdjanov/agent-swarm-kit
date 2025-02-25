import swarm from "../lib";

/**
 * Cancel the await of output by emit of empty string
 * 
 * @param {string} clientId - The ID of the client.
 * @param {string} agentName - The name of the agent.
 * @returns {Promise<void>} - A promise that resolves when the output is canceled
 */
export const cancelOutput = async (clientId: string, agentName: string) => {
    swarm.loggerService.log('function cancelOutput', {
        clientId,
        agentName,
    });
    swarm.agentValidationService.validate(agentName, "cancelOutput");
    swarm.sessionValidationService.validate(clientId, "cancelOutput");
    const swarmName = swarm.sessionValidationService.getSwarm(clientId);
    swarm.swarmValidationService.validate(swarmName, "cancelOutput");
    const currentAgentName = await swarm.swarmPublicService.getAgentName(clientId, swarmName);
    if (currentAgentName !== agentName) {
        swarm.loggerService.log('function "cancelOutput" skipped due to the agent change', {
            currentAgentName,
            agentName,
            clientId,
        });
        return;
    }
    await swarm.swarmPublicService.cancelOutput(clientId, swarmName);
}
