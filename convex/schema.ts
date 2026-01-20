import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ══════════════════════════════════════
  // WORKFLOWS TABLE
  // ══════════════════════════════════════
  workflows: defineTable({
    customId: v.optional(v.string()),
    userId: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    
    // Template flags
    isTemplate: v.optional(v.boolean()),
    isPublic: v.optional(v.boolean()),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    difficulty: v.optional(v.string()),
    estimatedTime: v.optional(v.string()),
    
    // Graph data
    nodes: v.array(v.any()),
    edges: v.array(v.any()),
    
    // Metadata
    version: v.optional(v.string()),
    status: v.optional(v.string()),
    
    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_customId", ["customId"])
    .index("by_userId", ["userId"])
    .index("by_template", ["isTemplate"])
    .index("by_category", ["category"]),

  // ══════════════════════════════════════
  // EXECUTIONS TABLE
  // ══════════════════════════════════════
  executions: defineTable({
    workflowId: v.id("workflows"),
    userId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    status: v.string(), // "pending" | "running" | "completed" | "failed"
    
    // Input/output data
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    error: v.optional(v.string()),
    nodeResults: v.optional(v.any()),
    
    // Execution metadata
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    duration: v.optional(v.number()),
    
    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_workflow", ["workflowId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  // ══════════════════════════════════════
  // APPROVALS TABLE
  // ══════════════════════════════════════
  approvals: defineTable({
    approvalId: v.optional(v.string()),
    executionId: v.optional(v.id("executions")),
    workflowId: v.id("workflows"),
    userId: v.optional(v.string()),
    
    status: v.string(), // "pending" | "approved" | "rejected"
    message: v.optional(v.string()),
    approvedBy: v.optional(v.string()),
    respondedBy: v.optional(v.string()),
    
    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
    resolvedAt: v.optional(v.string()),
    respondedAt: v.optional(v.string()),
  })
    .index("by_approvalId", ["approvalId"])
    .index("by_execution", ["executionId"])
    .index("by_workflow", ["workflowId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  // ══════════════════════════════════════
  // MCP SERVERS TABLE
  // ══════════════════════════════════════
  mcpServers: defineTable({
  userId: v.optional(v.string()),
  name: v.string(),
  description: v.optional(v.string()),
  url: v.optional(v.string()),
  command: v.optional(v.string()),
  args: v.optional(v.array(v.string())),
  env: v.optional(v.any()),
  tools: v.optional(v.any()),
  
  // Configuration
  isOfficial: v.optional(v.boolean()),
  enabled: v.optional(v.boolean()),
  category: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  connectionStatus: v.optional(v.string()),
  lastTested: v.optional(v.string()),      // ← MAKE SURE THIS EXISTS
  lastError: v.optional(v.string()),       // ← MAKE SURE THIS EXISTS
  
  // Auth fields (ADD THESE)
  authType: v.optional(v.string()),        // ← ADD THIS
  accessToken: v.optional(v.string()),     // ← ADD THIS
  headers: v.optional(v.any()),            // ← ADD THIS
  
  // Metadata
  version: v.optional(v.string()),
  author: v.optional(v.string()),
  
  // Timestamps
  createdAt: v.string(),
  updatedAt: v.string(),
})
  .index("by_userId", ["userId"])
  .index("by_enabled", ["enabled"])
  .index("by_isOfficial", ["isOfficial"]),

  // ══════════════════════════════════════
  // USER MCP CONNECTIONS TABLE
  // ══════════════════════════════════════
  userMCPs: defineTable({
    userId: v.string(),
    mcpServerId: v.optional(v.id("mcpServers")),
    name: v.string(),
    url: v.optional(v.string()),
    command: v.optional(v.string()),
    args: v.optional(v.array(v.string())),
    env: v.optional(v.any()),
    headers: v.optional(v.any()),
    
    enabled: v.optional(v.boolean()),
    
    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_userId", ["userId"]),

  // ══════════════════════════════════════
  // USER LLM KEYS TABLE
  // ══════════════════════════════════════
  userLLMKeys: defineTable({
    userId: v.string(),
    provider: v.string(), // "anthropic" | "openai" | "google" | etc
    encryptedKey: v.string(),
    keyPrefix: v.optional(v.string()),
    label: v.optional(v.string()),
    
    isActive: v.optional(v.boolean()),
    lastUsedAt: v.optional(v.string()),
    usageCount: v.optional(v.number()),
    
    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_userProvider", ["userId", "provider"])
    .index("by_isActive", ["isActive"]),

  // ══════════════════════════════════════
  // API KEYS TABLE
  // ══════════════════════════════════════
  apiKeys: defineTable({
    userId: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    name: v.optional(v.string()),
    
    isActive: v.optional(v.boolean()),
    lastUsedAt: v.optional(v.string()),
    usageCount: v.optional(v.number()),
    revokedAt: v.optional(v.string()),
    
    // Permissions
    scopes: v.optional(v.array(v.string())),
    
    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
    expiresAt: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_keyHash", ["keyHash"])
    .index("by_isActive", ["isActive"]),
});