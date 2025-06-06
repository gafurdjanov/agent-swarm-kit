import { addTool, commitToolOutput, execute, Storage } from "agent-swarm-kit";
import { z } from "zod";
import { ToolName } from "../../enum/ToolName";
import type { IFactSchema } from "../../model/FactSchema.model";
import { StorageName } from "../../enum/StorageName";

const PARAMETER_SCHEMA = z.object({}).strict();

addTool({
  docNote: "This tool, named TestStorageTool, functions within the persist-redis-storage project to test the FactStorage by adding a new test fact entry to the Redis-persisted storage, confirming the action via tool output, and triggering a follow-up message to notify the user of successful testing.",
  toolName: ToolName.TestStorageTool,
  type: "function",
  validate: async ({ clientId, agentName, params }) => {
    const validationResult = PARAMETER_SCHEMA.safeParse(params);
    return validationResult.success;
  },
  call: async ({ toolId, clientId, agentName, params }) => {
    const { length } = await Storage.list({
      agentName,
      clientId,
      storageName: StorageName.FactStorage,
    });
    await Storage.upsert<IFactSchema>({
      agentName,
      clientId,
      item: {
        id: length + 1,
        description: "Test fact",
        title: "Test fact",
      },
      storageName: StorageName.FactStorage,
    });
    await commitToolOutput(
      toolId,
      "Storage tested successfully.",
      clientId,
      agentName
    );
    await execute(
      "Tell me the storage has been tested successfully.",
      clientId,
      agentName
    );
  },
  function: {
    name: ToolName.TestStorageTool,
    description: "Test the storage.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
});
