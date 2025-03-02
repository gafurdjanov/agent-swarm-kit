import swarm from "../lib";
import { GLOBAL_CONFIG } from "../config/params";
import { SwarmName } from "../interfaces/Swarm.interface";

const METHOD_NAME = "function.dumpSwarm";

/**
 * Dumps the swarm information into PlantUML format.
 *
 * @param {SwarmName} swarmName - The name of the swarm to be dumped.
 * @returns {string} The UML representation of the swarm.
 */
export const dumpSwarm = (swarmName: SwarmName) => {
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
    swarm.loggerService.log(METHOD_NAME, {
      swarmName,
    });
  swarm.swarmValidationService.validate(swarmName, METHOD_NAME);
  return swarm.swarmMetaService.toUML(swarmName);
};
