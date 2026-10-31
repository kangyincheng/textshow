(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const STORAGE_KEY = 'textshow:v1';

  const FONTS = {
    heavy: { family: '"Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif', weight: '900' },
    sans: { family: 'system-ui, -apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif', weight: '800' },
    serif: { family: '"Songti SC", "Noto Serif SC", Georgia, "Times New Roman", serif', weight: '700' },
    mono: { family: '"SF Mono", Consolas, "Courier New", "Noto Sans Mono", monospace', weight: '800' },
    round: { family: 'ui-rounded, "SF Pro Rounded", "PingFang SC", "Noto Sans SC", sans-serif', weight: '800' }
  };

  const SOUND_LABELS = {
    alarm: '高频警报',
    siren: '警笛',
    urgent: '急促哔声',
    steady: '持续鸣响'
  };

  const PRESETS = {
    concert: {
      text: '一起唱！',
      font: 'heavy',
      fontSize: 26,
      color: '#ff2d95',
      glow: true,
      textFlash: false,
      bounce: true,
      marquee: true,
      rainbow: true,
      speed: 1.4,
      bgColor: '#07030b',
      flashColor: '#2b0a3f',
      bgFlash: true,
      bgHz: 2.5
    },
    emergency: {
      text: '车辆故障\n请绕行',
      font: 'heavy',
      fontSize: 30,
      color: '#ffffff',
      glow: true,
      textFlash: false,
      bounce: false,
      marquee: false,
      rainbow: false,
      speed: 1,
      bgColor: '#05060c',
      flashColor: '#ff3b30',
      bgFlash: true,
      bgHz: 2
    },
    clean: {
      text: 'TEXTSHOW',
      font: 'heavy',
      fontSize: 22,
      color: '#ffffff',
      glow: true,
      textFlash: false,
      bounce: false,
      marquee: false,
      rainbow: false,
      speed: 1,
      bgColor: '#05060c',
      flashColor: '#ff2d95',
      bgFlash: false,
      bgHz: 4
    }
  };

  const DEFAULTS = {
    text: 'TEXTSHOW',
    font: 'heavy',
    fontSize: 20,
    color: '#ffffff',
    glow: true,
    textFlash: false,
    bounce: true,
    marquee: false,
    rainbow: false,
    speed: 1,
    bgColor: '#05060c',
    flashColor: '#ff2d95',
    bgFlash: false,
    alertStripe: false,
    bgHz: 4,
    torchHz: 8,
    soundPattern: 'alarm',
    volume: 40
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const toNumber = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isFinite(number) ? clamp(number, min, max) : fallback;
  };

  const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

  const fmtHz = (value) => `${Number(value).toFixed(1)} Hz`;

  const state = { ...DEFAULTS };

  const stage = $('#stage');
  const stageBg = $('#stageBg');
  const marquee = $('#marquee');
  const marqueeTrack = $('#marqueeTrack');
  const displayText = $('#displayText');
  const displayTextClone = $('#displayTextClone');
  const panel = $('#panel');
  const panelBackdrop = $('#panelBackdrop');
  const openPanelBtn = $('#openPanel');
  const startShowBtn = $('#startShow');
  const toastEl = $('#toast');

  const textInput = $('#textInput');
  const sizeRange = $('#sizeRange');
  const sizeOut = $('#sizeOut');
  const speedRange = $('#speedRange');
  const speedOut = $('#speedOut');
  const bgHzRange = $('#bgHzRange');
  const bgHzOut = $('#bgHzOut');
  const torchHzRange = $('#torchHzRange');
  const torchHzOut = $('#torchHzOut');
  const volumeRange = $('#volumeRange');
  const volumeOut = $('#volumeOut');
  const textColorInput = $('#textColor');
  const bgColorInput = $('#bgColor');
  const flashColorInput = $('#flashColor');
  const torchSwitch = $('#torchSwitch');
  const soundSwitch = $('#soundSwitch');
  const torchPill = $('#torchPill');
  const soundPill = $('#soundPill');

  const PLAY_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';
  const EXIT_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"></path></svg>';

  let toastTimer = 0;
  let wakeLock = null;
  let fittedFontSize = state.fontSize;
  let resizeFrame = 0;

  /* ---------- Stage rendering ---------- */

  function fitStageText() {
    fittedFontSize = state.fontSize;
    stage.style.setProperty('--font-size', `${state.fontSize}vmin`);

    if (state.marquee) return;

    const styles = getComputedStyle(stage);
    const availableWidth =
      stage.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight) - 4;
    const availableHeight = stage.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);

    for (let i = 0; i < 4; i += 1) {
      const width = displayText.scrollWidth;
      const height = displayText.scrollHeight;
      const ratio = Math.min(availableWidth / Math.max(1, width), availableHeight / Math.max(1, height), 1);
      if (ratio > 0.995) break;
      fittedFontSize = Math.max(4, fittedFontSize * Math.max(0.3, ratio) * 0.985);
      stage.style.setProperty('--font-size', `${fittedFontSize}vmin`);
    }
  }

  function updateSizeOutput() {
    if (fittedFontSize < state.fontSize - 0.2) {
      sizeOut.textContent = `${state.fontSize} → ${fittedFontSize.toFixed(1)}`;
      sizeOut.title = '长文本已自动缩小以完整显示';
    } else {
      sizeOut.textContent = String(state.fontSize);
      sizeOut.removeAttribute('title');
    }
  }

  function applyStage() {
    stage.style.setProperty('--text', state.color);
    stage.style.setProperty('--speed', String(state.speed));
    stage.style.setProperty('--bg', state.bgColor);
    stage.style.setProperty('--flash', state.flashColor);
    stageBg.style.animationDuration = `${(1 / state.bgHz).toFixed(3)}s`;

    // Mutually exclusive visual modes
    if (state.alertStripe) {
      alertStripes.start();
      stage.classList.remove('flash-bg');
    } else {
      alertStripes.stop();
      stage.classList.toggle('flash-bg', state.bgFlash);
    }

    const font = FONTS[state.font] || FONTS.heavy;
    const raw = state.text.length ? state.text : 'TEXTSHOW';
    const display = state.marquee ? raw.replace(/\s*\n+\s*/g, ' ') : raw;

    displayText.textContent = display;
    displayTextClone.textContent = display;
    marquee.classList.toggle('on', state.marquee);

    [displayText, displayTextClone].forEach((node) => {
      node.classList.toggle('glow', state.glow);
      node.classList.toggle('rainbow', state.rainbow);
      node.style.fontFamily = font.family;
      node.style.fontWeight = font.weight;
      node.style.color = state.rainbow ? 'transparent' : state.color;
      node.style.setProperty('--glow', state.color);
    });

    const animations = [];
    if (state.bounce) {
      animations.push(`bounce ${(0.9 / state.speed).toFixed(2)}s ease-in-out infinite`);
    }
    if (state.textFlash) {
      animations.push(`textFlash ${(0.8 / state.speed).toFixed(2)}s steps(1, end) infinite`);
    }
    if (state.rainbow) {
      animations.push(`rainbow ${(4 / state.speed).toFixed(2)}s linear infinite`);
    }
    const animation = animations.join(', ');
    displayText.style.animation = animation;
    displayTextClone.style.animation = animation;

    const duration = Math.max(6, display.length * 0.55) / state.speed;
    marqueeTrack.style.animationDuration = `${duration.toFixed(2)}s`;

    fitStageText();
    updateSizeOutput();
  }

  /* ---------- Controls ---------- */

  function fillRange(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
    input.style.setProperty('--p', `${percent}%`);
  }

  function syncSwatches() {
    $$('#textSwatches .swatch').forEach((swatch) => {
      swatch.classList.toggle('is-active', swatch.dataset.color.toLowerCase() === state.color.toLowerCase());
    });
  }

  function updateStageStatus() {
    torchPill.hidden = !torch.active;
    soundPill.hidden = !soundEngine.active;
    torchPill.textContent = torch.active ? `闪光灯 ${fmtHz(state.torchHz)}` : '';
    soundPill.textContent = soundEngine.active ? `警示音 ${SOUND_LABELS[state.soundPattern]}` : '';
  }

  function syncControls() {
    textInput.value = state.text;

    $$('#fontSeg .seg-btn').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.font === state.font);
    });

    sizeRange.value = String(state.fontSize);
    sizeOut.textContent = String(state.fontSize);
    fillRange(sizeRange);

    speedRange.value = String(state.speed);
    speedOut.textContent = `${state.speed.toFixed(1)}×`;
    fillRange(speedRange);

    bgHzRange.value = String(state.bgHz);
    bgHzOut.textContent = fmtHz(state.bgHz);
    fillRange(bgHzRange);

    torchHzRange.value = String(state.torchHz);
    torchHzOut.textContent = fmtHz(state.torchHz);
    fillRange(torchHzRange);

    volumeRange.value = String(state.volume);
    volumeOut.textContent = String(state.volume);
    fillRange(volumeRange);

    textColorInput.value = state.color;
    bgColorInput.value = state.bgColor;
    flashColorInput.value = state.flashColor;
    syncSwatches();

    $('#fxGlow').checked = state.glow;
    $('#fxFlash').checked = state.textFlash;
    $('#fxBounce').checked = state.bounce;
    $('#fxMarquee').checked = state.marquee;
    $('#fxRainbow').checked = state.rainbow;
    $('#bgFlash').checked = state.bgFlash;
    $('#alertStripe').checked = state.alertStripe;

    torchSwitch.checked = torch.active;
    soundSwitch.checked = soundEngine.active;

    $$('#soundSeg .seg-btn').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.sound === state.soundPattern);
    });

    updateStageStatus();
  }

  function persist() {
    const payload = {
      text: state.text,
      font: state.font,
      fontSize: state.fontSize,
      color: state.color,
      glow: state.glow,
      textFlash: state.textFlash,
      bounce: state.bounce,
      marquee: state.marquee,
      rainbow: state.rainbow,
      speed: state.speed,
      bgColor: state.bgColor,
      flashColor: state.flashColor,
      bgFlash: state.bgFlash,
      alertStripe: state.alertStripe,
      bgHz: state.bgHz,
      torchHz: state.torchHz,
      soundPattern: state.soundPattern,
      volume: state.volume
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      /* storage may be unavailable */
    }
  }

  function loadState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (error) {
      saved = null;
    }
    if (saved && typeof saved === 'object') {
      Object.keys(DEFAULTS).forEach((key) => {
        if (saved[key] !== undefined) state[key] = saved[key];
      });
    }

    state.text = String(state.text ?? '').slice(0, 120);
    state.font = FONTS[state.font] ? state.font : 'heavy';
    state.fontSize = toNumber(state.fontSize, 20, 6, 40);
    state.speed = toNumber(state.speed, 1, 0.3, 3);
    state.bgHz = toNumber(state.bgHz, 4, 0.5, 12);
    state.torchHz = toNumber(state.torchHz, 8, 0.5, 20);
    state.volume = toNumber(state.volume, 40, 0, 100);
    state.color = isHex(state.color) ? state.color : '#ffffff';
    state.bgColor = isHex(state.bgColor) ? state.bgColor : '#05060c';
    state.flashColor = isHex(state.flashColor) ? state.flashColor : '#ff2d95';
    state.soundPattern = SOUND_LABELS[state.soundPattern] ? state.soundPattern : 'alarm';
    ['glow', 'textFlash', 'bounce', 'marquee', 'rainbow', 'bgFlash', 'alertStripe'].forEach((key) => {
      state[key] = Boolean(state[key]);
    });
  }

  /* ---------- Panel ---------- */

  function openPanel() {
    panel.classList.add('open');
    panelBackdrop.classList.add('show');
    panel.setAttribute('aria-hidden', 'false');
    openPanelBtn.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    panel.classList.remove('open');
    panelBackdrop.classList.remove('show');
    panel.setAttribute('aria-hidden', 'true');
    openPanelBtn.setAttribute('aria-expanded', 'false');
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2600);
  }

  /* ---------- Fullscreen & wake lock ---------- */

  async function acquireWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock || document.hidden) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch (error) {
      wakeLock = null;
    }
  }

  function updateShowButton() {
    const isFullscreen = Boolean(document.fullscreenElement);
    startShowBtn.innerHTML = `${isFullscreen ? EXIT_ICON : PLAY_ICON}<span>${isFullscreen ? '退出全屏' : '开始演出'}</span>`;
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (error) {
        /* ignore */
      }
      return;
    }
    const root = document.documentElement;
    if (!root.requestFullscreen || document.fullscreenEnabled === false) {
      toast('当前浏览器不支持全屏，可直接横屏使用');
      return;
    }
    try {
      await root.requestFullscreen({ navigationUI: 'hide' });
    } catch (error) {
      toast('无法进入全屏，可直接横屏使用');
    }
  }

  /* ---------- Torch ---------- */

  const torch = {
    stream: null,
    track: null,
    timer: null,
    lit: false,
    active: false,

    async start(hz) {
      if (!window.isSecureContext) {
        throw new Error('需要 HTTPS 或 localhost 才能调用闪光灯');
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('当前浏览器不支持摄像头调用');
      }

      if (!this.stream) {
        let stream = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
          });
        } catch (error) {
          if (error && error.name === 'NotAllowedError') {
            throw new Error('未获得摄像头权限，请在浏览器设置中允许后重试');
          }
          if (error && error.name === 'NotFoundError') {
            throw new Error('未检测到可用的摄像头');
          }
          throw new Error('无法打开摄像头，请检查权限');
        }
        this.stream = stream;
        this.track = stream.getVideoTracks()[0];
        const video = $('#torchVideo');
        video.srcObject = stream;
        try {
          await video.play();
        } catch (error) {
          /* hidden video may not need playback */
        }
      }

      const capabilities = this.track.getCapabilities ? this.track.getCapabilities() : {};
      if (!capabilities || !capabilities.torch) {
        await this.stop();
        throw new Error('此浏览器不支持手电筒控制，iOS 请使用系统手电筒');
      }

      this.active = true;
      this.lit = true;
      await this.applyTorch(true);
      this.restart(hz);
    },

    async applyTorch(on) {
      if (!this.track) return;
      try {
        await this.track.applyConstraints({ advanced: [{ torch: on }] });
      } catch (error) {
        /* some devices reject rapid constraint changes */
      }
    },

    restart(hz) {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      const halfPeriod = Math.max(20, 500 / hz);
      this.timer = setInterval(() => {
        if (!this.active) return;
        this.lit = !this.lit;
        this.applyTorch(this.lit);
      }, halfPeriod);
    },

    async stop() {
      this.active = false;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      if (this.track) {
        await this.applyTorch(false);
      }
      this.track = null;
      if (this.stream) {
        this.stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (error) {
            /* ignore */
          }
        });
      }
      this.stream = null;
      const video = $('#torchVideo');
      try {
        video.srcObject = null;
      } catch (error) {
        /* ignore */
      }
    }
  };

  /* ---------- Sound ---------- */

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.timer = null;
      this.nodes = [];
      this.active = false;
    }

    async init() {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('当前浏览器不支持音频播放');
        this.ctx = new AudioContextClass();
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 20;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(compressor);
        compressor.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
    }

    level(volume) {
      return clamp(Math.pow(clamp(volume, 0, 1), 1.7) * 0.9, 0, 1);
    }

    async start(pattern, volume) {
      await this.init();
      this.halt();
      this.active = true;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.level(volume), now);

      if (pattern === 'siren') {
        this.startSiren();
      } else if (pattern === 'steady') {
        this.startSteady();
      } else {
        this.startBeeps(pattern === 'urgent');
      }
    }

    halt() {
      this.active = false;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.nodes.forEach((node) => {
        if (typeof node.stop === 'function') {
          try {
            node.stop();
          } catch (error) {
            /* ignore */
          }
        }
        try {
          node.disconnect();
        } catch (error) {
          /* ignore */
        }
      });
      this.nodes = [];
      if (this.ctx && this.master) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(0, now);
      }
    }

    stop() {
      this.halt();
    }

    setVolume(volume) {
      if (!this.ctx || !this.master) return;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.level(volume), now, 0.04);
    }

    beep(frequency, duration) {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(frequency, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(7000, frequency * 2.2), now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.006);
      gain.gain.setValueAtTime(0.16, now + Math.max(0.01, duration - 0.015));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
      osc.onended = () => {
        try {
          osc.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch (error) {
          /* ignore */
        }
      };
    }

    startBeeps(urgent) {
      const frequency = urgent ? 3100 : 2600;
      const duration = urgent ? 0.07 : 0.16;
      const period = urgent ? 0.15 : 0.42;
      const tick = () => {
        if (this.active) this.beep(frequency, duration);
      };
      tick();
      this.timer = setInterval(tick, period * 1000);
    }

    startSiren() {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      filter.type = 'lowpass';
      filter.frequency.value = 5000;
      gain.gain.value = 0.13;

      let rising = true;
      const sweep = () => {
        const now = ctx.currentTime;
        osc.frequency.cancelScheduledValues(now);
        osc.frequency.setValueAtTime(rising ? 750 : 1750, now);
        osc.frequency.exponentialRampToValueAtTime(rising ? 1750 : 750, now + 0.62);
        rising = !rising;
      };

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      sweep();
      osc.start();
      this.nodes.push(osc, gain, filter);
      this.timer = setInterval(sweep, 660);
    }

    startSteady() {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.value = 2350;
      filter.type = 'lowpass';
      filter.frequency.value = 6000;
      gain.gain.value = 0.09;

      lfo.type = 'sine';
      lfo.frequency.value = 6;
      lfoGain.gain.value = 0.035;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      osc.start();
      lfo.start();
      this.nodes.push(osc, gain, filter, lfo, lfoGain);
    }
  }

  const soundEngine = new SoundEngine();

  /* ---------- Three-stripe alert ---------- */
  // Cycle: stripe0 on → gap → stripe1 on → gap → stripe2 on → gap → loop
  // Each lit phase ~240ms, gap ~70ms → full cycle ~930ms (~1.08 Hz)
  const alertStripes = {
    timer: null,
    active: false,
    // 0=red, 1=amber, 2=white, 3=gap (all off faint edge only)
    seq: [0, 3, 1, 3, 2, 3],
    step: 0,

    start() {
      if (this.active) return;
      this.active = true;
      stage.classList.add('alert');
      this.step = 0;
      this.tick();
      this.timer = setInterval(() => this.tick(), 240);
    },

    tick() {
      const idx = this.seq[this.step % this.seq.length];
      stage.setAttribute('data-strip', String(idx));
      this.step += 1;
    },

    stop() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.active = false;
      stage.classList.remove('alert');
      stage.removeAttribute('data-strip');
    }
  };

  /* ---------- Events ---------- */

  function bindSwitch(id, key) {
    const input = $(`#${id}`);
    input.addEventListener('change', () => {
      state[key] = input.checked;
      applyStage();
      persist();
    });
  }

  function bindRange(input, output, key, format, onInput) {
    input.addEventListener('input', () => {
      state[key] = Number(input.value);
      output.textContent = format(state[key]);
      fillRange(input);
      applyStage();
      if (onInput) onInput();
      persist();
    });
  }

  function bindEvents() {
    textInput.addEventListener('input', () => {
      state.text = textInput.value.slice(0, 120);
      applyStage();
      persist();
    });

    $$('#phraseChips button').forEach((button) => {
      button.addEventListener('click', () => {
        state.text = button.dataset.phrase;
        textInput.value = state.text;
        applyStage();
        persist();
      });
    });

    $$('#fontSeg .seg-btn').forEach((button) => {
      button.addEventListener('click', () => {
        state.font = button.dataset.font;
        $$('#fontSeg .seg-btn').forEach((item) => {
          item.classList.toggle('is-active', item === button);
        });
        applyStage();
        persist();
      });
    });

    bindRange(sizeRange, sizeOut, 'fontSize', (value) => String(value));
    bindRange(speedRange, speedOut, 'speed', (value) => `${value.toFixed(1)}×`);
    bindRange(bgHzRange, bgHzOut, 'bgHz', fmtHz);

    bindSwitch('fxGlow', 'glow');
    bindSwitch('fxFlash', 'textFlash');
    bindSwitch('fxBounce', 'bounce');
    bindSwitch('fxMarquee', 'marquee');
    bindSwitch('fxRainbow', 'rainbow');
    // Mutually exclusive visual modes
    $('#bgFlash').addEventListener('change', () => {
      state.bgFlash = $('#bgFlash').checked;
      if (state.bgFlash && state.alertStripe) {
        state.alertStripe = false;
        $('#alertStripe').checked = false;
      }
      applyStage();
      persist();
    });

    $('#alertStripe').addEventListener('change', () => {
      state.alertStripe = $('#alertStripe').checked;
      if (state.alertStripe && state.bgFlash) {
        state.bgFlash = false;
        $('#bgFlash').checked = false;
      }
      applyStage();
      persist();
    });

    $$('#textSwatches .swatch').forEach((swatch) => {
      swatch.addEventListener('click', () => {
        state.color = swatch.dataset.color;
        textColorInput.value = state.color;
        syncSwatches();
        applyStage();
        persist();
      });
    });

    textColorInput.addEventListener('input', () => {
      state.color = textColorInput.value;
      syncSwatches();
      applyStage();
      persist();
    });

    bgColorInput.addEventListener('input', () => {
      state.bgColor = bgColorInput.value;
      applyStage();
      persist();
    });

    flashColorInput.addEventListener('input', () => {
      state.flashColor = flashColorInput.value;
      applyStage();
      persist();
    });

    let torchRequestId = 0;
    torchSwitch.addEventListener('change', async () => {
      const requestId = ++torchRequestId;
      if (torchSwitch.checked) {
        torchSwitch.disabled = true;
        try {
          await torch.start(state.torchHz);
          if (requestId !== torchRequestId) {
            await torch.stop();
          } else {
            toast(`闪光灯已开启 · ${fmtHz(state.torchHz)}`);
          }
        } catch (error) {
          torchSwitch.checked = false;
          toast(error.message || '闪光灯开启失败');
        } finally {
          torchSwitch.disabled = false;
        }
      } else {
        await torch.stop();
      }
      torchSwitch.checked = torch.active;
      updateStageStatus();
    });

    torchHzRange.addEventListener('input', () => {
      state.torchHz = Number(torchHzRange.value);
      torchHzOut.textContent = fmtHz(state.torchHz);
      fillRange(torchHzRange);
      if (torch.active) torch.restart(state.torchHz);
      updateStageStatus();
      persist();
    });

    soundSwitch.addEventListener('change', async () => {
      if (soundSwitch.checked) {
        try {
          await soundEngine.start(state.soundPattern, state.volume / 100);
          toast(`警示音已开启 · ${SOUND_LABELS[state.soundPattern]}`);
        } catch (error) {
          soundSwitch.checked = false;
          toast(error.message || '音频启动失败');
        }
      } else {
        soundEngine.stop();
      }
      soundSwitch.checked = soundEngine.active;
      updateStageStatus();
    });

    $$('#soundSeg .seg-btn').forEach((button) => {
      button.addEventListener('click', () => {
        state.soundPattern = button.dataset.sound;
        $$('#soundSeg .seg-btn').forEach((item) => {
          item.classList.toggle('is-active', item === button);
        });
        if (soundEngine.active) {
          soundEngine.start(state.soundPattern, state.volume / 100);
        }
        updateStageStatus();
        persist();
      });
    });

    bindRange(volumeRange, volumeOut, 'volume', (value) => String(value), () => {
      if (soundEngine.active) soundEngine.setVolume(state.volume / 100);
    });

    $$('.preset').forEach((button) => {
      button.addEventListener('click', () => {
        const preset = PRESETS[button.dataset.preset];
        if (!preset) return;
        Object.assign(state, preset);
        syncControls();
        applyStage();
        persist();
        toast(`已切换到「${button.textContent.trim()}」`);
      });
    });

    openPanelBtn.addEventListener('click', () => {
      openPanel();
      updateStageStatus();
    });

    $('#panelClose').addEventListener('click', closePanel);
    panelBackdrop.addEventListener('click', closePanel);

    stage.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      openPanel();
    });

    startShowBtn.addEventListener('click', async () => {
      const alreadyFullscreen = Boolean(document.fullscreenElement);
      closePanel();
      await toggleFullscreen();
      acquireWakeLock();
      if (!alreadyFullscreen && document.fullscreenElement) {
        toast('演出模式 · 轻触屏幕打开控制');
      }
    });

    document.addEventListener('fullscreenchange', updateShowButton);

    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(applyStage);
    });

    window.addEventListener('orientationchange', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(applyStage);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && panel.classList.contains('open') && !document.fullscreenElement) {
        closePanel();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (torch.active) {
          torch.stop();
          torchSwitch.checked = false;
          updateStageStatus();
          toast('页面不可见，闪光灯已自动关闭');
        }
      } else {
        acquireWakeLock();
      }
    });

    window.addEventListener('pagehide', () => {
      if (torch.active) torch.stop();
    });

    updateShowButton();
  }

  /* ---------- Boot ---------- */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(window.location.protocol)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* offline caching is optional */
      });
    });
  }

  loadState();
  syncControls();
  applyStage();
  bindEvents();
  registerServiceWorker();
  acquireWakeLock();
})();
