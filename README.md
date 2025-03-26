# 🐝 Agent Swarm Kit

> **A lightweight TypeScript library for building orchestrated, framework-agnostic multi-agent AI systems.**

Unleash the power of collaborative AI with `agent-swarm-kit`! This library empowers you to create intelligent, modular agent networks that work together seamlessly—perfect for automating workflows, solving complex problems, or designing next-gen AI systems. With a simple API, robust validation, and flexible architecture, it’s your toolkit for building smarter solutions, faster.

📚 **[Full Documentation](https://agent-swarm.github.io/documents/demo_it-consulting-swarm_root_swarm.html)** | 🌟 **[Try It Now](https://github.com/tripolskypetr/agent-swarm-kit/blob/master/demo/repl-phone-seller/src/logic/agent/sales.agent.ts)**

![Agent Swarm Schema](https://raw.githubusercontent.com/tripolskypetr/agent-swarm-kit/master/schema.png)

---

## ✨ Why Choose Agent Swarm Kit?

- **Multi-Agent Collaboration**: Orchestrate multiple AI agents, each with unique roles—like triage, sales, or refunds—working as a team.
- **Lightweight & Flexible**: Unlike bulky frameworks, our API is simple and delegates prompt engineering to your team.
- **Framework-Agnostic**: Each agent works with any AI provider—OpenAI, Ollama, LMStudio, Claude, Grok, YandexGPT, Gemini, you name it!
- **Robust Validation**: Built-in checks ensure tools, agents, and outputs are always on point.
- **Real-Time Interaction**: Supports message scheduling and WebSocket channels for dynamic user input.

---

## 🚀 Getting Started

**Want a real-world demo?** Check out our **[REPL Phone Seller App](https://github.com/tripolskypetr/agent-swarm-kit/blob/master/demo/repl-phone-seller/src/logic/agent/sales.agent.ts)**—a practical example of a sales agent in action!

### Installation

Get up and running in seconds:

```bash
npm install agent-swarm-kit
```

### Quick Example

Here’s a taste of what `agent-swarm-kit` can do—create a swarm with a triage agent that navigates to specialized agents:

```typescript
import {
  addAgent,
  addCompletion,
  addSwarm,
  addTool,
  changeAgent,
  execute,
  session,
  Adapter
} from "agent-swarm-kit";

const NAVIGATE_TOOL = addTool({
  toolName: "navigate-tool",
  call: async (clientId, agentName, { to }) => {
    await changeAgent(to, clientId);
    await execute("Navigation complete. Notify the user", clientId);
  },
  validate: async () => true,
  type: "function",
  function: {
    name: "navigate-tool",
    description: "The tool for navigation",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "The target agent for navigation",
        },
      },
      required: ["to"],
    },
  },
});

const ollama = new Ollama({ host: CC_OLLAMA_HOST });

const MOCK_COMPLETION = addCompletion({
  completionName: "navigate-completion",
  /**
   * Use whatever you want: NVIDIA NIM, OpenAI, GPT4All, Ollama or LM Studio
   * Even mock it for unit test of tool integration like it done in `test` folder
   * 
   * @see https://github.com/tripolskypetr/agent-swarm-kit/tree/master/test
   */
  getCompletion: Adapter.fromOllama(ollama, "nemotron-mini:4b"), // "tripolskypetr/gemma3-tools:4b"
});

const TRIAGE_AGENT = addAgent({
  agentName: "triage-agent",
  completion: MOCK_COMPLETION,
  prompt: "You are to triage a users request, and call a tool to transfer to the right agent. There are two agents available: `sales-agent` and `refund-agent`",
  tools: [NAVIGATE_TOOL],
});

const SALES_AGENT = addAgent({
  agentName: "sales-agent",
  completion: MOCK_COMPLETION,
  prompt: "You are a sales agent that handles all actions related to placing the order to purchase an item.",
  tools: [NAVIGATE_TOOL],
});

const REDUND_AGENT = addAgent({
  agentName: "refund-agent",
  completion: MOCK_COMPLETION,
  prompt: "You are a refund agent that handles all actions related to refunds after a return has been processed.",
  tools: [NAVIGATE_TOOL],
});

const TEST_SWARM = addSwarm({
  agentList: [TRIAGE_AGENT, SALES_AGENT, REDUND_AGENT],
  defaultAgent: TRIAGE_AGENT,
  swarmName: "navigation-swarm",
});

...

app.get("/api/v1/session/:clientId", upgradeWebSocket((ctx) => {
  const clientId = ctx.req.param("clientId");

  const { complete, dispose } = session(clientId, TEST_SWARM)

  return {
    onMessage: async (event, ws) => {
      const message = event.data.toString();
      ws.send(await complete(message));
    },
    onClose: async () => {
      await dispose();
    },
  }
}));

```

The feature of this library is dependency inversion for agents injection. The agents are being lazy loaded during runtime, so you can declare them in separate modules and connect them to swarm with a string constant

```typescript
export enum ToolName {
  TestTool = "test-tool",
}

export enum AgentName {
  TestAgent = "test-agent",
}

export enum CompletionName {
  TestCompletion = "test-completion"
}

export enum SwarmName {
  TestSwarm = "test-swarm"
}

...

addTool({
    toolName: ToolName.TestTool
    ...
})

addAgent({
  agentName: AgentName.TestAgent,
  completion: CompletionName.TestCompletion,
  prompt: "...",
  tools: [ToolName.TestTool],
});

addSwarm({
  agentList: [AgentName.TestAgent],
  defaultAgent: AgentName.TestAgent,
  swarmName: SwarmName.TestSwarm,
});

const { complete, dispose } = session(clientId, SwarmName.TestSwarm)

complete("I need a refund!").then(console.log);
```

---

## 🌟 Key Features

- **Agent Orchestration**: Seamlessly switch between agents (e.g., triage → sales) with a single tool call.
- **Shared History**: Agents share a rotating 25-message history, scoped to `assistant` and `user` roles.
- **Custom Tools**: Define tools with validation and execution logic tailored to your needs.
- **Model Recovery**: Automatically rescues invalid outputs with smart fallbacks like "Sorry, I missed that."
- **Dependency Inversion**: Lazy-load agents at runtime for modular, scalable designs.

---

## 🎯 Use Cases

- **Workflow Automation**: Automate customer support with triage, sales, and refund agents.
- **Collaborative AI**: Build systems where agents solve problems together.
- **Task Distribution**: Assign specialized tasks to dedicated agents.
- **Chatbots & Beyond**: Create dynamic, multi-role conversational systems.

---

## 📖 API Highlights

- **`addAgent`**: Define agents with custom prompts, tools, and completions.
- **`addSwarm`**: Group agents into a coordinated network.
- **`session`**: Start a client session with real-time message handling.
- **`addTool`**: Create reusable tools with validation and execution logic.
- **`Storage.take`**: Search and retrieve data using embeddings (e.g., vector search, RAG).

Check out the **[API Reference](https://agent-swarm.github.io/documents/demo_it-consulting-swarm_root_swarm.html)** for more!

---

## 🛠 Advanced Example: Vector Search with Embeddings

Integrate vector search with embeddings (RAG) for smarter agents:

```typescript
import { addAgent, addSwarm, addStorage, addEmbedding, session, Storage } from "agent-swarm-kit";
import { Ollama } from "ollama";

const ollama = new Ollama();

// Define an embedding with similarity calculation
const NOMIC_EMBEDDING = addEmbedding({
  embeddingName: "nomic_embedding",
  calculateSimilarity: (a, b) => {
    return tidy(() => {
      const tensorA = tensor1d(a);
      const tensorB = tensor1d(b);
      const dotProduct = sum(mul(tensorA, tensorB));
      const normA = norm(tensorA);
      const normB = norm(tensorB);
      const cosineData = div(dotProduct, mul(normA, normB)).dataSync();
      const cosineSimilarity = cosineData[0];
      return cosineSimilarity;
    });
  },
  createEmbedding: async (text) => {
    const { embedding } = await ollama.embeddings({
      model: "nomic-embed-text",
      prompt: text,
    });
    return embedding;
  },
});

// Set up storage with sample data
const TEST_STORAGE = addStorage({
  storageName: "test_storage",
  embedding: NOMIC_EMBEDDING,
  createIndex: ({ description }) => description,
  getData: () => JSON.parse(readFileSync("./data.json", "utf8")).slice(0, 100),
});

// Create an agent with storage
const TEST_AGENT = addAgent({
  agentName: "test_agent",
  completion: TEST_COMPLETION
  prompt: "...",
  storages: [TEST_STORAGE],
});

// Build the swarm
const TEST_SWARM = addSwarm({
  swarmName: "test_swarm",
  agentList: [TEST_AGENT],
  defaultAgent: TEST_AGENT,
});

// Talk with a client
const { complete } = session("client-123", TEST_SWARM);
complete("I need a refund!").then(console.log);

...

export interface PhoneModel {
    id: number;
    title: string;
    description: string;
    diagonal: number;
}

// Use vector search in a tool call
Storage.take<PhoneModel>({
  search: "8 inch phone",
  agentName: AgentName.TestAgent,
  clientId,
  storageName: StorageName.PhoneStorage,
  total: 1,
  score: 0.68,
}).then((phones) => console.log(phones));
```

## ❓ Orchestration Principles

1. Several chatgpt sessions (agents) [execute tool calls](https://ollama.com/blog/tool-support). Each agent can use different model, for example, [mistral 7b](https://ollama.com/library/mistral) for small talk, [nemotron](https://ollama.com/library/nemotron) for business conversation

2. The agent swarm navigate messages to the active chatgpt session (agent) for each `WebSocket` channel [by using `clientId` url parameter](src/routes/session.ts#L5)

3. The active chatgpt session (agent) in the swarm could be changed [by executing function tool](https://platform.openai.com/docs/assistants/tools/function-calling) 

4. Each client sessions [share the same chat message history](https://platform.openai.com/docs/api-reference/messages/getMessage) for all agents. Each client chat history keep the last 25 messages with rotation. Only `assistant` and `user` messages are shared between chatgpt sessions (agents), the `system` and `tool` messages are agent-scoped so each agent knows only those tools related to It. As a result, each chatgpt session (agent) has it's [unique system prompt](https://platform.openai.com/docs/api-reference/messages/createMessage#messages-createmessage-role)

5. If the agent output do not pass the validation (not existing tool call, tool call with invalid arguments, empty output, XML tags in output or JSON in output by default), the resque algorithm will try to fix the model. At first it will hide the previos messeges from a model, if this will not help, it return a placeholder like `Sorry, I missed that. Could you say it again?`


---

## ✅ Tested & Reliable

`agent-swarm-kit` comes with a robust test suite covering:
- **Validation**: Ensures all components (agents, tools, swarms) are properly configured.
- **Recovery**: Handles edge cases like invalid tool calls or empty outputs.
- **Navigation**: Smoothly switches between agents without deadlocks.
- **Performance**: Efficient connection disposal and history management.

See the **[Test Cases](https://github.com/tripolskypetr/agent-swarm-kit/blob/master/TEST.md)** section in the docs for details.

---

## 🤝 Contribute

We’d love your input! Fork the repo, submit a PR, or open an issue on **[GitHub](https://github.com/tripolskypetr/agent-swarm-kit)**.

---

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
