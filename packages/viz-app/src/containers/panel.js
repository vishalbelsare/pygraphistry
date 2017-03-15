import renderNothing from 'recompose/renderNothing';
import { Popover } from 'react-bootstrap';
import panelStyles from '../components/panel.less';
import { Settings } from './settings';
import { Inspector } from './inspector';
import { Histograms } from './histograms';
import { Expressions } from './expressions';
import { container } from '@graphistry/falcor-react-redux';

const panelsById = {
    'scene': Settings,
    'layout': Settings,
    'labels': Settings,
    'filters': Expressions,
    'inspector': Inspector,
    'histograms': Histograms,
    'exclusions': Expressions,
};

function componentForSideAndType(side, id) {
    if (!id) {
        return renderNothing();
    }
    return panelsById[id] || (
        side === 'left' ? Settings : renderNothing()
    );
}

function Panel({ panel = {}, className = '',
                 id, side, isOpen, name, style, ...props }) {
    const Component = componentForSideAndType(side, panel.id);
    return (
        <Component data={panel} style={style}
                   id={panel.id} name={name} side={side}
                   className={className + ' ' + panelStyles[`panel-${side}`]}
                   {...props}/>
    );
};

Panel = container({
    renderLoading: true,
    fragment: (fragment = {}, props) => {
        const Content = componentForSideAndType(props.side, fragment.id);
        if (!Content || !Content.fragment) {
            return `{ id, name }`;
        }
        return Content.fragment(fragment, props);
    },
    mapFragment: (panel) => ({ panel })
})(Panel);

export { Panel };
