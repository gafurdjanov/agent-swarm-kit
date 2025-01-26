import { queued } from "functools-kit";
import { SwarmName } from "../interfaces/Swarm.interface";
import swarm from "../lib";
import { disposeConnection } from "./disposeConnection";

type TComplete = (content: string) => Promise<string>;

export const session = (clientId: string, swarmName: SwarmName) => {
  swarm.loggerService.log("function session", {
    clientId,
    swarmName,
  });
  swarm.swarmValidationService.validate(swarmName, "session");
  swarm.sessionValidationService.addSession(clientId, swarmName, "session");
  return {
    complete: queued(async (content: string) => {
      swarm.sessionValidationService.validate(clientId, "session");
      return await swarm.sessionPublicService.execute(
        content,
        clientId,
        swarmName
      );
    }) as TComplete,
    dispose: async () => {
      return await disposeConnection(clientId, swarmName);
    },
  };
};
