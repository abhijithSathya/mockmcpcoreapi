const BASE_DATE = "2026-05-26";

const CAPACITY_AREAS = [
  { label: "FL", name: "Florida", type: "area", status: "active", parent: { label: "US_FIELD_SERVICE", name: "US Field Service" } },
  { label: "CA", name: "California", type: "area", status: "active", parent: { label: "US_FIELD_SERVICE", name: "US Field Service" } },
  { label: "TX", name: "Texas", type: "area", status: "active", parent: { label: "US_FIELD_SERVICE", name: "US Field Service" } },
  { label: "GA", name: "Georgia", type: "area", status: "active", parent: { label: "US_FIELD_SERVICE", name: "US Field Service" } },
  { label: "AZ", name: "Arizona", type: "area", status: "active", parent: { label: "US_FIELD_SERVICE", name: "US Field Service" } },
  { label: "US_FIELD_SERVICE", name: "US Field Service", type: "group", status: "active" }
];

const RESOURCE_TYPES = [
  { label: "BK", name: "Bucket", active: true, role: "bucket" },
  { label: "GR", name: "Group", active: true, role: "organizationUnit" },
  { label: "TR", name: "Truck", active: true, role: "vehicle" },
  { label: "TECH", name: "Technician", active: true, role: "fieldResource" },
  { label: "CONTRACTOR", name: "Contractor", active: true, role: "fieldResource" }
];

const AREAS = [
  { label: "FL", cities: [["Orlando", "FL", "328", 28.5383, -81.3792], ["Tampa", "FL", "336", 27.9506, -82.4572]], resources: 8, monthly: [24, 34, 48], skills: ["HVAC", "APPLIANCE", "PLUMBING"] },
  { label: "CA", cities: [["Los Angeles", "CA", "900", 34.0522, -118.2437], ["San Diego", "CA", "921", 32.7157, -117.1611]], resources: 6, monthly: [20, 26, 34], skills: ["HVAC", "ELECTRICAL", "APPLIANCE"] },
  { label: "TX", cities: [["Austin", "TX", "787", 30.2672, -97.7431], ["Dallas", "TX", "752", 32.7767, -96.797]], resources: 6, monthly: [18, 24, 32], skills: ["HVAC", "PLUMBING", "ELECTRICAL"] },
  { label: "GA", cities: [["Atlanta", "GA", "303", 33.749, -84.388], ["Savannah", "GA", "314", 32.0809, -81.0912]], resources: 5, monthly: [16, 18, 22], skills: ["APPLIANCE", "PLUMBING"] },
  { label: "AZ", cities: [["Phoenix", "AZ", "850", 33.4484, -112.074], ["Tucson", "AZ", "857", 32.2226, -110.9747]], resources: 5, monthly: [14, 18, 20], skills: ["HVAC", "ELECTRICAL"] }
];

const SKILL_DETAILS = {
  HVAC: { label: "HVAC", name: "HVAC Service", ratio: 100 },
  APPLIANCE: { label: "APPLIANCE", name: "Appliance Repair", ratio: 90 },
  PLUMBING: { label: "PLUMBING", name: "Plumbing", ratio: 95 },
  ELECTRICAL: { label: "ELECTRICAL", name: "Electrical Diagnostics", ratio: 85 }
};

export function createSeedData() {
  const resourcesByArea = {};
  const locationsByResourceId = {};
  const activityWorkSkillsByActivityId = {};
  const activities = [];
  let activityId = 4225000;
  let locationId = 9100000;

  for (const area of AREAS) {
    const list = [];
    list.push({ resourceId: `${area.label}_BUCKET`, resourceType: "BK", status: "active", name: `${area.label} Bucket` });
    for (let i = 0; i < area.resources; i += 1) {
      const city = area.cities[i % area.cities.length];
      const resourceType = i % 5 === 4 ? "CONTRACTOR" : "TECH";
      const resourceId = `${area.label}_TECH_${String(i + 1).padStart(2, "0")}`;
      const skillA = area.skills[i % area.skills.length];
      const skillB = area.skills[(i + 1) % area.skills.length];
      const resource = {
        resourceId,
        resourceType,
        status: i % 11 === 10 ? "inactive" : "active",
        name: `${city[0]} Tech ${i + 1}`,
        workSkills: { items: [skillItem(skillA), skillItem(skillB, 70)] },
        workSchedules: { items: scheduleItems(area.label, i) }
      };
      list.push(resource);
      locationsByResourceId[resourceId] = [{
        locationId: locationId++,
        label: `${resourceId}_HOME`,
        status: "active",
        locationType: "home",
        address: `${100 + i} ${city[0]} Service Rd`,
        city: city[0],
        state: city[1],
        postalCode: `${city[2]}${String(i).padStart(2, "0")}`,
        country: "US",
        latitude: round(city[3] + ((i % 5) - 2) * 0.025),
        longitude: round(city[4] - ((i % 4) - 1) * 0.025),
        startDate: addDays(BASE_DATE, -365),
        endDate: addDays(BASE_DATE, 365)
      }];
    }
    resourcesByArea[area.label] = list;
    createActivitiesForArea(area, list.filter((r) => ["TECH", "CONTRACTOR"].includes(r.resourceType)), activities, activityWorkSkillsByActivityId, () => activityId++);
  }

  return {
    capacityAreas: CAPACITY_AREAS,
    resourceTypes: RESOURCE_TYPES,
    resourcesByArea,
    locationsByResourceId,
    activities,
    activityWorkSkillsByActivityId
  };
}

function createActivitiesForArea(area, resources, activities, workSkillsByActivityId, nextActivityId) {
  for (let month = 0; month < 3; month += 1) {
    const count = area.monthly[month];
    const monthStart = addDays(BASE_DATE, -89 + month * 30);
    for (let i = 0; i < count; i += 1) {
      const resource = resources[i % resources.length];
      const city = area.cities[i % area.cities.length];
      const skill = area.skills[(i + month) % area.skills.length];
      const date = addDays(monthStart, i % 30);
      const id = String(nextActivityId());
      const lead = month === 2 ? 5 + (i % 4) : month === 1 ? 3 + (i % 3) : 2 + (i % 2);
      activities.push({
        activityId: id,
        resourceId: resource.resourceId,
        timeSlot: ["08-12", "12-17", "17-20"][i % 3],
        status: "complete",
        latitude: round(city[3] + ((i % 9) - 4) * 0.007),
        longitude: round(city[4] - ((i % 9) - 4) * 0.007),
        timeOfBooking: `${addDays(date, -lead)} 09:00:00`,
        timeOfAssignment: `${addDays(date, -Math.max(1, lead - 1))} 10:30:00`,
        duration: 75 + (i % 5) * 20,
        date,
        slaWindowStart: `${date} 08:00:00`,
        slaWindowEnd: `${addDays(date, 2 + (i % 4))} 18:00:00`
      });
      workSkillsByActivityId[id] = { items: [skillItem(skill), skillItem(area.skills[(i + 1) % area.skills.length], 50)], totalResults: 2 };
    }
  }
}

function skillItem(label, ratio) {
  const base = SKILL_DETAILS[label] || { label, name: label, ratio: 100 };
  return { label: base.label, name: base.name, ratio: ratio ?? base.ratio };
}

function scheduleItems(areaLabel, index) {
  return [0, 1, 2, 3, 4].map((day) => ({
    recordType: "regular",
    weekday: day + 1,
    startTime: "08:00:00",
    endTime: "17:00:00",
    scheduleLabel: `${areaLabel}_WEEKDAY_${index + 1}`
  }));
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function round(value) {
  return Number(value.toFixed(6));
}
