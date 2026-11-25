import { createI18n } from 'vue-i18n';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

type Locale = 'zh-CN' | 'en-US';

function normalizeLocale(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;
  const id = value.trim().toLowerCase().replace('_', '-');
  if (id === 'zh' || id === 'zh-cn' || id === 'zh-hans') return 'zh-CN';
  if (id === 'en' || id === 'en-us') return 'en-US';
  return undefined;
}

function initialLocale(): Locale {
  // 用户在侧边栏手动切换过的语言优先；否则跟随宿主（VSCode/CodeBuddy）界面语言。
  const saved = normalizeLocale(localStorage.getItem('aicmd-locale'));
  if (saved) return saved;
  const fromHost = typeof window !== 'undefined'
    ? normalizeLocale(new URLSearchParams(window.location.search).get('locale'))
    : undefined;
  return fromHost || 'en-US';
}

const savedLocale = initialLocale();

const i18n = createI18n({
  locale: savedLocale,
  fallbackLocale: 'en-US',
  legacy: false,
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale as any;
  localStorage.setItem('aicmd-locale', locale);
}

export function getLocale() {
  return i18n.global.locale.value;
}

export default i18n;
