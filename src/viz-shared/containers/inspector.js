import { container } from '@graphistry/falcor-react-redux';

import { Inspector as InspectorComponent } from '../components/inspector/inspector';
import { selectInspectorTab } from 'viz-shared/actions/inspector';

import _ from 'underscore';


function getTemplates(templates, openTab) {
    return templates
        .filter(({componentType}) =>
            (openTab === 'points' && componentType === 'point')
            || (openTab === 'edges' && componentType === 'edge'))
        .map(({name}) => name);
}

function coerceSortKey(templates, openTab, sortKey) {
    return !sortKey ? getTemplates(templates, openTab).concat([''])[0] : sortKey;
}


let Inspector = (a,b,c) => {


    console.log('Inspector', JSON.stringify({a,b,c}));
    const {
            openTab = 'points',
            currentQuery = {},
            selectInspectorTab,
            templates = {length: 0},
            rows
        } = a;
    const { searchTerm = '', sortKey, sortOrder, rowsPerPage=6, page=1 } = currentQuery;

    console.log('ROWS', rows);
    var currentRows = undefined;
    try {
        currentRows = row[openTab][`search-${searchTerm||''}`][`sort-${sortKey||''}`][sortOrder];
    } catch (e) { }

    const sortBy = coerceSortKey(templates, openTab, sortKey);
    console.log('SORTYBY', {
        sortKey,
        availTemplates: getTemplates(templates, openTab).length,
        picked: getTemplates(templates, openTab).concat([''])[0],
        sortBy});

    return <InspectorComponent
        {...{ searchTerm, sortKey: sortBy, sortOrder, rowsPerPage, page } }
        open={open} openTab={openTab} templates={templates}
        rows={currentRows}
        onSelect={selectInspectorTab}  />;
};


Inspector = container({
    fragment:  (a, b, c, d) => {

        console.log('fragment input', {a,b,c,d});

        const { currentQuery = {}, templates = [], openTab, ...props } = a;
        const { searchTerm, sortKey, sortOrder, rowsPerPage=0, page=1}
            = currentQuery;

        const sortBy = coerceSortKey(templates, openTab, sortKey);

        const hasAllQueryProps =
            _.intersection(['searchTerm', 'sortKey', 'sortOrder'], _.keys(currentQuery)).length === 3;

        const hasAllTemplateNames =
            templates.length === 0
            || (templates.length === _.keys(templates).length - 1);

        if (!rowsPerPage || !hasAllQueryProps || !hasAllTemplateNames) {

            console.log('==== Insufficient rows data');
            console.log({rowsPerPage, hasAllQueryProps, hasAllTemplateNames}, _.keys(currentQuery));

            return `{
                id, name, open, openTab,
                currentQuery: { searchTerm, sortKey, sortOrder, rowsPerPage, page },
                templates: {
                    length, [0...${templates.length}]: {
                        name, dataType, identifier, componentType
                    }
                }
            }`;
        }


        const start = rowsPerPage * (page - 1);
        const stop = start + rowsPerPage;

        const frag = `{
            id, name, open, openTab,
            currentQuery: { searchTerm, sortKey, sortOrder, rowsPerPage, page },
            templates: {
                length, [0...${templates.length}]: {
                    name, dataType, identifier, componentType
                }
            },
            rows: {
                ${openTab}: {
                    'search-${searchTerm||''}': {
                        'sort-${sortBy||''}': {
                            ${sortOrder}: {
                                [${start}..${stop}]: {
                                    ${ getTemplates(templates, openTab).join(', ') }
                                }
                            }
                        }
                    }
                }
            }
        }`;

        console.log('OPEN TAB', openTab);
        console.log("THE QUERY", frag);

        return frag;
    },
    dispatchers: { selectInspectorTab }
})(Inspector);



export { Inspector };
