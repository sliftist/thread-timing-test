
export function max(values: number[], defaultValue = Number.NEGATIVE_INFINITY): number {
    return values.reduce((a, b) => Math.max(a, b), defaultValue);
}

export function min(values: number[], defaultValue = Number.POSITIVE_INFINITY): number {
    return values.reduce((a, b) => Math.min(a, b), defaultValue);
}

export function sum(nums: number[]): number {
    let result = 0;
    for(let i = 0; i < nums.length; i++) {
        result += nums[i];
    }
    return result;
}

export function BufToBigInt(data: Uint8Array): bigint {
    function p(n: number) { return (n < 16 ? "0" : "") + n.toString(16); }
    return BigInt("0x" + Array.from(data).map(p).join(""));
}
/** Little endian, so as number grow we can append to the array, instead of prepending? */
export function BigIntToBuf(num: bigint): Uint8Array {
    let bytes: number[] = [];
    let str = num.toString(16);
    for(let i = str.length; i > 0; i -= 2) {
        let hexByte = str.slice(Math.max(0, i - 2), i);
        bytes.push(parseInt(hexByte, 16));
    }
    return new Uint8Array(bytes);
}