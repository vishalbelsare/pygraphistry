import { container } from '@graphistry/falcor-react-redux';

import { Inspector as InspectorComponent } from '../components/inspector/inspector';
import { selectInspectorTab } from 'viz-shared/actions/inspector';


let Inspector = ({ selectInspectorTab, openTab = 'points', open = false, ...props} = {}) => {
    console.log('MAKING INSPECTOR CONTAINER', {selectInspectorTab, openTab, open});
    return <InspectorComponent openTab={openTab} open={open} onSelect={selectInspectorTab} />;
};


Inspector = container({
    fragment:  () => `{ openTab, open }`,
    mapFragment: (inspector) => ({
        inspector,
        id: inspector.id,
        open: inspector.open,
        openTab: inspector.openTab
    }),
    dispatchers: { selectInspectorTab }
})(Inspector);



export { Inspector };
