import { fetchFile } from '@ffmpeg/util';

// Use dynamically loaded FFmpeg from UMD bundle to avoid worker resolution issues
declare global {
  interface Window {
    FFmpegWASM: {
      FFmpeg: new () => FFmpegInstance;
    };
  }
}

interface FFmpegInstance {
  loaded: boolean;
  on(event: 'log', callback: (data: { message: string }) => void): void;
  on(event: 'progress', callback: (data: { progress: number }) => void): void;
  load(options: { coreURL: string; wasmURL: string }): Promise<void>;
  exec(args: string[]): Promise<number>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  deleteFile(path: string): Promise<void>;
  terminate(): void;
}

export interface ConversionOptions {
  width?: number;
  fps?: number;
}

export interface ConversionProgress {
  stage: 'loading' | 'processing' | 'complete';
  progress: number; // 0-100
  message: string;
}

export type ProgressCallback = (progress: ConversionProgress) => void;

export interface ConversionResult {
  blob: Blob;
  url: string;
  size: number;
}

const DEFAULT_WIDTH = 480;
const DEFAULT_FPS = 10;

class FFmpegService {
  private ffmpeg: FFmpegInstance | null = null;
  private loaded = false;
  private loading = false;

  private async loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  async load(onProgress?: ProgressCallback): Promise<void> {
    if (this.loaded) return;
    if (this.loading) {
      // Wait for existing load to complete
      while (this.loading) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.loading = true;
    onProgress?.({
      stage: 'loading',
      progress: 0,
      message: 'Initializing FFmpeg...',
    });

    try {
      const baseURL = window.location.origin + '/assets';
      console.log('[FFmpeg] Loading from:', baseURL);
      console.log('[FFmpeg] SharedArrayBuffer available:', typeof SharedArrayBuffer !== 'undefined');

      // Load FFmpeg UMD bundle if not already loaded
      if (!window.FFmpegWASM) {
        console.log('[FFmpeg] Loading UMD bundle...');
        await this.loadScript(`${baseURL}/ffmpeg.js`);
        console.log('[FFmpeg] UMD bundle loaded');
      }

      this.ffmpeg = new window.FFmpegWASM.FFmpeg();

      // Listen for log messages
      this.ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg Log]', message);
      });

      onProgress?.({
        stage: 'loading',
        progress: 30,
        message: 'Loading FFmpeg core (30MB)...',
      });

      const loadPromise = this.ffmpeg.load({
        coreURL: `${baseURL}/ffmpeg-core.js`,
        wasmURL: `${baseURL}/ffmpeg-core.wasm`,
      });

      // Add timeout detection (not rejection, just logging)
      const timeoutId = setTimeout(() => {
        console.warn('[FFmpeg] Load taking longer than 30s - check console for errors');
      }, 30000);

      await loadPromise;
      clearTimeout(timeoutId);

      console.log('[FFmpeg] Load complete!');
      this.loaded = true;
      onProgress?.({
        stage: 'loading',
        progress: 100,
        message: 'FFmpeg ready',
      });
    } catch (error) {
      console.error('[FFmpeg] Load failed:', error);
      throw error;
    } finally {
      this.loading = false;
    }
  }

  async convertToGif(
    videoFile: File,
    options: ConversionOptions = {},
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> {
    const { width = DEFAULT_WIDTH, fps = DEFAULT_FPS } = options;

    // Ensure FFmpeg is loaded
    await this.load(onProgress);

    if (!this.ffmpeg) {
      throw new Error('FFmpeg failed to initialize');
    }

    const inputName = 'input' + this.getExtension(videoFile.name);
    const outputName = 'output.gif';

    onProgress?.({
      stage: 'processing',
      progress: 0,
      message: 'Reading video file...',
    });

    // Write input file to FFmpeg virtual filesystem
    await this.ffmpeg.writeFile(inputName, await fetchFile(videoFile));

    // Set up progress tracking
    let lastProgress = 0;
    this.ffmpeg.on('progress', ({ progress }) => {
      const percent = Math.round(progress * 100);
      if (percent > lastProgress) {
        lastProgress = percent;
        onProgress?.({
          stage: 'processing',
          progress: percent,
          message: `Converting... ${percent}%`,
        });
      }
    });

    onProgress?.({
      stage: 'processing',
      progress: 5,
      message: 'Starting conversion...',
    });

    // FFmpeg command for high-quality GIF with palette generation
    // Step 1: Generate palette for better colors
    await this.ffmpeg.exec([
      '-i', inputName,
      '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=stats_mode=diff`,
      '-y', 'palette.png',
    ]);

    onProgress?.({
      stage: 'processing',
      progress: 50,
      message: 'Generating GIF...',
    });

    // Step 2: Create GIF using the palette
    await this.ffmpeg.exec([
      '-i', inputName,
      '-i', 'palette.png',
      '-lavfi', `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
      '-y', outputName,
    ]);

    onProgress?.({
      stage: 'processing',
      progress: 95,
      message: 'Finalizing...',
    });

    // Read the output file
    const data = await this.ffmpeg.readFile(outputName);
    // Copy to new Uint8Array to ensure ArrayBuffer compatibility
    const uint8Data = new Uint8Array(data as Uint8Array);
    const blob = new Blob([uint8Data], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);

    // Cleanup
    await this.ffmpeg.deleteFile(inputName);
    await this.ffmpeg.deleteFile('palette.png');
    await this.ffmpeg.deleteFile(outputName);

    onProgress?.({
      stage: 'complete',
      progress: 100,
      message: 'Conversion complete!',
    });

    return {
      blob,
      url,
      size: blob.size,
    };
  }

  private getExtension(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext ? `.${ext}` : '.mp4';
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  terminate(): void {
    if (this.ffmpeg) {
      this.ffmpeg.terminate();
      this.ffmpeg = null;
      this.loaded = false;
    }
  }
}

// Export singleton instance
export const ffmpegService = new FFmpegService();
