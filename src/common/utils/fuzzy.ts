// Subsequence fuzzy match. Returns a score (lower = better) or null if the
// query isn't a subsequence of the target. Gaps between matched chars are
// penalized so contiguous matches rank higher.
export function fuzzyScore(query: string, target: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let last = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (last >= 0) score += ti - last - 1;
      last = ti;
      qi++;
    }
  }
  return qi === q.length ? score : null;
}
