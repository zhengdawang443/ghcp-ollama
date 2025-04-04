const payload = {
  // model: "claude-3.5-sonnet",
  model: "hhao/qwen2.5-coder-tools:latest",
  messages: [
    {
      role: "system",
      content:
        "You know when to use `get_current_time` and `get_current_weather` internal tools.",
    },
    {
      role: "user",
      content: "why is the sky blue?",
    },
    {
      role: "assistant",
      content: "due to rayleigh scattering.",
    },
    {
      role: "user",
      content: "what's the weather in Beijing?",
    },
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "get_current_time",
        description: "Get the current time for a specific timezone",
        parameters: {
          type: "object",
          properties: {
            timezone: {
              type: "string",
              description:
                "The timezone to get the current time for (e.g., America/New_York)",
            },
          },
          required: ["timezone"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_current_weather",
        description: "Get the current weather for a location",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description:
                "The location to get the weather for, e.g. San Francisco, CA",
            },
            format: {
              type: "string",
              description:
                "The format to return the weather in, e.g. 'celsius' or 'fahrenheit'",
              enum: ["celsius", "fahrenheit"],
            },
          },
          required: ["location", "format"],
        },
      },
    },
  ],
  tool_choice: "auto",
  stream: true,
};

async function chat() {
  try {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let textResponse = "";
    let toolResponse = {
      name: "",
      arguments: "",
    };

    // Create a stream reader
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Decode the stream chunk and split by lines
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        const data = JSON.parse(line);
        console.log("Chunk received:", JSON.stringify(data));

        if (data.message?.tool_calls) {
          if (data.message.tool_calls[0].function.name) {
            toolResponse.name += data.message.tool_calls[0].function.name;
          }
          if (data.message.tool_calls[0].function.arguments) {
            toolResponse.arguments += JSON.stringify(
              data.message.tool_calls[0].function.arguments,
            );
          }
        }

        if (data.message?.content) {
          textResponse += data.message.content;
        }

        if (data.done) {
          console.log("Stream finished.\n");
          break;
        }
      }
    }

    console.log("====================\n");
    console.log("Text Response:\n", textResponse);
    console.log("\n====================\n");
    console.log("Tool Response:\n", toolResponse);
  } catch (error) {
    console.error("Error:", error);
  }
}

chat();
