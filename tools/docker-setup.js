const { spawn } = require("child_process");
const path = require("path");

// Resolve the absolute path of the current workspace directory
const workspaceDir = path.resolve(__dirname, "..");

const args = [
  "run",
  "-dit",
  "--name",
  "emscripten-jsartoolkitnft",
  "-v",
  `${workspaceDir}:/src`,
  "emscripten/emsdk:4.0.17",
  "bash",
];

console.log(`Running: docker ${args.join(" ")}`);

const child = spawn("docker", args, { stdio: "inherit", shell: true });

child.on("close", (code) => {
  process.exit(code);
});
