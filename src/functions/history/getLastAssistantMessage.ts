import beginContext from "../../utils/beginContext";
import { GLOBAL_CONFIG } from "../../config/params";
import swarm from "../../lib";
import { getRawHistory } from "./getRawHistory";

const METHOD_NAME = "function.history.getLastAssistantMessage";

/**
 * Retrieves the content of the most recent assistant message from a client's session history.
 *
 * This function fetches the raw history for a specified client using `getRawHistory` and finds the last entry where the role is "assistant".
 * It is wrapped in `beginContext` for a clean execution environment and logs the operation if enabled via `GLOBAL_CONFIG`. The result is the content
 * of the last assistant message as a string, or `null` if no assistant message exists in the history.
 *
 * @param {string} clientId - The unique identifier of the client session whose last assistant message is to be retrieved.
 * @returns {Promise<string | null>} A promise that resolves to the content of the last assistant message, or `null` if none is found.
 * @throws {Error} If `getRawHistory` fails due to session validation or history retrieval issues.
 * @example
 * const lastMessage = await getLastAssistantMessage("client-123");
 * console.log(lastMessage); // Outputs the last assistant message or null
 */
export const getLastAssistantMessage = beginContext(
  async (clientId: string) => {
    // Log the operation details if logging is enabled in GLOBAL_CONFIG
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log(METHOD_NAME, {
        clientId,
      });

    // Fetch raw history and find the last assistant message
    const history = await getRawHistory(clientId, METHOD_NAME);
    const last = history.findLast(({ role }) => role === "assistant");
    return last ? last.content : null;
  }
);
