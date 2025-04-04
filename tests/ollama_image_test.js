import fs from "fs";
import path from "path";

function encodeImageToBase64(imagePath) {
  const image = fs.readFileSync(imagePath);
  return image.toString("base64");
}

const imagePath = path.join(__dirname, "images", "vergil.jpg");

const payload = {
  model: "claude-3.5-sonnet",
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "What do you see in this image?",
        },
        {
          type: "image",
          image: encodeImageToBase64(imagePath),
        },
      ],
    },
  ],
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

    let fullResponse = "";

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

        if (data.message?.content) {
          fullResponse += data.message.content;
        }

        if (data.done) {
          console.log("Stream finished.\n");
          break;
        }
      }
    }

    console.log("====================\n");
    console.log("Full Response:\n", fullResponse);
  } catch (error) {
    console.error("Error:", error);
    if (error.message.includes("ENOENT")) {
      console.error(
        "Image file not found. Please make sure to place an image named 'example.jpg' in the tests directory.",
      );
    }
  }
}

chat();
