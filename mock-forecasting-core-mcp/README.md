# Forecasting Core Entity Mock MCP

Mock MCP server for the Forecasting 2.0 proof of concept where workflows calculate landing-page capacity issues and hire recommendations from granular entity data.

This package is separate from `mock-forecasting-mcp`. The older mock returns computed workforce metrics and recommendations. This mock exposes only three raw data tools modeled after Oracle Field Service public REST APIs:

```text
get_activities
get_resources
get_resource_locations
```

The mock data includes activities, resources, capacity categories, skills, and home locations needed for workflow-side grid, proximity, activity/proximity ratio, and hire-location calculations. It intentionally does not return precomputed issue ranks, hire options, proximity grids, simulations, recommendation text, or impact summaries.

## Run Locally

```bash
npm install
npm start
```

Default local URL:

```text
http://localhost:8787
```

## Render

Use `render.yaml` in this folder. The service root is:

```text
mock-forecasting-core-mcp
```

Health check:

```text
/health
```

## MCP Endpoints

```text
GET  /health
GET  /tools
GET  /mcp
POST /mcp
GET  /sse
POST /messages?sessionId=...
POST /tools/{toolName}
GET  /mock/state
POST /mock/reset
```

## REST-Style Debug Endpoints

These are available for local inspection and mirror the public REST paths used as the contract reference:

```text
GET /rest/ofscCore/v1/activities
GET /rest/ofscCore/v1/resources
GET /rest/ofscCore/v1/resources/{resourceId}/locations
```

They share the same mock handlers as the MCP tools.
