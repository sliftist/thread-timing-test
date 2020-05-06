export function formatMinDigits(num: number, digits: number) {
    if(!Number.isFinite(num)) return num.toFixed(digits);
    
    let intDigits = Math.floor(Math.log10(num) + 1);
    if (intDigits < 0) intDigits = 1;
    let decimalDigits = digits - intDigits;
    // Happens if the number is so close to having too many digits that Math.log10 rounds it over.
    if(decimalDigits < 0) {
        decimalDigits = 0;
    }
    if(!(decimalDigits >= 0 && decimalDigits <= 100)) {
        debugger;
    }
    return num.toFixed(decimalDigits);
}

export function formatTime(milliseconds: number): string {
    if(milliseconds === 0) return "0";
    if(milliseconds < 0) {
        return formatTime(-milliseconds);
    }
    if(milliseconds < 1/1000) {
        return formatMinDigits(milliseconds * 1000 * 1000, 3) + "ns";
    } else if(milliseconds < 1) {
        return formatMinDigits(milliseconds * 1000, 3) + "us";
    } else if(milliseconds < 1000) {
        return formatMinDigits(milliseconds, 3) + "ms";
    } else  {
        return formatMinDigits(milliseconds / 1000, 3) + "s";
    }
}

export function formatPercent(frac: number): string {
    return `${(frac * 100).toFixed(1)}%`;
}

export function formatInteger(count: number): string {
    if(count === 0) return "0";
    if(count < 0) {
        return "-" + formatInteger(-count);
    }
    if(count < 1000) {
        return formatMinDigits(count, 3);
    } else if(count < 1000 * 1000) {
        return formatMinDigits(count / 1000, 3) + "K";
    } else if(count < 1000 * 1000 * 1000) {
        return formatMinDigits(count / 1000 / 1000, 3) + "M";
    } else {
        return formatMinDigits(count / 1000 / 1000 / 1000, 3) + "B";
    }
}

export function p(num: number): string {
    if(isNaN(num)) {
        debugger;
    }
    // toFixed, to prevent scientific notation from showing up (0.1**10 + "")
    let str = (num * 100).toFixed(13) + "%";
    return str;
}

export function className(strings: TemplateStringsArray, ...variables: unknown[]) {
    let result = "";
    for(let i = 0; i < strings.length; i++) {
        result += strings[i];
        let varValue = variables[i];
        if(varValue || varValue === 0) {
            result += String(varValue);
        }
    }
    return result;
}