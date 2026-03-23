/**
 * Expands ${env:VAR} placeholders in a string using process.env.
 * Matches VS Code's variable syntax used in launch.json and tasks.json.
 * Missing env vars are replaced with empty string.
 */
export function resolveEnvVariables(value: string): string {
  return value.replace(/\$\{env:([^}]+)\}/g, (_, varName) => {
    return process.env[varName] ?? "";
  });
}
