const sameKind = (a, b) =>
  a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.nodeType !== 1 || a.getAttribute('data-key') === b.getAttribute('data-key'));

function patchAttributes(from, to) {
  for (const { name } of [...from.attributes]) if (!to.hasAttribute(name)) from.removeAttribute(name);
  for (const { name, value } of [...to.attributes]) if (from.getAttribute(name) !== value) from.setAttribute(name, value);
}

function patchChildren(parent, next) {
  const current = [...parent.childNodes];
  const wanted = [...next.childNodes];
  wanted.forEach((node, i) => {
    const old = current[i];
    if (!old) { parent.appendChild(node); return; }
    if (!sameKind(old, node)) { parent.replaceChild(node, old); return; }
    if (old.nodeType !== 1) { if (old.nodeValue !== node.nodeValue) old.nodeValue = node.nodeValue; return; }
    patchAttributes(old, node);
    if (!old.hasAttribute('data-morph-skip')) patchChildren(old, node);
  });
  for (let i = current.length - 1; i >= wanted.length; i--) current[i].remove();
}

export function morph(target, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  patchChildren(target, template.content);
}
