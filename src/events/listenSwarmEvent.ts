import { IBusEvent } from "../model/Event.model";
import swarm from "../lib";
import { queued } from "functools-kit";
import beginContext from "../utils/beginContext";

/**
 * Validates the client ID for swarm event listening, allowing wildcard "*" or checking for an active session.
 *
 * @param {string} clientId - The client ID to validate.
 * @throws {Error} If the client ID is not "*" and no active session exists for it.
 */
const validateClientId = (clientId: string) => {
  if (clientId === "*") {
    return;
  }
  if (!swarm.sessionValidationService.hasSession(clientId)) {
    throw new Error(
      `agent-swarm listenSwarmEvent session not found for clientId=${clientId}`
    );
  }
};

/**
 * Subscribes to swarm-specific events on the swarm bus service for a specific client and executes a callback for each event.
 *
 * This function sets up a listener for events on the "swarm-bus" topic associated with a given client ID, invoking the provided callback with
 * the event data whenever a swarm event is received. It is wrapped in `beginContext` for a clean execution environment and logs the operation
 * via `loggerService`. The callback is queued using `functools-kit` to ensure sequential processing of events. The function supports a wildcard
 * client ID ("*") for listening to all clients or validates a specific client session. It returns an unsubscribe function to stop listening.
 *
 * @param {string} clientId - The ID of the client to subscribe to swarm events for, or "*" to listen to all clients.
 * @param {(event: IBusEvent) => void} fn - The callback function to execute when a swarm event is received, passed the event object.
 * @returns {() => void} A function to unsubscribe from the swarm event listener.
 * @throws {Error} If the `clientId` is not "*" and no active session exists for it.
 * @example
 * const unsubscribe = listenSwarmEvent("client-123", (event) => console.log(event));
 * // Logs each swarm event for "client-123"
 * unsubscribe(); // Stops listening
 */
export const listenSwarmEvent = beginContext(
  (clientId: string, fn: (event: IBusEvent) => void) => {
    // Log the operation details
    swarm.loggerService.log("middleware listenSwarmEvent", {
      clientId,
    });

    // Validate the client ID
    validateClientId(clientId);

    // Subscribe to swarm events with a queued callback
    return swarm.busService.subscribe(
      clientId,
      "swarm-bus",
      queued(async (e) => await fn(e))
    );
  }
);

export default listenSwarmEvent;
