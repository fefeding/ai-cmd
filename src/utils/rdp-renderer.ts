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

/** 剪贴板流（服务端 -> 客户端） */
interface PendingClipboard {
  mimetype: string;
  data: string;
}

/** UTF-8 文本转 base64（用于剪贴板写入） */
function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

/** base64 转 UTF-8 文本（用于剪贴板读取） */
function base64ToUtf8(base64: string): string {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
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
  private onClipboard?: (text: string) => void;
  private pendingClipboard = new Map<number, PendingClipboard>();
  private clipStreamCounter = 100;

  constructor(
    container: HTMLElement,
    width: number,
    height: number,
    onSyncAck?: (t: string) => void,
    onClipboard?: (text: string) => void,
  ) {
    this.onSyncAck = onSyncAck;
    this.onClipboard = onClipboard;
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
      case 'clipboard': {
        // clipboard,stream,mimetype — 服务端剪贴板变化
        this.pendingClipboard.set(parseInt(a[0], 10), {
          mimetype: a[1] || 'UTF8_STRING',
          data: '',
        });
        break;
      }
      case 'blob': {
        // blob,stream,base64 — 图片流或剪贴板流
        const stream = parseInt(a[0], 10);
        const img = this.pending.get(stream);
        if (img) { img.data += a[1]; break; }
        const clip = this.pendingClipboard.get(stream);
        if (clip) clip.data += a[1];
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
        const clip = this.pendingClipboard.get(stream);
        if (clip) {
          this.pendingClipboard.delete(stream);
          const text = base64ToUtf8(clip.data);
          if (text && this.onClipboard) this.onClipboard(text);
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

  /**
   * 生成「把本地文本写入远端剪贴板」的指令序列。
   * Guacamole 剪贴板写入：clipboard,stream,mimetype → blob,stream,base64 → end,stream
   */
  clipboardWrite(text: string): string[] {
    const stream = this.clipStreamCounter++;
    const base64 = utf8ToBase64(text);
    return [
      buildInstruction('clipboard', stream, 'UTF8_STRING'),
      buildInstruction('blob', stream, base64),
      buildInstruction('end', stream),
    ];
  }

  dispose(): void {
    this.pending.clear();
    this.pendingClipboard.clear();
    this.streams.clear();
  }
}

export default RdpRenderer;
