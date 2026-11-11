import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The tests run in jsdom, where import.meta.url is not a file URL.
const frontendDirectory = resolve(__dirname, "..");
// Everything in these directories can end up in the page's JavaScript.
const browserCodeDirectories = ["app", "components", "hooks", "lib"];
const sourceFilePattern = /\.(ts|tsx|js|jsx|mjs)$/;
// The Public API's own host and its Cloud Run addresses, in both forms:
// policyengine-api-<hash>.a.run.app and
// policyengine-api-<project number>.<region>.run.app.
const publicApiAddressPattern =
  /api\.policyengine\.org|policyengine-api[a-z0-9-]*\.[a-z0-9.-]*run\.app/;

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entryName) => {
    const entryPath = join(directory, entryName);
    if (statSync(entryPath).isDirectory()) {
      return sourceFilesUnder(entryPath);
    }
    return sourceFilePattern.test(entryName) ? [entryPath] : [];
  });
}

describe("browser code", () => {
  it("never names the Public API's address", () => {
    const filesNamingThePublicApi = browserCodeDirectories
      .flatMap((directoryName) =>
        sourceFilesUnder(join(frontendDirectory, directoryName)),
      )
      .filter((filePath) =>
        publicApiAddressPattern.test(readFileSync(filePath, "utf8")),
      )
      .map((filePath) => relative(frontendDirectory, filePath));

    expect(filesNamingThePublicApi).toEqual([]);
  });
});
