/* Runs engine searches off the main thread so the board never freezes. */
importScripts('chess-engine.js');

self.onmessage = (e) => {
  const { id, fen, moves, opts } = e.data;
  const g = new Chess(fen);
  for (const u of moves || []) { const m = g.fromUci(u); if (m) g.make(m); }
  const r = g.search(opts);
  const out = { id, score: r.score, depth: r.depth, nodes: r.nodes, ms: r.ms };
  if (r.move) { out.move = g.uci(r.move); out.moveSan = g.san(r.move); }
  if (r.best) { out.best = g.uci(r.best); out.bestSan = g.san(r.best); }
  self.postMessage(out);
};
