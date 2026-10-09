export default {
  hint: ['indice', 'indices'],
  // plural(n, 'wrong', 'wrong'): "3 wrong" in the result statistics, "3 mauvaises réponses" in French.
  wrong: ['mauvaise réponse', 'mauvaises réponses'],
} as Record<string, readonly [string, string]>;
