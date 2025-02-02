import { AgentName, IAgent } from "../interfaces/Agent.interface";
import { ILogger } from "../interfaces/Logger.interface";
import { ExecutionMode } from "./Session.interface";

export interface ISwarmSessionCallbacks {
  /**
   * Callback triggered when a client connects.
   * @param clientId - The ID of the client.
   * @param swarmName - The name of the swarm.
   */
  onConnect?: (clientId: string, swarmName: SwarmName) => void;
  /**
   * Callback triggered when a command is executed.
   * @param clientId - The ID of the client.
   * @param swarmName - The name of the swarm.
   * @param content - The content to execute.
   * @param mode - The source of execution: tool or user.
   */
  onExecute?: (
    clientId: string,
    swarmName: SwarmName,
    content: string,
    mode: ExecutionMode
  ) => void;

  /**
   * Callback triggered when a message is emitted.
   * @param clientId - The ID of the client.
   * @param swarmName - The name of the swarm.
   * @param message - The message to emit.
   */
  onEmit?: (clientId: string, swarmName: SwarmName, message: string) => void;
  /**
   * Callback triggered when a session being connected
   * @param clientId - The ID of the client.
   * @param swarmName - The name of the swarm.
   */
  onInit?: (clientId: string, swarmName: SwarmName) => void;
  /**
   * Callback triggered when a session being disponnected
   * @param clientId - The ID of the client.
   * @param swarmName - The name of the swarm.
   */
  onDispose?: (clientId: string, swarmName: SwarmName) => void;
}

/**
 * Lifecycle callbacks of initialized swarm
 */
export interface ISwarmCallbacks extends ISwarmSessionCallbacks {
  /** Emit the callback on agent change */
  onAgentChanged: (
    clientId: string,
    agentName: AgentName,
    swarmName: SwarmName
  ) => Promise<void>;
}

/**
 * Parameters for initializing a swarm.
 * @interface
 * @extends {Omit<ISwarmSchema, 'agentList'>}
 */
export interface ISwarmParams
  extends Omit<
    ISwarmSchema,
    keyof {
      agentList: never;
      onAgentChanged: never;
    }
  >, ISwarmCallbacks {
  /** Client identifier */
  clientId: string;
  /** Logger instance */
  logger: ILogger;
  /** Map of agent names to agent instances */
  agentMap: Record<AgentName, IAgent>;

}

/**
 * Schema for defining a swarm.
 * @interface
 */
export interface ISwarmSchema {
  /** Default agent name */
  defaultAgent: AgentName;
  /** Name of the swarm */
  swarmName: string;
  /** List of agent names */
  agentList: string[];
  /** Lifecycle callbacks*/
  callbacks?: Partial<ISwarmCallbacks>;
}

/**
 * Interface for a swarm.
 * @interface
 */
export interface ISwarm {
  /**
   * Waits for the output from the swarm.
   * @returns {Promise<string>} The output from the swarm.
   */
  waitForOutput(): Promise<string>;

  /**
   * Gets the name of the agent.
   * @returns {Promise<AgentName>} The name of the agent.
   */
  getAgentName(): Promise<AgentName>;

  /**
   * Gets the agent instance.
   * @returns {Promise<IAgent>} The agent instance.
   */
  getAgent(): Promise<IAgent>;

  /**
   * Sets the reference to an agent.
   * @param {AgentName} agentName - The name of the agent.
   * @param {IAgent} agent - The agent instance.
   * @returns {Promise<void>}
   */
  setAgentRef(agentName: AgentName, agent: IAgent): Promise<void>;

  /**
   * Sets the name of the agent.
   * @param {AgentName} agentName - The name of the agent.
   * @returns {Promise<void>}
   */
  setAgentName(agentName: AgentName): Promise<void>;
}

/** Type alias for swarm name */
export type SwarmName = string;

export default ISwarm;
