import compose from 'recompose/compose';
import withToolbarSchema from './schema';
import Tool from './components/tool';
import Toolbar from './components/tool-bar';
import ToolGroup from './components/tool-group';
import {
    withToolContainer,
    withToolbarContainer,
    withToolGroupContainer
} from './containers';

const ToolContainer = withToolContainer(Tool);
const ToolGroupContainer = withToolGroupContainer(ToolGroup);
const ToolbarContainer = compose(
    withToolbarSchema, withToolbarContainer
)(Toolbar);

export { ToolContainer as Tool };
export { ToolbarContainer as Toolbar };
export { ToolGroupContainer as ToolGroup };
