# GHCP-Ollama

A Node.js client for interacting with GitHub Copilot LSP server API with Ollama-compatible API endpoints.

## Features

- Sign in/sign out with GitHub Copilot
- List available Copilot models
- Set active Copilot model
- Send chat requests and receive streaming responses
- Ollama-compatible API endpoints for integration with existing tools

## Requirements

- Node.js 18.x or newer
- GitHub Copilot subscription
- Installed Copilot LSP server (typically installed with copilot.lua Neovim plugin)

## Installation

```bash
# Clone the repository
git clone https://github.com/ljie-PI/ghcp-ollama.git
cd src

# Install dependencies
npm install
```

## Usage

There are two main ways to use this tool:

### 1. Command Line Interface

```bash
# Check your authentication status
node ghcp.js --command status

# Sign in to GitHub Copilot
node ghcp.js --command signin

# Sign out from GitHub Copilot
node ghcp.js --command signout

# List available models
node ghcp.js --command models

# Set the active model
node ghcp.js --command setmodel --model claude-3.5-sonnet

# Send a chat message to Copilot
node ghcp.js --command chat --message "Write quick sort algo in python"
```

### 2. Ollama-Compatible Server

Start the server that provides Ollama-compatible API endpoints:

```bash
# Using npm start (recommended)
npm start

# Start on a different port with npm
PORT=8080 npm start

# Or directly with node
node server.js

# Start on a different port with node
PORT=8080 node server.js
```

#### Server API Endpoints

The server provides the following endpoints:

##### Ollama-Compatible Endpoints

- `GET /api/tags`: List available models (similar to Ollama)

- `POST /api/chat`: Have a conversation with a model
  ```json
  {
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": "Write a quicksort algorithm in Python"
      }
    ],
    "stream": true,
    "options": {
      "temperature": 0.7
    }
  }
  ```

## Advanced Configuration

You can specify the path to the language-server.js file:

```bash
# For CLI
node ghcp.js --command status --serverPath /path/to/language-server.js

# For server
SERVER_PATH=/path/to/language-server.js node server.js
```

## Integration with Ollama

This client can be used as a bridge between Ollama and GitHub Copilot, allowing you to use Copilot models through Ollama's API.

Since the server implements the same API endpoints as Ollama, you can use it with any tool that supports Ollama, such as:

1. **LangChain**: Set your base URL to the GHCP-Ollama server
2. **Ollama Web UI**: Point it to your GHCP-Ollama server instead of Ollama
3. **CLI tools**: Tools like `ollama-cli` will work with GHCP-Ollama

Example with curl:

```bash
# List available models
curl http://localhost:11434/api/tags

# Chat with streaming
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Write a quicksort algorithm in Python"}],"stream":true}'
```

## License

MIT
