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
  {
    name: 'afro house — 122',
    code: `setcps(0.508)
stack(
  s("bd ~ bd ~").gain(0.9),
  s("~ ~ cp ~").gain(0.7).room(0.3),
  s("[lt mt]*2 ~ ht").gain(0.55),
  s("hh*8").gain(0.28).pan(sine.slow(4)),
  s("[sh sh]*3 ~ sh").gain(0.4),
  note("c2 c2 f2 ~ eb2 ~")
    .s("sawtooth")
    .cutoff(800)
    .resonance(6)
    .gain(0.6)
)`,
  },
  {
    name: 'minimal techno — 132',
    code: `setcps(0.55)
stack(
  s("bd*4").gain(0.95),
  s("hh*8").gain(0.18).pan(sine.slow(16)),
  s("~ ~ ~ cp").gain(0.5).room(0.15),
  note("c1*16")
    .s("square")
    .cutoff(sine.range(180, 600).slow(32))
    .resonance(14)
    .gain(0.45)
    .pan(cosine.slow(8))
)`,
  },
  {
    name: 'berlin dark — 138',
    code: `setcps(0.575)
stack(
  s("bd*4").gain(1),
  s("hh*16").gain(0.2).pan(sine.slow(6)),
  s("[~ ~ cp ~]*2").gain(0.6).room(0.4).delay(0.2),
  s("mt ~ ~ mt ~ ~ mt ~").gain(0.4).room(0.5),
  note("c1*8")
    .s("sawtooth")
    .cutoff(perlin.range(100, 800).slow(8))
    .resonance(16)
    .gain(0.5)
)`,
  },
  {
    name: 'dub techno — 128',
    code: `setcps(0.533)
stack(
  s("bd ~ ~ ~").gain(0.9),
  s("~ cp").gain(0.5).room(0.9).delay(0.6),
  s("hh*4").gain(0.22).pan(sine.slow(12)),
  note("<cm7 fm7>/8")
    .s("sawtooth")
    .cutoff(sine.range(200, 900).slow(16))
    .resonance(10)
    .room(0.95)
    .delay(0.7)
    .gain(0.45)
)`,
  },
  {
    name: 'melodic techno — 126',
    code: `setcps(0.525)
stack(
  s("bd*4").gain(0.88),
  s("~ cp").gain(0.6).room(0.3),
  s("hh*8").gain(0.25).pan(sine.slow(7)),
  note("c4 eb4 g4 bb4 c5 bb4 g4 eb4")
    .s("triangle")
    .cutoff(sine.range(600, 3000).slow(16))
    .resonance(4)
    .room(0.7)
    .delay(0.3)
    .gain(0.5),
  note("c2 ~ eb2 ~")
    .s("sawtooth")
    .cutoff(400)
    .resonance(8)
    .gain(0.55)
)`,
  },
  {
    name: 'industrial — 140',
    code: `setcps(0.583)
stack(
  s("bd*4").gain(1).distort(0.4),
  s("[~ cp]*2").gain(0.7).room(0.2).distort(0.3),
  s("[mt lt ht lt]*2").gain(0.5).distort(0.5),
  s("hh*16").gain(0.15).pan(rand),
  note("c1*8")
    .s("sawtooth")
    .cutoff(perlin.range(100, 1200).slow(4))
    .resonance(20)
    .distort(0.6)
    .gain(0.6)
)`,
  },
  {
    name: 'uk garage — 130',
    code: `setcps(0.541)
stack(
  s("bd ~ ~ bd ~ ~ bd ~").gain(0.9),
  s("~ cp ~ cp").gain(0.7),
  s("[oh oh ~]*2 ~").gain(0.45).pan(sine.slow(5)),
  s("hh*8").gain(0.2),
  note("c2 ~ eb2 g2 ~ f2 ~ d2")
    .s("triangle")
    .cutoff(1200)
    .resonance(6)
    .gain(0.6)
)`,
  },
  {
    name: 'jungle — 160',
    code: `setcps(0.666)
stack(
  s("bd ~ ~ ~ bd ~ ~ ~").gain(0.9),
  s("~ cp").gain(0.7).room(0.2),
  s("hh*16").gain(0.22).pan(sine.slow(3)),
  s("lt ~ ht ~ mt ht ~ lt").fast(2).gain(0.5),
  note("c3 eb3 g3 c3")
    .s("sawtooth")
    .cutoff(sine.range(400, 2000).slow(4))
    .resonance(10)
    .gain(0.55)
)`,
  },
];
