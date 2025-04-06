import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function encodeImageToBase64(imagePath) {
  const image = fs.readFileSync(imagePath);
  return image.toString("base64");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imagePath = path.join(__dirname, "images", "vergil.jpg");

const payload = {
  model: "gpt-4o-2024-11-20",
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Who is the man in this image?",
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${encodeImageToBase64(imagePath)}`,
          },
        },
      ],
    },
  ],
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

    console.log("====================\n");
    console.log("Full Response:\n", fullResponse);
  } catch (error) {
    console.error("Error:", error);
  }
}

chat();
