const defaultBudgets = {
  observationP50Ms: 75,
  inspectP50Ms: 150,
  actionPlanningP50Ms: 300,
  coordinateActionP50Ms: 350,
};

const appProfiles = {
  chrome: {
    aliases: ["google chrome", "chrome", "com.google.chrome"],
    preferredObservationMode: "focused",
  },
  finder: {
    aliases: ["finder", "访达", "com.apple.finder"],
    preferredObservationMode: "focused",
  },
  textedit: {
    aliases: ["textedit", "文本编辑", "com.apple.textedit"],
    preferredObservationMode: "focused",
  },
};

const stateScenarios = new Set([
  "observe",
  "inspect",
  "plan_action",
  "coordinate_action",
  "after_stale_error",
  "after_window_change",
  "force_full",
]);

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function knownStateScenarios() {
  return [...stateScenarios];
}

export function profileForApp(app) {
  const normalized = normalize(app);
  for (const [key, profile] of Object.entries(appProfiles)) {
    if (profile.aliases.some((alias) => normalize(alias) === normalized)) {
      return { key, ...profile };
    }
  }
  return {
    key: "generic",
    aliases: [],
    preferredObservationMode: "focused",
  };
}

function baseDecision({ scenario, app, reason, stateMode, includeScreenshot, budgetP50Ms }) {
  const profile = profileForApp(app);
  return {
    scenario,
    app: app || null,
    appProfile: profile.key,
    stateArgs: {
      stateMode,
      includeScreenshot,
    },
    budget: {
      p50Ms: budgetP50Ms,
      source: "M19 large-app state budget",
    },
    reason,
  };
}

export function chooseStateReadPolicy({
  scenario = "observe",
  app = null,
  needsScreenshot = false,
  needsCoordinates = false,
  staleState = false,
  windowChanged = false,
  forceFull = false,
  budgets = defaultBudgets,
} = {}) {
  const normalizedScenario = normalize(scenario) || "observe";
  if (!stateScenarios.has(normalizedScenario)) {
    throw new Error(
      `Unknown state scenario: ${scenario}. Expected one of: ${knownStateScenarios().join(", ")}`,
    );
  }

  if (
    forceFull ||
    staleState ||
    windowChanged ||
    normalizedScenario === "force_full" ||
    normalizedScenario === "after_stale_error" ||
    normalizedScenario === "after_window_change"
  ) {
    return baseDecision({
      scenario: normalizedScenario,
      app,
      stateMode: "full",
      includeScreenshot: true,
      budgetP50Ms: budgets.coordinateActionP50Ms,
      reason: "refresh full tree and current pixels after a stale or changed state boundary",
    });
  }

  if (needsCoordinates || needsScreenshot || normalizedScenario === "coordinate_action") {
    return baseDecision({
      scenario: normalizedScenario,
      app,
      stateMode: "full",
      includeScreenshot: true,
      budgetP50Ms: budgets.coordinateActionP50Ms,
      reason: "screenshot-coordinate workflows need current pixels and full coordinate metadata",
    });
  }

  if (normalizedScenario === "plan_action") {
    return baseDecision({
      scenario: normalizedScenario,
      app,
      stateMode: "full",
      includeScreenshot: false,
      budgetP50Ms: budgets.actionPlanningP50Ms,
      reason: "action planning needs complete AX structure but not current image pixels",
    });
  }

  if (normalizedScenario === "inspect") {
    return baseDecision({
      scenario: normalizedScenario,
      app,
      stateMode: "visible",
      includeScreenshot: false,
      budgetP50Ms: budgets.inspectP50Ms,
      reason: "inspection needs nearby UI context without paying for the complete tree or screenshot",
    });
  }

  const profile = profileForApp(app);
  return baseDecision({
    scenario: normalizedScenario,
    app,
    stateMode: profile.preferredObservationMode,
    includeScreenshot: false,
    budgetP50Ms: budgets.observationP50Ms,
    reason: "repeated observation should use the fastest no-screenshot mode measured in M19",
  });
}

export function applyStateReadPolicy(app, policyDecision) {
  return {
    app,
    ...policyDecision.stateArgs,
  };
}

export { defaultBudgets as statePolicyBudgets };
