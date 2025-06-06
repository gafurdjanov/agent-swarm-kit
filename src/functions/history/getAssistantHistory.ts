import beginContext from "../../utils/beginContext";
import { GLOBAL_CONFIG } from "../../config/params";
import swarm from "../../lib";
import { getRawHistory } from "./getRawHistory";

const METHOD_NAME = "function.history.getAssistantHistory";

/**
 * Retrieves the assistant's history entries for a given client session.
 *
 * This function fetches the raw history for a specified client using `getRawHistory` and filters it to include only entries where the role is
 * "assistant". It is wrapped in `beginContext` for a clean execution environment and logs the operation if enabled via `GLOBAL_CONFIG`. The result
 * is an array of history objects representing the assistant's contributions in the session.
 *
 * @param {string} clientId - The unique identifier of the client session whose assistant history is to be retrieved.
 * @returns {Promise<object[]>} A promise that resolves to an array of history objects with the role "assistant".
 * @throws {Error} If `getRawHistory` fails due to session validation or history retrieval issues.
 * @example
 * const assistantHistory = await getAssistantHistory("client-123");
 * console.log(assistantHistory); // Outputs array of assistant history entries
 */
export const getAssistantHistory = beginContext(async (clientId: string) => {
  // Log the operation details if logging is enabled in GLOBAL_CONFIG
  GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
    swarm.loggerService.log(METHOD_NAME, {
      clientId,
    });

  // Fetch raw history and filter for assistant role
  const history = await getRawHistory(clientId, METHOD_NAME);
  return history.filter(({ role }) => role === "assistant");
});
