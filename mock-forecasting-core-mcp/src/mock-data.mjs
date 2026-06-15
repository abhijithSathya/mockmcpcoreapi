const BASE_DATE = "2026-05-26";

const CLUSTERS = [
  {
    area: "FL",
    city: "Orlando",
    state: "FL",
    postalPrefix: "328",
    baseLatitude: 28.5383,
    baseLongitude: -81.3792,
    activityCount: 42,
    resources: 3,
    capacityCategories: ["CC_APPLIANCE", "CC_HVAC"]
  },
  {
    area: "FL",
    city: "Tampa",
    state: "FL",
    postalPrefix: "336",
    baseLatitude: 27.9506,
    baseLongitude: -82.4572,
    activityCount: 36,
    resources: 3,
    capacityCategories: ["CC_HVAC", "CC_APPLIANCE"]
  },
  {
    area: "FL",
    city: "Jacksonville",
    state: "FL",
    postalPrefix: "322",
    baseLatitude: 30.3322,
    baseLongitude: -81.6557,
    activityCount: 30,
    resources: 2,
    capacityCategories: ["CC_PLUMBING", "CC_HVAC"]
  },
  {
    area: "TX",
    city: "Austin",
    state: "TX",
    postalPrefix: "787",
    baseLatitude: 30.2672,
    baseLongitude: -97.7431,
    activityCount: 26,
    resources: 4,
    capacityCategories: ["CC_HVAC", "CC_PLUMBING"]
  },
  {
    area: "GA",
    city: "Atlanta",
    state: "GA",
    postalPrefix: "303",
    baseLatitude: 33.749,
    baseLongitude: -84.388,
    activityCount: 24,
    resources: 4,
    capacityCategories: ["CC_APPLIANCE", "CC_PLUMBING"]
  }
];

const SKILLS_BY_CATEGORY = {
  CC_APPLIANCE: ["APPLIANCE_REPAIR", "PREVENTIVE_MAINTENANCE", "CUSTOMER_PREMISE_EQUIPMENT"],
  CC_HVAC: ["HVAC_SERVICE", "ELECTRICAL_DIAGNOSTICS", "WARRANTY_REPAIRS"],
  CC_PLUMBING: ["PLUMBING", "COMPRESSOR_DIAGNOSTICS", "COMMERCIAL_MAINTENANCE"]
};

export function createSeedData() {
  const resources = [];
  const locationsByResourceId = {};
  const activities = [];
  let resourceInternalId = 8101000;
  let locationId = 9100000;
  let activityId = 7200000;

  for (const cluster of CLUSTERS) {
    for (let index = 0; index < cluster.resources; index += 1) {
      const category = cluster.capacityCategories[index % cluster.capacityCategories.length];
      const resourceId = `${cluster.area.toLowerCase()}_tech_${String(index + 1).padStart(2, "0")}`;
      const latitude = roundCoord(cluster.baseLatitude + resourceOffset(index));
      const longitude = roundCoord(cluster.baseLongitude - resourceOffset(index + 1));
      resources.push({
        resourceId,
        resourceInternalId: resourceInternalId++,
        name: `${cluster.city} Tech ${index + 1}`,
        parentResourceId: `${cluster.area.toLowerCase()}_bucket`,
        resourceType: "field_resource",
        status: "active",
        organization: "OFSC_FORECASTING_DEMO",
        timeZone: timezoneFor(cluster.area),
        timeZoneIANA: timezoneIanaFor(cluster.area),
        timeZoneDiff: timezoneDiffFor(cluster.area),
        language: "en",
        email: `${resourceId}@example.com`,
        capacityArea: cluster.area,
        capacityAreaName: areaName(cluster.area),
        capacityCategory: category,
        capacityCategoryName: categoryName(category),
        workSkills: SKILLS_BY_CATEGORY[category].slice(0, 2),
        weeklyShiftHours: 40
      });
      locationsByResourceId[resourceId] = [
        {
          locationId: locationId++,
          label: `${resourceId}_home`,
          status: "active",
          address: `${100 + index} ${cluster.city} Service Rd`,
          city: cluster.city,
          state: cluster.state,
          postalCode: `${cluster.postalPrefix}${String(index).padStart(2, "0")}`,
          country: "US",
          latitude,
          longitude,
          privateLocationFlag: true,
          locationType: "home"
        }
      ];
    }

    for (let index = 0; index < cluster.activityCount; index += 1) {
      const category = cluster.capacityCategories[index % cluster.capacityCategories.length];
      const assignedResource = resources.find((resource) => (
        resource.capacityArea === cluster.area && resource.capacityCategory === category
      ));
      const dayOffset = index % 28;
      const date = addDays(BASE_DATE, -dayOffset);
      const status = index % 17 === 0 ? "pending" : "completed";
      activities.push({
        activityId: activityId++,
        apptNumber: `${cluster.area}-${activityId}`,
        resourceId: assignedResource?.resourceId,
        date,
        status,
        recordType: "regular",
        activityType: activityTypeFor(category, index),
        duration: durationFor(category, index),
        travelTime: 18 + ((index * 7) % 42),
        latitude: roundCoord(cluster.baseLatitude + activityOffset(index)),
        longitude: roundCoord(cluster.baseLongitude - activityOffset(index + 2)),
        city: cluster.city,
        stateProvince: cluster.state,
        postalCode: `${cluster.postalPrefix}${String(20 + (index % 70)).padStart(2, "0")}`,
        country_code: "US",
        workZone: `${cluster.area}-${cluster.city.toUpperCase().slice(0, 3)}`,
        capacityArea: cluster.area,
        capacityAreaName: areaName(cluster.area),
        capacityCategory: category,
        capacityCategoryName: categoryName(category),
        requiredWorkSkills: SKILLS_BY_CATEGORY[category].slice(0, 2),
        timeOfBooking: `${addDays(date, -bookingLeadDays(cluster.area, dayOffset, index))} 09:00:00`,
        startTime: `${date} ${String(8 + (index % 8)).padStart(2, "0")}:00:00`,
        endTime: `${date} ${String(10 + (index % 8)).padStart(2, "0")}:00:00`,
        slaWindowStart: `${date} 08:00:00`,
        slaWindowEnd: `${addDays(date, 3 + (index % 5))} 18:00:00`,
        timeZone: timezoneFor(cluster.area),
        timeZoneIANA: timezoneIanaFor(cluster.area)
      });
    }
  }

  return { activities, resources, locationsByResourceId };
}

function activityOffset(index) {
  const ring = (index % 9) - 4;
  const spread = (Math.floor(index / 9) % 5) * 0.006;
  return ring * 0.008 + spread;
}

function resourceOffset(index) {
  return ((index % 5) - 2) * 0.028;
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function roundCoord(value) {
  return Number(value.toFixed(6));
}

function activityTypeFor(category, index) {
  const values = {
    CC_APPLIANCE: ["APPLIANCE_INSTALL", "APPLIANCE_REPAIR"],
    CC_HVAC: ["HVAC_INSTALL", "HVAC_SERVICE"],
    CC_PLUMBING: ["PLUMBING_REPAIR", "PLUMBING_MAINTENANCE"]
  };
  const options = values[category] || ["FIELD_SERVICE"];
  return options[index % options.length];
}

function durationFor(category, index) {
  const base = { CC_APPLIANCE: 95, CC_HVAC: 125, CC_PLUMBING: 110 }[category] || 90;
  return base + ((index % 4) * 15);
}

function bookingLeadDays(area, dayOffset, index) {
  const recent = dayOffset <= 13;
  const wave = index % 3;
  if (area === "FL") return recent ? 6 + wave : 2 + wave;
  if (area === "TX") return recent ? 5 + (wave % 2) : 3 + (wave % 2);
  if (area === "GA") return recent ? 4 + (wave % 2) : 3;
  return recent ? 4 : 3;
}

function areaName(area) {
  return { FL: "Florida", TX: "Texas", GA: "Georgia" }[area] || area;
}

function categoryName(category) {
  return {
    CC_APPLIANCE: "Appliance",
    CC_HVAC: "HVAC",
    CC_PLUMBING: "Plumbing"
  }[category] || category;
}

function timezoneFor(area) {
  return area === "TX" ? "Central" : "Eastern";
}

function timezoneIanaFor(area) {
  return area === "TX" ? "America/Chicago" : "America/New_York";
}

function timezoneDiffFor(area) {
  return area === "TX" ? -360 : -300;
}
