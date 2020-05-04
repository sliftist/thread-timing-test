let clock_ticksVar: () => number;
let enable_low_latency_clockVar: (code: () => Promise<void>) => Promise<void>;
let launch_new_timing_threadVar: () => Promise<void>;

if(typeof SharedArrayBuffer === "undefined") {
    console.warn(`No SharedArrayBuffer support found, timing precision will be severly reduced.`);
    clock_ticksVar = () => performance.now();
    enable_low_latency_clockVar = (code) => code();
    launch_new_timing_threadVar = async () => {};
} else {

    
    clock_ticksVar = function clock_ticks(): number {
        // No error check, as apparently the error check makes this code way slower
        // Also, inline timeArray[0], as that might make it faster too.
        //  (I measured it, removing the if statement makes this function twice as fast, consistently,
        //      so even a function call could make it measurable slower).
        /*
        if(lowLatencyClockEnableCount <= 0) {
            throw new Error(`clock_ticks may only be called in the callback of enable_low_latency_clock.`);
        }
        */

        return timeArray[0];
    }

    /** Runs the code, making calls to clock_ticks valid while the code is running.
     *      Is explicitly async, as setting up the low latency clock takes a bit of time.
     */
    enable_low_latency_clockVar = async function enable_low_latency_clock(code: () => Promise<void>): Promise<void> {
        await enable_low_latency_clockInternal(code);
    }

    let lowLatencyClockEnableCount = 0;
    async function enable_low_latency_clockInternal(code: () => Promise<void>): Promise<void> {
        if(lowLatencyClockEnableCount === 0) {
            // Enable it
            //  (startLowLatencyLoop just returns a promise, so there is nothing to do here yet, but any synchronous initialization
            //      would happen here).
        }
        lowLatencyClockEnableCount++;
        try {
            await startLowLatencyLoop();
            await waitUntilLowLatencyClockIsRunning();
            await code();
        } finally {
            lowLatencyClockEnableCount--;
            // May be true when doEnable === false, or vis versa, because code is async, so we can leave in a different order than we entered.
            if(lowLatencyClockEnableCount === 0) {
                // Disable it
                await stopLowLatencyLoop();
            }
        }
    }





    /** Tells if clock_ticks is running on another thread, right now. We can tell this
     *      be inspecting the times. If they change rapidly then it is running on another thread.
     *      If not, then the other thread is paused (not that it is not running, but that the OS level thread
     *      has been interrupted and other threads are running).
    */
    function checkIfHighPrecisionClockIsSynced(): boolean {
        const minimumSuccessiveChanges = 100;
        const maximumChecksPerCount = 1000;

        let curChanges = 0;

        let lastTime = 0;
        for(let i = 0; i < maximumChecksPerCount; i++) {
            let curTime = clock_ticksVar();
            if(curTime === lastTime) {
                curChanges = 0;
            } else {
                curChanges++;
            }
            if(curChanges > minimumSuccessiveChanges) {
                return true;
            }
        }
        return false;
    }

    /** Waits until it seems like the low latency clock seems to be running.
     *  Is kind of a hack, so on some computers it might always wait the max wait time. But I've seen it work at least once.
     *      - maxWaitTime is in milliseconds.
     */
    async function waitUntilLowLatencyClockIsRunning(maxWaitTime = 1000): Promise<void> {
        if(lowLatencyClockEnableCount <= 0) {
            throw new Error(`waitUntilLowLatencyClockIsRunning must be called inside the enable_low_latency_clock callback`);
        }

        let endWaitTime = performance.now() + maxWaitTime;
        
        // Wait until the the clocks tick at least a bit. Because the other thread might be paused... and if this
        //  initial measurement is off it messes up times forever.
        while(true) {
            if(checkIfHighPrecisionClockIsSynced()) {
                break;
            }
            if(performance.now() > endWaitTime) {
                console.warn(`The thread worker handling the clock doesn't seem to be running. This is odd, and impossible to debug. Likely case is that the OS is simply not giving our clock thread enough time to run.`);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }




    let lowLatencyClockRunning: Promise<void>|undefined = undefined;
    let lowLatencyClockRunningResolve: (() => void)|undefined = undefined;

    let timeSharedArray = new SharedArrayBuffer(8);
    let timeArray = new Float64Array(timeSharedArray);

    // First byte is if loop should start or stop, and second byte says if loop is started or stopped
    let enableSharedArray = new SharedArrayBuffer(2);
    let enableArray = new Uint8Array(enableSharedArray);

    function createWorker() {
        let worker = new Worker(createJSBlob(`(${workerMain.toString()})()`));
        worker.postMessage({ time: timeSharedArray, enable: enableSharedArray });
        worker.onmessage = () => {
            if(!lowLatencyClockRunningResolve) {
                throw new Error(`time Worker sent us a message, when it shouldn't have.`);
            }
            let resolve = lowLatencyClockRunningResolve;
            lowLatencyClockRunningResolve = undefined;
            resolve();
        };
        return worker;
    }

    let worker = createWorker();

    launch_new_timing_threadVar = async () => {
        if(enableArray[0]) {
            throw new Error(`Cannot launch new timing thread while using the old one. Leave enable_low_latency_clock first!`);
        }
        // TODO: The docs says this synchronously kills the worker? Is that FOR REAL? If so... that's awfully nice, if not...
        //  we will have to detect termination properly. This is ideal, as the worker has nothing to cleanup, so telling it
        //  "please shutdown" is unneeded, and we can leave it up to v8 to cleanup handles, etc.
        worker.terminate();
        worker = createWorker();
    };


    async function startLowLatencyLoop() {
        if(lowLatencyClockRunning) return lowLatencyClockRunning;
        if(enableArray[0]) throw new Error(`Low latency already started? State is bad`);

        lowLatencyClockRunning = new Promise(resolve => lowLatencyClockRunningResolve = resolve);

        // Wait for the previous stop command to finish
        //  Eh... is this allowed? Is this... thread safe? I think it probably isn't safe...
        while(enableArray[0] !== enableArray[1]) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        enableArray[0] = 1;
        worker.postMessage(null);

        return lowLatencyClockRunning;
    }
    function stopLowLatencyLoop() {
        if(!enableArray[0]) throw new Error(`Low latency already stopped? State is bad`);

        enableArray[0] = 0;
        lowLatencyClockRunning = undefined;
        lowLatencyClockRunningResolve = undefined;
    }


    function createJSBlob(code: string) {
        return URL.createObjectURL(new Blob([ code ], { type: 'application/javascript' }));
    }

    function workerMain() {
        let timeArray: Float64Array|null = null;
        let enableArray: Uint8Array|null = null;
        self.onmessage = (e: MessageEvent) => {
            if(!timeArray || !enableArray) {
                timeArray = new Float64Array(e.data.time);
                enableArray = new Uint8Array(e.data.enable);
            } else {
            
                (self.postMessage as any)(null);
                // loopMain can't enter multiple times at once, because workers are still single threaded onto themselves,
                //  SO, the message handler can't run until the first loopMain call sees enableArray and exits! Which is nice.
                loopMain();
            }
        };

        function loopMain() {
            if(!timeArray || !enableArray) throw new Error(`Worker out of sync`);
            enableArray[1] = 1;
            while(enableArray[0]) {
                // TODO: Consider "unrolling" this loop, and even caching the current time array value outside the loop.
                //  However... if we do, we should verify it doesn't change our timings. A faster loop that has N fast writes,
                //  and then slows down for a bit (so is less consistent), is actually less desirable than a lower more
                //  consistent loop.
                // TODO: Consider adding extra code in here to slow this loop down. Because if the two threads ends up being on
                //  different cores (and not the same core hyperthreaded), the writes (at least in C++) are sent between cores
                //  in batches. This means faster writes just mean the value increased in increments of 20, instead of 10, or 1,
                //  not that precision is increased. And... is stands to reason, that using up the bandwidth between cores with
                //  unneeded writes MAY have a negative impact on performance, by reducing the speed other cores
                //  and communicate, and messing up the cache more. But... it might also cause no issues... somehow...
                timeArray[0] = timeArray[0] + 1;
            }
            enableArray[1] = 0;
        }
    }
}


/** A clock operation that has low latency (nanoseconds), and updates synchronously (via Worker).
 *      - Must only be called in the callback of enable_low_latency_clock.
 *      - In "ticks", which are arbitrary, and variable length.
 * 
 *  This has very low latency, measured at around 30ns on my machine, compare to performance.now(),
 *      which I measured at around 350ns on my machine. This allows profiling of code that is 10x faster
 *      (because you can't profile before your clock latency, or even really too close to it). Which could
 *      be the difference between being able to drill your profiling down to groups of 100 lines,
 *      to groups of 10 lines... which is significant.
 *      - This also has much higher precision than performance.now(), which is kept at 5000ns precision,
 *          which still allows 350ns timing, but it requires more iterations to reach statistically significance.
 * 
 *  NOTE: The correct way to recover actual times from clock ticks is to record in tick counts in your profiling,
 *      while measuring the entire time of your profile in both ticks and ms with performance.now(), and then convert
 *      from ticks to ms after you run your profile. It is simply not feasible for clock_ticks to return a milliseconds time,
 *      because the tick rate can vary too much from the boot.
 *      - And the varying tick rate sholdn't impact profiles too much. If they run during boot, and are fast, then it should
 *          be a consistent slow rate, and if they run for a long time, it should average out to the correct fast rate.
 *      - Of course, if your application can get away with simply comparing tick counts, then you don't need to do conversion
 *          at all.
 *  NOTE: If your browser doesn't have SharedArrayBuffer, this defaults to performance.now()
 *  NOTE: Always returns an integer value.
 */
export const clock_ticks = clock_ticksVar;
export const enable_low_latency_clock = enable_low_latency_clockVar;

export const launch_new_timing_thread = launch_new_timing_threadVar;