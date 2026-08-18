window.addEventListener("error", (event) => {
  const pre = document.createElement("pre")
  pre.id = "boot-error"
  pre.style.cssText = "position:relative;z-index:9;margin:64px 20px 0;color:#ff8b80;white-space:pre-wrap;font:13px/1.4 ui-monospace,monospace"
  pre.textContent = [event.message, event.filename && `${event.filename}:${event.lineno}`]
    .filter(Boolean)
    .join("\n")
  if (!document.getElementById("boot-error")) document.body.prepend(pre)
})
