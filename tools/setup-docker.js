const { execSync } = require('child_process');
const path = require('path');

const currentDir = process.cwd();
const dockerCommand = `docker run -dit --name emscripten-jsartoolkitnft -v "${currentDir}:/src" emscripten/emsdk:4.0.17 bash`;

console.log(`Running command: ${dockerCommand}`);

try {
  execSync(dockerCommand, { stdio: 'inherit' });
  console.log('Docker container started successfully.');
} catch (error) {
  console.error(`Error starting Docker container: ${error.message}`);
  process.exit(1);
}