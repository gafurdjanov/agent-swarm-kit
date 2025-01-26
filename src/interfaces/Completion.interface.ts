import { IModelMessage } from "../model/ModelMessage.model";
import { ITool } from "../model/Tool.model";
import { AgentName } from "./Agent.interface";

/**
 * Interface representing a completion.
 */
export interface ICompletion extends ICompletionSchema { }

/**
 * Arguments required to get a completion.
 */
export interface ICompletionArgs {
  /**
   * Client ID.
   */
  clientId: string,
  /**
   * Name of the agent.
   */
  agentName: AgentName, 
  /**
   * Array of model messages.
   */
  messages: IModelMessage[],
  /**
   * Optional array of tools.
   */
  tools?: ITool[]
}

/**
 * Schema for a completion.
 */
export interface ICompletionSchema {
  /**
   * Name of the completion.
   */
  completionName: CompletionName;
  /**
   * Method to get a completion.
   * @param args - Arguments required to get a completion.
   * @returns A promise that resolves to a model message.
   */
  getCompletion(args: ICompletionArgs): Promise<IModelMessage>;
}

/**
 * Type representing the name of a completion.
 */
export type CompletionName = string;
