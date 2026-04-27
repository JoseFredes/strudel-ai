export type Example = { name: string; code: string };

export const EXAMPLES: Example[] = [
  {
    name: 'deep house — 120',
    code: `setcps(0.5)
stack(
  s("bd*4"),
  s("~ cp").gain(0.7),
  s("hh*8").gain(0.35).pan(sine.slow(8)),
  s("~ ~ oh ~").gain(0.5),
  note("c2 eb2 g2 eb2")
    .s("sawtooth")
    .cutoff(sine.range(400, 1800).slow(8))
    .resonance(8)
    .room(0.4)
)`,
  },
  {
    name: 'driving techno — 130',
    code: `setcps(0.54)
stack(
  s("bd*4"),
  s("~ ~ hh ~").gain(0.6),
  s("hh*16").gain(0.25),
  s("~ cp").gain(0.7).room(0.2),
  note("c1*8")
    .s("square")
    .cutoff(perlin.range(200, 2000).slow(4))
    .resonance(12)
    .gain(0.6)
)`,
  },
  {
    name: 'acid 303 — 125',
    code: `setcps(0.52)
stack(
  s("bd ~ bd ~").gain(0.9),
  s("~ cp").gain(0.6),
  s("hh*8").gain(0.3),
  note("c2 c2 eb2 c2 g1 c2 bb1 c2")
    .s("sawtooth")
    .cutoff(sine.range(300, 2200).slow(16))
    .resonance(18)
    .sometimes(x => x.fast(2))
    .gain(0.7)
)`,
  },
  {
    name: 'minimal dub — 118',
    code: `setcps(0.49)
stack(
  s("bd ~ ~ bd"),
  s("~ cp").room(0.6).delay(0.3).gain(0.5),
  s("hh*4").gain(0.3).pan(sine.slow(6)),
  note("<a2 c3 e3 g3>/2")
    .s("triangle")
    .room(0.8)
    .delay(0.5)
    .gain(0.4)
)`,
  },
];
