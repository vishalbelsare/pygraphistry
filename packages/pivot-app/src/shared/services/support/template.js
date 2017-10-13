import templater from 'string-template';

// str * obj -> str U Exception
// String with {variable}s that are defined in obj
//   Throws an exception if a variable is missing
export function template(str, obj) {
    const re = /\{([0-9a-zA-Z_]+)\}/g;
    str.replace(re, (full, fld) => {
        if (!(fld in obj) || obj[fld] === undefined) {
            throw new Error(`Missing field "${fld}"`);
        }
    });

    return templater(str, obj);
}
