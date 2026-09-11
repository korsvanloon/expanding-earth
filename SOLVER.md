# The solver, in pseudo code

This describes `tools/lib/solver.ts` from the top down: the whole idea first,
then the loop, then each piece it calls. Nothing here assumes you know the
codebase, and every name is explained where it first appears.

It is written to be read in order. If you stop after Part 1 you will know what
the program does; after Part 2, how a single step of time works; Parts 3 to 6
are the details of each mechanism.

---

## Part 0. The vocabulary

Eight words carry the whole thing.

| word | meaning |
|---|---|
| **globe** | A sphere whose radius changes with time. Today it is 6,371 km. Going back in time it gets smaller. |
| **crust** | The rock skin of the planet. Modelled as a triangle mesh wrapped round the globe: 40,962 corner points and 81,920 triangles. |
| **point** (vertex) | One corner of that mesh. It has a 3-D position. Moving points is the only thing the solver ever does. |
| **triangle** (face) | Three points. It has an *age* — when its sea floor erupted — and a *rigidity* — how much it refuses to deform. |
| **age** | How long ago a piece of sea floor was created at a mid-ocean ridge. Measured by ships and magnetometers; it is input data, not a model output. Continents have no age in this sense, so they are marked "permanent". |
| **step** | One million years of going backwards. The run does 200 of them. |
| **sweep** | One pass over every triangle inside a single step, nudging points to satisfy the rules. A step does 80 of these. |
| **fold** | What happens to crust that had not erupted yet at the time being reconstructed. It is pushed *inside* the globe rather than deleted. |
| **probe** | One of 100,000 fixed directions from the centre of the Earth, used to ask "is any crust lying this way?" This is how coverage is measured. |

---

## Part 1. The whole idea, in fifteen lines

```
The hypothesis: the Earth was smaller in the past, and the sea floor we see
today is the record of it growing. So:

  1. Read the age of every piece of sea floor on Earth today.      (input data)
  2. The area of sea floor younger than T is the area the globe
     grew by in the last T million years. Subtract it, and you
     have the area of the globe at time T -- hence its radius.     (arithmetic)
  3. Take today's crust. Walk backwards one million years at a
     time. At each step:
        - shrink everything onto the smaller globe
        - take away the sea floor that had not erupted yet
        - let the remaining crust move and deform to fit
  4. What you get at each step is a reconstruction of the globe
     at that time.
  5. Score it against things you did NOT use to build it.          (honesty)
```

Everything below is step 3.

Two properties of the arrangement matter more than any detail:

- **There is no ground truth to fit to.** Nothing in the solver is told what the
  world looked like at 100 Ma. The radius comes from the age data, the motions
  come from the age data, and the reconstruction is whatever falls out.
- **It runs backwards.** That means crust only ever *disappears* as the run
  proceeds, never appears. Several mechanisms rely on that being true.

---

## Part 2. The main loop

```
FUNCTION solve():

    # ---- Inputs, read once -------------------------------------------------
    mesh          = 40,962 points and 81,920 triangles wrapped on a sphere
    ageOf[face]   = when this triangle's sea floor erupted, in Ma
                    (a special large value means "permanent": a continent)
    rigidityOf[face] = 0..1, how much this crust refuses to deform
                    (from a map of crust types, and from a measured
                     effective elastic thickness where one exists)
    islandOf[point]  = which rigid block this point belongs to, or none
                    (a shield, a platform, a stable basin)
    radiusAt(time)   = the radius curve computed from the age data
    tracks           = fracture zones traced across the sea floor, and
                       conjugate pairs -- two points that were once the
                       same point at a ridge. HALF of these drive the
                       solve; the other half are kept back as the score.

    # ---- The state being solved for ----------------------------------------
    position[point] = today's direction x today's radius      # 3-D vector
    drift[point]    = (0,0,0)   # each point's remembered motion

    # ---- Walk backwards ----------------------------------------------------
    FOR time = 1 Ma, 2 Ma, 3 Ma, ... up to 200 Ma:
        doOneStep(time)
        IF time is a multiple of 5:
            record(time)        # write out a frame, measure everything

    checkTheMeshIsStillASphere()   # or every area reported is a lie
```

### One step of time

This is the heart of the program. Read it once end to end; each named piece is
expanded in Parts 3–6.

```
FUNCTION doOneStep(time):

    rNow  = radiusAt(time)            # the globe we are moving TO
    rWas  = radiusAt(time - 1 Ma)     # the globe we are moving FROM
    shrink = rNow / rWas              # slightly less than 1

    remember previousPosition = position     # used later by two mechanisms

    # -- A. Shrink ----------------------------------------------------------
    # Everything contracts uniformly onto the smaller globe. This alone makes
    # the crust overlap itself, because the same crust now has less room.
    FOR every point: position *= shrink

    # -- B. Un-make the crust that did not exist yet -------------------------
    # Sea floor younger than `time` had not erupted. It must stop being crust.
    markWhichTrianglesAreCrustNow(time)      # see Part 3
    pushTheRestInside()                      # THE FOLD -- see Part 3

    # -- C. Work out what each triangle should measure ----------------------
    # Done once per step rather than once per sweep: it does not change while
    # the sweeps run, and doing it 80 times was a million square roots a step.
    FOR every triangle:
        targetEdgeLength[3] = today's edge lengths, scaled by:
             - how much of that edge is crust that exists yet (0..1)
             - how much the model has decided to let this crust stretch
        targetArea          = today's area, scaled the same way

    # -- D. Set the crust moving ------------------------------------------
    pushAlongTheSpreadingField(time)         # see Part 4

    # -- E. Which rims have met -------------------------------------------
    findNewlyClosedSeams()                   # see Part 5

    # -- F. Solve, by relaxation ------------------------------------------
    FOR sweep = 1 to 80:
        doOneSweep(sweep, time)              # see below

    # -- G. Projections, after the solve -----------------------------------
    clapTheClosingRidgesShut(6 rounds)       # see Part 5
    pullCrustOffCrust(7 rounds)              # see Part 6
    haulCrustOverAnyBareSky(8 rounds)        # see Part 6

    # -- H. Tidy up ---------------------------------------------------------
    removeTheNetRotationOfTheWholeShell()    # see Part 6
```

### One sweep

A sweep is one pass of a *position-based* solver. There are no forces and no
velocities: each rule simply moves the points it cares about closer to
satisfying itself, in order, over and over, until they stop arguing. This is
the same method cloth and rope are simulated with.

```
FUNCTION doOneSweep(sweep, time):

    # 1. Edge springs. The bulk of the work: 3 edges x 81,920 triangles.
    FOR every triangle f, alternating front-to-back and back-to-front:

        IF f is crust that exists now:
            stiffness = how much this crust resists deforming
            FOR each of its three edges:
                move both ends together or apart until the edge measures
                targetEdgeLength -- but only partly, by `stiffness`
                (shortening is resisted harder than stretching: oceanic
                 crust rifts apart readily and does not squash)

        ELSE IF f is on the rim of a ridge that has to shut:
            # Its crust does not exist yet, so its three corners belong in
            # the SAME PLACE. This is what closes an ocean.
            move its three corners together along the surface of the globe,
            each keeping its own depth

        ELSE:
            # Folded-in crust, hanging inside the globe. It asks for nothing.
            skip

    # 2. Data constraints
    pullConjugatePairsTogether()     # half of them; see Part 4
    keepFractureZonesSmooth()        # half of them; see Part 4

    # 3. Hard rules
    pushRigidBlocksOutOfEachOther()  # two continents may not interpenetrate
    holdEachTriangleToItsArea()      # see Part 6
    stopTrianglesTurningInsideOut()  # a barrier, not a spring; see Part 6

    # 4. Put everything back on the globe
    snapPointsToRadius(rNow)         # the shell is a shell
    holdFoldedCrustInside()          # and the folded part stays inside

    # 5. Block behaviour
    holdRigidBlocksToTheirShape()    # see Part 5
    holdClosedSeamsShut()            # see Part 5
    dragBlocksByTheirHangingSlabs()  # see Part 5

    # 6. Every 8th sweep only
    IF sweep mod 8 == 7:
        smoothTheMotionAcrossNeighbours()   # see Part 5
```

Order matters here and is not arbitrary: anything that moves a point across
the surface is followed by something that puts it back on the sphere, because
those are two different questions — *where on the globe* a point is, and *how
deep* it hangs.

---

## Part 3. The fold: what happens to crust that does not exist yet

Going backwards, sea floor has to stop being crust. There are two ways to do
that and the model uses the second.

```
# Option 1, "the collapse": delete it.
#   Merge the points away and re-triangulate. Structurally perfect -- the
#   remaining crust tiles the globe exactly -- but it destroys the mesh:
#   40,962 points become 23,391 by 90 Ma. Crust loses its identity and the
#   picture develops large blank patches.
#
# Option 2, "the fold": push it inside. THIS IS WHAT THE MODEL DOES.
#   Nothing is deleted. The crust that has not erupted is pushed below the
#   shell, where it exerts no force and is not counted as covering anything.
#   The mesh keeps every point it started with.
```

```
FUNCTION markWhichTrianglesAreCrustNow(time):
    FOR every triangle f:
        crustNow[f]  = (ageOf[f] >= time)         # its floor has erupted
        closing[f]   = (NOT crustNow[f]) AND (f still has a corner up top)
        # `closing` triangles are the top of the curtain: the ones whose job
        # is to bring the two flanks of a vanished ridge into one place.

FUNCTION pushTheRestInside():
    FOR every point that belongs only to non-crust triangles:
        decide how deep it should hang, from how much crust is folded over it
        move it down to that depth, keeping its direction
    # The top of the curtain is pinned directly beneath the line it folded
    # over, so the fold keeps a sharp right angle at the surface. Below that
    # pin, the crust is free to be crumpled any way at all -- it is inside the
    # Earth, it is not being looked at, and it exerts no force.
```

Two consequences worth holding on to:

- Crust is **conserved**. Nothing is thrown away, so a later question like
  "where did this piece of Africa come from" always has an answer.
- The fold is **monotone going backwards**: crust only ever goes down, never
  comes back up. Mechanisms that remember things (like welded seams) rely on
  this.

---

## Part 4. What makes the crust move

Three things, in descending order of how much they matter.

### 4a. The spreading field — the engine

```
# Prepared once, before the run:
#
#   The age of the sea floor is a smooth field over the globe. Its gradient
#   points from young crust to old crust, and its steepness is the inverse of
#   the spreading rate: where ages change slowly with distance, the floor was
#   laid down fast.
#
#   flow[point] = -gradient(age) / |gradient(age)|^2
#
#   That vector points TOWARDS the ridge the crust came from, with a length in
#   km per million years. Run backwards, every piece of sea floor travels down
#   it, back to where it erupted. Nothing is fitted: it is a derivative of data
#   already in hand. It reproduces the real spreading rates -- about 10 km/Myr
#   in the Atlantic, about 90 on the East Pacific Rise.
#
#   The field is smoothed over a few hundred km first, because a fracture zone
#   is a step in the age field and the gradient of a step points the wrong way.

FUNCTION pushAlongTheSpreadingField(time):
    FOR every living point p:
        IF p's own crust vanishes between now and 14 Myr from now:
            # only the isochrons disappearing around this moment are read:
            # that is the margin the ocean is closing at, right now. Crust
            # deep inside a plate records the rate when it FORMED, which is a
            # different question.
            newPush = flow[p] * oneMillionYears
            drift[p] = 0.5 * drift[p] + 0.5 * newPush     # it remembers
        ELSE:
            drift[p] = 0.5 * drift[p]                     # it coasts
        position[p] += drift[p]
```

The memory is what turns a sequence of independent nudges into a *motion*, and
what keeps a continent moving after its own sea floor has run out. There are no
plates here and there deliberately are none: what moves together is whatever
the crust holds together, which is a consequence rather than an input.

### 4b. Conjugate pairs — data as a constraint

A conjugate pair is two points on opposite sides of a ridge that were the same
point when they erupted. They are read off published fracture-zone geometry.

```
FUNCTION pullConjugatePairsTogether():
    FOR each pair (A, B) whose crust still exists at this time:
        IF the TRACK this pair sits on has an even number:
            move A and B towards their midpoint
        ELSE:
            do nothing -- this pair is the SCORE

        # Split by track rather than by pair, because two pairs a few million
        # years apart on one walk are nearly the same claim and splitting them
        # would leak the answer across the divide.
```

The split is the whole point. A pair the solver was told to close is no
evidence that it closed; the held-back half is what every "pairs = 117 km"
number in the documentation is measured on.

### 4c. Fracture zone tracks — keeping lines straight

```
FUNCTION keepFractureZonesSmooth():
    FOR each drawn track, in the half that drives:
        FOR each three consecutive points along it:
            IF the middle one has developed a kink beyond an allowance:
                straighten it, proportionally to how far past the allowance
```

A fracture zone is a scar left by two plates sliding past each other. It is
straight on the real sea floor, so a reconstruction that bends it is wrong.

---

## Part 5. What holds the crust together

### 5a. Rigid blocks ("islands")

```
# An island is a patch of strong crust -- a shield, a craton, a stable basin --
# that the model says must not deform. It is the one thing in the solver that
# cannot be argued with; everything else is a spring.

FUNCTION holdRigidBlocksToTheirShape():
    FOR each island:
        fit the single rotation that best explains where the island's points
        are now, compared to the shape it has today
        (3 iterations of a least-squares fit about the centre of the Earth)

    FOR each point of an island:
        where it WOULD be if the island were perfectly rigid under that
        rotation = walk from the island's rotated centre, along its rotated
        bearing, for its own fixed distance
        move the point a fraction of the way there

        # That fraction is NOT the same for every point. It is scaled by the
        # crust's own strength, so a shield is held hard and a thinned sliver
        # hanging off its edge is barely held at all. Deformation then belongs
        # to the thin crust, which is where the model says it belongs.
```

Measured consequence: turning this off entirely produces *better* geometry —
fewer holes, less overlap — and takes the strain inside cratons from 1.2% to
21.9%. It closes the holes by kneading the shields. So it stays on.

### 5b. Welded seams

```
# The problem it solves: once a ridge has shut, the two flanks are touching and
# MECHANICALLY UNRELATED. There is no spring, no shared triangle and no island
# across the join. So a push from the east moves the east flank, the west flank
# never hears about it, and where they were touching they now overlap.

FUNCTION findNewlyClosedSeams():           # once per step
    FOR each living point p not already stitched:
        find the nearest other living point q such that:
             - q is within 50 km of p
             - p and q do NOT share a triangle    (else they are the same crust)
             - q is not already stitched
        IF found: remember the pair (p, q) FOREVER

FUNCTION holdClosedSeamsShut():            # every sweep
    FOR each remembered pair (p, q):
        move both onto the direction halfway between them,
        each keeping its own depth

# It is a SEAM weld and deliberately not a BODY weld. Welding the plates either
# side into one rigid block would freeze the model: by 200 Ma nearly every ridge
# has shut, and the shell would be one block that cannot reconstruct anything.
#
# It is remembered forever because the run goes backwards and crust only ever
# disappears, so a seam that has closed stays closed.
#
# It is PAIRWISE and that is not a detail. The first version merged everything
# that met into one group and held each group on its own average direction. A
# seam is a LINE, so the group swallowed the whole line and the hold pulled that
# line onto a single point: at 10 Ma it took the doubled sphere from 0.1% to
# 15.5%.
```

### 5c. Slab drag

```
FUNCTION dragBlocksByTheirHangingSlabs():
    # The folded crust hanging under a continent's margin pulls on it. A hanging
    # slab does not tug a margin sideways, it TURNS A PLATE -- so the pulls are
    # summed into a torque about the block's own centre, weighted by how hard
    # that block is to turn about each axis (which differs by a factor of
    # hundreds: spinning a continent in place is easy, sliding it is not).
    # Continents that have come into contact are dragged as one body.
```

### 5d. Motion smoothing

```
FUNCTION smoothTheMotionAcrossNeighbours():          # every 8th sweep
    movement[p] = where p is now  -  where p was at the start of the step
    repeat twice:
        movement[p] = average of movement over p and its neighbours
    move each point a fraction of the way towards
        (its start-of-step place + its smoothed movement)

# What this attacks: the model deforms 20 to 30 times more than the data
# allows, and squeezed and stretched come out nearly EQUAL at every epoch, so
# almost all of it cancels globally. That is not crust being deformed by a
# closure it cannot make. It is squeeze immediately beside stretch -- a plate
# whose leading edge is squashed and whose trailing edge is pulled instead of
# the plate simply moving. That is a long-wavelength failure, and this is the
# only pass in the solver that acts at a longer wavelength than one triangle.
```

---

## Part 6. Keeping the shell a shell

### 6a. Measuring coverage — the number the model is judged on

```
FUNCTION coverage():
    # You cannot answer this by adding up triangle areas: a sheet folded over
    # itself in one place and short in another sums to exactly the right total
    # while covering neither place correctly. So ask the sky directly.
    FOR each of 100,000 fixed directions:
        count how many living triangles lie that way
        0  -> BARE      (a hole in the planet)
        2+ -> DOUBLED   (crust lying on crust)
    # The directions are a golden-angle spiral, deliberately sharing no symmetry
    # with the mesh. When they were mesh vertices instead, every probe landed on
    # a corner and the measurement was meaningless for years.
```

### 6b. The three repairs, in the order of badness

A hole is worse than an overlap; an overlap is worse than a squeeze. That order
decides the sequence.

```
# FIRST, shut the ridges that are supposed to be shut:
FUNCTION clapTheClosingRidgesShut():
    repeat 6 times:
        pull the corners of every rim triangle together
        put everything back on the sphere, and the folded part back inside

# SECOND, turn crust-over-crust into crust-that-is-merely-squeezed:
FUNCTION pullCrustOffCrust():
    repeat up to 7 times:
        measure coverage
        FOR each direction covered twice by triangles f and g:
            IF both belong to DIFFERENT rigid islands: leave it alone
                # that is a suture, and squeezing a craton to hide it would be
                # the worst answer of the three. It is counted instead.
            ELSE: shrink the weaker of the two towards its own middle
        put everything back on the sphere

# THIRD, close whatever holes are left:
FUNCTION haulCrustOverAnyBareSky():
    repeat up to 8 times:
        measure coverage
        FOR each bare direction:
            find the nearest living crust and haul it over the hole
        put everything back on the sphere
```

### 6c. The two per-triangle guards

```
FUNCTION holdEachTriangleToItsArea():
    # The edge springs say what a triangle's sides measure; they say nothing
    # about its area, and a triangle can be sheared into a needle while every
    # side is the right length. This constrains the area itself. Between them,
    # lengths and area are as close to rigid as a mesh of springs gets.
    FOR each living triangle:
        one Newton step on (its current area - its target area)

FUNCTION stopTrianglesTurningInsideOut():
    # A BARRIER, not a constraint: it pushes only when a triangle has fallen
    # below a fraction of its proper size wound the right way, and never pulls
    # one back that has grown. Without it the mesh can turn itself inside out,
    # and a sphere that has done that reports impossible areas.
```

### 6d. The reference frame

```
FUNCTION removeTheNetRotationOfTheWholeShell():
    # Fit the single rotation that best describes how the entire shell moved
    # this step, and undo it. The same no-net-rotation convention plate
    # tectonics uses. Without it the reconstruction slowly spins, which is
    # meaningless motion that would show up in every measurement.
```

---

## Part 7. What is measured, every frame

None of these feed back into the solve. They exist to say how wrong it is.

```
FUNCTION record(time):
    bare              = share of the sky no crust covers
    doubled           = share of the sky more than one triangle covers
    islandOverlap     = share where two DIFFERENT rigid blocks are in one place
    budget            = area the globe has, vs area the crust measures.
                        Their disagreement is the only deformation the data
                        licenses: 0.20% of the sphere at 40 Ma, 0.11% at 120,
                        0.29% at 200. The run deforms 17%, 34% and 46% at
                        those times -- over budget by 87x, 317x and 158x.
    squeezed/stretched = how much of the crust is each
    cratonStrain      = deformation inside the strong blocks (should be ~0)
    weakStrain        = deformation in the thin crust (where it belongs)
    conjugateMedian   = median distance between the HELD-BACK conjugate pairs.
                        THIS IS THE SCORE. Zero is the right answer.
    paleolatitude     = the reconstruction's latitude for points where
                        palaeomagnetism has measured one. Independent of the
                        radius, so it is the one check the expansion
                        hypothesis cannot influence.
    blocks            = how many groups of points move as one rigid rotation.
                        A read-out, not an input: the model is never told
                        where a plate is.
```

---

## Part 8. Where to look if you want to break it

Honest weak points, in the order I would attack them:

1. **The overlap is ~2% of the sphere at 200 Ma and nothing has fixed it.**
   Four mechanisms have been tried. Three failed because they act on one
   triangle and the failure is not triangle-sized. The fourth (motion
   smoothing) helped by about 8%.
2. **The deformation budget is exceeded by a factor of 90 to 320.** The crust is
   being kneaded far more than "the Earth was smaller" alone can justify.
   Squeeze and stretch nearly cancel, which says the deformation is churn
   rather than a real closure the crust cannot make.
3. **Resolution.** A triangle is 42 km across at 120 Ma. Several failures are
   at or below that scale, which means the mesh cannot represent the answer.
4. **The mesh is a geodesic sphere, not a geological one.** Its triangles have
   nothing to do with where crust actually breaks. A mesh whose edges followed
   real boundaries would be free to fail along them instead of across them.
5. **The end of the run is not history.** After about 180 Ma the age grid has
   nothing left to take away, so nothing drives the model and it simply
   settles. Read the last frames as the solver relaxing, not as the Jurassic.
