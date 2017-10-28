function overrides(o1, o2, fldMergeOverrides) {
    if (!fldMergeOverrides) {
        return undefined;
    }
    let out = undefined;
    for (const i in fldMergeOverrides) {
        if (i in o1 || i in o2) {
            out = out || {};
            out[i] = fldMergeOverrides[i](o1[i], o2[i]);
        }
    }
    return out;
}

//[ {key, ...}, ... ]_n -> [ {key, ...}, ... ]_(k < n)
// Combine array elements with equal 'key' field (as str); drop if missing/0-length
// NOTE: order preserving
export function mergeByKey(arr, key, fldMergeOverrides) {
    const map = {};
    const ordered = [];

    arr.forEach(o => {
        const id = o[key];
        if (id === undefined) {
            return;
        }

        const base = map[id];
        if (!base) {
            const copy = Object.assign({}, o);
            map[id] = copy;
            ordered.push(copy);
        } else {
            Object.assign(base, o, overrides(base, o, fldMergeOverrides));
        }
    });

    return ordered;
}
