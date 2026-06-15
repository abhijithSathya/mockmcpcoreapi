import assert from "node:assert/strict";
import test from "node:test";
import { callTool, handleHttpRequest, resetState } from "../src/mock-mcp-core.mjs";

test("lists only granular core entity tools", async () => {
  const response = await handleHttpRequest(new Request("http://localhost/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "tools/list" })
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.result.tools.map((tool) => tool.name).sort(), [
    "get_activities",
    "get_resource_locations",
    "get_resources"
  ]);
});

test("activities return REST-style raw activity envelope", async () => {
  resetState();
  const result = await callTool("get_activities", {
    capacityAreas: ["FL"],
    statuses: ["completed"],
    limit: 5,
    fields: ["activityId", "resourceId", "status", "duration", "travelTime", "latitude", "longitude", "capacityCategory"]
  });
  assert.equal(result.items.length, 5);
  assert.equal(result.limit, 5);
  assert.equal(result.offset, 0);
  assert.equal(result.hasMore, true);
  assert.equal(result.items.every((item) => item.status === "completed"), true);
  assert.equal(typeof result.items[0].duration, "number");
  assert.equal(typeof result.items[0].travelTime, "number");
  assert.equal(typeof result.items[0].latitude, "number");
  assert.equal(Object.hasOwn(result.items[0], "recommendationId"), false);
  assert.equal(Object.hasOwn(result.items[0], "activityToProximityRatio"), false);
});

test("resources and resource locations expose data needed for workflow-side proximity calculations", async () => {
  resetState();
  const resources = await callTool("get_resources", {
    capacityAreas: ["FL"],
    capacityCategories: ["CC_HVAC"],
    limit: 10
  });
  assert.ok(resources.items.length >= 2);
  assert.equal(resources.totalResults, resources.items.length);
  assert.equal(resources.items.every((item) => item.status === "active"), true);
  assert.ok(resources.items[0].workSkills.length > 0);

  const locations = await callTool("get_resource_locations", { resourceId: resources.items[0].resourceId });
  assert.equal(locations.totalResults, 1);
  assert.equal(locations.items[0].locationType, "home");
  assert.equal(typeof locations.items[0].latitude, "number");
  assert.equal(typeof locations.items[0].longitude, "number");
});

test("REST-style debug endpoints share tool handlers", async () => {
  const activities = await handleHttpRequest(new Request("http://localhost/rest/ofscCore/v1/activities?limit=2&capacityAreas=FL"));
  assert.equal(activities.status, 200);
  const activityBody = await activities.json();
  assert.equal(activityBody.items.length, 2);

  const resources = await handleHttpRequest(new Request("http://localhost/rest/ofscCore/v1/resources?limit=1&capacityAreas=FL"));
  assert.equal(resources.status, 200);
  const resourceBody = await resources.json();
  assert.equal(resourceBody.items.length, 1);

  const resourceId = resourceBody.items[0].resourceId;
  const locations = await handleHttpRequest(new Request(`http://localhost/rest/ofscCore/v1/resources/${resourceId}/locations`));
  assert.equal(locations.status, 200);
  const locationBody = await locations.json();
  assert.equal(locationBody.items.length, 1);
});
