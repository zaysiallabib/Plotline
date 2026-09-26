# Plotline — Product philosophy (plain language)

Written 2026-09-26 after the founder sent five marketing renders from Sheltech's website
(brick tower with hanging gardens, a double-height lobby, the driveway, a gym, a living room)
and asked three questions. The answers below are the company's position until the founder
changes them. Read this before pitching, before art-directing, and before arguing about realism.

## 1. Is that level of realism possible for us?

**Not in a browser, not in real time, and not from a plan traced in 15 minutes.** Those images
were made the slow way: a 3D artist modelled that exact building and that exact lobby in
3ds Max or Blender, dressed it by hand, and a path tracer (Corona, V-Ray, Cycles) chewed on
each picture for hours on a workstation. Some studios now finish them with AI (the sofa
close-up and the living room look AI-polished: perfect fabric, perfect lens blur). Either way it
is one artist, one viewpoint, one weekend, one picture. That is why they cost $100–300 each and
why a developer has five of them, not five hundred.

Our engine draws sixty pictures a second on the buyer's own laptop from a plan the sales
staff traced this morning. The physics is the same (real materials, real sun position) but
the light bounces we can afford are a fraction of theirs, our furniture comes from a shared
library rather than being modelled for that flat, and nobody hand-tunes each shot. On a good
day we look like a clean, honest photo of a real, slightly plain flat. We will not look like a
magazine cover. Chasing that is a trap: every step closer costs a lot and the gap never closes.

## 2. Is it necessary?

**No. It is the wrong target.** The render's job is to make the buyer *want* the building.
Plotline's job is to let the buyer *understand the exact flat they are about to pay for*, and
to write down what they decided.

A buyer sees the render, gets excited, and then has a hundred small questions the render
cannot answer: which flat is mine, which floor, where does the afternoon sun land, is the
kitchen really that narrow, can I have the darker floor, can that wall go, will the tiles be
like the sample. Today the answer is a brochure plan and "the tiles will be like the sample,
inshallah". Plotline answers every one of those on the buyer's screen and records the answer.

So the developer keeps buying renders. We are not against them; we sit next to them. The
staffer opens the render to sell the dream and opens Plotline to close the specific unit.

The realism we do need is **credibility**, not beauty: correct sizes, correct sun, doors that
swing the right way, a kitchen you can stand in, glass that reads as glass, nothing that looks
like a cartoon or a game. That is why "honest sunlight, calm staging, plain exterior" are our
defaults and why the art-director scores aim for a believable 7, not a 10.

## 3. "We sell apartments anyway. Why pay for your tool?"

Do not argue. Agree, then ask three questions. Every developer has at least one.

1. **"How many units are unsold right now, and how many of those are not the type you have a
   show flat for?"** A physical show flat covers one unit type on one floor. A render covers
   one viewpoint. Plotline covers every unit on every floor, made by your own staff in an
   afternoon each. The pitch: a show flat for every unit type at one percent of the cost.
2. **"How many of your buyers live abroad?"** The NRB buyer decides with a brother in Dhaka
   over WhatsApp. He cannot visit. He needs to walk the actual flat, at night, on his laptop,
   and send the link with his choices marked. Track "opens outside Bangladesh" from day one.
3. **"What happens when a buyer says the tiles are not what they were promised?"** Every
   choice a buyer makes in Plotline is a dated, written row: which floor finish, which paint,
   which change request, when. That change list annexed to the sale agreement kills the
   argument before it starts. This is the part no render, no brochure and no show flat can do,
   and it is the part that keeps them paying after the launch excitement fades.

If none of the three lands, they are not our customer yet. That is what the week-6 kill gate in
the masterplan is for. Selling a tool to someone who feels no pain is the one thing we must
not spend months on.

## 4. What we are actually fighting

- **Not the renders.** They are the developer's marketing; they will exist whatever we do.
- **Not "everything is going digital".** Nobody pays for digital. They pay for fewer unsold
  units, faster NRB closes, and fewer post-sale fights.
- **Habit and laziness.** The real enemy is a sales team that does not want to trace a plan,
  and a sales head who will not pay for something his staff will not use. That is why the
  Studio's minutes-to-trace number matters more than any render comparison, why the founder's
  own 13:15 first trace was a milestone, and why the next wave is Studio ergonomics.
- **Ourselves, when we chase pretty.** Every hour on a glossier veranda is an hour not spent
  on the trace, the link and the change list. The look only has to stop being an objection.

## 5. Where realism can still improve cheaply (later, not now)

When a paying pilot asks: baked lighting per unit (a one-time bake gives soft bounced light
the real-time path cannot), a bigger and better furniture library, developer-supplied facade
and lobby models for the outside view, and better neighbour blocks from map data. None of
these are Phase 0. All of them are cheaper than one afternoon of arguing with a render.

## 6. One-line answers to keep in your pocket

- *"Your render looks better than this."* — Yes. That is a picture of one flat; this is every flat, yours to walk, on your buyer's phone.
- *"Our buyers don't need this."* — Your abroad buyers do, and your finish disputes do.
- *"My staff won't learn it."* — It is click, type the printed number, click. The founder traced a flat in 13 minutes the first time.
- *"Why not just more renders?"* — Because a render cannot say what the buyer chose, and cannot sign a change list.
