export function safeAuthNext(value: string | undefined) {
  // Return targets are fixed app destinations, never an arbitrary redirect URL.
  return value === "/create" ? value : "/projects";
}
