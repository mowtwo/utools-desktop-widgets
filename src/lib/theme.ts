export function applyTheme() {
  const dark = window.utools ? window.utools.isDarkColors() : window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', dark)
}
