# Working agreements

## Working with the reader

Four things have been said more than once, which means they were not heard the
first time. They are here so they do not have to be said again.

**Read the register, and answer in it.** *"als ik iets zeg wat je moet doen,
moet je dat doen. als ik meer open ben, meer vragend of twijfelend klink mag je
meer afwijken of tegengas bieden."* How something is said carries as much as
what is said. Stated flatly, it is an instruction and gets carried out --
*"ik vroeg allemaal en ik twijfelde niet dus dan moet je dat ook doen"* -- and
coming back at the last step to ask again is not caution, it is not having
listened. Asked openly, or hedged, or wondered aloud, it is an invitation:
disagree, propose something else, say the idea is wrong. Pushing back on the
first kind and nodding along to the second is exactly backwards, and both are
failures of the same reading. If a result along the way is bad, say so plainly
in the same breath as doing the thing -- the report and the action are not
alternatives.

**Do not measure what has already been decided.** *"ik wil niet beide meten.
het was gewoon fout eerst."* When they say something was simply wrong, an A/B
of it is not diligence, it is a wasted run and a second-guessing of their
judgement. Delete the knob and move on.

**Be modest in language.** *"je noemt het een overlap fix, maar het is maar een
kwart beter. dat is geen fix."* A fix means the problem is gone. A quarter
better is a quarter better. No celebrating a small gain, and no lyricism about
a change that barely moves a number.

**Brainstorm first, build second.** *"ik wil dat je meer gaat brainstormen met
mij en met opties voor oplossingen komt ipv heel lang werken aan wat jij de
hele tijd fixes noemt."* Put the options and a recommendation in front of them
before disappearing into an hour of solo work. Two things they have named as
the worst options: measuring more before acting, and edge flips, which destroy
crust identity.

And one design principle that has come out of all of it: **corrections applied
after the solve are a red flag.** *"ik denk dat de hoofd sweep voldoende zou
moeten zijn."* Anything that tidies the solver's answer rather than being a
force the solver feels is suspect -- and when it was measured, it was both
carrying the model and eating 83% of the runtime.

## Waiting

A full solve is about ten minutes (594 s measured, September, at subdivision 6
over 180 Ma with no post-solve corrections) and a Pages build about the same.
It was fifty minutes for a while, and the reason is worth remembering: the pass
that pulled crust off crust ran seven full coverage passes a step and only ever
looked cheap because it broke out early when nothing was doubled. Set
`STEP_TRACE=1` and the run ends with a `[cost]` line saying where its time went
-- read that before guessing, because the guess was wrong twice.

The rule below is about whether a wait is *worth* it rather than about whether
it is long:

- Is the task set up right at all? Two measurements in this project were
  abandoned mid-run because they were written O(misses x vertices) when the
  grid buckets that make them O(1) were already in `tools/lib/coverage.ts`.
- Is it worth the wait, or is there a cheaper answer that decides the same
  thing? `END_MA=40` costs a couple of minutes and settles most questions a
  full run would -- but check that it really settles the *same* question, since
  the deep end is where the curtain is sixty percent of the planet and where
  several things behave differently.
- Say so either way. An update beats silence, and "this will take seven
  minutes, here is what it will tell us" beats a seven-minute gap.

## Deploying

**The site is a viewer and nothing else.** Every reconstruction it shows lives
in the store; it reads the list of them at runtime, so a run becomes visible the
moment it is published and no deploy is involved. The deploy builds the React
app, and that is all it does.

So a run and a deploy are two separate things:

- **A run**: solve it here, where it can be measured, then
  `pnpm publish-run --label "..."`. It is the default the viewer opens with
  unless `--default no` says otherwise, which is how a run goes up to be looked
  at without becoming the model. The publisher refuses to publish a run whose
  stamp does not match this tree, so what is in the store is always some
  checkout's real answer.
- **A deploy**: push to `main`. Only worth doing when the app changed.

Because the run is made here and not on a runner, anything that only lives in
an environment variable does not ship. Every setting that is meant to be the model
belongs in `CONFIG` in `tools/lib/solver.ts` as a default, with the variable
left as the way to measure the alternative -- and exactly one default per knob,
which `pnpm test` now refuses to let slip. A variable set on the run itself is
recorded in its metadata and marks it an experiment, `STEP_TRACE` included, so
a run meant to ship is solved with a clean environment.

Do not push to `main` for every experiment. Push when there is something to
look at, and say **what** to look at and **at which time on the timeline**. If
a change will not be visible in the viewer, say that instead of letting a
build be waited on.

## Measuring

Numbers before changes, and the number that decides it named first. The
conjugate pairs held back from the solver are the score; the scorecard pairs
with dates from the geology are the check; everything else is diagnosis.

`pnpm docs` after any run whose numbers the documents quote, or `pnpm test`
fails. That test compares MODEL.md against `public/data/meta.json`, so it also
fails whenever the local data is a scratch run rather than a full one -- worth
knowing before reading it as a real failure.

## When the next step is not obvious

Say so, and then raise this before casting about: **a deep research pass on
Expanding Earth, for inspiration rather than for judgement.** Skip the sceptics
— the model already carries its own honesty section and nobody needs the
argument rehearsed. What is wanted is the constructive side: which motions the
literature and its illustrators propose, what forces are said to drive them,
what the globe is supposed to *look* like at 200 Ma, reference figures worth
comparing a frame against, and any data set that could be read the way the age
grid and ECM1 are read now.

A reader asked for this to be kept and brought up at exactly that moment, so it
is a standing item, not a suggestion made once. What that pass should go after
is written out in RESEARCH.md: ten questions, what a usable answer to each looks
like, and the artefacts worth hunting for.
