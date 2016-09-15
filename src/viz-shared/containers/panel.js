import { Popover } from 'react-bootstrap';
import { container } from '@graphistry/falcor-react-redux';
import { renderNothing } from 'recompose';

// import { Timebar } from './timebar';
import { Settings } from './settings';
import { Expressions } from './expressions';
// import { Inspector } from './inspector';
// import { Histograms } from './histograms';

export const Panel = container(
    ({ id, name, ...rest } = {}, { side }) => {
        if (!id && !name) {
            return `{ panels: { ${side} } }`;
        }
        const Content = componentForSideAndType(side, id);
        if (!Content.fragment) {
            return `{ id, name }`;
        }
        return Content.fragment({ id, name, ...rest });
    },
    (panel) => ({ panel })
)(renderPanel);

function renderPanel({ side, panel = {}, ...props } = {}) {
    const Content = componentForSideAndType(side, panel.id);
    return (
        <Content data={panel} {...props}/>
    );
}

const panelsById = {
    'sets': Sets,
    'filters': Expressions,
    'timebar': Timebar,
    'inspector': Inspector,
    'exclusions': Expressions,
    'histograms': Histograms,
    'scene': Settings,
    'layout': Settings,
    'labels': Settings
};

function componentForSideAndType(side, id) {
    if (!id) {
        return renderNothing();
    }
    return panelsById[id] || (
        side === 'left' ? Settings : renderNothing()
    );
}

function Sets({ name, ...props }) {
    return (
        <Popover {...props}>
            <h1>Sets</h1>
        </Popover>
    );
}

// function Filters() {
//     return (
//         <h1>Filters</h1>
//     );
// }

function Timebar() {
    return (
        <h1>Timebar</h1>
    );
}

function Inspector() {
    return (
        <h1>Inspector</h1>
    );
}

function Exclusions({ name, ...props }) {
    return (
        <Popover {...props}>
            <h1>Exclusions</h1>
        </Popover>
    );
}

function Histograms() {
    return (
        <h1>Histograms</h1>
    );
}
