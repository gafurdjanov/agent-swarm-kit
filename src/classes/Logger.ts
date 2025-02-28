import { ILogger } from "../interfaces/Logger.interface";
import swarm from "../lib";
import { GLOBAL_CONFIG } from "../config/params";

class LoggerUtils {
  /**
   * Sets the provided logger to the logger service.
   * @param {ILogger} logger - The logger instance to be used.
   */
  public useLogger = (logger: ILogger) => {
    GLOBAL_CONFIG.CC_LOGGER_ENABLE_LOG &&
      swarm.loggerService.log("HistoryInstance useLogger");
    swarm.loggerService.setLogger(logger);
  };
}

/**
 * Instance of LoggerUtils to be used for logging.
 * @type {LoggerUtils}
 */
export const Logger = new LoggerUtils();

export default Logger;
