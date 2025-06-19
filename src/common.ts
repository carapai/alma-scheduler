export function ordinalSuffixOf(i: number) {
    let j = i % 10,
        k = i % 100;
    if (j === 1 && k !== 11) {
        return i + "st";
    }
    if (j === 2 && k !== 12) {
        return i + "nd";
    }
    if (j === 3 && k !== 13) {
        return i + "rd";
    }
    return i + "th";
}

export const secondOptions = [{ value: "*", label: "Every" }].concat(
    Array.from({ length: 60 }, (_, i) => i).map((i) => ({
        label: i.toString(),
        value: i.toString(),
    })),
);
export const minuteOptions = [{ value: "*", label: "Every" }].concat(
    Array.from({ length: 60 }, (_, i) => i).map((i) => ({
        label: i.toString(),
        value: i.toString(),
    })),
    Array.from({ length: 60 }, (_, i) => i).flatMap((i) => {
        if (i > 0) {
            return {
                label: `Every ${ordinalSuffixOf(i)} minute`,
                value: `*/${i}`,
            };
        }
        return [];
    }),
);
export const hourOptions = [{ value: "*", label: "Every" }].concat(
    Array.from({ length: 24 }, (_, i) => i).map((i) => ({
        label: i.toString(),
        value: i.toString(),
    })),
    Array.from({ length: 24 }, (_, i) => i).flatMap((i) => {
        if (i > 0) {
            return {
                label: `Every ${ordinalSuffixOf(i)} hour`,
                value: `*/${i}`,
            };
        }
        return [];
    }),
);
export const dayOptions = [{ value: "*", label: "Every" }].concat(
    Array.from({ length: 31 }, (_, i) => i + 1).map((i) => ({
        label: i.toString(),
        value: i.toString(),
    })),
    Array.from({ length: 31 }, (_, i) => i).flatMap((i) => {
        if (i > 0) {
            return {
                label: `Every ${ordinalSuffixOf(i)} day`,
                value: `*/${i}`,
            };
        }
        return [];
    }),
);

export const weekOptions = [
    { value: "*", label: "Every" },
    { value: "0", label: "Sun" },
    { value: "1", label: "Mon" },
    { value: "2", label: "Tue" },
    { value: "3", label: "Wed" },
    { value: "4", label: "Thu" },
    { value: "5", label: "Fri" },
    { value: "6", label: "Sat" },
];
export const monthOptions = [
    { value: "*", label: "Every" },
    { value: "1", label: "Jan" },
    { value: "2", label: "Feb" },
    { value: "3", label: "Mar" },
    { value: "4", label: "Apr" },
    { value: "5", label: "May" },
    { value: "6", label: "Jun" },
    { value: "7", label: "Jul" },
    { value: "8", label: "Aug" },
    { value: "9", label: "Sep" },
    { value: "10", label: "Oct" },
    { value: "11", label: "Nov" },
    { value: "12", label: "Dec" },

    { value: "*/1", label: "Every 1st Month" },
    { value: "*/2", label: "Every 2nd Month" },
    { value: "*/3", label: "Every 3rd Month" },
    { value: "*/4", label: "Every 4th Month" },
    { value: "*/5", label: "Every 5th Month" },
    { value: "*/6", label: "Every 6th Month" },
    { value: "*/7", label: "Every 7th Month" },
    { value: "*/8", label: "Every 8th Month" },
    { value: "*/9", label: "Every 9th Month" },
    { value: "*/10", label: "Every 10th Month" },
    { value: "*/11", label: "Every 11th Month" },
    { value: "*/12", label: "Every 12th Month" },
];
