import { App } from 'viz-app/components/app';
import { View } from 'viz-app/containers/view';
import * as Scheduler from 'rxjs/scheduler/animationFrame';
import { connect, container } from '@graphistry/falcor-react-redux';

const withAppContainer = container({
    renderLoading: true,
    fragment: ({ workbooks = [] } = {}) => `{
        workbooks: {
            length, open: {
                id, title, views: {
                    length, current: ${
                        View.fragment(
                            workbooks &&
                            workbooks.open &&
                            workbooks.open.views &&
                            workbooks.open.views.current || undefined)
                    }
                }
            }
        }
    }`
});

let AppContainer = withAppContainer(({ workbooks = [], ...props }) => (
    <App {...props}>
        <View key='view'
              data={workbooks &&
                    workbooks.open &&
                    workbooks.open.views &&
                    workbooks.open.views.current || undefined}/>
    </App>
));

AppContainer = connect(AppContainer, Scheduler.animationFrame);

export { AppContainer as App };
export default AppContainer;
