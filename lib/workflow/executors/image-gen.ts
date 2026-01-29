/**
 * Image Generation Executor - Flux models via Replicate
 * Supports: flux-dev, flux-1.1-pro, flux-schnell
 * Saves images to /public/generated-images/ and returns local URLs
 */

import Replicate from 'replicate';
import fs from 'fs';
import path from 'path';

// Model configurations with Replicate IDs and pricing
const FLUX_MODELS = {
  'flux-dev': {
    replicateId: 'black-forest-labs/flux-dev',
    costPerImage: 0.025, // Higher quality, slower
    defaultSteps: 28,
    description: 'High quality, best for detailed images',
  },
  'flux-1.1-pro': {
    replicateId: 'black-forest-labs/flux-1.1-pro',
    costPerImage: 0.04, // Highest quality
    defaultSteps: 25,
    description: 'Professional quality, best results',
  },
  'flux-schnell': {
    replicateId: 'black-forest-labs/flux-schnell',
    costPerImage: 0.003, // Fast and cheap
    defaultSteps: 4,
    description: 'Fast generation, good for drafts',
  },
} as const;

type FluxModelKey = keyof typeof FLUX_MODELS;

interface ImageGenNode {
  id: string;
  data: any; // Accepts full NodeData from WorkflowNode
}

interface WorkflowState {
  variables: Record<string, any>;
  chatHistory?: Array<{ role: string; content: string }>;
}

interface ImageResult {
  shotNumber?: number;
  url: string;
  localPath: string;
  originalPrompt: string;
  aspectRatio: string;
  style?: string;
  model: string;
  duration: string;
  estimatedCost: string;
  success: boolean;
  error?: string;
}

interface ImageGenOutput {
  images: ImageResult[];
  totalGenerated: number;
  totalFailed: number;
  totalRequested: number;
  estimatedTotalCost: string;
  provider: string;
  model: string;
  modelId: string;
  savedToPublic: boolean;
  publicPath: string;
}

/**
 * Helper: Stream to Buffer
 */
async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

/**
 * Helper: Extract prompts from markdown code blocks
 */
function extractPromptsFromMarkdown(text: string): Array<{ shotNumber?: number; prompt: string; aspectRatio?: string; style?: string }> {
  console.log('Parsing markdown for code block prompts...');
  
  const prompts: Array<{ shotNumber?: number; prompt: string; aspectRatio?: string; style?: string }> = [];
  
  // Match all code blocks with ```
  const codeBlockRegex = /```\n([\s\S]*?)\n```/g;
  let match;
  let shotNumber = 1;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const blockContent = match[1].trim();
    
    // Skip blocks that are just technical specs or negative prompts
    if (blockContent.toLowerCase().includes('negative prompt:') || 
        blockContent.toLowerCase().includes('technical specifications') ||
        blockContent.length < 50) {
      continue;
    }
    
    // This is likely an image generation prompt
    prompts.push({
      shotNumber: shotNumber++,
      prompt: blockContent,
      aspectRatio: '4:3',
      style: 'cinematic',
    });
  }
  
  console.log(`Found ${prompts.length} prompts in markdown code blocks`);
  return prompts;
}

/**
 * Helper: Extract prompts from various input formats
 */
function extractPrompts(lastOutput: any): Array<{ shotNumber?: number; prompt: string; aspectRatio?: string; style?: string }> {
  console.log('Extracting prompts from lastOutput type:', typeof lastOutput);

  // Case 1: Already an array of prompt objects
  if (Array.isArray(lastOutput)) {
    console.log('Input is array, length:', lastOutput.length);
    return lastOutput.map((item, index) => ({
      shotNumber: item.shotNumber || index + 1,
      prompt: item.prompt || item.toString(),
      aspectRatio: item.aspectRatio || '4:3',
      style: item.style || 'cinematic',
    }));
  }

  // Case 2: Object with imagePrompts array (Visual Generator output)
  if (lastOutput && typeof lastOutput === 'object' && Array.isArray(lastOutput.imagePrompts)) {
    console.log('Found imagePrompts array, length:', lastOutput.imagePrompts.length);
    return lastOutput.imagePrompts.map((item: any, index: number) => ({
      shotNumber: item.shotNumber || index + 1,
      prompt: item.prompt,
      aspectRatio: item.aspectRatio || '4:3',
      style: item.style || 'cinematic',
    }));
  }

  // Case 3: Object with nested prompts
  if (lastOutput && typeof lastOutput === 'object') {
    console.log('Input is object with keys:', Object.keys(lastOutput));
    
    // Look for any array property that might contain prompts
    for (const key of Object.keys(lastOutput)) {
      const value = lastOutput[key];
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && 'prompt' in value[0]) {
        console.log(`Found prompts in property: ${key}`);
        return value.map((item: any, index: number) => ({
          shotNumber: item.shotNumber || index + 1,
          prompt: item.prompt,
          aspectRatio: item.aspectRatio || '4:3',
          style: item.style || 'cinematic',
        }));
      }
    }

    // If it's a single prompt object
    if ('prompt' in lastOutput) {
      console.log('Found single prompt object');
      return [{
        shotNumber: lastOutput.shotNumber || 1,
        prompt: lastOutput.prompt,
        aspectRatio: lastOutput.aspectRatio || '4:3',
        style: lastOutput.style || 'cinematic',
      }];
    }
  }

  // Case 4: String with markdown code blocks (Visual Generator markdown output)
  if (typeof lastOutput === 'string') {
    console.log('Input is string, checking for markdown prompts...');
    
    // Try to extract from markdown code blocks first
    if (lastOutput.includes('```')) {
      const markdownPrompts = extractPromptsFromMarkdown(lastOutput);
      if (markdownPrompts.length > 0) {
        return markdownPrompts;
      }
    }
    
    // Fallback: use entire string as single prompt
    console.log('No markdown blocks found, using entire string as single prompt');
    return [{
      shotNumber: 1,
      prompt: lastOutput,
      aspectRatio: '4:3',
      style: 'cinematic',
    }];
  }

  console.warn('Could not extract prompts from input, using default');
  return [{
    shotNumber: 1,
    prompt: 'cinematic photo, professional lighting, 4:3 aspect ratio',
    aspectRatio: '4:3',
    style: 'cinematic',
  }];
}

/**
 * Helper: Ensure public directory exists
 */
function ensurePublicDirectory(): string {
  const publicDir = path.join(process.cwd(), 'public', 'generated-images');
  
  if (!fs.existsSync(publicDir)) {
    console.log(`Creating directory: ${publicDir}`);
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  return publicDir;
}

/**
 * Main Executor
 */
export async function executeImageGenNode(
  node: ImageGenNode,
  state: WorkflowState,
  apiKeys?: { replicate?: string; openai?: string }
): Promise<ImageGenOutput> {
  console.log('🎨 Image Generation Node Starting...');
  console.log('Node ID:', node.id);
  console.log('Available API keys:', Object.keys(apiKeys || {}));

  const startTime = Date.now();

  // Validate API key
  const replicateKey = apiKeys?.replicate || process.env.REPLICATE_API_KEY;
  if (!replicateKey) {
    throw new Error(
      'REPLICATE_API_KEY not found. Please add it to your .env.local file or provide it via API keys configuration.'
    );
  }

  // Initialize Replicate
  const replicate = new Replicate({ auth: replicateKey });

  // Extract configuration - support both new imageGenConfig and legacy config
  const imageGenConfig = node.data.imageGenConfig || {};
  const legacyConfig = node.data.config || {};

  // Determine model - check imageGenConfig first, then legacy config
  let modelKey: FluxModelKey = 'flux-dev'; // Default
  if (imageGenConfig.model && imageGenConfig.model in FLUX_MODELS) {
    modelKey = imageGenConfig.model as FluxModelKey;
  } else if (legacyConfig.model) {
    // Handle legacy full model IDs
    const legacyModel = legacyConfig.model as string;
    if (legacyModel.includes('flux-schnell')) {
      modelKey = 'flux-schnell';
    } else if (legacyModel.includes('flux-1.1-pro')) {
      modelKey = 'flux-1.1-pro';
    } else if (legacyModel.includes('flux-dev')) {
      modelKey = 'flux-dev';
    }
  }

  const modelConfig = FLUX_MODELS[modelKey];
  const model = modelConfig.replicateId;
  const costPerImage = modelConfig.costPerImage;
  const numInferenceSteps = legacyConfig.num_inference_steps || modelConfig.defaultSteps;

  console.log(`🎨 Using model: ${modelKey} (${model})`);
  console.log(`   Cost per image: $${costPerImage}`);
  console.log(`   Inference steps: ${numInferenceSteps}`);

  // Extract prompts from previous node output
  const lastOutput = state.variables.lastOutput;
  const prompts = extractPrompts(lastOutput);

  console.log(`Found ${prompts.length} prompts to generate`);

  // Ensure public directory exists
  const publicDir = ensurePublicDirectory();

  // Safety limit
  const MAX_IMAGES = 20;
  const promptsToGenerate = prompts.slice(0, MAX_IMAGES);
  
  if (prompts.length > MAX_IMAGES) {
    console.warn(`⚠️ Limiting generation to ${MAX_IMAGES} images (requested ${prompts.length})`);
  }

  const results: ImageResult[] = [];
  // costPerImage is already set from modelConfig above
  let successCount = 0;
  let failCount = 0;

  // Generate images sequentially
  for (let i = 0; i < promptsToGenerate.length; i++) {
    const { shotNumber, prompt, aspectRatio, style } = promptsToGenerate[i];
    const imageStartTime = Date.now();

    console.log(`\n[${i + 1}/${promptsToGenerate.length}] Generating image for shot ${shotNumber}...`);
    console.log(`Prompt: ${prompt.substring(0, 100)}...`);

    try {
      // Truncate prompt to Replicate's limit (typically 4000 chars)
      const truncatedPrompt = prompt.length > 4000 ? prompt.substring(0, 4000) : prompt;

      // Generate image
      const output = await replicate.run(model as any, {
        input: {
          prompt: truncatedPrompt,
          num_inference_steps: numInferenceSteps,
          aspect_ratio: aspectRatio || '4:3',
        },
      }) as any;

      // Handle ReadableStream output
      if (Array.isArray(output) && output[0] instanceof ReadableStream) {
        console.log('📥 Downloading image data...');
        const imageBuffer = await streamToBuffer(output[0]);

        // Save to public folder
        const timestamp = Date.now();
        const filename = `shot-${shotNumber || i + 1}-${timestamp}.png`;
        const filepath = path.join(publicDir, filename);
        const publicUrl = `/generated-images/${filename}`;

        fs.writeFileSync(filepath, imageBuffer);
        console.log(`✅ Saved to: ${filepath}`);

        const duration = ((Date.now() - imageStartTime) / 1000).toFixed(1);

        results.push({
          shotNumber,
          url: publicUrl, // Public URL for browser
          localPath: filepath, // Full filesystem path
          originalPrompt: prompt,
          aspectRatio: aspectRatio || '4:3',
          style,
          model,
          duration: `${duration}s`,
          estimatedCost: `$${costPerImage.toFixed(4)}`,
          success: true,
        });

        successCount++;
      } else {
        throw new Error('Unexpected output format from Replicate');
      }

      // Rate limiting: Wait 1 second between requests
      if (i < promptsToGenerate.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error: any) {
      console.error(`❌ Failed to generate image for shot ${shotNumber}:`, error.message);

      results.push({
        shotNumber,
        url: '',
        localPath: '',
        originalPrompt: prompt,
        aspectRatio: aspectRatio || '4:3',
        style,
        model,
        duration: '0s',
        estimatedCost: '$0.0000',
        success: false,
        error: error.message,
      });

      failCount++;

      // Handle rate limiting
      if (error.message.includes('rate limit')) {
        console.log('⏸️ Rate limited, waiting 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalCost = (successCount * costPerImage).toFixed(4);

  console.log('\n🎨 Image Generation Complete!');
  console.log(`✅ Success: ${successCount}/${promptsToGenerate.length}`);
  console.log(`❌ Failed: ${failCount}/${promptsToGenerate.length}`);
  console.log(`💰 Total Cost: $${totalCost}`);
  console.log(`⏱️ Total Duration: ${totalDuration}s`);
  console.log(`📁 Images saved to: /public/generated-images/`);

  return {
    images: results,
    totalGenerated: successCount,
    totalFailed: failCount,
    totalRequested: promptsToGenerate.length,
    estimatedTotalCost: `$${totalCost}`,
    provider: 'replicate',
    model: modelKey,
    modelId: model,
    savedToPublic: true,
    publicPath: '/generated-images/',
  };
}