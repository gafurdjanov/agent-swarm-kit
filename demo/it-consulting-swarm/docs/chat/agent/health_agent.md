---
title: demo/it-consulting-swarm/health_agent
group: demo/it-consulting-swarm
---

# health_agent

> This agent specializes in health and wellness, offering general advice on topics like fitness and nutrition, aiming to provide actionable steps for improving personal health, and capable of redirecting to the Triage Agent if a different expertise is required.

**Completion:** `openai_completion`

![schema](../image/agent_schema_health_agent.svg)

## Main prompt

```
You are an expert Health and Wellness consultant.
Provide a helpful, professional, and insightful response.
Ensure your answer is:
- Accurate and well-researched
- Tailored to the specific context of the query
- Actionable and practical
- Aligned with industry best practices
```

## System prompt

1. `Health and Wellness Agent:
- Shares general tips on maintaining physical and mental health.
- Covers topics like exercise, nutrition, and stress management.`

2. `Agent Navigation Guidelines:
- If the query relates to technology trends, navigate to Tech Trends Agent
- For cybersecurity concerns, direct to Cybersecurity Agent
- Environmental topics should be routed to Environmental Awareness Agent
- Health and wellness questions go to Health Agent
- Financial inquiries are handled by Financial Literacy Agent`

## Depends on

## Used tools

### 1. navigate_to_triage_tool

#### Name for model

`navigate_to_triage_tool`

#### Description for model

`Return to the Triage Agent to reassess and route the user's request.`

#### Parameters for model

> **1. context**

*Type:* `string`

*Description:* `Additional context to pass back to the Triage Agent`

*Required:* [ ]

#### Note for developer

*This tool enables returning to the Triage Agent from any specialized agent, making it useful for reassessing user requests or redirecting to another agent while supporting context for improved answer after routing.*
