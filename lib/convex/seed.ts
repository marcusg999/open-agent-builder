import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Seed: Cinematic Ad Agent Suite
 */
export const seedCinematicAdWorkflow = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Create workflow
    const workflowId = await ctx.db.insert("workflows", {
      name: "Cinematic Ad Agent Suite",
      description: "Multi-agent cinematic product advertisement generator",
      createdAt: Date.now(),
    });

    // Helper to create nodes
    const createNode = async (node: any) => {
      return await ctx.db.insert("nodes", {
        workflowId,
        ...node,
        createdAt: Date.now(),
      });
    };

    // 2. START NODE
    const startNodeId = await createNode({
      type: "start",
      name: "START",
      inputs: {
        product_brief: "string",
        brand_name: "string",
        target_platform: "string",
        budget_tier: "string",
      },
    });

    // 3. Creative Director
    const creativeDirectorId = await createNode({
      type: "agent",
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
      `,
    });

    // 4. Scriptwriter
    const scriptwriterId = await createNode({
      type: "agent",
      name: "Scriptwriter",
      model: "gpt-4.1",
      prompt: `
Write a 30–60 second cinematic ad script.
Include:
- Voiceover
- Scene timing
- On-screen text
Match the creative plan exactly.
      `,
    });

    // 5. Visual Director
    const visualDirectorId = await createNode({
      type: "agent",
      name: "Visual Director",
      model: "gpt-4.1",
      prompt: `
Translate the script into cinematic visual descriptions.
Include camera movement, lighting, and mood.
Optimize for AI generation.
      `,
    });

    // 6. Budget Condition
    const budgetConditionId = await createNode({
      type: "condition",
      name: "Budget Tier Check",
      condition: "budget_tier === 'low'",
    });

    // 7. Image Generator
    const imageGenId = await createNode({
      type: "tool",
      name: "Image Generator",
      provider: "kie.ai",
      tool: "image.generate",
      batching: true,
      fallbackProviders: ["stability", "sdxl"],
      promptTemplate: `
Cinematic product shot.
{{shot_description}}
Ultra-detailed lighting, film grain, commercial realism.
      `,
    });

    // 8. Video Generator
    const videoGenId = await createNode({
      type: "tool",
      name: "Video Generator",
      provider: "kie.ai",
      tool: "video.generate",
      batching: true,
      fallbackProviders: ["replicate"],
    });

    // 9. Music Generator
    const musicGenId = await createNode({
      type: "tool",
      name: "Music Generator",
      provider: "kie.ai",
      tool: "music.generate",
      promptTemplate: `
Cinematic underscore.
Emotion-driven.
No vocals.
Broadcast safe.
      `,
    });

    // 10. Voice Generator
    const voiceGenId = await createNode({
      type: "tool",
      name: "Voice Generator",
      provider: "kie.ai",
      tool: "voice.generate",
      promptTemplate: `
Professional cinematic voiceover.
Confident, warm, premium tone.
      `,
    });

    // 11. Editor
    const editorId = await createNode({
      type: "agent",
      name: "Editor",
      model: "gpt-4.1",
      prompt: `
Assemble video, music, and voice into a final cinematic ad.
Output a render plan and asset manifest.
      `,
    });

    // 12. QA Agent
    await createNode({
      type: "agent",
      name: "QA & Brand Safety",
      model: "gpt-4.1",
      prompt: `
Review the final ad for:
- Brand consistency
- Legal risk
- Tone alignment
Approve or flag issues.
      `,
    });

    return {
      success: true,
      workflowId,
    };
  },
});
