import { Controls } from '../';
import { Panel } from 'react-bootstrap';

function Settings({ id, name, side, style = {}, settings = [], ...props } = {}) {
    return (
        <Panel header={name} style={{ ...style, minWidth: `350px` }} {...props}>
        {settings.map((options, index) => (
            <Controls data={options} key={`${index}: ${options.name}`}/>
        ))}
        </Panel>
    );
}

export { Settings };
export default Settings;
