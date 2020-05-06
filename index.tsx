import * as preact from "preact";

import "./index.less";
import { formatInteger, p, formatPercent, formatTime } from "./format";
import { enable_low_latency_clock, clock_ticks, launch_new_timing_thread } from "./clock_fast";
import { sum, max, min } from "./math";
import { insertIntoListMapped } from "./algorithms";

function getRaw(url: string): Promise<ArrayBuffer> {
    var request = new XMLHttpRequest();
    request.open("GET", url);
    request.responseType = "arraybuffer";
    request.send();
    return new Promise((resolve, reject) =>
        request.onload = () => {
            if(request.status !== 200) {
                reject(request.statusText);
            } else {
                resolve(request.response);
            }
        }
    );
}

//todonext
// Curious. So... high thread priority does help, but it doesn't stop all interrupts.
//todonext
//  - We need to start getting data from javascript, to make sure the graphs look similar
//      - This includes setting the javascript process priority, or even thread priority if we can
//  - Then after we have an idea of how many ticks and interrupt is, we need to run it a bunch and then graph
//      the ticks until interrupt, to see how much process priority helps, and how much time we can expect
//  - And then... this will determine kind of what we can profile. Hopefully it is fairly high. If not... we might
//      just have to eat the interrupts. We could ignore sequence of 0 times, but... those aren't the problem, it is the reverse,
//      when the test thread stops and so some values look like they have a lot of time. So... yeah... it sucks, but... what can we do?

//todonext;
// Okay, at least in C++, thread priority does help a lot in extending the times without large gaps. It completely changes the distribution,
//  changing it from a normal, to a normal weighted to one side.
//  - Although... it only makes the top 10% best cases maybe 4 times better, 8 times better? BUT, it makes the top very best cases 10-20x
//      more likely to happen, possibly making them the most common case! Which... is nice.

//todonext;
// Copy the JS clock code over here, and then take the results in the browser. Then...
//  Render the distributions, and see if there are two "0 group" distributions
//  - Then, if there are, use that to estimate the ideal time to identify if the second distribution triggered
//      (to check for interrupts), and then... probably hardcode that (but we will want a function for it in our real code)
//      and get time between interrupt
//  - OH, and... we should spawn multiple threads and try to see if we can identify when we are hyper-threaded on the same core
//  - AND... set the thread priority, and see how much that changes the time between interrupt distribution (and the
//      interrupt calculation distribution... because it shouldn't actually change the ticks we identify as being an interrupt).


// NOTES:
//  - High process priority results in long delays USUALLY being completely removed (anything over 1000 ticks)
//  - There is a distribution around 1-7 ticks, at around 127-255 ticks, and at a trailing distribution at 1K-32K ticks (about flat)
//      - The first one is just the core latency, the last is interrupts, but I'm not sure what the middle one is...
//  - We don't need to worry about hyper threading TOO much. Sometimes our timing thread and test thread may be on the same core,
//      BUT, the CPU is pretty good about fixing that, and the rates I detected of it happening is FAR less than random
//      (maybe... 1 in 50 chance, and then it only happened for part of the test cycle, so... should be fine...)
//  - Histo for delta between ticks is similar (in shape) across (at least two) wildly different machines, which indiciates it
//      is truly picking up fundamental CPU information, and not just information specific to my computer.

// At 64 ticks interrupt threshold...
//  - High priority actually does little, perhaps it adds some more high durations (>8K) without interrupts, but not all the time.
// At 1K threshold
//  - High priority does nothing
// At 8192 ticks interrupt threshold
//  - High priority increase the cap for maximum time, significantly, maybe changing the average max from 2M to 32M?

// ALSO! Realtime thread priority gets reset... somehow. Which is weird, but probably okay (but definitely super annoying).
//  - Oh, hiding the tab causes this.

//todonext;
// Okay... uh... I really want to be able to dedect hyperthreading as well. So...
//  we might be able to see it via... the peak of the most common time diff graph? Maybe even just the median?
//  Maybe the average?
// So... crap... we need to make it so clock_fast can spawn a new thread, and then keep running it on new threads,
//  and then graph our average tick size (tick is a diff under tick threshold).

//todonext
// Welp... hyper threading detecting isn't working. Let's try it in C++, where we can verify if we are hyperthreaded or not.
//  Maybe... once we are hyperthreaded the CPU just mosts the thread around, to prevent the bad hyperthreading case
//  (the bad case is 2 100% usage threads on the same core, which makes both a lot slower).

//todonext;
// Okay, we want to identify the two peaks of durations. Which... we can do directly, but... it is annoying, because of the 0 times.
//  However, just by count it should be possible... hmm... I think
// Actually... making the graph more detailed, there is a lot of stuff here. Multiple, consistent peaks. I wonder what those mean?

const interruptThreshold = 1024 * 8;
const tickThreshold = 127;

function processTimes(times: Float64Array): Float64Array {
    let startIndex = 0;
    while(times[startIndex] === 0) {
        startIndex++;
    }

    times = times.slice(startIndex);

    for(let i = 0; i < times.length - 1; i++) {
        times[i] = times[i + 1] - times[i];
    }
    times = times.slice(0, -1);
    return times;
}

//todonext
// Mark on the graph where we think... the important points are
//  - Probably start with the valleys, and then use those to mark the peaks, and then...
//      mark the tick threshold and interrupt thresholds
//  - OH! And warn if the number of 0 diffs is too small. That MIGHT indiciate hyper threading? Not sure...

(async () => {

    let count = 1024 * 1024 * 16;
    let times = new Float64Array(count);

    /*
    let file = await getRaw("/output.txt");
    times = new Float64Array(file);
    times = processTimes(times);
    */

    //*
    let inTicksAvgList: number[] = [];

    for(let i = 0; i < 1; i++) {
        await launch_new_timing_thread();

        await enable_low_latency_clock(async () => {
            for(let i = 0; i < count; i++) {
                times[i] = clock_ticks();
            }
        });

        times = processTimes(times);

        if(times.length < count / 2) continue;

        let inTicks = times.filter(x => x < tickThreshold);
        let inTicksSum = 0;
        for(let i = 0; i < inTicks.length; i++) {
            inTicksSum += inTicks[i];
        }
        let inTicksAvg = inTicksSum / inTicks.length;
        inTicksAvgList.push(inTicksAvg);
    }
    //*/


    // TODO: We can also check the end sum to see if the clock suddenly caught up or not. I guess... it shouldn't be catching
    //  up, it should be 0 because the time thread stopped. Although... maybe it is likely that when it starts again our
    //  thread stops? Idk... it's odd, but I've seen it often, so it could be something we detect and show.
    //  - Of course, for very small breaks we can't tell, only for large breaks.

    let clockStoppedDurations: number[] = [];

    let stoppedDuration = 0;
    let realStoppedDuration = 0;
    for(let i = 0; i < times.length; i++) {
        if(times[i] === realStoppedDuration) {
            realStoppedDuration++;
        } else {
            realStoppedDuration = 0;
        }
        if(times[i] < interruptThreshold && realStoppedDuration < 10) {
            stoppedDuration++;
        } else {
            if(stoppedDuration > 0) {
                clockStoppedDurations.push(stoppedDuration);
                stoppedDuration = 0;
            }
        }
    }
    if(stoppedDuration > 0) {
        clockStoppedDurations.push(stoppedDuration);
        stoppedDuration = 0;
    }

    //console.log(clockStoppedDurations);
    //console.log(times);

    const logBase = 1.5;
    function getGroup(x: number) {
        //return Math.round(Math.log2(y / lastY));
        return Math.floor(Math.log(x + 1) / Math.log(logBase));
        //return Math.round(y * 4);
    }
    function mapPosition(x: number) {
        //return Math.round(Math.log2(y / lastY));
        return Math.log(x + 1) / Math.log(logBase);
        //return Math.round(y * 4);
    }
    function getGroupStart(y: number) {
        //return y;
        return (logBase) ** y - 1;
        //return y / 4;
    }

    class Histo extends preact.Component<{
        values: Map<number, {
            sum: number;
            count: number;
            color?: string;
            groupCenterLabel?: string;
        }> 
    }, {}> {
        render() {
            let { values } = this.props;
            let maxSum = max(Array.from(values.values()).map(x => x.sum));

            let keys = Array.from(values.keys());
            let minKey = min(keys);
            let maxKey = max(keys);

            return (
                <preact.Fragment>
                    <div>&nbsp;</div>
                    <div>&nbsp;</div>
                    <div>&nbsp;</div>
                    <div>&nbsp;</div>
                    <div>&nbsp;</div>
                    <div
                        className="Histo-barGraph"
                    >
                        {Array(maxKey - minKey + 1).fill(0).map((x, i) => i + minKey).map((i) => (
                            <div
                                style={{
                                    height: ((values.get(i)?.sum || 0) / maxSum * 100).toFixed(8) + "%",
                                    ... values.get(i)?.color ? {
                                        "background-color": values.get(i)?.color
                                    } : {} as any,
                                }}
                                className="Histo-bar"
                            >
                                <div className="Histo-count">
                                    {formatInteger(values.get(i)?.count || 0)}
                                </div>
                                <div className="Histo-barTitle">
                                    <pre>
                                        {formatInteger(getGroupStart(i))}
                                        {`\n`}
                                        {formatInteger(((values.get(i)?.sum || 0) - (values.get(i)?.count || 0)) / (values.get(i)?.count || 1))}
                                        {`\n`}
                                        {values.get(i)?.groupCenterLabel && `\n${values.get(i)?.groupCenterLabel}`}
                                    </pre>
                                </div>
                            </div>
                        ))}
                    </div>
                </preact.Fragment>
            );
        }
    }

    class HistoNumber extends preact.Component<{
        values: Map<number, number>
    }, {}> {
        render() {
            let { values } = this.props;
            let maxY = max(Array.from(values.values()));

            let xValues = Array.from(values.keys());
            xValues.sort((a, b) => a - b);

            return (
                <preact.Fragment>
                    <div>&nbsp;</div>
                    <div>&nbsp;</div>
                    <div>&nbsp;</div>
                    <div
                        className="Histo-barGraph"
                    >
                        {xValues.map(x => (
                            <div
                                style={{
                                    height: ((values.get(x) || 0) / maxY * 100).toFixed(8) + "%"
                                }}
                                className="Histo-bar"
                                title={`${formatInteger(x)}=${values.get(x)}`}
                            >
                                <div className="Histo-count"></div>
                            </div>
                        ))}
                    </div>
                </preact.Fragment>
            );
        }
    }

    //todonext;
    // Okay... as we get farther away from the peak, we should accept smaller peaks. BUT, we shouldn't settle on a crappy peak
    //  if there is a much better one that isn't so much farther...
    //todonext;
    // Okay, uh... it is actually fairly simple. Assuming they are mass bodies, which body do they orbit? I think... we only want
    //  bodies that orbit the largest body? Yeah... that seems right... anything that orbits a smaller body is just a part of it...
    // Huh, so... we just... find the gravitational force on each side, and that determines what we are orbitting?
    //  And then... hmm... every point where masses reverse the direction of gravitation... is the boundary of two
    //  groups? Ah... yes, I think so...

    class Component extends preact.Component<{}, {}> {
        render() {
            let maxLog2 = 0;
            let histo: Map<number, {
                sum: number;
                count: number;
                group: number;
                color?: string;
                chunk: number;
                first: number;
                last: number;
                groupCenterLabel?: string;
            }> = new Map();

            let minDist = mapPosition(2) - mapPosition(1);
            // minDist === 1 is most similar to our chart.
            minDist = 1;


            let list = times;

            let tickRawHisto: Map<number, number> = new Map();
            for(let i = 0; i < list.length; i++) {
                let value = list[i];
                tickRawHisto.set(value, (tickRawHisto.get(value) || 0) + 1);
            }

            //let list = clockStoppedDurations;
            //for(let duration of clockStoppedDurations) {
            //for(let duration of times) {
            //for(let duration of inTicksAvgList) {
            //for(let i = 0; i < list.length; i++) {
            for(let [duration, count] of tickRawHisto) {
                let group = getGroup(duration);

                let obj = histo.get(group);
                if(!obj) {
                    obj = { sum: 0, count: 0, group, first: duration, last: duration, chunk: -1 };
                    histo.set(group, obj);
                }
                obj.sum += (duration < 1 ? 1 : duration) * count;

                obj.first = Math.min(obj.first, duration);
                obj.last = Math.max(obj.last, duration);
                //obj.sum++;

                obj.count += count;
                maxLog2 = Math.max(maxLog2, group);
            }

            function getGravitySingle(target: number, source: number, mass: number) {
                let direction = source < target ? -1 : +1;
                let distance = Math.abs(target - source);

                if(distance === 0) return 0;

                // TODO:
                // Shell theorem combined with maximum object density (which is not so bad, all of the planets AND the sun
                //  are within 10X density, which means they are essentially equal in density).
                // https://en.wikipedia.org/wiki/Shell_theorem
                //todonext;
                // Hmm... but... there is a problem that... values right beside each other
                //  won't spread out as much. So... we need to... spread it out
                // Hmm... but... okay, one large 3d body, or a bunch beside each other that are more dense... is the same?
                //  No... because... the outer ones will do more than just cancel out the far matter... and actually... you
                //  will be pulled the closest sphere more, while the other spheres won't be able to compenstate, as they will
                //  be scaling linearily, not... cubically...
                //  Uh, but... uh... hmm... is this related to the roche limit?
                //  - So... once something is within the roche limit it will be evenly distributed as a shell, so... it essentially becomes
                //      part of the body.
                //  - Uh... and... 

                // Don't let values get too close, which high values can do, which makes their gravity too high.
                // TODO: Don't instantly turn gravity off, add some easing... similar to how an object approaching a large
                //  sphere would slowly reduce it's gravity as it enters the sphere, as some of the sphere is behind and beside it.
                if(distance < minDist) {
                    return 0;
                }
                return direction * mass / distance ** 2;
            }

            // Okay... we let values get too close. We want overall orbital gravity, so... uh... "squish" masses a bit?
            //  We just need to spread them out, applying some kind of maximum density value... hmm...
            function getGravity(position: number, massObjsSorted: [number, number][]) {
                // M / r^2
                let force = 0;

                for(let [pos, mass] of massObjsSorted) {
                    force += getGravitySingle(position, pos, mass);
                }

                return force;
            }
            function getGravityForces(
                // number is position, and value is the mass
                masses: Map<number, number>,
            ): Map<number, number> {
                let gravities: Map<number, number> = new Map();
                let positions = Array.from(masses.keys());
                positions.sort((a, b) => a - b);

                let massObjsSorted = Array.from(masses.entries());
                massObjsSorted.sort((a, b) => a[0] - b[0]);

                for(let [pos, obj] of massObjsSorted) {
                    let gravity = getGravity(pos, massObjsSorted);
                    gravities.set(pos, gravity);
                }
                return gravities;
            }
            function getLagrangePoints(
                // number is position, and value is the mass
                masses: Map<number, number>,
                gravityForces: Map<number, number> = getGravityForces(masses)
            ): Set<number> {
                let positions = Array.from(masses.keys());
                positions.sort((a, b) => a - b);

                let switchPoints: Set<number> = new Set();

                let lastDirection = +1;

                for(let pos of positions) {
                    let gravity = gravityForces.get(pos) || 0;

                    let direction = gravity < 0 ? -1 : +1;
                    if(direction !== lastDirection) {
                        switchPoints.add(pos);
                    }
                    lastDirection = direction;
                }

                return switchPoints;
            }
            function color(
                // key is the position
                histo: Map<number, { sum: number, count: number; group: number; color?: string; chunk: number; groupCenterLabel?: string }>,
                // number is position, and value is the mass
                masses: Map<number, number>,
            ) {

                let positions = Array.from(masses.keys());
                positions.sort((a, b) => a - b);

                let switchPoints = getLagrangePoints(masses);

                let orbitIndex = -1;
                {
                    let maxIndex = 0;
                    let maxValue = 0;
                    for(let [index, obj] of histo) {
                        if(obj.sum > maxValue) {
                            maxValue = obj.sum;
                            maxIndex = index;
                        }
                    }

                    // We orbit around the closest switch point to the largest group. Hopefully...
                    for(let offset = 0; offset <= maxIndex; offset++) {
                        if(switchPoints.has(maxIndex + offset)) {
                            orbitIndex = maxIndex + offset;
                            break;
                        } else if(switchPoints.has(maxIndex - offset)) {
                            orbitIndex = maxIndex - offset;
                            break;
                        }
                    }
                }

                // We see gravitational inflection points inside bodies too, so we need to determine when we are in a body and ignore those.
                let inBody = false;
                for(let i = orbitIndex - 1; i  >= 0; i--) {
                    if(switchPoints.has(i)) {
                        inBody = !inBody;
                    }
                }

                

                let histoPositions = Array.from(histo.keys());
                histoPositions.sort((a, b) => a - b);

                let posIndex = 0;

                let groupNumber = 0;
                for(let i = 0; i < histoPositions.length; i++) {
                    let pos = histoPositions[i];
                    let obj = histo.get(pos);
                    if(!obj) throw new Error(`Impossible`);

                    let posCount = 0;
                    let centerIndex = -1;
                    while(posIndex < positions.length && positions[posIndex] <= pos) {
                        if(switchPoints.has(positions[posIndex])) {
                            inBody = !inBody;
                            if(!inBody) {
                                groupNumber++;
                            } else {
                                if(centerIndex > -1) {
                                    // Multiple inflection points in 1 bar? I guess... this is possible. Seems... impossible though...
                                    debugger;
                                }
                                centerIndex = posCount;
                            }
                        }
                        posCount++;
                        posIndex++;
                    }

                    if(centerIndex > -1) {
                        let nextPos = histoPositions[i + 1];
                        obj.groupCenterLabel = formatInteger(getGroupStart(pos + centerIndex / posCount * nextPos));
                    }

                    obj.color = `hsl(${100 + groupNumber * 60}, 75%, 75%)`;
                    obj.chunk = groupNumber;
                }
            }

            // NOTE: When we calculate gravity we have to do it by grouping up values. This is similar to the perspective problem,
            //  where... as something gets farther away, it gets smaller... BUT, it also distorts, as in a 3D object part is closer
            //  to you and part is farther away, and as the entire object gets 2X away, part is 2X + 1 away, and part is 2X - 1 away,
            //  so the ratio ((2x + 1) / (2x - 1)) depends on the distance.
            // And in our case everything is so close together, so the ability to assume large objects far away are point masses...
            //  doesn't REALLY help us, at least... I don't think it will?
            // IDEA: Actually... so... this 3d perspective thing is what make perspective illusions possible. Basically, if you
            //  see a slope away from you, you can't tell the absolute slope of it. However... you can tell the 2D bounds,
            //  and so if it is rotated... you can tell the max size, and use that to decide the actual distance. Of course,
            //  unless you rotate it along the worst axis, experience gimbal lock, and end up just spinning it. So you have to try twice?
            //  And after the first time, you rotate it by 45 degrees along a different axis?
            //  So... can we use this... the rotation idea... to... hmm... idk... something?
            // Hmm... would we calculate some kind of... spread factor? Probably not, the spread could be very complex.


            // NOTE: We map position logarithmically

            // NOTE: We don't just need to create groups to ease the calculation of gravity (it scale O(N^2) to the number
            //  of bodies), but also to prevent large point values from becoming two different bodies. The grouping,
            //  as well as ignoring gravity of the self, makes this unlikely to happen.
            //  - If we didn't group at all and we had large groups at 4, 5, 6, 9, 10, 11 then it would be likely they would
            //      form didn't gravitational bodies, with the midpoints being 5 and 10.
            //      HOWEVER, with grouping, the close grouping become one, and then it is less likely for them to
            //      cause inflection points. Because it spreads the mass out.

            // TODO: We could apply the concept of maximum density, forcing values to spread out, which would allow
            //  us to not worry about two very large groups next to each other being treated as one body (they would
            //  spread out and then merge).
            //  - Then we could use the correct formulas, and use our idea for just not updating far away values
            //      until their position is X% (maybe 10%) off the last calculated. This is a lot easier to implement
            //      than grouping, and to maintain, and has a guarantee of correctness that is much easier to prove.
            //      it also has a nice scaling factor, with 10% only costing 10N to calculate, 1% being 100N, etc.
            //      - It is pretty realistic too, when you jump on earth the gravity doesn't change much, and you have to
            //          get pretty far away for it to change by a lot, and your gravity to the sun... that changes even less.
            //      - Although... this only really works when in a straight line... where you can keep track of all the distances
            //          in a big array. In 3D space you couldn't do that, so... it's really just an optimization for this specific problem...
            //      - Oh, and... we would probably have tiers of mass. As in, once it reaches a certain mass part of its mass
            //          starts to get more dense... like... how matter actually works. ALthough we probably own't have enough
            //          difference in scale for that to be needed...



            // REMEMBER! Organize groups not be their gravitational force, but their net force, assuming
            //  they can't be more than some minimum distance from themselves. That way we can handle
            //  close bodies which failed to be completely controlled by a large body from overtaking
            //  bodies which are only slightly smaller, that are farther away.


            let histoBarMasses: Map<number, number> = new Map();
            for(let [pos, obj] of histo) {
                histoBarMasses.set(pos, obj.sum);
            }

            color(histo, histoBarMasses);

            let groups: Map<number, {
                first: number;
                last: number;
                sum: number;
                posSum: number;
                effectiveMass: number;
            }> = new Map();

            for(let obj of histo.values()) {
                let groupObj = groups.get(obj.chunk);
                if(!groupObj) {
                    groupObj = {
                        first: obj.first,
                        last: obj.last,
                        sum: 0,
                        posSum: 0,
                        effectiveMass: 0,
                    };
                    groups.set(obj.chunk, groupObj);
                }
                groupObj.first = Math.min(groupObj.first, obj.first);
                groupObj.last = Math.max(groupObj.last, obj.last);
                groupObj.sum += obj.sum;
                // TODO: This could be done before the groups, to be actually accurate, but, eh...
                groupObj.posSum += obj.sum * (obj.first + obj.last) * 0.5;
            }


            for(let groupObj of groups.values()) {
                let effectiveMass = groupObj.sum;
                let massCenter = groupObj.posSum / groupObj.sum;
                for(let otherGroupObj of groups.values()) {
                    if(groupObj === otherGroupObj) continue;
                    let otherMassCenter = otherGroupObj.posSum / otherGroupObj.sum;
                    let otherMass = otherGroupObj.sum;

                    effectiveMass -= otherMass / Math.abs(otherMassCenter - massCenter) ** 2 * 10;
                }
                if(effectiveMass < 0) {
                    effectiveMass = 0;
                }
                groupObj.effectiveMass = effectiveMass;
            }

            console.log(groups);

            for(let obj of histo.values()) {
                if(obj.groupCenterLabel) {
                    let chunk = groups.get(obj.chunk);
                    if(chunk) {
                        obj.groupCenterLabel = formatInteger(chunk.effectiveMass) + "/" + formatInteger(chunk.sum);
                    }
                }
            }

            let massesFull: Map<number, number> = new Map();
            for(let [value, count] of tickRawHisto) {
                let duration = value;
                if(duration < 1) {
                    duration = 1;
                }
                massesFull.set(mapPosition(value), count * duration);
            }

            console.log("histo lagrange points", Array.from(getLagrangePoints(histoBarMasses)).sort((a, b) => a - b).map(getGroupStart));

            let trueGravities: Map<number, number>;
            {
                let time = performance.now();
                trueGravities = getGravityForces(massesFull);
                time = performance.now() - time;
                console.log(`Brute force gravity took ${formatTime(time)}`);
                console.log("brute force lagrange points", Array.from(getLagrangePoints(massesFull, trueGravities)).sort((a, b) => a - b).map(getGroupStart));
            }

            function logGravityErrors(testGravities: Map<number, number>) {
                let errors = [];
                for(let [pos, gravity] of testGravities) {
                    let trueGravity = trueGravities.get(pos) || 0;
                    let error = Math.abs((gravity - trueGravity) / trueGravity);
                    errors.push(error);
                }
                errors.sort((b, a) => a - b);
                console.log(`Gravity errors:`, errors);
            }


            {
                let time = performance.now();

                let massObjs: [number, number][] = Array.from(massesFull.entries()).map(x => [x[0], x[1]]);
                massObjs.sort((a, b) => a[0] - b[0]);
                let massSum = sum(massObjs.map(x => x[1]));
                
                // The entire size of our masses may change, but... the size to contain 50% (or any reasonable percent)
                //  will probably stay fairly constant. Either way, the positions are logarithmic... so it probably doesn't matter.
                let massStableSize = 0;
                let massLeft = massSum * 0.5;
                for(let i = 0; i < massObjs.length; i++) {
                    massLeft -= massObjs[i][1];
                    if(massLeft < 0) {
                        massStableSize = massObjs[i][0];
                    }
                }

                {
                    // Any mass smaller than this will have less impact than the rest of the masses, even if they are very far away.
                    //  We can't ignore it (it may add up), but we can move it, with little impact on the output.
                    let minMass = massSum / massStableSize**2 * minDist**2 * 0.05;
                    let pendingMass = 0;
                    for(let massObj of massObjs) {
                        pendingMass += massObj[1];
                        massObj[1] = 0;
                        if(pendingMass > minMass) {
                            massObj[1] = pendingMass;
                            pendingMass = 0;
                        }
                    }
                    massObjs = massObjs.filter(x => x[1] !== 0);
                }

                let massesCombined = new Map<number, number>(massObjs);
                let gravities = getGravityForces(massesCombined);

                time = performance.now() - time;

                console.log(`Combined mass took ${formatTime(time)}`);
                //logGravityErrors(gravities);
            }


            {
                let time = performance.now();

                let massObjsSorted = Array.from(massesFull.entries());
                massObjsSorted.sort((a, b) => a[0] - b[0]);

                let gravities: Map<number, number> = new Map();

                let gravityValues: {
                    posThreshold: number;
                    pos: number;
                    mass: number;
                    currentGravity: number;
                    currentGravityTargetPos: number;
                    //reason?: string;
                    massIndex: number;
                }[] = [];
                let totalGravity = 0;
                for(let i = 0; i < massObjsSorted.length; i++) {
                    let [ pos, mass ] = massObjsSorted[i];
                    gravityValues.push({
                        posThreshold: -1,
                        pos,
                        mass,
                        currentGravity: 0,
                        currentGravityTargetPos: 0,
                        massIndex: i,
                    });
                }

                const threshold = 0.1;

                let totalRecalcs = 0;

                for(let i = 0; i < massObjsSorted.length; i++) {

                    let [posBase, mass] = massObjsSorted[i];

                    let endRecalcIndex = 0;
                    while(endRecalcIndex < gravityValues.length && gravityValues[endRecalcIndex].posThreshold <= posBase) {
                        endRecalcIndex++;
                    }

                    for(let recalcIndex = 0; recalcIndex < endRecalcIndex; recalcIndex++) {
                        let rangeToRecalc = gravityValues[recalcIndex];

                        let { pos, mass, currentGravity } = rangeToRecalc;

                        totalRecalcs++;
                        let newGravity = getGravitySingle(posBase, pos, mass);

                        /*
                        if(Math.abs((newGravity - currentGravity) / newGravity) < threshold) {
                            // No reason to recalculate, because the change in gravity was so small. So... why did we?
                            console.log(rangeToRecalc.currentGravityTargetPos - pos, "to", posBase - pos);
                            debugger;
                        }
                        */
                        rangeToRecalc.currentGravityTargetPos = posBase;

                        let dist = Math.abs(pos - posBase);

                        //rangeToRecalc.reason = "threshold";

                        // Once we move by dist * threshold we need to recalculate the impact of our gravity.
                        let newPosThreshold = posBase + dist * threshold;

                        let currentInMinDist = dist < minDist;
                        if(currentInMinDist) {
                            // The only thing that matters is leaving the min dist threshold,
                            //  and if all the remaining masses are in the min dist threshold, then
                            //  we never need to recalculate.
                            newPosThreshold = Number.POSITIVE_INFINITY;
                        }

                        // Check everything we will be passing over until the next threshold, and see when our
                        //  current (or lack of current) min dist mass supression will end, and if it is before
                        //  newPosThreshold, we will need to recalculate early
                        // TODO: Use a binary search here instead, or a gallop search.
                        for(let n = i + 1; n < massObjsSorted.length; n++) {
                            let nextPos = massObjsSorted[n][0];
                            let nextIsInMinDist = Math.abs((nextPos - pos)) < minDist;
                            // The threshold is when we are evaluating the value, not the values before it.
                            let minDistThreshold = nextPos;
                            if(minDistThreshold > newPosThreshold) break;
                            if(nextIsInMinDist !== currentInMinDist) {
                                if(minDistThreshold < newPosThreshold) {
                                    newPosThreshold = minDistThreshold;
                                    /*
                                    rangeToRecalc.reason = "minDist of " + nextPos;
                                    if(nextIsInMinDist) {
                                        rangeToRecalc.reason += " entered";
                                    } else {
                                        rangeToRecalc.reason += " exited";
                                    }
                                    */
                                }
                                break;
                            }
                        }

                        rangeToRecalc.currentGravity = newGravity;
                        rangeToRecalc.posThreshold = newPosThreshold;

                        totalGravity -= currentGravity;
                        totalGravity += newGravity;
                    }

                    let gravitiesChanged = gravityValues.splice(0, endRecalcIndex);
                    for(let obj of gravitiesChanged) {
                        insertIntoListMapped(gravityValues, obj, x => x.posThreshold, (a, b) => a - b, "add");
                    }

                    /*
                    let gravityErrorMagnitude = 0;
                    let calcCorrectGravity = 0;
                    for(let i = 0; i < gravityValues.length; i++) {
                        let { currentGravity, pos, mass, posThreshold } = gravityValues[i];
                        let correctGravity = getGravitySingle(posBase, pos, mass);

                        gravityErrorMagnitude += currentGravity - correctGravity;
                        calcCorrectGravity += correctGravity;

                        if(correctGravity === currentGravity) continue;

                        let error = Math.abs((currentGravity - correctGravity) / correctGravity);
                        if(error < 0) {
                            debugger;
                        }
                        if(!isFinite(error)) {
                            debugger;
                        }
                        if(error * 0.5 > 1 - (1 - threshold)**2 || isNaN(error)) {
                            console.log(posThreshold);
                            console.log(error, currentGravity, correctGravity, posBase, pos);
                            debugger;
                        }
                    }
                    */

                    //todonext;
                    // OOOOOOOOOOOOOOOOOOOOOH, it is because the gravities cancel out... so if the force should be 0, even being a little
                    //  off will cause infinite percent error. Huh... Is this... a problem?
                    // Well... it IS if we are looking at inflection points! But... this are minor inflection points... and... it will probably
                    //  only change the inflection point by moving it slightly.
                    /*

                    let trueGravity = trueGravities.get(posBase) || 0;

                    let error = Math.abs((totalGravity - trueGravity) / trueGravity);
                    if(error > 0.1) {
                        console.log({error, totalGravity, trueGravity, posBase, gravityErrorMagnitude, calcCorrectGravity});
                        debugger;
                    }
                    */

                    gravities.set(posBase, totalGravity);
                }

                time = performance.now() - time;
                console.log(`Gravity with error ${formatPercent(1 - (1 - threshold)**2)} took ${formatTime(time)}, out of all possible calculations we ran ${formatPercent(totalRecalcs / (massObjsSorted.length ** 2))}`);

                //logGravityErrors(gravities);

                //console.log("gravities with error", Array.from(gravities.entries()).sort((a, b) => a[0] - b[0]).map(x => [getGroupStart(x[0]), x[1]]));
                //console.log("gravities correct", Array.from(trueGravities.entries()).sort((a, b) => a[0] - b[0]).map(x => [getGroupStart(x[0]), x[1]]));

                console.log("gravities with error lagrange points", Array.from(getLagrangePoints(massesFull, gravities)).sort((a, b) => a - b).map(getGroupStart));
            }


            let totalMass = sum(Array.from(massesFull.values()));

            //console.log(Array.from(massesFull).sort((a, b) => a[0] - b[0]).map(k => [k[0], getGroupStart(k[0]), k[1], formatPercent(k[1] / totalMass)]));

            /*
            obj.first = Math.min(obj.first, duration);
            obj.last = Math.max(obj.last, duration);
            */

            return (
                <div>
                    <div>Count, {formatInteger(times.length)}, average under {tickThreshold}</div>

                    {/*
                    <HistoNumber values={massGroupedLess} />
                    <HistoNumber values={gravityTest}/>
                    <HistoNumber values={histoBarMasses} />
                    */}

                    <Histo values={histo} />
                </div>
            );
        }
    }


    //console.log(times);


    /*
    todonext;
    // So... we need to to get a frequency analysis of various gap sizes. It... is seeming like it may be random, for some gap sizes at least... which... should be the case.
    //	The frequency by gap size should have huge jumps, and even if it is continous in some regions. If it is fully continous... then it means there is no "we were interrupted"
    //	vs "we weren't interrupted, the CPU just hiccuped", and... that's annoying, but... we can deal with it...
    // OH! And... we should try it with high priority and without high priority (on thread and process), to see if indeed interrupts are being measured in that case,
    //	and maybe we did remove that, we just also caused another problem...
    todonext;
    // So... dump the data to a file, read it, and display in the browser? Yep.

    todonext;
    // Yeah, so... just change the C++ code is purely dump the timings to a file, in binary,
    //  and then make a webpack/typescript/jsx application that reads it in... probably via using some kind of binary file webpack loader (that we can just write ourselves)
    */

    preact.render(
        <body>
            <Component />
        </body>,
        document.body
    );
})();