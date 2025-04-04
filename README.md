# GHCP-Ollama

The [Ollama](https://github.com/ollama-dev/ollama) project provides a convenient way to interact with various LLMs (Large Language Models) via a simple API. 
This project aims to provide an Ollama-compatible API for interacting with the LLMs of GitHub Copilot.

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
git submodule update --init --recursive

# Install dependencies
npm install
```

## Usage

There are two main ways to use this tool:

### 1. Command Line Interface

```bash
# Check your authentication status
node src/ghcp.js status

# Sign in to GitHub Copilot
node src/ghcp.js signin

# Sign out from GitHub Copilot
node src/ghcp.js signout

# List available models
node src/ghcp.js models

# Get the active model
node src/ghcp.js getmodel

# Set the active model
node src/ghcp.js setmodel --model gpt-4o-2024-11-20

# Send a chat message to Copilot
node src/ghcp.js chat --message "Write quick sort algo in python"
```

### 2. Ollama-Compatible Server

Start the server that provides Ollama-compatible API endpoints:

```bash
# Using npm start (recommended)
npm start
```

The server provides the following endpoints:

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

Since the server implements the same API endpoints as Ollama, you can use it with any tool that supports Ollama, such as:

1. **LangChain**: Set your base URL to the GHCP-Ollama server
2. **Ollama Web UI**: Point it to your GHCP-Ollama server instead of Ollama
3. **CLI tools**: Tools like `ollama-cli` will work with GHCP-Ollama

Example with curl:

```bash
# List available models
curl http://localhost:11434/api/tags

# Chat with text messages
curl http://localhost:11434/api/chat -d '{
  "model": "claude-3.5-sonnet",
  "messages": [
    {
      "role": "user",
      "content": "why is the sky blue?"
    },
    {
      "role": "assistant",
      "content": "due to rayleigh scattering."
    },
    {
      "role": "user",
      "content": "how is that different than mie scattering?"
    }
  ]
}'

# Chat with tools
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.2",
  "messages": [
    {
      "role": "user",
      "content": "What is the weather today in Paris?"
    }
  ],
  "stream": false,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_current_weather",
        "description": "Get the current weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "The location to get the weather for, e.g. San Francisco, CA"
            },
            "format": {
              "type": "string",
              "description": "The format to return the weather in, e.g. 'celsius' or 'fahrenheit'",
              "enum": ["celsius", "fahrenheit"]
            }
          },
          "required": ["location", "format"]
        }
      }
    }
  ]
}'
     
```