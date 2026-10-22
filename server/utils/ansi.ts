/**
 * 终端输出中的 ANSI / VT 转义序列清洗。
 *
 * ⚠️ 历史实现使用过 `/\x1B[^\x1B]*[a-zA-Z]/` 这种贪婪兜底：它会从第一个 ESC 起
 * 吞掉中间所有正文，直到回溯找到最后一个字母为止，导致命令的真实输出被当作
 * 转义序列删除。典型实例（现代 bash/zsh 会开启括号粘贴模式）：
 *
 *   raw:   "whoami\r\n\x1b[?2004l\rroot\r\n\x1b[?2004h\x1b]0;...\x07root@...:~# "
 *   clean: "whoami\r\n\r\n:~# "              ← "root" 与提示符主体全部丢失
 *
 * 原因有两条：
 *   1) CSI 正则 `\x1B\[[0-9;]*[a-zA-Z]` 的参数字节类不含 '?'(0x3F)，
 *      因此 `\x1b[?2004h` / `\x1b[?2004l` 无法被清除；
 *   2) 兜底正则贪婪跨段匹配，第一个未被清除的 ESC 就成了吞噬正文的起点。
 *
 * 本实现严格按 ECMA-48 的有界结构匹配（CSI/OSC 有明确终止字节，
 * 其余按固定长度处理），绝不使用会跨越正文的贪婪兜底。
 */
export function stripAnsiEscapes(input: string): string {
  if (!input) return input;
  return input
    // OSC（窗口标题等）：ESC ] ... BEL(0x07) 或 ST(ESC \)
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    // CSI：ESC [ 参数字节(0x30–0x3F，含 '?') 中间字节(0x20–0x2F) 终止字节(0x40–0x7E)
    .replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, '')
    // DCS / PM / APC 等字符串序列：ESC P|X|^|_ ... ST
    .replace(/\x1B[PX^_][^\x1B]*\x1B\\/g, '')
    // 字符集 / 字号选择：ESC ( X、ESC ) X、ESC # X
    .replace(/\x1B[()#][0-9A-Za-z]/g, '')
    // 其它两字符 Esc 序列（ESC > 小键盘模式、ESC 7/8 光标保存恢复、ESC M 等），有界
    .replace(/\x1B(?![\[\]])[ -~]/g, '')
    // 残留的孤立 ESC
    .replace(/\x1B/g, '');
}
