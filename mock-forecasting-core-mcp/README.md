# Forecasting Core Entity Mock MCP

Mock MCP server for the Forecasting 2.0 proof of concept where workflows calculate landing-page capacity issues and hire recommendations from granular entity data.

This package is separate from `mock-forecasting-mcp`. The older mock returns computed workforce metrics and recommendations. This mock exposes raw production-like data tools modeled after Oracle Field Service public REST APIs:

```text
get_capacity_areas
get_resource_types
get_resource_descendants
get_activities
get_resource_locations
get_activity_work_skills
```

The mock data includes five capacity areas, resource types, field-resource descendants with expanded work skills and work schedules, resource locations, 90 days of completed activities, and per-activity work skills. It intentionally does not return precomputed issue ranks, hire options, capacity buckets on activities, top-level skills on generic resource responses, proximity grids, simulations, recommendation text, or impact summaries.

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
GET /rest/ofscMetadata/v1/capacityAreas
GET /rest/ofscMetadata/v1/resourceTypes
GET /rest/ofscCore/v1/activities
GET /rest/ofscCore/v1/resources/{resourceId}/descendants
GET /rest/ofscCore/v1/resources/{resourceId}/locations
GET /rest/ofscCore/v1/activities/{activityId}/workSkills
```

They share the same mock handlers as the MCP tools.
