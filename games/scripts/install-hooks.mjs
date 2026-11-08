import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gamesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: gamesRoot,
  encoding: "utf8",
}).trim();

execFileSync("git", ["config", "--local", "core.hooksPath", resolve(gamesRoot, ".githooks")], {
  cwd: repositoryRoot,
  stdio: "inherit",
});

console.log("Installed the Games pre-push quality check.");
