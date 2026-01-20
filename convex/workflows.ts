import { mutation } from "./_generated/server";
import { api } from "./_generated/api";

export const seedCinematicAdTemplate = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation("workflows:seedOfficialTemplate", {
      customId: "cinematic-ad-agent-suite",
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
            prompt:
              "You are a world-class creative director for cinematic product advertising.",
          },
        },
        {
          id: "scriptwriter",
          type: "agent",
          position: { x: 600, y: 0 },
          data: {
            name: "Scriptwriter",
            model: "gpt-4.1",
            prompt:
              "Write a 30–60 second cinematic ad script with voiceover and timing.",
          },
        },
      ],

      edges: [
        { id: "e1", source: "start", target: "creative_director" },
        { id: "e2", source: "creative_director", target: "scriptwriter" },
      ],
    });
  },
});
