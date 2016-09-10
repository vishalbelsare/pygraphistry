import _ from 'underscore';

const SEARCH = {
    name: 'Search'
};

const FIREEYE = {
    name: 'Expand with Fire Eye'
};

const BLUECOAT = {
    name: 'Expand with Blue Coat'
};

const FIREWALL = {
    name: 'Expand with Firewall'
};


const ALL = [SEARCH, FIREEYE, BLUECOAT, FIREWALL];
const PIVOTS = _.object(ALL.map((x) => x.name), ALL);

/*
{
    'pivots': {string -> {'name'}},
    'get': string -> pivot U exn
}
*/
export default {
    pivots: PIVOTS,
    get: (name) => {
        if (name in PIVOTS) {
            return PIVOTS[name];
        }
        throw new Error('Unknown pivot: ' + name);
    }
};