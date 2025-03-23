import { CopilotLSPClient } from './lsp-client.js';
import { CopilotAuth } from './auth.js';
import { CopilotModels } from './models.js';
import { CopilotChat } from './chat.js';
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2), {
  string: ['serverPath', 'command', 'message', 'model'],
  boolean: ['help'],
  alias: {
    h: 'help',
    c: 'command',
    m: 'message',
    p: 'serverPath'
  },
  default: {
    command: 'status'
  }
});

// Display help
if (argv.help) {
  console.log(`
GitHub Copilot CLI Tool

Commands:
  status                Check authentication status
  signin                Sign in to GitHub Copilot
  signout               Sign out from GitHub Copilot
  models                List available models
  setmodel <model>      Set the active model
  chat <message>        Send a chat message to Copilot

Options:
  --serverPath, -p      Path to the language-server.js file
  --message, -m         Message for chat command
  --model               Model ID for setmodel command
  --help, -h            Show this help message
  `);
  process.exit(0);
}

async function main() {
  // Create the LSP client
  const lspClient = new CopilotLSPClient({
    serverPath: argv.serverPath,
    onNotification: (method, params) => {
      if (method === 'statusNotification') {
        if (params.status === 'Error') {
          console.error(`Copilot status: ${params.message}`);
        }
      }
    }
  });

  try {
    // Start the LSP client
    await lspClient.start();

    // Create service instances
    const auth = new CopilotAuth(lspClient);
    const models = new CopilotModels(lspClient);
    const chat = new CopilotChat(lspClient);

    // Handle different commands
    switch (argv.command) {
      case 'status': {
        const status = await auth.checkStatus();
        if (status.user) {
          console.log(`Signed in as GitHub user: ${status.user}`);
        } else {
          console.log('Not signed in');
        }
        break;
      }

      case 'signin': {
        await auth.signIn();
        break;
      }

      case 'signout': {
        await auth.signOut();
        break;
      }

      case 'models': {
        const modelInfo = await models.getAvailableModels();
        if (modelInfo.success) {
          console.log('Available models:');
          modelInfo.availableModels.forEach(model => {
            console.log(`- ${model.name} (${model.id}): ${model.version}`);
          });
        } else {
          console.error('Failed to get models:', modelInfo.error);
        }
        break;
      }

      case 'setmodel': {
        const modelId = argv.model;
        if (!modelId) {
          console.error('Model ID is required. Use --model <modelId>');
          break;
        }

        const result = await models.setModel(modelId);
        if (result.success) {
          console.log(`Set active model to: ${modelId}`);
        } else {
          console.error('Failed to set model:', result.error);
        }
        break;
      }

      case 'chat': {
        const message = argv.message;
        if (!message) {
          console.error('Message is required. Use --message <message>');
          break;
        }
        console.log('Sending message to Copilot...\n');
        const messages = [
          { role: 'system', content: 'You are GitHub Copilot, an AI coding assistant.' },
          { role: 'user', content: message }
        ];
        await chat.sendMessage(messages, {}, (response) => {
          if (response.message?.content) {
            process.stdout.write(response.message.content);
          }
          if (response.done) {
            console.log('\n\n[Response complete]');
            cleanup();
          }
        });
        // process.stdin.resume();
        break;
      }

      default:
        console.error(`Unknown command: ${argv.command}`);
        break;
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Don't stop if we're streaming a chat message
    if (argv.command !== 'chat') {
      cleanup();
    }
  }
}

function cleanup() {
  if (lspClient) {
    lspClient.stop();
  }
  process.exit(0);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Shutting down...');
  cleanup();
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM. Shutting down...');
  cleanup();
});

let lspClient;
main().catch(error => {
  console.error('Fatal error:', error);
  cleanup();
});
