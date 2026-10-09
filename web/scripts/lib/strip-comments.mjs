/**
 * Removes JS/TS comments with a small tokenizer instead of a line regex, so that a `//` inside a string, a
 * template literal or a regular expression (`'a//b'`, `` `http://x` ``, `/\/\//`) can never hide the code after it,
 * and a quote inside a comment can never open a phantom string. String and template contents are kept (the
 * boundary patterns are deliberately conservative); comment text is replaced by spaces, newlines are preserved.
 * Every ambiguity (JSX text, division vs regex) resolves towards keeping text, never towards hiding code.
 */
export function stripComments(text) {
  let out = '';
  let i = 0;
  let previous = ''; // last significant (non-space) character seen in code position
  // Each open template literal remembers the brace depth at which its `${` expression started.
  const templates = [];
  let braces = 0;

  const blank = (chunk) => chunk.replace(/[^\n]/g, ' ');
  // `}` is deliberately not an operand: after a block or object literal a `/` far more often opens a regex than divides, and a
  // wrongly guessed regex that does not close on its line falls back to code, so the ambiguity can only keep text visible.
  const isOperand = (c) => /[\w$)\]'"`]/.test(c);

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '/' && next === '/') {
      let end = text.indexOf('\n', i);
      if (end === -1) end = text.length;
      out += blank(text.slice(i, end));
      i = end;
      continue;
    }
    if (c === '/' && next === '*') {
      let end = text.indexOf('*/', i + 2);
      end = end === -1 ? text.length : end + 2;
      out += blank(text.slice(i, end));
      i = end;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      j = Math.min(j + 1, text.length);
      out += text.slice(i, j);
      i = j;
      previous = c;
      continue;
    }
    if (c === '`' || (c === '}' && templates.length > 0 && templates[templates.length - 1] === braces)) {
      // Template literal text: just opened by a backtick, or resumed after the `}` that ends a `${ ... }`.
      if (c === '}') { templates.pop(); braces -= 1; }
      let j = i + 1;
      let opensExpression = false;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '`') break;
        if (text[j] === '$' && text[j + 1] === '{') { opensExpression = true; break; }
        j += 1;
      }
      if (opensExpression) {
        out += text.slice(i, j + 2);
        i = j + 2;
        braces += 1;
        templates.push(braces);
        previous = '{';
      } else {
        j = Math.min(j + 1, text.length);
        out += text.slice(i, j);
        i = j;
        previous = '`';
      }
      continue;
    }
    if (c === '/' && !isOperand(previous)) {
      // A regular expression literal (it cannot span lines; if it does not close, it was not one).
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < text.length && text[j] !== '\n') {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '[') inClass = true;
        else if (text[j] === ']') inClass = false;
        else if (text[j] === '/' && !inClass) { closed = true; break; }
        j += 1;
      }
      if (closed) {
        out += text.slice(i, j + 1);
        i = j + 1;
        previous = '/';
        continue;
      }
    }
    if (c === '{') braces += 1;
    else if (c === '}') braces -= 1;
    out += c;
    if (!/\s/.test(c)) previous = c;
    i += 1;
  }
  return out;
}
