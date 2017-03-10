//{x: {y: 1}} => {"x.y": 1}
//http://stackoverflow.com/questions/19098797/fastest-way-to-flatten-un-flatten-nested-json-objects
export function flattenJson (data = {}) {
    const result = {};
    function recurse (cur, prop) {
        if (cur !== data) {
            if (Object(cur) !== cur) {
                result[prop] = cur;
                return;
            } else if (Array.isArray(cur)) {
                let l = cur.length;
                for(let i=0; i<l; i++)
                     recurse(cur[i], prop + "[" + i + "]");
                if (l === 0)
                result[prop] = [];
                return;
            }
        }

        let isEmpty = true;
        for (let p in cur) {
            isEmpty = false;
            recurse(cur[p], prop ? prop+"."+p : p);
        }
        if (isEmpty && prop)
            result[prop] = {};
    
    }
    recurse(data, "");
    return result;
}