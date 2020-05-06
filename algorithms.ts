const uniqueKey = Symbol();
export function binarySearchMapped<T, M>(list: T[], value: M, map: (t: T) => M, comparer: (lhs: M, rhs: M) => number): number {
    return binarySearch<T>(list, {[uniqueKey]: value} as any as T, (a, b) => {
        let aMap = uniqueKey in a ? (a as any)[uniqueKey] as M : map(a);
        let bMap = uniqueKey in b ? (b as any)[uniqueKey] as M : map(b);

        return comparer(aMap, bMap);
    });
}
/** Always returns the index of the first match in the list. */
export function binarySearch<T>(list: T[], value: T, comparer: (lhs: T, rhs: T) => number): number {
    if(!list) {
        debugger;
    }
    let minIndex = 0;
    let maxIndex = list.length;

    while (minIndex < maxIndex) {
        let fingerIndex = ~~((maxIndex + minIndex) / 2);
        // Try to increase the minIndex if the finger is in the middle
        if(minIndex + 2 === maxIndex) {
            fingerIndex = minIndex;
        }
        let finger = list[fingerIndex];
        let comparisonValue = comparer(value, finger);
        // Check the minIndex first
        if(comparisonValue > 0) {
            minIndex = fingerIndex + 1;
        } else if(comparisonValue < 0) {
            maxIndex = fingerIndex;
        } else {
            // Modification to keep searching until we get to the first element that matches.
            if(minIndex + 1 === maxIndex) {
                return fingerIndex;
            }
            maxIndex = fingerIndex + 1;
        }
    }
    return ~minIndex;
}

export function compareString(a: string, b: string): number {
    if(a < b) return -1;
    if(a > b) return +1;
    return 0;
}
export function compareNumber(a: number, b: number): number {
    return a - b;
}


export function findAtOrBeforeMapped<T, M>(list: T[], value: M, map: (t: T) => M, comparer: (lhs: M, rhs: M) => number): number {
    let index = binarySearchMapped<T, M>(list, value, map, comparer);

    if (index < 0) {
        index = ~index - 1;
    }

    return index;
}

export function findAtOrAfterMapped<T, M>(list: T[], value: M, map: (t: T) => M, comparer: (lhs: M, rhs: M) => number): number {
    let index = binarySearchMapped<T, M>(list, value, map, comparer);

    if (index < 0) {
        index = ~index;
    }

    return index;
}
export function findAfterMapped<T, M>(list: T[], value: M, map: (t: T) => M, comparer: (lhs: M, rhs: M) => number): number {
    let index = binarySearchMapped<T, M>(list, value, map, comparer);

    if (index < 0) {
        index = ~index;
    } else {
        index++;
    }

    return index;
}

export function findBeforeMapped<T, M>(list: T[], value: M, map: (t: T) => M, comparer: (lhs: M, rhs: M) => number): number {
    let index = binarySearchMapped<T, M>(list, value, map, comparer);

    if (index < 0) {
        index = ~index;
    }
    index--;

    return index;
}


export function findAtOrBefore<T>(list: T[], value: T, comparer: (lhs: T, rhs: T) => number): number {
    let index = binarySearch(list, value, comparer);

    if (index < 0) {
        index = ~index - 1;
    }

    return index;
}

export function findAtOrAfter<T>(list: T[], value: T, comparer: (lhs: T, rhs: T) => number): number {
    let index = binarySearch(list, value, comparer);

    if (index < 0) {
        index = ~index;
    }

    return index;
}

export function findBefore<T>(list: T[], value: T, comparer: (lhs: T, rhs: T) => number): number {
    let index = binarySearch(list, value, comparer);

    if (index < 0) {
        index = ~index;
    }
    index--;

    return index;
}

export function insertIntoListMapped<T, M>(list: T[], value: T, map: (t: T) => M, comparer: (lhs: M, rhs: M) => number, duplicates: "throw"|"ignore"|"add"|"replace" = "throw") {
    return insertIntoList(list, value, (a, b) => comparer(map(a), map(b)), duplicates);
}

export function insertIntoList<T>(list: T[], value: T, comparer: (lhs: T, rhs: T) => number, duplicates: "throw"|"ignore"|"add"|"replace" = "throw") {
    let index = binarySearch(list, value, comparer);
    if(index >= 0) {
        if(duplicates === "throw") throw new Error(`Duplicate value in list ${value}.`);
        if(duplicates === "ignore") return;
        if(duplicates === "replace") {
            list[index] = value;
            return;
        }
    } else {
        index = ~index;
    }
    list.splice(index, 0, value);
}

export function removeFromListMapped<T, M>(list: T[], value: M, map: (t: T) => M, comparer: (lhs: M, rhs: M) => number, throwOnNotExists = false) {
    let index = binarySearchMapped(list, value, map, comparer);
    if(index >= 0) {
        list.splice(index, 1);
    } else if(throwOnNotExists) {
        throw new Error(`Tried to remove value that didn't exist. ${value}`);
    }
}

export function removeFromList<T>(list: T[], value: T, comparer: (lhs: T, rhs: T) => number) {
    let index = binarySearch(list, value, comparer);
    if(index >= 0) {
        list.splice(index, 1);
    }
}


// getShortestSumRange([1, 2, 1, 3], 4) === 2
// getShortestSumRange([5, 5, 10, 5, 8, 8], 16) === 2
// getShortestSumRange([5, 5, 10, 5, 8, 8], 22) === 3
export function getShortestSumRange(values: number[], sum: number): {
    count: number;
    sum: number;
} {
    let curSum = 0;
    let lastIndex = 0;
    let firstIndex = 0;
    while(lastIndex < values.length && curSum < sum) {
        curSum += values[lastIndex++];
    }

    let minCount = lastIndex;
    let minCountSum = curSum;
    while(lastIndex < values.length) {
        curSum += values[lastIndex++];
        while(curSum - values[firstIndex] >= sum) {
            curSum -= values[firstIndex];
            firstIndex++;
        }
        let curLength = lastIndex - firstIndex;
        //minCount = Math.min(minCount, curLength);
        //*
        if(curLength < minCount || curLength === minCount && curSum > minCountSum) {
            minCount = curLength;
            minCountSum = curSum;
        }
        //*/
    }
    return {
        count: minCount,
        sum: minCountSum,
    };
}