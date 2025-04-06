// Usage: node openai_textmsg_test.js [--no-stream]
// --no-stream: Use non-streaming mode (default: streaming enabled)

// Parse command line arguments with a default value of true for stream
const args = process.argv.slice(2);
const stream = args.includes("--no-stream") ? false : true;

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
      content: "how is that different than mie scattering?",
    },
  ],
  stream: stream,
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

    let fullResponse = "";

    if (stream) {
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
            fullResponse += data.choices[0].delta.content;
          }
        }
      }
    } else {
      const data = await response.json();
      for (const choice of data.choices) {
        fullResponse += choice.message.content;
      }
    }

    console.log("====================\n");
    console.log("Full Response:\n", fullResponse);
  } catch (error) {
    console.error("Error:", error);
  }
}

chat();
