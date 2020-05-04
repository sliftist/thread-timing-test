import * as preact from "preact";

import "./index.less";
import { formatInteger } from "./format";
import { enable_low_latency_clock, clock_ticks, launch_new_timing_thread } from "./clock_fast";
import { sum } from "./math";

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

    console.log(clockStoppedDurations);
    console.log(times);

    const logBase = 1.3;
    function mapY(y: number) {
        return Math.floor(Math.log(y + 1) / Math.log(logBase));
        //return Math.round(y * 4);
    }
    function unmapY(y: number) {
        return (logBase) ** y - 1;
        //return y / 4;
    }


    class Component extends preact.Component<{}, {}> {
        render() {
            let maxSum = 0;

            let maxLog2 = 0;
            let histo: Map<number, { sum: number, count: number }> = new Map();
            let list = times;
            //let list = clockStoppedDurations;
            //for(let duration of clockStoppedDurations) {
            //for(let duration of times) {
            //for(let duration of inTicksAvgList) {
            for(let i = 0; i < list.length; i++) {
                let duration = list[i];
                let log = mapY(duration);
                let obj = histo.get(log);
                if(!obj) {
                    obj = { sum: 0, count: 0 };
                    histo.set(log, obj);
                }
                obj.sum += duration < 1 ? 1 : duration;
                //obj.sum++;

                obj.count++;
                maxLog2 = Math.max(maxLog2, log);
                maxSum = Math.max(maxSum, obj.sum);
            }

            return (
                <div>
                    <div>Count, {formatInteger(times.length)}, average under {tickThreshold}</div>
                    <div>&nbsp;</div>
                    <div>&nbsp;</div>
                    <div
                        className="Histo-barGraph"
                    >
                        {Array(maxLog2 + 1).fill(0).map((x, i) => i).map((i) => (
                            <div
                                style={{
                                    height: ((histo.get(i)?.sum || 0) / maxSum * 100).toFixed(8) + "%"
                                }}
                                className="Histo-bar"
                            >
                                <div className="Histo-count">
                                    {formatInteger(histo.get(i)?.count || 0)}
                                </div>
                                <div className="Histo-barTitle">
                                    {formatInteger(unmapY(i))}
                                </div>
                            </div>
                        ))}
                    </div>
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