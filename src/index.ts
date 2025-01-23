export * from './lib';

export * from './functions/addAgent';
export * from './functions/addCompletion';
export * from './functions/addSwarm';
export * from './functions/addTool';
export * from './functions/makeConnection';
export * from './functions/changeAgent';
export * from './functions/complete';
export * from './functions/disposeConnection';

export { IAgentSchema } from './interfaces/Agent.interface';
export { ICompletionSchema } from './interfaces/Completion.interface';
export { ISwarmSchema } from './interfaces/Swarm.interface';
export { IAgentTool } from './interfaces/Agent.interface';

export { SendMessageFn, ReceiveMessageFn } from './interfaces/Session.interface';

export { setConfig } from './config/params'
