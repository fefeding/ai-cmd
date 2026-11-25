import * as vscode from 'vscode';

const language = (vscode.env.language || 'en').toLowerCase();

export const isChinese =
  language === 'zh' || language === 'zh-cn' || language.startsWith('zh-hans');

/** 根据宿主界面语言选择文案（CodeBuddy/VSCode 简体中文为 `zh-cn`）。 */
export function t(zh: string, en: string): string {
  return isChinese ? zh : en;
}
