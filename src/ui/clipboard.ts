/** Puts text on the clipboard; falls back to a hidden text box where the clipboard API is blocked. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // e.g. the page isn't focused or isn't served securely
  }
  const box = document.createElement('textarea')
  box.value = text
  box.style.position = 'fixed'
  box.style.opacity = '0'
  document.body.append(box)
  box.select()
  const ok = document.execCommand('copy')
  box.remove()
  if (!ok) throw new Error('Copy failed')
}
