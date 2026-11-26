// Preserve unrelated environment settings and comments, including duplicate
// target definitions. No environment values are printed by the setup command.
export function mergeBillingEnvironment(
  contents: string,
  updates: Record<string, string>,
) {
  const allowed = new Set([
    "STRIPE_PACKAGE_PRICE_ID",
    "STRIPE_STUDIO_PRICE_ID",
    "STRIPE_PORTAL_CONFIGURATION_ID",
    "STRIPE_WEBHOOK_ENDPOINT_ID",
    "STRIPE_WEBHOOK_SECRET",
  ]);
  for (const [name, value] of Object.entries(updates)) {
    if (!allowed.has(name) || !/^[a-zA-Z0-9_]+$/.test(value))
      throw new Error("Invalid billing configuration update.");
  }
  const eol = contents.includes("\r\n") ? "\r\n" : "\n";
  const lines = contents.split(/\r?\n/);
  const found = new Set<string>();
  const output = lines.map((line) => {
    const name = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/)?.[1];
    if (!name || !(name in updates)) return line;
    found.add(name);
    return `${name}=${updates[name]}`;
  });
  while (output.at(-1) === "") output.pop();
  for (const [name, value] of Object.entries(updates))
    if (!found.has(name)) output.push(`${name}=${value}`);
  return `${output.join(eol)}${eol}`;
}
