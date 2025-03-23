import fs from 'fs';
import path from 'path';
import os from 'os';

export class CopilotModels {
  constructor(lspClient) {
    this.lspClient = lspClient;
    this.configPath = process.env.XDG_CONFIG_HOME ||
      (os.platform() === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Local', 'github-copilot')
        : path.join(os.homedir(), '.config', 'github-copilot'));
    this.modelConfigFile = path.join(this.configPath, 'model-config.json');
    this.githubTokenPath = path.join(this.configPath, 'github-token.json');

    // Ensure config directory exists
    this.ensureConfigDir();
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true });
    }
  }

  /**
   * Get the available Copilot models
   */
  async getAvailableModels() {
    try {
      // First, try to read the GitHub token file to get the API endpoint
      if (!fs.existsSync(this.githubTokenPath)) {
        console.log('GitHub token file not found. Triggering authentication...');

        // We need to create an Auth instance if one doesn't exist
        if (!this.auth) {
          const { CopilotAuth } = await import('./auth.js');
          this.auth = new CopilotAuth(this.lspClient);
        }

        // Trigger sign-in process
        const signInResult = await this.auth.signIn();

        if (!signInResult.success) {
          throw new Error(`Authentication failed: ${signInResult.error}`);
        }
      }

      // Read the GitHub token file
      const tokenContent = fs.readFileSync(this.githubTokenPath, 'utf8');
      const tokenData = JSON.parse(tokenContent);

      if (!tokenData.endpoints || !tokenData.endpoints.api) {
        throw new Error('API endpoint not found in GitHub token file');
      }

      // Get the API endpoint and token
      const apiEndpoint = tokenData.endpoints.api;
      const token = tokenData.token;

      console.log(`Fetching available models from API endpoint: ${apiEndpoint}/models`);

      // Make a request to the API to get the models
      const modelsResponse = await this.requestModels(apiEndpoint, token);

      // Parse the response to get the available models
      let modelsList = [];

      if (modelsResponse && modelsResponse.data && Array.isArray(modelsResponse.data)) {
        modelsList = modelsResponse.data.map(model => ({
          id: model.id,
          name: model.name,
          vendor: model.vendor,
          version: model.version
        }));
      } else {
        throw new Error('Unexpected format for models response from API');
      }

      return {
        success: true,
        availableModels: modelsList
      };

    } catch (error) {
      console.error('Error in getAvailableModels:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Make an HTTP request to get models from the Copilot API
   */
  async requestModels(apiEndpoint, token) {
    return new Promise(async (resolve, reject) => {
      try {
        // Parse the API endpoint URL
        const url = new URL(`${apiEndpoint}/models`);
        const options = {
          hostname: url.hostname,
          path: url.pathname,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'github-copilot/2.0',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Copilot-Integration-Id': 'vscode-chat', // Added header
            'Editor-Version': 'VSCode/1.98.2'        // Added header
          }
        };

        // Use https or http depending on the protocol
        const requestModule = url.protocol === 'https:' ?
          await import('https') : await import('http');

        const req = requestModule.default.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const responseData = JSON.parse(data);
                resolve(responseData);
              } catch (error) {
                console.error('Error parsing API response:', error);
                console.log('Raw response data:', data);
                reject(new Error(`Failed to parse models response: ${error.message}`));
              }
            } else {
              console.error(`API returned status code ${res.statusCode}`);
              console.log('Response data:', data);
              reject(new Error(`API returned status code ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on('error', (error) => {
          reject(new Error(`Error making request to models API: ${error.message}`));
        });

        req.end();
      } catch (error) {
        reject(new Error(`Error in request setup: ${error.message}`));
      }
    });
  }

  /**
   * Set the active Copilot model
   * This would be done by changing the settings and saving to config
   */
  async setModel(modelId) {
    try {
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
          github: {
            copilot: {
              selectedCompletionModel: modelId
            }
          }
        },
      };

      // Add _ property to convert empty objects to JSON objects instead of arrays
      editorConfig._ = true;

      // Send model change to the LSP server
      await this.lspClient.request('setEditorInfo', editorConfig);

      // Get the available models to find the name for the selected model
      const modelsResult = await this.getAvailableModels();
      const modelInfo = modelsResult.availableModels.find(model => model.id === modelId);

      // Create model configuration object
      const modelConfig = {
        id: modelId,
        name: modelInfo ? modelInfo.name : modelId,
        lastUpdated: new Date().toISOString()
      };

      // Save to JSON file
      fs.writeFileSync(
        this.modelConfigFile,
        JSON.stringify(modelConfig, null, 2),
        'utf8'
      );

      return {
        success: true,
        activeModel: modelId,
        modelName: modelConfig.name
      };
    } catch (error) {
      console.error('Error setting model:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get the current active model from the saved configuration
   */
  async getCurrentModel() {
    try {
      // Try to read the saved model configuration
      if (fs.existsSync(this.modelConfigFile)) {
        const modelConfigData = fs.readFileSync(this.modelConfigFile, 'utf8');
        const modelConfig = JSON.parse(modelConfigData);

        return {
          success: true,
          currentModel: modelConfig.id,
          modelName: modelConfig.name,
          lastUpdated: modelConfig.lastUpdated
        };
      } else {
        // If no configuration exists, use default and create one

        // Default model settings
        const defaultModel = {
          id: "gpt-4o",
          name: "GPT-4o",
          lastUpdated: new Date().toISOString()
        };

        // Write default config
        fs.writeFileSync(
          this.modelConfigFile,
          JSON.stringify(defaultModel, null, 2),
          'utf8'
        );

        return {
          success: true,
          currentModel: defaultModel.id,
          modelName: defaultModel.name,
          lastUpdated: defaultModel.lastUpdated,
          isDefault: true
        };
      }
    } catch (error) {
      console.error('Error getting current model:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default CopilotModels;
