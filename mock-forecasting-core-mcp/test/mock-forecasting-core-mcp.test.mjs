import assert from "node:assert/strict";
import test from "node:test";
import { callTool, handleHttpRequest, resetState } from "../src/mock-mcp-core.mjs";

test("lists production-like OFSC acquisition tools", async () => {
  const response = await handleHttpRequest(new Request("http://localhost/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "tools/list" })
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.result.tools.map((tool) => tool.name).sort(), [
    "get_activities",
    "get_activity_work_skills",
    "get_capacity_areas",
    "get_resource_descendants",
    "get_resource_locations",
    "get_resource_types"
  ]);
});

test("capacity areas and resource types match metadata contracts", async () => {
  resetState();
  const areas = await callTool("get_capacity_areas", { fields: "label,name,type,status,parent.label", expand: "parent" });
  const activeAreas = areas.items.filter((item) => item.type === "area");
  assert.equal(activeAreas.length, 5);
  assert.ok(activeAreas.some((item) => item.label === "FL" && item.name === "Florida"));
  assert.ok(activeAreas.some((item) => item.label === "CA" && item.name === "California"));
  assert.ok(activeAreas.some((item) => item.label === "TX" && item.name === "Texas"));
  assert.equal(activeAreas.every((item) => item.parent?.label === "US_FIELD_SERVICE"), true);

  const types = await callTool("get_resource_types", {});
  const fieldTypes = types.items.filter((item) => item.role === "fieldResource").map((item) => item.label).sort();
  assert.deepEqual(fieldTypes, ["CONTRACTOR", "TECH"]);
});

test("resource descendants expand work skills and schedules without capacity convenience fields", async () => {
  resetState();
  const result = await callTool("get_resource_descendants", {
    resourceId: "FL",
    fields: "resourceId,resourceType,status",
    expand: "workSkills,workSchedules"
  });
  assert.ok(result.items.length > 5);
  const fieldResource = result.items.find((item) => item.resourceType === "TECH");
  assert.ok(fieldResource);
  assert.ok(Array.isArray(fieldResource.workSkills.items));
  assert.ok(Array.isArray(fieldResource.workSchedules.items));
  assert.equal(Object.hasOwn(fieldResource, "capacityArea"), false);
  assert.equal(Object.hasOwn(fieldResource, "capacityCategory"), false);
});

test("activities support resource, date, q, and fields filters for 30-day windows", async () => {
  resetState();
  const descendants = await callTool("get_resource_descendants", {
    resourceId: "FL",
    fields: "resourceId,resourceType,status",
    expand: "workSkills,workSchedules"
  });
  const resourceIds = descendants.items
    .filter((item) => ["TECH", "CONTRACTOR"].includes(item.resourceType) && item.status === "active")
    .map((item) => item.resourceId);
  const activities = await callTool("get_activities", {
    resources: resourceIds,
    dateFrom: "2026-04-27",
    dateTo: "2026-05-26",
    q: "status=='complete'",
    fields: "activityId,resourceId,timeSlot,status,latitude,longitude,timeOfBooking,timeOfAssignment,duration,date,slaWindowStart,slaWindowEnd"
  });
  assert.ok(activities.items.length > 0);
  assert.equal(activities.items.every((item) => item.status === "complete"), true);
  assert.equal(activities.items.every((item) => resourceIds.includes(item.resourceId)), true);
  assert.equal(Object.hasOwn(activities.items[0], "capacityArea"), false);
  assert.equal(Object.hasOwn(activities.items[0], "requiredWorkSkills"), false);
});

test("resource locations and activity work skills are returned by per-record calls", async () => {
  resetState();
  const descendants = await callTool("get_resource_descendants", {
    resourceId: "TX",
    fields: "resourceId,resourceType,status",
    expand: "workSkills,workSchedules"
  });
  const resource = descendants.items.find((item) => item.resourceType === "TECH" && item.status === "active");
  const locations = await callTool("get_resource_locations", { resourceId: resource.resourceId });
  assert.equal(locations.totalResults, 1);
  assert.equal(typeof locations.items[0].latitude, "number");
  assert.equal(typeof locations.items[0].longitude, "number");

  const activities = await callTool("get_activities", {
    resources: [resource.resourceId],
    q: "status=='complete'",
    limit: 1,
    fields: "activityId,resourceId,status,date"
  });
  const skills = await callTool("get_activity_work_skills", { activityId: activities.items[0].activityId });
  assert.equal(skills.totalResults, 2);
  assert.ok(skills.items[0].label);
});

test("REST-style debug endpoints share tool handlers", async () => {
  const areas = await handleHttpRequest(new Request("http://localhost/rest/ofscMetadata/v1/capacityAreas?fields=label,name,type,status&expand=parent"));
  assert.equal(areas.status, 200);
  const areaBody = await areas.json();
  assert.ok(areaBody.items.some((item) => item.label === "FL"));

  const types = await handleHttpRequest(new Request("http://localhost/rest/ofscMetadata/v1/resourceTypes"));
  assert.equal(types.status, 200);
  const typeBody = await types.json();
  assert.ok(typeBody.items.some((item) => item.role === "fieldResource"));

  const descendants = await handleHttpRequest(new Request("http://localhost/rest/ofscCore/v1/resources/FL/descendants?fields=resourceId,resourceType,status&expand=workSkills,workSchedules"));
  assert.equal(descendants.status, 200);
  const descendantBody = await descendants.json();
  const resourceId = descendantBody.items.find((item) => item.resourceType === "TECH").resourceId;

  const locations = await handleHttpRequest(new Request(`http://localhost/rest/ofscCore/v1/resources/${resourceId}/locations`));
  assert.equal(locations.status, 200);
  const locationBody = await locations.json();
  assert.equal(locationBody.items.length, 1);

  const activities = await handleHttpRequest(new Request(`http://localhost/rest/ofscCore/v1/activities?resources=${resourceId}&dateFrom=2026-04-27&dateTo=2026-05-26&q=status=='complete'&fields=activityId,resourceId,status,date`));
  assert.equal(activities.status, 200);
  const activityBody = await activities.json();
  assert.ok(activityBody.items.length > 0);

  const workSkills = await handleHttpRequest(new Request(`http://localhost/rest/ofscCore/v1/activities/${activityBody.items[0].activityId}/workSkills`));
  assert.equal(workSkills.status, 200);
  const workSkillBody = await workSkills.json();
  assert.equal(workSkillBody.items.length, 2);
});
