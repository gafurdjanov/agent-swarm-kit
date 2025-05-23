import { AgentName } from "../interfaces/Agent.interface";
import swarm from "../lib";
import { GLOBAL_CONFIG } from "../config/params";
import beginContext from "../utils/beginContext";

const METHOD_NAME = "cli.dumpAgent";

/**
 * The config for UML generation
 */
interface IConfig {
  withSubtree: boolean;
}

/**
 * Dumps the agent information into PlantUML format.
 *
 * @param {SwarmName} swarmName - The name of the swarm to be dumped.
 * @returns {string} The UML representation of the swarm.
 */
export const dumpAgent = beginContext(
  (agentName: AgentName, { withSubtree = false }: Partial<IConfig> = {}) => {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(METHOD_NAME, {
        agentName,
      });
    swarm.agentValidationService.validate(agentName, METHOD_NAME);
    return swarm.agentMetaService.toUML(agentName, withSubtree);
  }
);
