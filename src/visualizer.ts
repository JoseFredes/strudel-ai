let animId: number | null = null;
let analyser: AnalyserNode | null = null;
let audioCtx: AudioContext | null = null;
let playing = false;
let currentCps = 0.5;

// Per-bar state for smooth decay
const BAR_COUNT = 32;
const barHeights = new Float32Array(BAR_COUNT);
const barVelocities = new Float32Array(BAR_COUNT);

export function initVisualizer(ctx: AudioContext, node?: AudioNode): AnalyserNode {
  audioCtx = ctx;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.75;
  if (node) node.connect(analyser);
  return analyser;
}

export function setVisualizerState(isPlaying: boolean, cps: number) {
  playing = isPlaying;
  currentCps = cps;
}

export function startVisualizer(canvas: HTMLCanvasElement) {
  stopVisualizer();
  resize(canvas);

  function frame() {
    animId = requestAnimationFrame(frame);
    draw(canvas);
  }
  frame();
}

export function stopVisualizer() {
  if (animId !== null) { cancelAnimationFrame(animId); animId = null; }
}

function resize(canvas: HTMLCanvasElement) {
  canvas.width = canvas.offsetWidth * devicePixelRatio;
  canvas.height = canvas.offsetHeight * devicePixelRatio;
}

function draw(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const fftData = new Uint8Array(analyser?.frequencyBinCount ?? 0);
  const hasReal = analyser && playing;
  if (hasReal) analyser!.getByteFrequencyData(fftData);

  const t = audioCtx?.currentTime ?? 0;
  const barW = W / BAR_COUNT;

  for (let i = 0; i < BAR_COUNT; i++) {
    let target: number;

    if (hasReal && fftData.length > 0) {
      // Map bar index to frequency bin
      const binIdx = Math.floor((i / BAR_COUNT) * (fftData.length * 0.6));
      target = (fftData[binIdx] / 255) * H * 0.9;
    } else if (playing) {
      // BPM-synced synthetic animation
      const beat = t * currentCps * 4; // 16th-note counter
      const phase = ((beat + i * 0.33) % 4) / 4; // 0–1
      const pulse = Math.pow(Math.max(0, 1 - phase * 2), 2);
      const wave = (Math.sin(i * 1.3 + t * 2.1) * 0.4 + 0.6);
      target = (pulse * 0.6 + wave * 0.3) * H * 0.85;
    } else {
      target = 0;
    }

    // Smooth approach
    const diff = target - barHeights[i];
    barVelocities[i] = barVelocities[i] * 0.6 + diff * 0.4;
    barHeights[i] = Math.max(0, barHeights[i] + barVelocities[i]);

    const h = barHeights[i];
    if (h < 1) continue;

    const grad = ctx.createLinearGradient(0, H, 0, H - h);
    grad.addColorStop(0, 'rgba(111,216,143,0.9)');
    grad.addColorStop(0.5, 'rgba(60,140,90,0.7)');
    grad.addColorStop(1, 'rgba(30,60,50,0.3)');
    ctx.fillStyle = grad;
    ctx.fillRect(i * barW + 1, H - h, barW - 2, h);
  }
}
