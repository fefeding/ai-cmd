/**
 * 轻量 Guacamole 帧渲染器。
 *
 * 只负责把 Guacamole 协议中的画面指令（size/img/blob/end/sync/cursor）绘制到
 * canvas，并把鼠标/键盘事件编码成 Guacamole 指令。相比 guacamole-common-js 的
 * 完整 Client，这里去掉了图层/Task/flush 等复杂机制，画面链路更直接可控。
 *
 * Guacamole 指令格式：`<opcode长度>.<opcode>,<值长度>.<值>,...;`
 */
import Guacamole from '../vendor/guacamole-common';

interface PendingImage {
  layer: number;
  x: number;
  y: number;
  mimetype: string;
  data: string;
}

/** 键码 -> X11 keysym 的最小映射（覆盖常见按键） */
const KEY_SYMBOLS: Record<string, number> = {
  Backspace: 0xff08, Tab: 0xff09, Enter: 0xff0d, Escape: 0xff1b,
  Delete: 0xffff, Home: 0xff50, ArrowLeft: 0xff51, ArrowUp: 0xff52,
  ArrowRight: 0xff53, ArrowDown: 0xff54, PageUp: 0xff55, PageDown: 0xff56,
  Shift: 0xffe1, Control: 0xffe3, Alt: 0xffe9, Meta: 0xffeb,
  ' ': 0x20,
};

export function keySym(key: string): number {
  if (KEY_SYMBOLS[key] !== undefined) return KEY_SYMBOLS[key];
  if (/^[a-zA-Z]$/.test(key)) return key.charCodeAt(0);
  if (/^[0-9]$/.test(key)) return key.charCodeAt(0);
  if (/^F\d+$/.test(key)) return 0xffbe + parseInt(key.slice(1), 10) - 1;
  return key.charCodeAt(0) || 0xfffd;
}

function elem(value: string | number): string {
  const s = String(value);
  return `${s.length}.${s}`;
}

/** 把一条 Guacamole 指令解析成 [opcode, ...args] */
export function parseInstruction(text: string): string[] {
  const body = text.replace(/;$/, '');
  const out: string[] = [];
  let i = 0;
  while (i < body.length) {
    const dot = body.indexOf('.', i);
    if (dot < 0) break;
    const len = parseInt(body.slice(i, dot), 10);
    if (isNaN(len)) break;
    out.push(body.slice(dot + 1, dot + 1 + len));
    i = dot + 1 + len;
    if (body[i] === ',') i++;
  }
  return out;
}

/** 由可变参数构造 Guacamole 指令字符串 */
export function buildInstruction(opcode: string, ...args: (string | number)[]): string {
  return [elem(opcode), ...args.map(elem)].join(',') + ';';
}

export class RdpRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pending = new Map<number, PendingImage>();
  private streams = new Map<number, number>();
  private nextStream = 1;
  private cursorCanvas: HTMLCanvasElement;
  private cursorCtx: CanvasRenderingContext2D;
  private cursorX = 0;
  private cursorY = 0;
  private onSyncAck?: (timestamp: string) => void;

  constructor(container: HTMLElement, width: number, height: number, onSyncAck?: (t: string) => void) {
    this.onSyncAck = onSyncAck;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    this.cursorCanvas = document.createElement('canvas');
    this.cursorCanvas.width = 32;
    this.cursorCanvas.height = 32;
    this.cursorCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
    container.appendChild(this.cursorCanvas);
    this.cursorCtx = this.cursorCanvas.getContext('2d')!;
  }

  getElement(): HTMLCanvasElement {
    return this.canvas;
  }

  setSize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /** 处理一条来自 guacd 的 Guacamole 指令 */
  feed(text: string): void {
    const parts = parseInstruction(text);
    if (!parts.length) return;
    const op = parts[0];
    const a = parts.slice(1);
    switch (op) {
      case 'size': {
        // size,layer,width,height — layer=-1 是光标层（尺寸很小），
        // 主画面 canvas 尺寸由连接配置固定，不随 size 指令改变。
        break;
      }
      case 'img':
        // img,stream,channelMask,layer,mimetype,x,y
        this.pending.set(parseInt(a[0], 10), {
          layer: parseInt(a[2], 10),
          mimetype: a[3],
          x: parseInt(a[4], 10),
          y: parseInt(a[5], 10),
          data: '',
        });
        break;
      case 'blob': {
        // blob,stream,base64
        const stream = parseInt(a[0], 10);
        const img = this.pending.get(stream);
        if (img) img.data += a[1];
        break;
      }
      case 'end': {
        // end,stream
        const stream = parseInt(a[0], 10);
        const img = this.pending.get(stream);
        if (img) {
          this.pending.delete(stream);
          this.drawImage(img);
        }
        break;
      }
      case 'sync':
        this.onSyncAck?.(a[0] || '0');
        break;
      case 'cursor': {
        // cursor,stream,x,y
        this.cursorX = parseInt(a[2], 10);
        this.cursorY = parseInt(a[3], 10);
        break;
      }
      case 'move': {
        // move,layer,x,y
        break;
      }
      default:
        break;
    }
  }

  private drawImage(img: PendingImage): void {
    if (!img.data) return;
    const image = new Image();
    image.onload = () => {
      try { this.ctx.drawImage(image, img.x, img.y); } catch { /* ignore */ }
    };
    image.src = `data:${img.mimetype};base64,${img.data}`;
  }

  /** 生成鼠标指令 */
  mouse(mask: number, x: number, y: number): string {
    return buildInstruction('mouse', mask, Math.round(x), Math.round(y));
  }

  /** 生成键盘指令 */
  key(pressed: 0 | 1, keysym: number): string {
    return buildInstruction('key', pressed, keysym);
  }

  /** 生成尺寸指令 */
  size(width: number, height: number): string {
    return buildInstruction('size', width, height, 96);
  }

  dispose(): void {
    this.pending.clear();
    this.streams.clear();
  }
}

export default RdpRenderer;
