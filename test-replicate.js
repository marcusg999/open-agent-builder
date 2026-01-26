const Replicate = require('replicate');
const fs = require('fs');

async function streamToBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  return Buffer.concat(chunks);
}

async function test() {
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_KEY,
  });

  console.log('Testing Replicate API with Flux Schnell...');
  console.log('Generating image (~3-5 seconds)...\n');
  
  const output = await replicate.run(
    "black-forest-labs/flux-dev",
    {
      input: {
        prompt: "cinematic photo of a futuristic utility jacket on mannequin, studio lighting, 4:3 aspect ratio, professional product photography",
        num_inference_steps: 4,
        aspect_ratio: "4:3"
      }
    }
  );

  if (Array.isArray(output) && output[0] instanceof ReadableStream) {
    console.log("📥 Downloading image...");
    const imageBuffer = await streamToBuffer(output[0]);
    
    const filename = 'test-flux-image.png';
    fs.writeFileSync(filename, imageBuffer);
    
    console.log("\n✅ Success!");
    console.log(`📸 Image saved to: ${filename}`);
    console.log("💰 Cost: ~$0.003\n");
    console.log("💡 Open the file to view your generated image!");
  } else {
    console.log("Unexpected output:", output);
  }
}

test().catch(error => {
  console.error("❌ Error:", error.message);
});
