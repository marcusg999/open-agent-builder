import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// List all workflows
export const listWorkflows = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("workflows").collect();
  },
});

// Get templates only
export const getTemplates = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("workflows")
      .filter((q) => q.eq(q.field("isTemplate"), true))
      .collect();
  },
});

export const getWorkflowByCustomId = query({
  args: { customId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflows")
      .withIndex("by_customId", (q) => q.eq("customId", args.customId))
      .first();
  },
});

// Delete workflow by customId
export const deleteWorkflow = mutation({
  args: { customId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workflows")
      .withIndex("by_customId", (q) => q.eq("customId", args.customId))
      .first();
    
    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true, id: existing._id };
    }
    return { deleted: false };
  },
});

// 🎯 UI-COMPATIBLE CINEMATIC AD AGENT SUITE
export const seedCinematicAdTemplate = mutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();

    await ctx.db.insert("workflows", {
      customId: "cinematic-ad-agent-suite",
      name: "Cinematic AI Ad Agent Suite",
      description: "Multi-agent system for generating cinematic AI advertisements with trend analysis, scriptwriting, and visual generation",
      
      isTemplate: true,
      category: "general",
      
      createdAt: now,
      updatedAt: now,

      tags: ["advertising", "video", "ai-generation", "marketing", "cinematic"],
      
      nodes: [
        // ══════════════════════════════════════
        // START NODE
        // ══════════════════════════════════════
        {
          id: "start-1",
          type: "start", // ← Keep as "start"
          position: { x: 100, y: 100 },
          data: {
            label: "Campaign Input",
            description: "Initial campaign requirements and brand context",
            config: {
              fields: [
                {
                  name: "brandName",
                  type: "text",
                  label: "Brand Name",
                  required: true
                },
                {
                  name: "productDescription",
                  type: "textarea",
                  label: "Product Description",
                  required: true
                },
                {
                  name: "targetAudience",
                  type: "text",
                  label: "Target Audience",
                  required: true
                },
                {
                  name: "campaignGoals",
                  type: "textarea",
                  label: "Campaign Goals"
                }
              ]
            }
          }
        },

        // ══════════════════════════════════════
        // AGENT 1: TREND ANALYST
        // ══════════════════════════════════════
        {
          id: "agent-trend-analyst",
          type: "agent", // ← Changed from "model" to "agent"
          position: { x: 100, y: 250 },
          data: {
            label: "🔍 Trend Analyst Agent",
            description: "Analyzes current cultural trends and viral patterns",
            config: {
              provider: "anthropic",
              model: "kie:claude-sonnet-4-20250514",
              systemPrompt: `You are an expert trend analyst specializing in viral marketing and cultural zeitgeist.

RESPONSIBILITIES:
- Analyze current social media trends relevant to {{targetAudience}}
- Identify viral content patterns and formats
- Map cultural moments to brand opportunities
- Generate trend-aligned creative concepts

OUTPUT REQUIREMENTS:
Return a JSON object with:
{
  "currentTrends": ["trend1", "trend2", "trend3"],
  "viralPatterns": ["pattern1", "pattern2"],
  "culturalMoments": ["moment1", "moment2"],
  "recommendations": ["rec1", "rec2", "rec3"],
  "trendAlignment": {
    "trend": "description of how to leverage it"
  }
}`,
              temperature: 0.7,
              maxTokens: 2000
            }
          }
        },

        {
          id: "tool-trend-research",
          type: "mcp", // ← Changed from "action" to "mcp"
          position: { x: 400, y: 250 },
          data: {
            label: "📊 Web Research Tool",
            description: "Gathers real-time trend data",
            config: {
              toolName: "web_search",
              provider: "anthropic",
              parameters: {
                query: "viral marketing trends {{targetAudience}} 2025",
                maxResults: 10
              }
            }
          }
        },

        // ══════════════════════════════════════
        // AGENT 2: CREATIVE DIRECTOR
        // ══════════════════════════════════════
        {
          id: "agent-creative-director",
          type: "agent", // ← Changed from "model" to "agent"
          position: { x: 100, y: 450 },
          data: {
            label: "🎨 Creative Director Agent",
            description: "Develops cinematic ad concepts and visual narratives",
            config: {
              provider: "anthropic",
              model: "kie:claude-sonnet-4-20250514",
              systemPrompt: `You are a world-class creative director for cinematic advertisements.

CONTEXT:
- Brand: {{brandName}}
- Product: {{productDescription}}
- Trends: {{trendAnalysis}}

RESPONSIBILITIES:
- Develop high-concept cinematic narratives
- Create shot-by-shot visual storyboards
- Design emotional arc and pacing
- Ensure brand alignment with cultural relevance

OUTPUT REQUIREMENTS:
Return a JSON object with:
{
  "conceptTitle": "string",
  "logline": "one-sentence pitch",
  "emotionalArc": ["act1", "act2", "act3"],
  "visualStyle": "description",
  "storyboard": [
    {
      "shotNumber": 1,
      "description": "detailed visual description",
      "duration": "seconds",
      "cameraMovement": "description",
      "mood": "description"
    }
  ],
  "musicDirection": "description",
  "keyMessage": "core brand message"
}`,
              temperature: 0.8,
              maxTokens: 3000
            }
          }
        },

        // ══════════════════════════════════════
        // AGENT 3: SCRIPTWRITER
        // ══════════════════════════════════════
        {
          id: "agent-scriptwriter",
          type: "agent", // ← Changed from "model" to "agent"
          position: { x: 100, y: 650 },
          data: {
            label: "✍️ Scriptwriter Agent",
            description: "Crafts compelling dialogue and voiceover copy",
            config: {
              provider: "anthropic",
              model: "kie:claude-sonnet-4-20250514",
              systemPrompt: `You are an award-winning commercial scriptwriter.

CREATIVE BRIEF:
- Concept: {{conceptTitle}}
- Storyboard: {{storyboard}}
- Key Message: {{keyMessage}}

RESPONSIBILITIES:
- Write compelling voiceover narration
- Craft punchy, memorable dialogue
- Ensure rhythm and pacing match visual beats
- Create hooks for first 3 seconds

OUTPUT REQUIREMENTS:
Return a JSON object with:
{
  "title": "Ad Title",
  "duration": "30s/60s",
  "script": [
    {
      "timecode": "00:00-00:03",
      "visual": "what's on screen",
      "audio": "voiceover or dialogue",
      "sfx": "sound effects"
    }
  ],
  "tagline": "final memorable line",
  "cta": "call to action"
}`,
              temperature: 0.7,
              maxTokens: 2000
            }
          }
        },

        // ══════════════════════════════════════
        // AGENT 4: VISUAL GENERATOR
        // ══════════════════════════════════════
        {
          id: "agent-visual-generator",
          type: "agent", // ← Changed from "model" to "agent"
          position: { x: 100, y: 850 },
          data: {
            label: "🎬 Visual Generator Agent",
            description: "Creates AI-generated visual assets and storyboard frames",
            config: {
              provider: "anthropic",
              model: "kie:claude-sonnet-4-20250514",
              systemPrompt: `You are an AI image generation specialist for cinematic advertising.

STORYBOARD:
{{storyboard}}

VISUAL STYLE:
{{visualStyle}}

RESPONSIBILITIES:
- Generate detailed image prompts for each storyboard frame
- Ensure visual consistency across shots
- Optimize prompts for cinematic quality
- Include technical camera/lighting specs

OUTPUT REQUIREMENTS:
Return a JSON object with:
{
  "imagePrompts": [
    {
      "shotNumber": 1,
      "prompt": "ultra-detailed prompt for AI image generation",
      "aspectRatio": "16:9",
      "style": "cinematic, commercial, professional",
      "technicalSpecs": "camera angle, lighting, composition"
    }
  ],
  "colorPalette": ["#hex1", "#hex2", "#hex3"],
  "consistencyNotes": "guidelines for visual coherence"
}`,
              temperature: 0.6,
              maxTokens: 2500
            }
          }
        },

        {
          id: "tool-image-gen",
          type: "mcp", // ← Changed from "action" to "mcp"
          position: { x: 400, y: 850 },
          data: {
            label: "🖼️ Image Generation",
            description: "Generates storyboard frames via AI",
            config: {
              toolName: "generate_image",
              provider: "anthropic",
              parameters: {
                prompts: "{{imagePrompts}}",
                model: "dall-e-3",
                quality: "hd"
              }
            }
          }
        },

        // ══════════════════════════════════════
        // AGENT 5: CAMPAIGN STRATEGIST
        // ══════════════════════════════════════
        {
          id: "agent-strategist",
          type: "agent", // ← Changed from "model" to "agent"
          position: { x: 100, y: 1050 },
          data: {
            label: "📈 Campaign Strategist Agent",
            description: "Develops distribution and optimization strategy",
            config: {
              provider: "anthropic",
              model: "kie:claude-sonnet-4-20250514",
              systemPrompt: `You are a digital marketing strategist specializing in video ad campaigns.

CAMPAIGN ASSETS:
- Script: {{script}}
- Visuals: {{visualAssets}}
- Target Audience: {{targetAudience}}

RESPONSIBILITIES:
- Recommend platform-specific cuts (TikTok, Instagram, YouTube)
- Design A/B test variations
- Plan distribution schedule
- Set KPI targets

OUTPUT REQUIREMENTS:
Return a JSON object with:
{
  "platformStrategy": {
    "tiktok": {
      "duration": "15s",
      "hook": "first 3 seconds",
      "format": "vertical 9:16",
      "variations": ["var1", "var2"]
    },
    "instagram": {...},
    "youtube": {...}
  },
  "abTests": [
    {
      "variable": "hook",
      "variantA": "description",
      "variantB": "description"
    }
  ],
  "kpis": {
    "views": "target",
    "engagement": "target",
    "ctr": "target"
  },
  "timeline": "launch schedule"
}`,
              temperature: 0.7,
              maxTokens: 2000
            }
          }
        },

        // ══════════════════════════════════════
        // END NODE
        // ══════════════════════════════════════
        {
          id: "end-1",
          type: "end", 
          position: { x: 100, y: 1250 },
          data: {
            label: "📦 Campaign Deliverables",
            description: "Final packaged outputs ready for production",
            config: {
              outputs: [
                {
                  name: "fullCampaignBrief",
                  type: "document",
                  format: "markdown"
                },
                {
                  name: "storyboardFrames",
                  type: "images",
                  format: "png"
                },
                { name: "script", type: "document", format: "json" },
                {
                  name: "platformAssets",
                  type: "package",
                  format: "zip"
                }
              ]
            }
          }
        }
      ],

      edges: [
        { id: "e1", source: "start-1", target: "agent-trend-analyst", animated: true },
        { id: "e2", source: "agent-trend-analyst", target: "tool-trend-research", animated: true },
        { id: "e3", source: "tool-trend-research", target: "agent-creative-director", animated: true },
        { id: "e4", source: "agent-creative-director", target: "agent-scriptwriter", animated: true },
        { id: "e5", source: "agent-scriptwriter", target: "agent-visual-generator", animated: true },
        { id: "e6", source: "agent-visual-generator", target: "tool-image-gen", animated: true },
        { id: "e7", source: "tool-image-gen", target: "agent-strategist", animated: true },
        { id: "e8", source: "agent-strategist", target: "end-1", animated: true }
      ]
    });

    return { success: true, message: "Cinematic Ad Agent Suite template seeded successfully" };
  },
});