import { GLOBAL_CONFIG } from "../config/params";
import swarm from "../lib";

/**
 * Cancel the await of output by emit of empty string without checking active agent
 *
 * @param {string} clientId - The ID of the client.
 * @param {string} agentName - The name of the agent.
 * @returns {Promise<void>} - A promise that resolves when the output is canceled
 */
export const cancelOutputForce = async (clientId: string) => {
  const methodName = "function cancelOutputForce";
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
    swarm.loggerService.log("function cancelOutputForce", {
      clientId,
    });
  swarm.sessionValidationService.validate(clientId, "cancelOutputForce");
  const swarmName = swarm.sessionValidationService.getSwarm(clientId);
  swarm.swarmValidationService.validate(swarmName, "cancelOutputForce");
  await swarm.swarmPublicService.cancelOutput(methodName, clientId, swarmName);
};
