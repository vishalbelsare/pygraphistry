import { renderNothing } from 'recompose';
import { Popover } from 'react-bootstrap';
import panelStyles from '../components/panel.less';
import { container } from '@graphistry/falcor-react-redux';

// import { Timebar } from './timebar';
import { Settings } from './settings';
import { Expressions } from './expressions';
// import { Inspector } from './inspector';
// import { Histograms } from './histograms';

const panelsById = {
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


let Panel = ({
        panel = {}, placement,
        positionTop, positionLeft,
        id, side, name, style, ...props
    } = {}) => {
    const Content = componentForSideAndType(side, panel.id);
    if (side !== 'left') {
        return (
            <Content name={name} side={side} data={panel} style={style} {...props}/>
        );
    }
    return (
        <Popover id={`${side}-panel`}
                 name={name}
                 style={style}
                 placement={placement}
                 positionTop={positionTop}
                 positionLeft={positionLeft}
                 className={panelStyles['panel-left']}>
            <Content name={name} side={side} data={panel} {...props}/>
        </Popover>
    );
};

Panel = container(
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
)(Panel);

export { Panel };

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

function Histograms() {
    return (
        <h1>Histograms</h1>
    );
}
