export async function copyText(value: string): Promise<void> {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(value);
  } catch {
    const previousFocus = document.activeElement;
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    try {
      input.focus();
      input.select();
      if (!document.execCommand("copy")) throw new Error("Copy failed");
    } finally {
      input.remove();
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    }
  }
}
