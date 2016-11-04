import { container } from '@graphistry/falcor-react-redux';

import { Inspector as InspectorComponent } from '../components/inspector/inspector';
import { selectInspectorTab } from 'viz-shared/actions/inspector';


let Inspector = ({ selectInspectorTab, openTab = 'points', open = false, ...props} = {}) => {


    console.log('got', {openTab, open});
    const wat = (a, b, c) => { console.log('click', {a,b,c}); return selectInspectorTab(a,b,c); };

    return <InspectorComponent openTab={openTab} open={open} onSelect={wat} />;
};


Inspector = container({
    fragment:  () => `{ id, name, openTab, open }`,
    dispatchers: { selectInspectorTab }
})(Inspector);



export { Inspector };
