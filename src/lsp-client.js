import { createMessageConnection } from 'vscode-jsonrpc/node.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class CopilotLSPClient {
  constructor(options = {}) {
    this.options = options;
    this.initialized = false;
    this.connection = null;
    this.childProcess = null;
    this.requestId = 0;
  }

  async findServerPath() {
    // Check common locations for language-server.js
    const possiblePaths = [
      // Local directory relative to the script
      path.join(__dirname, '..', 'copilot', 'dist', 'language-server.js'),
      path.join(__dirname, 'copilot', 'dist', 'language-server.js'),
      path.join(process.cwd(), 'copilot', 'dist', 'language-server.js'),
      // Try in node_modules if installed via npm
      path.join(__dirname, 'node_modules', 'copilot', 'dist', 'language-server.js'),
      // Try in ~/.config/nvim/ for Neovim installations
      path.join(os.homedir(), '.config', 'nvim', 'plugged', 'copilot.lua', 'copilot', 'dist', 'language-server.js'),
      // Try in ~/.local/share/nvim for Neovim installations with plugin managers
      path.join(os.homedir(), '.local', 'share', 'nvim', 'site', 'pack', 'plugins', 'start', 'copilot.lua', 'copilot', 'dist', 'language-server.js'),
    ];

    for (const serverPath of possiblePaths) {
      if (fs.existsSync(serverPath)) {
        console.log(`Found language-server.js at: ${serverPath}`);
        return serverPath;
      }
    }

    throw new Error('Could not find language-server.js. Please specify the path with --serverPath or ensure Copilot plugin is installed.');
  }

  async start() {
    if (this.childProcess) {
      return;
    }

    const serverPath = this.options.serverPath || await this.findServerPath();

    if (!fs.existsSync(serverPath)) {
      throw new Error(`Language server not found at ${serverPath}`);
    }

    this.childProcess = spawn('node', [serverPath, '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.connection = createMessageConnection(
      this.childProcess.stdout,
      this.childProcess.stdin
    );

    this.childProcess.stderr.on('data', (data) => {
      console.error(`[Copilot LSP] ${data.toString()}`);
    });

    this.childProcess.on('error', (error) => {
      console.error(`Error starting language server: ${error}`);
    });

    this.childProcess.on('exit', (code) => {
      console.log(`Language server exited with code ${code}`);
      this.connection = null;
      this.childProcess = null;
      this.initialized = false;
    });

    this.connection.onNotification((method, params) => {
      if (this.options.onNotification) {
        this.options.onNotification(method, params);
      }
    });

    this.connection.listen();

    // Initialize the LSP connection
    await this.initialize();
  }

  async initialize() {
    if (this.initialized) return;

    const capabilities = {
      textDocument: {
        synchronization: {
          didSave: true,
          didChange: true,
        },
      },
      workspace: {
        workspaceFolders: true,
      },
      copilot: {
        openURL: true,
      }
    };

    const initializeParams = {
      processId: process.pid,
      rootPath: process.cwd(),
      capabilities,
      initializationOptions: {
        copilotIntegrationId: "vscode-chat",
        editorInfo: {
          name: "Neovim",
          version: "0.9.0", // Default version
        },
        editorPluginInfo: {
          name: "copilot.lua",
          version: "1.43.0",
        },
      }
    };

    try {
      const result = await this.connection.sendRequest('initialize', initializeParams);

      await this.connection.sendNotification('initialized', {});

      // Set editor info
      const editorConfig = {
        editorInfo: {
          name: "Neovim",
          version: "0.9.0",
        },
        editorPluginInfo: {
          name: "copilot.lua",
          version: "1.43.0",
        },
        editorConfiguration: {
          enableAutoCompletions: true,
          disabledLanguages: [],
        },
      };

      // Add _ property to convert empty objects to JSON objects instead of arrays
      editorConfig._ = true;

      await this.connection.sendRequest('setEditorInfo', editorConfig);

      this.initialized = true;
      return result;
    } catch (error) {
      console.error('Failed to initialize Copilot LSP:', error);
      throw error;
    }
  }

  async request(method, params = {}) {
    if (!this.initialized && method !== 'initialize') {
      throw new Error('LSP client not initialized');
    }

    if (!this.connection) {
      throw new Error('LSP connection not established');
    }

    // Add _ property to convert empty objects to JSON objects instead of arrays
    params._ = true;

    try {
      const response = await this.connection.sendRequest(method, params);
      return response;
    } catch (error) {
      console.error(`Error in request ${method}:`, error);
      throw error;
    }
  }

  async notify(method, params = {}) {
    if (!this.initialized) {
      throw new Error('LSP client not initialized');
    }

    if (!this.connection) {
      throw new Error('LSP connection not established');
    }

    // Add _ property to convert empty objects to JSON objects instead of arrays
    params._ = true;

    try {
      await this.connection.sendNotification(method, params);
    } catch (error) {
      console.error(`Error in notification ${method}:`, error);
      throw error;
    }
  }

  stop() {
    if (this.connection) {
      this.connection.dispose();
      this.connection = null;
    }

    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill();
      this.childProcess = null;
    }

    this.initialized = false;
  }
}

export default CopilotLSPClient;
