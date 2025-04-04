/**
 * Client for handling chat interactions with GitHub Copilot.
 * Manages authentication, model selection, and streaming chat requests.
 */

import { CopilotAuth } from "./auth_client.js";
import { CopilotModels } from "./model_client.js";
import { sendHttpStreamingRequest } from "./http_utils.js";
import { editorConfig } from "../config.js";

export class CopilotChatClient {
  constructor(lspClient) {
    this.auth = new CopilotAuth(lspClient);
    this.models = new CopilotModels(lspClient);
  }

  /**
   * Sends a streaming chat request to the Copilot API.
   *
   * @param {Array} messages - Array of chat messages to send
   * @param {Function} onResponse - Callback function to handle streaming responses
   * @param {Object} [options={}] - Additional options for the request
   * @param {Array|null} [tools=null] - Array of tools available to the model
   * @param {boolean} [refreshToken=true] - Whether to attempt token refresh if invalid
   *
   * @returns {Promise<{success: boolean, error?: string}>} Result of the streaming request
   */
  async sendStreamingRequest(
    messages,
    onResponse,
    options = {},
    tools = null,
    refreshToken = true,
  ) {
    try {
      // Quick check if the token is valid
      const { token, _ } = this.auth.getGithubToken();
      if (!token) {
        if (refreshToken) {
          console.log("GitHub token not valid, attempting to refresh...");
          await this.auth.signIn(true);
          const newStatus = await this.auth.checkStatus();
          if (!newStatus.authenticated || !newStatus.tokenValid) {
            return {
              success: false,
              error: "Failed to sign in and refresh GitHub token",
            };
          }
          console.log("GitHub token refreshed successfully");
        } else {
          return {
            success: false,
            error: "GitHub token not valid",
          };
        }
      }

      return await this.#doSendRequest(messages, onResponse, options, tools);
    } catch (error) {
      console.error("Error sending chat messages:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async #doSendRequest(
    messages,
    onResponse,
    options = {},
    tools,
    stream = true,
  ) {
    const { token, endpoint } = this.auth.getGithubToken();
    if (!token) {
      return {
        success: false,
        error: "Could not determine GitHub token",
      };
    }
    if (!endpoint) {
      return {
        success: false,
        error: "Could not determine API endpoint",
      };
    }

    try {
      const url = new URL(`${endpoint}/chat/completions`);
      const defaultModel = await this.#getDefaultModel();
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Copilot-Integration-Id": editorConfig.copilotIntegrationId,
        "Editor-Version": `${editorConfig.editorInfo.name}/${editorConfig.editorInfo.version}`,
      };
      const payload = {
        ...options,
        model: options.model || defaultModel.modelConfig.modelId,
        messages: messages,
        tools: tools,
        stream: stream,
      };

      return await sendHttpStreamingRequest(
        url.hostname,
        url.pathname,
        "POST",
        headers,
        payload,
        onResponse,
        this.#parseToOllamaResp,
      );
    } catch (error) {
      console.error("Error sending chat messages:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async #getDefaultModel() {
    try {
      return this.models.getCurrentModel();
    } catch (error) {
      console.error("Error getting default model:", error);
      return {
        success: true,
        modelConfig: {
          modelId: "gpt-4o-2024-11-20",
          modelName: "GPT-4o",
          lastUpdated: "2025-04-04T04:35:49.004Z",
        },
      };
    }
  }

  #parseToOllamaResp(buffer) {
    const respMessages = buffer.split("\n\n");
    const remainBuffer = respMessages.pop();
    let parsedMessages = [];

    for (const respMessage of respMessages) {
      if (!respMessage || respMessage.trim() === "") continue;

      const lines = respMessage.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            const parsedMessage = {
              done: true,
              message: {
                role: "assistant",
                content: "",
              },
            };
            parsedMessages.push(parsedMessage);
            break;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.choices && parsed.choices[0]) {
              const choice = parsed.choices[0];
              if (choice.delta) {
                const parsedMessage = {
                  done: false,
                  message: {
                    role: "assistant",
                    content: choice.delta.content ?? "",
                  },
                  model: parsed.model,
                  created: parsed.created,
                };
                parsedMessages.push(parsedMessage);
              }
            }
          } catch (error) {
            console.error("Error parsing data:", error, data);
          }
        }
      }
    }

    return {
      parsedMessages,
      remainBuffer,
    };
  }
}
