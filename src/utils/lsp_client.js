/**
 * Github Copilot Language Server Protocol (LSP) Client
 *
 * This module provides a client implementation for communicating with the Github Copilot
 * language server using the Language Server Protocol (LSP). It handles:
 *
 * - Starting and stopping the Copilot language server process
 * - Managing the JSON-RPC connection for LSP communication
 * - Sending requests to and receiving responses from the language server
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { createMessageConnection } from "vscode-jsonrpc/node.js";
import { editorConfig } from "../config.js";

export class CopilotLSPClient {
  constructor() {
    this.initialized = false;
    this.connection = null;
    this.childProcess = null;
  }

  /**
   * Starts the LSP client by spawning child process and establishing the connection.
   *
   * @returns {Promise<void>}
   *
   * @throws {Error} If the server path is not found or if the server fails to start
   */
  async start() {
    if (this.childProcess) {
      // Already started
      return;
    }

    const serverPath = this.#findServerPath();
    this.childProcess = spawn("node", [serverPath, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.connection = createMessageConnection(
      this.childProcess.stdout,
      this.childProcess.stdin,
    );

    this.childProcess.stderr.on("data", (data) => {
      console.error(
        `[Github Copilot LSP] Error from language server: ${data.toString()}`,
      );
    });
    this.childProcess.on("error", (error) => {
      console.error(
        `[Github Copilot LSP] Error starting language server: ${error}`,
      );
    });
    this.childProcess.on("exit", (code) => {
      console.log(
        `[Github Copilot LSP] Language server exited with code ${code}`,
      );
      this.connection = null;
      this.childProcess = null;
      this.initialized = false;
    });

    this.connection.listen();

    await this.#initialize();
  }

  /**
   * Sends a request to the language server and waits for the response
   *
   * @param {string} method - The LSP method name to call
   * @param {Object} params - Parameters to send with the request
   *
   * @returns {Promise<any>} The response from the language server
   *
   * @throws {Error} If the client is not initialized or the connection is not established
   * @throws {Error} If the request fails
   */
  async request(method, params = {}) {
    if (!this.initialized) {
      throw new Error("[Github Copilot LSP] Client not initialized");
    }

    if (!this.connection) {
      throw new Error("[Github Copilot LSP] LSP connection not established");
    }

    try {
      return await this.connection.sendRequest(method, params);
    } catch (error) {
      console.error(
        `[Github Copilot LSP] Error in LSP request ${method}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Stops the LSP client and cleans up resources
   * This should be called when the client is no longer needed to prevent resource leaks.
   */
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

  #findServerPath() {
    const serverPaths = [
      path.join(process.cwd(), "..", "copilot", "dist", "language-server.js"),
      path.join(process.cwd(), "copilot", "dist", "language-server.js"),
    ];
    for (const serverPath of serverPaths) {
      if (fs.existsSync(serverPath)) {
        return serverPath;
      }
    }
    throw new Error(
      "[Github Copilot LSP] LSP server(`copilot/dist/language-server.js`) not found",
    );
  }

  async #initialize() {
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
      },
    };

    const initializeParams = {
      processId: process.pid,
      rootPath: process.cwd(),
      capabilities,
      initializationOptions: {
        copilotIntegrationId: editorConfig.copilotIntegrationId,
        editorInfo: {
          name: editorConfig.editorInfo.name,
          version: editorConfig.editorInfo.version,
        },
        editorPluginInfo: {
          name: editorConfig.editorPluginInfo.name,
          version: editorConfig.editorPluginInfo.version,
        },
      },
    };

    try {
      const result = await this.connection.sendRequest(
        "initialize",
        initializeParams,
      );

      await this.connection.sendNotification("initialized");

      await this.connection.sendRequest("setEditorInfo", editorConfig);

      this.initialized = true;
      return result;
    } catch (error) {
      console.error("Failed to initialize Copilot LSP:", error);
      throw error;
    }
  }
}
