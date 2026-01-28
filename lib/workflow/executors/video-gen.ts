/**
 * Video Generation Executor - Runway Gen-3 Alpha via Replicate
 * Generates video clips from prompts/images and stitches them with FFmpeg
 */

import Replicate from 'replicate';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

interface VideoGenNode {
  id: string;
  data: any; // Accepts full NodeData from WorkflowNode
}

interface WorkflowState {
  variables: Record<string, any>;
  chatHistory?: Array<{ role: string; content: string }>;
}

interface VideoClipResult {
  shotNumber?: number;
  url: string;
  localPath: string;
  originalPrompt: string;
  sourceImage?: string;
  duration: number;
  model: string;
  generationTime: string;
  estimatedCost: string;
  success: boolean;
  error?: string;
}

interface VideoGenOutput {
  clips: VideoClipResult[];
  finalVideo?: {
    url: string;
    localPath: string;
    duration: number;
    format: string;
  };
  totalGenerated: number;
  totalFailed: number;
  estimatedTotalCost: string;
  provider: 'replicate';
  stitchingStatus: 'success' | 'failed' | 'skipped';
}

/**
 * Helper: Download file from URL to local path
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(destPath);
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

/**
 * Helper: Ensure public directory exists
 */
function ensurePublicDirectory(subdir: string): string {
  const publicDir = path.join(process.cwd(), 'public', subdir);

  if (!fs.existsSync(publicDir)) {
    console.log(`Creating directory: ${publicDir}`);
    fs.mkdirSync(publicDir, { recursive: true });
  }

  return publicDir;
}

/**
 * Helper: Extract video prompts from various input formats
 */
function extractVideoPrompts(lastOutput: any): Array<{
  shotNumber?: number;
  prompt: string;
  sourceImage?: string;
  aspectRatio?: string;
}> {
  console.log('Extracting video prompts from lastOutput type:', typeof lastOutput);

  // Case 1: Image-gen output (has images array with localPath)
  if (lastOutput && typeof lastOutput === 'object' && Array.isArray(lastOutput.images)) {
    console.log('Found images array from image-gen output, length:', lastOutput.images.length);
    return lastOutput.images
      .filter((img: any) => img.success && img.localPath)
      .map((img: any, index: number) => ({
        shotNumber: img.shotNumber || index + 1,
        prompt: img.originalPrompt || `Shot ${index + 1}`,
        sourceImage: img.localPath,
        aspectRatio: img.aspectRatio || '16:9',
      }));
  }

  // Case 2: Already an array of prompt objects
  if (Array.isArray(lastOutput)) {
    console.log('Input is array, length:', lastOutput.length);
    return lastOutput.map((item, index) => ({
      shotNumber: item.shotNumber || index + 1,
      prompt: item.prompt || item.toString(),
      sourceImage: item.sourceImage || item.localPath || item.image,
      aspectRatio: item.aspectRatio || '16:9',
    }));
  }

  // Case 3: Object with imagePrompts array (Visual Generator output)
  if (lastOutput && typeof lastOutput === 'object' && Array.isArray(lastOutput.imagePrompts)) {
    console.log('Found imagePrompts array, length:', lastOutput.imagePrompts.length);
    return lastOutput.imagePrompts.map((item: any, index: number) => ({
      shotNumber: item.shotNumber || index + 1,
      prompt: item.prompt,
      sourceImage: item.sourceImage || item.image,
      aspectRatio: item.aspectRatio || '16:9',
    }));
  }

  // Case 4: Object with nested prompts
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
          sourceImage: item.sourceImage || item.localPath || item.image,
          aspectRatio: item.aspectRatio || '16:9',
        }));
      }
    }

    // If it's a single prompt object
    if ('prompt' in lastOutput) {
      console.log('Found single prompt object');
      return [{
        shotNumber: lastOutput.shotNumber || 1,
        prompt: lastOutput.prompt,
        sourceImage: lastOutput.sourceImage || lastOutput.image,
        aspectRatio: lastOutput.aspectRatio || '16:9',
      }];
    }
  }

  // Case 5: String with markdown code blocks
  if (typeof lastOutput === 'string') {
    console.log('Input is string, checking for markdown prompts...');

    // Try to extract from markdown code blocks
    if (lastOutput.includes('```')) {
      const prompts = extractPromptsFromMarkdown(lastOutput);
      if (prompts.length > 0) {
        return prompts;
      }
    }

    // Fallback: use entire string as single prompt
    console.log('No markdown blocks found, using entire string as single prompt');
    return [{
      shotNumber: 1,
      prompt: lastOutput,
      aspectRatio: '16:9',
    }];
  }

  console.warn('Could not extract prompts from input, using default');
  return [{
    shotNumber: 1,
    prompt: 'cinematic establishing shot, professional lighting',
    aspectRatio: '16:9',
  }];
}

/**
 * Helper: Extract prompts from markdown code blocks
 */
function extractPromptsFromMarkdown(text: string): Array<{
  shotNumber?: number;
  prompt: string;
  aspectRatio?: string;
}> {
  console.log('Parsing markdown for code block prompts...');

  const prompts: Array<{ shotNumber?: number; prompt: string; aspectRatio?: string }> = [];

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

    prompts.push({
      shotNumber: shotNumber++,
      prompt: blockContent,
      aspectRatio: '16:9',
    });
  }

  console.log(`Found ${prompts.length} prompts in markdown code blocks`);
  return prompts;
}

/**
 * Helper: Convert image file to data URI for Replicate
 */
function imageToDataUri(imagePath: string): string {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mimeType};base64,${base64Image}`;
}

/**
 * Helper: Generate a single video clip via Replicate API
 */
async function generateSingleClip(
  replicate: Replicate,
  prompt: string,
  options: {
    shotNumber?: number;
    sourceImage?: string;
    model?: 'gen3a_turbo' | 'minimax';
    duration?: number;
    ratio?: string;
    inputMode?: 'text' | 'image' | 'auto';
  },
  outputDir: string
): Promise<VideoClipResult> {
  const startTime = Date.now();
  const model = options.model || 'minimax';
  const duration = options.duration || 5;
  const ratio = options.ratio || '16:9';
  const inputMode = options.inputMode || 'auto';

  console.log(`Generating video clip for shot ${options.shotNumber}...`);
  console.log(`  Model: ${model}, Duration: ${duration}s, Ratio: ${ratio}`);
  console.log(`  Prompt: ${prompt.substring(0, 100)}...`);

  try {
    let output: any;

    // Determine whether to use image-to-video or text-to-video
    const shouldUseImage = inputMode === 'image' ||
      (inputMode === 'auto' && options.sourceImage && fs.existsSync(options.sourceImage));

    if (model === 'gen3a_turbo') {
      // Use Runway Gen-3 Alpha via Replicate
      // Model: runway/gen-3-alpha-turbo
      const replicateModel = 'runway/gen-3-alpha-turbo';

      if (shouldUseImage && options.sourceImage) {
        console.log(`  Using image-to-video mode with source: ${options.sourceImage}`);
        const imageUri = imageToDataUri(options.sourceImage);

        output = await replicate.run(replicateModel as any, {
          input: {
            prompt: prompt,
            image: imageUri,
            duration: duration,
            aspect_ratio: ratio,
          },
        });
      } else {
        console.log(`  Using text-to-video mode`);
        output = await replicate.run(replicateModel as any, {
          input: {
            prompt: prompt,
            duration: duration,
            aspect_ratio: ratio,
          },
        });
      }
    } else {
      // Use MiniMax video-01 model (good quality, cost-effective)
      // Model: minimax/video-01
      const replicateModel = 'minimax/video-01';

      if (shouldUseImage && options.sourceImage) {
        console.log(`  Using image-to-video mode with source: ${options.sourceImage}`);
        const imageUri = imageToDataUri(options.sourceImage);

        output = await replicate.run(replicateModel as any, {
          input: {
            prompt: prompt,
            first_frame_image: imageUri,
          },
        });
      } else {
        console.log(`  Using text-to-video mode`);
        output = await replicate.run(replicateModel as any, {
          input: {
            prompt: prompt,
          },
        });
      }
    }

    // Get output URL - Replicate returns URL directly or in an array
    let outputUrl: string;
    if (typeof output === 'string') {
      outputUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      outputUrl = output[0];
    } else if (output && typeof output === 'object' && 'url' in output) {
      outputUrl = output.url;
    } else {
      throw new Error('Unexpected output format from Replicate');
    }

    console.log(`  Video generated successfully: ${outputUrl}`);

    // Download video to local storage
    const timestamp = Date.now();
    const filename = `clip-${options.shotNumber || 1}-${timestamp}.mp4`;
    const localPath = path.join(outputDir, filename);
    const publicUrl = `/generated-videos/${filename}`;

    await downloadFile(outputUrl, localPath);
    console.log(`  Downloaded to: ${localPath}`);

    const generationTime = ((Date.now() - startTime) / 1000).toFixed(1);
    // Estimate cost based on model - Replicate prices vary
    const costPerSecond = model === 'gen3a_turbo' ? 0.05 : 0.025;
    const estimatedCost = (duration * costPerSecond).toFixed(2);

    return {
      shotNumber: options.shotNumber,
      url: publicUrl,
      localPath,
      originalPrompt: prompt,
      sourceImage: options.sourceImage,
      duration,
      model,
      generationTime: `${generationTime}s`,
      estimatedCost: `$${estimatedCost}`,
      success: true,
    };
  } catch (error: any) {
    console.error(`  Failed to generate video:`, error.message);

    return {
      shotNumber: options.shotNumber,
      url: '',
      localPath: '',
      originalPrompt: prompt,
      sourceImage: options.sourceImage,
      duration: 0,
      model,
      generationTime: '0s',
      estimatedCost: '$0.00',
      success: false,
      error: error.message,
    };
  }
}

/**
 * Helper: Stitch clips together with FFmpeg
 */
async function stitchClipsWithFFmpeg(
  clips: VideoClipResult[],
  outputDir: string
): Promise<{ url: string; localPath: string; duration: number; format: string } | null> {
  const successfulClips = clips.filter(c => c.success && c.localPath);

  if (successfulClips.length === 0) {
    console.log('No successful clips to stitch');
    return null;
  }

  if (successfulClips.length === 1) {
    // Only one clip, no need to stitch
    console.log('Only one clip, skipping stitching');
    return {
      url: successfulClips[0].url,
      localPath: successfulClips[0].localPath,
      duration: successfulClips[0].duration,
      format: 'mp4',
    };
  }

  console.log(`Stitching ${successfulClips.length} clips together...`);

  // Create concat list file
  const timestamp = Date.now();
  const concatListPath = path.join(outputDir, `concat-${timestamp}.txt`);
  const concatContent = successfulClips
    .map(clip => `file '${clip.localPath}'`)
    .join('\n');
  fs.writeFileSync(concatListPath, concatContent);

  // Output path
  const outputFilename = `final-video-${timestamp}.mp4`;
  const outputPath = path.join(outputDir, outputFilename);
  const publicUrl = `/generated-videos/${outputFilename}`;

  // Run FFmpeg concat
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        '-preset', 'fast',
        '-crf', '23',
      ])
      .output(outputPath)
      .on('start', (cmd) => {
        console.log(`FFmpeg command: ${cmd}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Stitching progress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        console.log(`Stitching complete: ${outputPath}`);

        // Calculate total duration
        const totalDuration = successfulClips.reduce((sum, clip) => sum + clip.duration, 0);

        // Clean up concat list file
        fs.unlinkSync(concatListPath);

        resolve({
          url: publicUrl,
          localPath: outputPath,
          duration: totalDuration,
          format: 'mp4',
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        // Clean up concat list file
        if (fs.existsSync(concatListPath)) {
          fs.unlinkSync(concatListPath);
        }
        reject(err);
      })
      .run();
  });
}

/**
 * Main Executor
 */
export async function executeVideoGenNode(
  node: VideoGenNode,
  state: WorkflowState,
  apiKeys?: { replicate?: string }
): Promise<VideoGenOutput> {
  console.log('🎬 Video Generation Node Starting...');
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

  // Initialize Replicate client
  const replicate = new Replicate({ auth: replicateKey });

  // Extract configuration
  const config = node.data.videoGenConfig || {};
  const model = config.model || 'minimax';
  const duration = config.duration || 5;
  const ratio = config.ratio || '16:9';
  const inputMode = config.inputMode || 'auto';

  // Extract prompts from previous node output
  const lastOutput = state.variables.lastOutput;
  let prompts: Array<{
    shotNumber?: number;
    prompt: string;
    sourceImage?: string;
    aspectRatio?: string;
  }>;

  // Check if lastOutput contains approved images from an approval node
  if (lastOutput && typeof lastOutput === 'object') {
    const output = lastOutput as any;

    // Check for approved images from user-approval node
    if (output.approvedImages && Array.isArray(output.approvedImages)) {
      console.log('Using approved images from approval node');
      prompts = output.approvedImages.map((img: any, index: number) => ({
        shotNumber: img.shotNumber || index + 1,
        prompt: img.originalPrompt || `Shot ${index + 1}`,
        sourceImage: img.localPath,
        aspectRatio: '16:9',
      }));
    } else if (output.selectedImages && Array.isArray(output.selectedImages)) {
      console.log('Using selected images from approval node');
      prompts = output.selectedImages.map((img: any, index: number) => ({
        shotNumber: img.shotNumber || index + 1,
        prompt: img.originalPrompt || `Shot ${index + 1}`,
        sourceImage: img.localPath,
        aspectRatio: '16:9',
      }));
    } else {
      // Fallback to extracting from general output
      prompts = extractVideoPrompts(lastOutput);
    }
  } else {
    prompts = extractVideoPrompts(lastOutput);
  }

  console.log(`Found ${prompts.length} prompts to generate`);

  // Ensure output directory exists
  const outputDir = ensurePublicDirectory('generated-videos');

  // Safety limit - video generation is expensive
  const MAX_CLIPS = 10;
  const promptsToGenerate = prompts.slice(0, MAX_CLIPS);

  if (prompts.length > MAX_CLIPS) {
    console.warn(`⚠️ Limiting generation to ${MAX_CLIPS} clips (requested ${prompts.length})`);
  }

  const clips: VideoClipResult[] = [];
  const costPerSecond = model === 'gen3a_turbo' ? 0.05 : 0.025;
  let successCount = 0;
  let failCount = 0;

  // Generate clips sequentially with rate limiting
  for (let i = 0; i < promptsToGenerate.length; i++) {
    const { shotNumber, prompt, sourceImage, aspectRatio } = promptsToGenerate[i];

    console.log(`\n[${i + 1}/${promptsToGenerate.length}] Generating video for shot ${shotNumber}...`);

    try {
      const clip = await generateSingleClip(
        replicate,
        prompt,
        {
          shotNumber,
          sourceImage,
          model,
          duration,
          ratio: aspectRatio || ratio,
          inputMode,
        },
        outputDir
      );

      clips.push(clip);

      if (clip.success) {
        successCount++;
      } else {
        failCount++;
      }

      // Rate limiting: 2 second delay between requests
      if (i < promptsToGenerate.length - 1) {
        console.log('Waiting 2 seconds before next request...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error: any) {
      console.error(`❌ Failed to generate video for shot ${shotNumber}:`, error.message);

      clips.push({
        shotNumber,
        url: '',
        localPath: '',
        originalPrompt: prompt,
        sourceImage,
        duration: 0,
        model,
        generationTime: '0s',
        estimatedCost: '$0.00',
        success: false,
        error: error.message,
      });

      failCount++;

      // Handle rate limiting - back off for 30 seconds
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        console.log('⏸️ Rate limited, waiting 30 seconds...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }
  }

  // Stitch clips together
  let finalVideo: { url: string; localPath: string; duration: number; format: string } | undefined;
  let stitchingStatus: 'success' | 'failed' | 'skipped' = 'skipped';

  if (successCount > 0) {
    try {
      const stitchResult = await stitchClipsWithFFmpeg(clips, outputDir);
      if (stitchResult) {
        finalVideo = stitchResult;
        stitchingStatus = 'success';
      }
    } catch (error: any) {
      console.error('Failed to stitch clips:', error.message);
      stitchingStatus = 'failed';
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalVideoDuration = clips.filter(c => c.success).reduce((sum, c) => sum + c.duration, 0);
  const totalCost = (totalVideoDuration * costPerSecond).toFixed(2);

  console.log('\n🎬 Video Generation Complete!');
  console.log(`✅ Success: ${successCount}/${promptsToGenerate.length}`);
  console.log(`❌ Failed: ${failCount}/${promptsToGenerate.length}`);
  console.log(`💰 Total Cost: $${totalCost}`);
  console.log(`⏱️ Total Generation Time: ${totalDuration}s`);
  console.log(`🎥 Total Video Duration: ${totalVideoDuration}s`);
  console.log(`📁 Videos saved to: /public/generated-videos/`);
  console.log(`🔗 Stitching Status: ${stitchingStatus}`);

  return {
    clips,
    finalVideo,
    totalGenerated: successCount,
    totalFailed: failCount,
    estimatedTotalCost: `$${totalCost}`,
    provider: 'replicate',
    stitchingStatus,
  };
}
