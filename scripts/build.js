const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const env = { ...process.env };

if (process.platform === "win32") {
  const cargoConfig = path.join(root, "src-tauri", ".cargo", "config.toml");
  const config = fs.readFileSync(cargoConfig, "utf8");
  const linker = config.match(/^\s*linker\s*=\s*"([^"]+)"/m);

  if (linker) {
    const toolchainBin = path.dirname(linker[1].replace(/\//g, path.sep));
    if (fs.existsSync(path.join(toolchainBin, "windres.exe"))) {
      env.PATH = `${toolchainBin}${path.delimiter}${env.PATH || ""}`;
    }
  }
}

const tauriCli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const result = spawnSync(process.execPath, [tauriCli, "build"], {
  cwd: root,
  env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Failed to start Tauri build: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status === null ? 1 : result.status;
}
