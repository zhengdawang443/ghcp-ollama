import os from "os";
import path from "path";

export function sysConfigPath() {
  if (process.env.XDG_CONFIG_HOME) {
    return process.env.XDG_CONFIG_HOME;
  }

  if (os.platform() === "win32") {
    return path.join(os.homedir(), "AppData", "Local", "github-copilot");
  }

  return path.join(os.homedir(), ".config", "github-copilot");
}

export const editorConfig = {
  editorInfo: {
    name: "Neovim",
    version: "0.10.3",
  },
  editorPluginInfo: {
    name: "copilot.lua",
    version: "1.43.0",
  },
  copilotIntegrationId: "vscode-chat",
};
