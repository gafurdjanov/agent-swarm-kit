import { Source, Subject } from "functools-kit";
import { SwarmName } from "../interfaces/Swarm.interface";
import { disposeConnection } from "./disposeConnection";
import swarm from "../lib";

const DEFAULT_TIMEOUT = 15 * 60;

/**
 * Interface for the parameters of the makeAutoDispose function.
 */
export interface IMakeDisposeParams {
  /**
   * Timeout in seconds before auto-dispose is triggered.
   */
  timeoutSeconds: number;
}

/**
 * Creates an auto-dispose mechanism for a client in a swarm.
 *
 * @param {string} clientId - The ID of the client.
 * @param {SwarmName} swarmName - The name of the swarm.
 * @param {Partial<IMakeDisposeParams>} [params={}] - Optional parameters for auto-dispose.
 * @returns {Object} An object with tick and stop methods to control the auto-dispose.
 */
export const makeAutoDispose = (
  clientId: string,
  swarmName: SwarmName,
  { timeoutSeconds = DEFAULT_TIMEOUT }: Partial<IMakeDisposeParams> = {}
) => {
  const stateEmitter = new Subject<boolean>();

  const unSource = Source.join([
    stateEmitter.toObserver(),
    Source.fromInterval(1_000),
  ])
    .reduce((acm, [isOk]) => {
      if (isOk) {
        return acm + 1;
      }
      return 0;
    }, 0)
    .filter((ticker) => ticker >= timeoutSeconds)
    .once(async () => {
      unSource();
      if (swarm.sessionValidationService.hasSession(clientId)) {
        await disposeConnection(clientId, swarmName);
      }
    });

  return {
    /**
     * Signals that the client is active, resetting the auto-dispose timer.
     */
    tick() {
      stateEmitter.next(true);
    },
    /**
     * Stops the auto-dispose mechanism.
     */
    stop() {
      unSource();
    },
  };
};
