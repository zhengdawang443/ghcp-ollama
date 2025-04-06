const payload = {
  model: "claude-3.5-sonnet",
  messages: [
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
    const response = await fetch("http://localhost:11434/v1/chat/completions", {
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
        console.log("Chunk received:", line);
        if (line.includes("[DONE]")) {
          break;
        }
        const data = JSON.parse(line.slice(6));

        if (data.choices.length > 0) {
          const choice = data.choices[0];
          if (choice.delta?.tool_calls) {
            if (choice.delta.tool_calls[0].function.name) {
              toolResponse.name += choice.delta.tool_calls[0].function.name;
            }
            if (choice.delta.tool_calls[0].function.arguments) {
              toolResponse.arguments +=
                choice.delta.tool_calls[0].function.arguments;
            }
          }

          if (choice.delta?.content) {
            textResponse += choice.delta.content;
          }
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
