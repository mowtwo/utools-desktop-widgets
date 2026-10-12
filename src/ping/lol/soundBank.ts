// 移植自 lolPing（https://github.com/darrenprx/lolPing，MIT，Copyright (c) 2026 Danrui Meng），见 NOTICE。
// 原样保留：预先解码的 Web Audio 缓冲，每次播放新建 Audio 元素会有明显延迟。

/** Safety ceiling: more overlapping sounds than this are skipped (the ping still shows). */
export const MAX_VOICES = 8;

/** Pre-decoded Web Audio buffers: HTMLAudioElement per play added audible latency in the prototype. */
export class SoundBank {
  private readonly ctx = new AudioContext({ latencyHint: 'interactive' });
  private readonly buffers = new Map<string, AudioBuffer>();
  private voices = 0;

  /** Decodes every sound up front, each under its key. Resolves with the URLs that failed to load. */
  async load(entries: readonly { key: string; url: string }[]): Promise<string[]> {
    const results = await Promise.all(
      entries.map(async ({ key, url }) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          this.buffers.set(key, await this.ctx.decodeAudioData(await res.arrayBuffer()));
          return null;
        } catch {
          return url;
        }
      }),
    );
    return results.filter((r): r is string => r !== null);
  }

  play(key: string, volume01: number): void {
    const buffer = this.buffers.get(key);
    if (!buffer || volume01 <= 0 || this.voices >= MAX_VOICES) return;
    if (this.ctx.state !== 'running') void this.ctx.resume();
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buffer;
    gain.gain.value = volume01;
    src.connect(gain).connect(this.ctx.destination);
    this.voices++;
    src.onended = () => this.voices--;
    src.start();
  }
}
