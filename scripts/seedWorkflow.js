const { ConvexHttpClient } = require("convex/browser");
const { api } = require("../convex/_generated/api");

// Local Convex dev URL
const client = new ConvexHttpClient("http://127.0.0.1:3210");

async function seed() {
  await client.mutation(api.workflows.saveWorkflow, {
    name: "Cinematic Ad Agent Suite",
    description: "Multi-agent cinematic product ad generator",
    category: "Advertising",

    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 0, y: 0 },
        data: {
          inputs: {
            product_brief: "string",
            brand_name: "string",
            target_platform: "string",
            budget_tier: "string",
          },
        },
      },
      {
        id: "creative_director",
        type: "agent",
        position: { x: 300, y: 0 },
        data: {
          name: "Creative Director",
          model: "gpt-4.1",
          prompt: `
You are a world-class creative director for cinematic product advertising.

Define:
- Emotional hook
- Narrative arc
- Visual style
- Music direction
- Voice direction
- Shot list (5–8 shots)

Be concise and production-ready.
          `.trim(),
        },
      },
      {
        id: "scriptwriter",
        type: "agent",
        position: { x: 600, y: 0 },
        data: {
          name: "Scriptwriter",
          model: "gpt-4.1",
          prompt: `
Write a 30–60 second cinematic ad script.
Include voiceover, timing, and on-screen text.
          `.trim(),
        },
      },
    ],

    edges: [
      { id: "e1", source: "start", target: "creative_director" },
      { id: "e2", source: "creative_director", target: "scriptwriter" },
    ],
  });

  console.log("✅ Cinematic Ad Agent Suite seeded successfully");
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
