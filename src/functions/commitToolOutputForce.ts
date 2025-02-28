import { GLOBAL_CONFIG } from "../config/params";
import swarm from "../lib";

/**
 * Commits the tool output to the active agent in a swarm session without checking active agent
 *
 * @param {string} content - The content to be committed.
 * @param {string} clientId - The client ID associated with the session.
 * @returns {Promise<void>} - A promise that resolves when the operation is complete.
 */
export const commitToolOutputForce = async (
  toolId: string,
  content: string,
  clientId: string
) => {
  const methodName = "function commitToolOutputForce";
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
    swarm.loggerService.log("function commitToolOutputForce", {
      toolId,
      content,
      clientId,
    });
  swarm.sessionValidationService.validate(clientId, "commitToolOutputForce");
  const swarmName = swarm.sessionValidationService.getSwarm(clientId);
  swarm.swarmValidationService.validate(swarmName, "commitToolOutputForce");
  await swarm.sessionPublicService.commitToolOutput(
    toolId,
    content,
    methodName,
    clientId,
    swarmName
  );
};
