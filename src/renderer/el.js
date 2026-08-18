export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value
    else if (key === "dataset") Object.assign(node.dataset, value)
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value)
    } else if (key === "style" && value && typeof value === "object") {
      Object.assign(node.style, value)
    } else if (value === false || value == null) continue
    else if (value === true) node.setAttribute(key, "")
    else node.setAttribute(key, String(value))
  }
  for (const child of children) {
    if (child == null || child === false) continue
    node.append(child.nodeType ? child : document.createTextNode(String(child)))
  }
  return node
}
