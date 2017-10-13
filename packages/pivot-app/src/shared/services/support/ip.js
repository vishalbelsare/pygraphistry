export function isPrivateIP(ip) {
    // RFC 1918: 10/8, 172.16/12, 192.168/16
    // TODO: use ipaddr.js
    return (
        String(ip).match(
            /^10[.][^.]+[.][^.]+[.][^.]+$|172[.](?:1[6-9]|2\d|3[01])[.][^.]+[.][^.]+$|192[.]168[.][^.]+[.][^.]+$/
        ) !== null
    );
}

export function isIP(ip) {
    // TODO: use ipaddr.js
    return Boolean(String(ip).match(/^\d+[.]\d+[.]\d+[.]\d+$/));
}

export function isMac(mac) {
    // TODO: use ipaddr.js
    return Boolean(
        String(mac)
            .replace(/[^0-9a-f]/g, '')
            .split(/(..)/)
            .filter(v => v.length)
            .join('-')
            .match(/([0-9a-f]{2}-){5}([0-9a-f]{2})/)
    );
}
