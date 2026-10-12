export function applyTheme(dark?: boolean) {
  const isDark =
    dark ?? (window.utools ? window.utools.isDarkColors() : window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}
