export async function listApps() {
  return [];
}

export async function notImplemented(tool) {
  return {
    status: "not_implemented",
    message: `Tool not implemented in local skeleton: ${tool}`,
  };
}
