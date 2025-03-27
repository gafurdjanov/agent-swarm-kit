import { dumpDocs } from "agent-swarm-kit";
import plantuml from "plantuml";

import "./lib/swarm";

await dumpDocs("demo/binance-candle-chat", './docs/chat', plantuml);

process.kill(process.pid);
