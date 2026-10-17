export function owned<T extends { owner_id: string }>(
  row: T | null,
  owner: string,
): T {
  if (!row || row.owner_id !== owner) throw new Error("Not found.");
  return row;
}
export function safeStoragePath(owner: string, path: string) {
  return (
    path.startsWith(`${owner}/`) && !path.includes("..") && !path.includes("\\")
  );
}
