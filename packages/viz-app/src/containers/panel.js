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

function Panel({ panel = {}, placement,
                 className = '', positionTop, positionLeft,
                 id, side, isOpen, name, style, ...props }) {

    const Component = componentForSideAndType(side, panel.id);
    const componentInstance = (
        <Component name={name} side={side}
                   data={panel} style={style}
                   className={className + ' ' + panelStyles[`panel-${side}`]}
                   {...props}/>
    );

    if (side === 'left') {
        return (
            <div style={{ ...leftPanelStyles(isOpen), ...style }}
                 className={className + ' ' + panelStyles[`panel-${side}`]}>
                {componentInstance}
            </div>
        );
    }

    return componentInstance;
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

function leftPanelStyles(isOpen) {
    return {
        top: `0px`,
        left: `44px`,
        zIndex: 3700,
        position: `absolute`,
        opacity: Number(isOpen),
        // minWidth: isOpen ? undefined : `200px`,
        minWidth: `200px`,
        minHeight: isOpen ? undefined : `200px`,
        visibility: isOpen && 'visible' || 'hidden',
        transform: `translate3d(${Number(!isOpen) * -10}%, 6px, 0)`,
        transition: isOpen &&
            `opacity 0.2s, transform 0.2s, visibility 0s` ||
            `opacity 0.0s, transform 0.0s, visibility 0s linear 0.2s`
    };
}
