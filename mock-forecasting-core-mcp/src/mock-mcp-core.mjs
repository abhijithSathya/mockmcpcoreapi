import { createSeedData } from "./mock-data.mjs";

const SERVICE_NAME = "forecasting-core-entity-mock-mcp";
const SERVICE_VERSION = "0.1.0";
const BASE_NOW = "2026-05-26T10:30:00Z";
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const sseClients = new Map();
const mcpEvents = [];
let state = createSeedData();

class ToolError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function resetState() {
  mcpEvents.length = 0;
  state = createSeedData();
  return getPublicState();
}

export function getPublicState() {
  return {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    generatedAt: BASE_NOW,
    dataset: {
      activities: state.activities.length,
      resources: state.resources.length,
      resourceLocations: Object.values(state.locationsByResourceId).flat().length,
      capacityAreas: [...new Set(state.resources.map((resource) => resource.capacityArea))].sort(),
      capacityCategories: [...new Set(state.resources.map((resource) => resource.capacityCategory))].sort()
    },
    toolCount: Object.keys(TOOL_METADATA).length,
    tools: Object.keys(TOOL_METADATA)
  };
}

export async function handleHttpRequest(request, env = {}) {
  const url = new URL(request.url);
  const acceptHeader = request.headers.get("accept") || "";

  recordMcpEvent("http.request", {
    method: request.method,
    path: url.pathname,
    accept: acceptHeader,
    userAgent: request.headers.get("user-agent")
  });

  if (request.method === "OPTIONS") return responseJson({}, 204);

  if (env.MOCK_MCP_TOKEN) {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (token !== env.MOCK_MCP_TOKEN) {
      return responseJson({ error: "unauthorized", message: "Missing or invalid bearer token." }, 401);
    }
  }

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      return responseJson({ ok: true, service: SERVICE_NAME, version: SERVICE_VERSION, generatedAt: BASE_NOW });
    }

    if (request.method === "GET" && url.pathname === "/" && acceptHeader.includes("text/event-stream")) {
      return responseMcpSse(url);
    }

    if (request.method === "GET" && url.pathname === "/") {
      return responseJson({
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        contract: "Forecasting 2.0 granular entity MCP facade for public OFSC REST-style data",
        endpoints: [
          "GET /health",
          "GET /tools",
          "POST /tools/{toolName}",
          "GET /mcp",
          "POST /mcp",
          "GET /sse",
          "POST /messages?sessionId=...",
          "GET /mock/state",
          "POST /mock/reset",
          "GET /rest/ofscCore/v1/activities",
          "GET /rest/ofscCore/v1/resources",
          "GET /rest/ofscCore/v1/resources/{resourceId}/locations"
        ]
      });
    }

    if (request.method === "GET" && url.pathname === "/tools") return responseJson({ tools: listTools() });
    if (request.method === "GET" && url.pathname === "/mock/state") return responseJson(getPublicState());
    if (request.method === "GET" && url.pathname === "/mock/mcp-events") return responseJson({ events: mcpEvents.slice(-100) });
    if (request.method === "POST" && url.pathname === "/mock/reset") return responseJson({ reset: true, state: resetState() });

    if (request.method === "GET" && url.pathname === "/rest/ofscCore/v1/activities") {
      return responseJson(getActivities(Object.fromEntries(url.searchParams)));
    }

    if (request.method === "GET" && url.pathname === "/rest/ofscCore/v1/resources") {
      return responseJson(getResources(Object.fromEntries(url.searchParams)));
    }

    const locationMatch = url.pathname.match(/^\/rest\/ofscCore\/v1\/resources\/([^/]+)\/locations$/);
    if (request.method === "GET" && locationMatch) {
      return responseJson(getResourceLocations({ resourceId: decodeURIComponent(locationMatch[1]) }));
    }

    if (request.method === "GET" && url.pathname === "/mcp") {
      return responseSse([{ event: "endpoint", data: { jsonrpc: "2.0", service: SERVICE_NAME, version: SERVICE_VERSION, endpoint: "/mcp" } }]);
    }

    if (request.method === "GET" && ["/sse", "/sse/sse", "/mcp/sse"].includes(url.pathname)) {
      return responseMcpSse(url);
    }

    if (request.method === "POST" && url.pathname === "/messages") {
      const sessionId = url.searchParams.get("sessionId");
      const client = sessionId ? sseClients.get(sessionId) : null;
      const payload = await readJson(request);
      recordMcpEvent("sse.message.received", {
        sessionId,
        foundSession: Boolean(client),
        method: Array.isArray(payload) ? payload.map((item) => item?.method) : payload?.method,
        id: Array.isArray(payload) ? payload.map((item) => item?.id) : payload?.id
      });
      if (!client) return responseJson({ error: "unknown_session", message: "Unknown or expired SSE session." }, 404);
      const result = await handleMcp(payload);
      if (result !== null) sendSse(client.controller, "message", result);
      return responseEmpty(202);
    }

    if (request.method === "POST" && url.pathname === "/mcp") {
      const payload = await readJson(request);
      const result = await handleMcp(payload);
      if (result === null) return responseEmpty(202);
      return responseJson(result);
    }

    if (request.method === "POST" && url.pathname.startsWith("/tools/")) {
      const toolName = decodeURIComponent(url.pathname.slice("/tools/".length));
      return responseJson(await callTool(toolName, await readJson(request)));
    }

    return responseJson({ error: "not_found", message: `No route for ${request.method} ${url.pathname}` }, 404);
  } catch (error) {
    if (error instanceof ToolError) {
      return responseJson({ error: error.code, message: error.message, details: error.details }, 400);
    }
    return responseJson({ error: "internal_error", message: error.message }, 500);
  }
}

async function handleMcp(payload) {
  if (Array.isArray(payload)) {
    const responses = [];
    for (const request of payload) {
      const response = await handleMcp(request);
      if (response) responses.push(response);
    }
    return responses;
  }

  if (!payload || payload.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id: payload?.id ?? null, error: { code: -32600, message: "Invalid JSON-RPC 2.0 request." } };
  }

  if (payload.method === "notifications/initialized") return null;

  if (payload.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: payload.id ?? null,
      result: {
        protocolVersion: negotiateProtocolVersion(payload.params?.protocolVersion),
        serverInfo: { name: SERVICE_NAME, version: SERVICE_VERSION },
        capabilities: { tools: {} }
      }
    };
  }

  if (payload.method === "tools/list") {
    return { jsonrpc: "2.0", id: payload.id ?? null, result: { tools: listTools() } };
  }

  if (payload.method === "tools/call") {
    const result = await callTool(payload.params?.name, payload.params?.arguments || {});
    return {
      jsonrpc: "2.0",
      id: payload.id ?? null,
      result: {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      }
    };
  }

  return { jsonrpc: "2.0", id: payload.id ?? null, error: { code: -32601, message: `Unsupported method ${payload.method}` } };
}

function negotiateProtocolVersion(requestedVersion) {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion) ? requestedVersion : "2025-03-26";
}

export async function callTool(name, args = {}) {
  const tool = TOOL_HANDLERS[name];
  if (!tool) {
    throw new ToolError("unknown_tool", `Unknown tool: ${name}`, { supportedTools: Object.keys(TOOL_HANDLERS) });
  }
  return tool(args || {});
}

const TOOL_METADATA = {
  get_activities: {
    description: "Return granular activity records modeled after GET /rest/ofscCore/v1/activities. No forecasting metrics or recommendations are computed.",
    inputSchema: {
      type: "object",
      properties: {
        dateFrom: { type: "string", description: "Inclusive scheduled date lower bound in YYYY-MM-DD format." },
        dateTo: { type: "string", description: "Inclusive scheduled date upper bound in YYYY-MM-DD format." },
        resources: arrayOrString("Comma-separated or array resource IDs."),
        q: { type: "string", description: "Small mock subset of OFSC q syntax, supporting equality and simple IN filters." },
        fields: arrayOrString("Comma-separated or array field names to return."),
        limit: { type: "integer", description: "Maximum activities to return." },
        offset: { type: "integer", description: "Zero-based offset." },
        statuses: arrayOrString("Optional status filter for workflow convenience."),
        capacityAreas: arrayOrString("Optional capacity area filter for workflow convenience."),
        capacityCategories: arrayOrString("Optional capacity category filter for workflow convenience.")
      }
    }
  },
  get_resources: {
    description: "Return granular resource records modeled after GET /rest/ofscCore/v1/resources. No utilization or capacity scoring is computed.",
    inputSchema: {
      type: "object",
      properties: {
        fields: arrayOrString("Comma-separated or array field names to return."),
        limit: { type: "integer" },
        offset: { type: "integer" },
        statuses: arrayOrString("Resource statuses such as active or inactive."),
        resourceTypes: arrayOrString("Resource types such as field_resource."),
        parentResourceId: { type: "string" },
        capacityAreas: arrayOrString("Optional capacity area filter for workflow convenience."),
        capacityCategories: arrayOrString("Optional capacity category filter for workflow convenience."),
        skillCodes: arrayOrString("Optional work skill filter for workflow convenience.")
      }
    }
  },
  get_resource_locations: {
    description: "Return resource location records modeled after GET /rest/ofscCore/v1/resources/{resourceId}/locations.",
    inputSchema: {
      type: "object",
      required: ["resourceId"],
      properties: {
        resourceId: { type: "string", description: "External resource identifier." },
        fields: arrayOrString("Comma-separated or array field names to return.")
      }
    }
  }
};

const TOOL_HANDLERS = {
  get_activities: getActivities,
  get_resources: getResources,
  get_resource_locations: getResourceLocations
};

function listTools() {
  return Object.entries(TOOL_METADATA).map(([name, metadata]) => ({
    name,
    description: metadata.description,
    inputSchema: metadata.inputSchema
  }));
}

function getActivities(args = {}) {
  const offset = clampInteger(args.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = clampInteger(args.limit, 100, 1, 100000);
  const fields = normalizeList(args.fields);
  let items = state.activities.slice();

  const resources = normalizeList(args.resources);
  if (resources.length) items = items.filter((item) => resources.includes(item.resourceId));
  const statuses = normalizeList(args.statuses);
  if (statuses.length) items = items.filter((item) => statuses.includes(item.status));
  const capacityAreas = normalizeList(args.capacityAreas);
  if (capacityAreas.length) items = items.filter((item) => capacityAreas.includes(item.capacityArea));
  const capacityCategories = normalizeList(args.capacityCategories);
  if (capacityCategories.length) items = items.filter((item) => capacityCategories.includes(item.capacityCategory));
  if (args.dateFrom) items = items.filter((item) => item.date >= args.dateFrom);
  if (args.dateTo) items = items.filter((item) => item.date <= args.dateTo);
  if (args.q) items = applyMockQuery(items, args.q);

  const paged = items.slice(offset, offset + limit).map((item) => projectFields(item, fields));
  return {
    items: paged,
    offset,
    limit,
    hasMore: offset + paged.length < items.length,
    expression: args.q || undefined
  };
}

function getResources(args = {}) {
  const offset = clampInteger(args.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = clampInteger(args.limit, 100, 1, 100000);
  const fields = normalizeList(args.fields);
  let items = state.resources.slice();

  const statuses = normalizeList(args.statuses);
  if (statuses.length) items = items.filter((item) => statuses.includes(item.status));
  const resourceTypes = normalizeList(args.resourceTypes);
  if (resourceTypes.length) items = items.filter((item) => resourceTypes.includes(item.resourceType));
  const capacityAreas = normalizeList(args.capacityAreas);
  if (capacityAreas.length) items = items.filter((item) => capacityAreas.includes(item.capacityArea));
  const capacityCategories = normalizeList(args.capacityCategories);
  if (capacityCategories.length) items = items.filter((item) => capacityCategories.includes(item.capacityCategory));
  const skillCodes = normalizeList(args.skillCodes);
  if (skillCodes.length) items = items.filter((item) => skillCodes.some((skill) => item.workSkills.includes(skill)));
  if (args.parentResourceId) items = items.filter((item) => item.parentResourceId === args.parentResourceId);

  const paged = items.slice(offset, offset + limit).map((item) => projectFields(item, fields));
  return { items: paged, offset, limit, totalResults: items.length };
}

function getResourceLocations(args = {}) {
  if (!args.resourceId) {
    throw new ToolError("missing_resource_id", "resourceId is required.");
  }
  const fields = normalizeList(args.fields);
  const items = state.locationsByResourceId[args.resourceId];
  if (!items) {
    throw new ToolError("resource_not_found", `No mock resource exists for resourceId ${args.resourceId}.`);
  }
  return {
    items: items.map((item) => projectFields(item, fields)),
    totalResults: items.length
  };
}

function applyMockQuery(items, query) {
  const equality = query.match(/^\s*([A-Za-z0-9_.]+)\s*==\s*'([^']*)'\s*$/);
  if (equality) {
    const [, field, value] = equality;
    return items.filter((item) => String(readField(item, field) ?? "").toLowerCase() === value.toLowerCase());
  }
  const inList = query.match(/^\s*([A-Za-z0-9_.]+)\s+in\s+\[([^\]]+)\]\s*$/i);
  if (inList) {
    const [, field, valuesText] = inList;
    const values = valuesText.split(",").map((value) => value.trim().replace(/^'|'$/g, "").toLowerCase());
    return items.filter((item) => values.includes(String(readField(item, field) ?? "").toLowerCase()));
  }
  return items;
}

function readField(item, path) {
  return path.split(".").reduce((value, key) => value?.[key], item);
}

function projectFields(item, fields) {
  if (!fields.length) return { ...item };
  const projected = {};
  for (const field of fields) {
    if (Object.hasOwn(item, field)) projected[field] = item[field];
  }
  return projected;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function clampInteger(value, defaultValue, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}

function arrayOrString(description) {
  return {
    description,
    oneOf: [
      { type: "array", items: { type: "string" } },
      { type: "string" }
    ]
  };
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

function responseJson(payload, status = 200) {
  const headers = corsHeaders({ "content-type": "application/json; charset=utf-8" });
  return new Response(status === 204 ? null : JSON.stringify(payload, null, 2), { status, headers });
}

function responseEmpty(status = 204) {
  return new Response(null, { status, headers: corsHeaders() });
}

function responseSse(events) {
  const body = events.map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`).join("");
  return new Response(body, { status: 200, headers: corsHeaders({ "content-type": "text/event-stream; charset=utf-8" }) });
}

function responseMcpSse(url) {
  const sessionId = crypto.randomUUID();
  const stream = new ReadableStream({
    start(controller) {
      sseClients.set(sessionId, { controller, createdAt: new Date().toISOString() });
      sendSse(controller, "endpoint", `/messages?sessionId=${encodeURIComponent(sessionId)}`);
      recordMcpEvent("sse.open", { sessionId, path: url.pathname });
    },
    cancel() {
      sseClients.delete(sessionId);
      recordMcpEvent("sse.cancel", { sessionId });
    }
  });
  return new Response(stream, {
    status: 200,
    headers: corsHeaders({
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive"
    })
  });
}

function sendSse(controller, event, data) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${payload}\n\n`));
}

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,mcp-protocol-version",
    ...extra
  };
}

function recordMcpEvent(type, details = {}) {
  mcpEvents.push({ at: new Date().toISOString(), type, details });
  if (mcpEvents.length > 500) mcpEvents.splice(0, mcpEvents.length - 500);
}
